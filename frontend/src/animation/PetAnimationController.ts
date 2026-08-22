/**
 * PetAnimationController — the orchestrator.
 *
 * Every frame, in this order:
 *
 *   1. joints snap back to rest
 *   2. the outgoing and incoming states are crossfaded into one pose
 *   3. any active clip is laid over the top at its own weight
 *   4. ambient layers add breathing, lean and spring motion underneath
 *   5. the body's scale is clamped so nothing can deform the creature
 *   6. the face is driven separately, from feelings rather than from poses
 *
 * The separation matters. States describe what the creature is doing, clips
 * describe what is being done to it, layers describe the fact that it is alive,
 * and the expression system describes how it feels about all of that. None of
 * them can stamp on each other, which is what makes it possible to be shaken
 * while cross while mid-hop (/Docs/animation-approach.md §35-36).
 */

import { SPRING_JOINTS, resetJoint } from '../assets/pets/anatomy/joints';
import type { PetRig } from '../assets/pets/anatomy/PetRig';
import { clamp } from '../assets/shared/shapes';
import { ClipInstance } from './core/Clip';
import type { ClipDefinition } from './core/Clip';
import { applyPose } from './core/Pose';
import type { Pose } from './core/Pose';
import { RESTING_MOTION } from './core/types';
import type {
  AnimationContext,
  EmotionRequest,
  MotionLayer,
  MotionState,
  PetState,
} from './core/types';
import { emotionFace, overrideFace, restingFace } from './expression/Expression';
import type { Emotion, FaceParams } from './expression/Expression';
import { FaceDriver } from './expression/FaceDriver';
import { Gaze, createBodyLean, createBreathing } from './layers/Ambient';
import { createSecondaryMotion } from './layers/Secondary';
import type { SecondaryMotion } from './layers/Secondary';
import { createDiscover, createAngry, createDizzy, createHeld, createPlay, createScared } from './states/Reactions';
import { createIdle, createSit } from './states/Ambient';
import { createHop, createRun } from './states/Locomotion';
import { createSleep } from './states/Sleep';

export type { AnimationContext, MotionState } from './core/types';

export const PET_STATE_NAMES = [
  'idle',
  'hop',
  'run',
  'sit',
  'sleep',
  'play',
  'discover',
  'held',
  'scared',
  'angry',
  'dizzy',
] as const;

export type PetStateName = (typeof PET_STATE_NAMES)[number];

/**
 * How far the body is allowed to be scaled after everything has had its say.
 *
 * This is the systemic answer to "stop compressing the poor creature": no
 * combination of state, clip and layer can flatten it past these numbers, and
 * the area clamp underneath keeps a squash from becoming a smear.
 */
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.3;
const AREA_MIN = 0.9;
const AREA_MAX = 1.12;

/**
 * How far an appendage may swing from its rest angle, in radians.
 *
 * The same idea as the scale clamp, applied to rotation: an ear thrown hard
 * enough should whip, but it must never sweep across the creature's own face
 * or fold through its head. About 63 degrees is dramatic and still anatomy.
 */
const SWING_LIMIT = 1.1;

export class PetAnimationController {
  private rig: PetRig;
  private states: Record<PetStateName, PetState>;
  private activeName: PetStateName = 'idle';
  private active: PetState;

  /** The state being crossfaded out, if any. */
  private outgoing: PetState | null = null;
  private outgoingPose: Pose = {};
  private transition = 1;
  private transitionLength = 0.25;

  private clip: ClipInstance | null = null;
  private layers: MotionLayer[];
  private secondary: SecondaryMotion;
  private gaze = new Gaze();
  private face: FaceDriver;

  private ctx: AnimationContext;
  private externalEmotion: EmotionRequest | null = null;

  constructor(rig: PetRig) {
    this.rig = rig;

    this.states = {
      idle: createIdle(),
      hop: createHop(),
      run: createRun(),
      sit: createSit(),
      sleep: createSleep(),
      play: createPlay(),
      discover: createDiscover(),
      held: createHeld(),
      scared: createScared(),
      angry: createAngry(),
      dizzy: createDizzy(),
    };

    this.active = this.states.idle;

    this.secondary = createSecondaryMotion(rig);
    this.layers = [createBreathing(), createBodyLean(), this.secondary];
    this.face = new FaceDriver(rig);

    this.ctx = {
      rig,
      time: 0,
      delta: 0,
      intensity: 1,
      lookTarget: null,
      motion: { ...RESTING_MOTION },
      random: Math.random,
    };

    this.active.enter?.(this.ctx);
  }

  get state(): PetStateName {
    return this.activeName;
  }

  /** What the creature is feeling right now — for the interface to show. */
  get expression(): FaceParams {
    return this.face.current;
  }

  // --- Inputs ---------------------------------------------------------------

  setState(name: PetStateName): void {
    if (name === this.activeName) return;

    // Freeze the outgoing pose so the crossfade has something to fade *from*
    // even though states are recomputed every frame.
    this.outgoing = this.active;
    this.outgoingPose = this.active.pose(this.ctx);
    this.transition = 0;
    this.transitionLength = this.states[name].blendIn ?? 0.25;

    this.active.exit?.(this.ctx);
    this.activeName = name;
    this.active = this.states[name];
    this.active.enter?.(this.ctx);
  }

  /** Point the creature's attention at a spot in its own local space. */
  setLookTarget(point: { x: number; y: number } | null): void {
    this.ctx.lookTarget = point;
  }

  /** The room tells the animation layer what the physics is doing. */
  setMotion(motion: Partial<MotionState>): void {
    this.ctx.motion = { ...this.ctx.motion, ...motion };
  }

  /**
   * An emotion from the simulation, used when the current state does not
   * demand one of its own — a creature can be quietly pleased while idling.
   */
  setEmotion(emotion: Emotion, strength = 1, response = 0.4): void {
    this.externalEmotion =
      emotion === 'neutral' && strength <= 0 ? null : { emotion, strength, response };
  }

  /** Start a one-shot. Loses to anything already running with a higher priority. */
  play(definition: ClipDefinition): void {
    const running = this.clip;
    if (running && !running.stopping && running.priority > (definition.priority ?? 0)) {
      return;
    }

    this.clip = new ClipInstance(definition);
    definition.onStart?.(this.ctx);
  }

  /** Stop the running clip, by name or whatever is playing. */
  stopClip(name?: string): void {
    if (!this.clip) return;
    if (name && this.clip.name !== name) return;
    this.clip.stop();
  }

  get playingClip(): string | null {
    return this.clip && !this.clip.stopping ? this.clip.name : null;
  }

  /** Shock every appendage at once. Landings, hits, pokes. */
  impulse(strength: number, direction = 1): void {
    this.secondary.impulse(strength, direction);
  }

  /** Re-bind to a rebuilt creature. Motion carries on from the same clock. */
  setRig(rig: PetRig): void {
    this.rig = rig;
    this.ctx.rig = rig;
    this.ctx.random = makeRandom(rig.appearance.seed);

    for (const layer of this.layers) layer.setRig?.(rig);
    this.secondary.settle();
    this.face.setRig(rig);
  }

  // --- The frame ------------------------------------------------------------

  /** @param deltaMS milliseconds since the previous frame. */
  update(deltaMS: number): void {
    // A backgrounded tab can hand us an enormous delta, which would fling
    // every spring to its limit on the first frame back.
    const delta = Math.min(deltaMS, 60) / 1000;

    this.ctx.time += delta;
    this.ctx.delta = delta;

    this.resetRig();

    // --- 1. State, crossfaded --------------------------------------------
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + delta / this.transitionLength);
    }

    this.ctx.intensity = this.active.intensity ?? 1;
    const pose = this.active.pose(this.ctx);

    if (this.outgoing && this.transition < 1) {
      applyPose(this.rig.joints, this.outgoingPose, 1 - this.transition);
      applyPose(this.rig.joints, pose, this.transition);
    } else {
      this.outgoing = null;
      applyPose(this.rig.joints, pose);
    }

    // --- 2. Clip on top ---------------------------------------------------
    let clipFace: Partial<FaceParams> | null = null;
    let clipEmotion: EmotionRequest | null = null;
    let clipWeight = 0;

    if (this.clip) {
      this.clip.advance(delta);

      if (this.clip.finished) {
        this.clip = null;
      } else {
        clipWeight = this.clip.weight();
        const t = this.clip.progress;
        applyPose(this.rig.joints, this.clip.definition.pose(t, this.ctx), clipWeight);
        clipFace = this.clip.definition.face?.(t, this.ctx) ?? null;
        clipEmotion = this.clip.definition.emotion?.(t, this.ctx) ?? null;
      }
    }

    // --- 3. Ambient layers ------------------------------------------------
    for (const layer of this.layers) layer.update(this.ctx);

    // --- 4. Nothing gets to deform the creature ---------------------------
    this.guardRig();

    // --- 5. The face ------------------------------------------------------
    const gaze = this.gaze.update(this.ctx);
    const request =
      clipEmotion ?? this.active.emotion?.(this.ctx) ?? this.externalEmotion;

    const resting = restingFace(this.rig.appearance.restingMood);
    let target = request
      ? emotionFace(request.emotion, request.strength, resting)
      : resting;

    if (clipFace) target = overrideFace(target, clipFace, clipWeight);

    this.face.update(delta, target, gaze, request?.response ?? 0.4);
  }

  /** Snap everything the motion layer can write back to its rest pose. */
  private resetRig(): void {
    const { joints } = this.rig;
    for (const name of Object.keys(joints) as (keyof typeof joints)[]) {
      resetJoint(joints[name]);
    }
  }

  /**
   * Clamp the body's scale, then correct its area.
   *
   * The first clamp stops any single animation going too far; the area
   * correction stops several small squashes from stacking into one big one.
   * Together they mean a creature can be hit by a chair mid-hop while being
   * shaken and still look like itself.
   */
  private guardRig(): void {
    // Appendages first: springs and clips both write here, and either one on
    // its own is reasonable while the two together are not.
    for (const name of SPRING_JOINTS) {
      const joint = this.rig.joints[name];
      const rest = joint.rest.rotation;
      joint.container.rotation = clamp(
        joint.container.rotation,
        rest - SWING_LIMIT,
        rest + SWING_LIMIT,
      );
    }

    const scale = this.rig.joints.body.container.scale;

    scale.x = clamp(scale.x, SCALE_MIN, SCALE_MAX);
    scale.y = clamp(scale.y, SCALE_MIN, SCALE_MAX);

    const area = scale.x * scale.y;
    if (area < AREA_MIN) {
      const correction = Math.sqrt(AREA_MIN / area);
      scale.x *= correction;
      scale.y *= correction;
    } else if (area > AREA_MAX) {
      const correction = Math.sqrt(AREA_MAX / area);
      scale.x *= correction;
      scale.y *= correction;
    }
  }
}

/** Small deterministic generator, so a seeded creature behaves the same twice. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
