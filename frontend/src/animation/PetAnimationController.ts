/**
 * PetAnimationController — drives the rig every frame.
 *
 * The model is additive layering, not a stack of competing tweens:
 *
 *   1. every joint is snapped back to its rest transform
 *   2. ambient procedural modules add small offsets (breathing, wobble, gaze)
 *   3. the current state adds its own motion or pose on top
 *
 * Because everything is an offset from rest, modules never fight each other and
 * can be combined freely — which is what /Docs/animation-approach.md asks for
 * when it describes animations that layer and blend rather than hard-switch.
 *
 * This is deliberately only the motion foundation. There is no behavior system
 * here: nothing in this layer decides what the pet should want to do.
 */

import type { PetRig } from '../assets/pets/anatomy/PetRig';
import { resetJoint } from '../assets/pets/anatomy/joints';
import { createBreathing } from './procedural/Breathing';
import { createFaceMotion } from './procedural/FaceMotion';
import { createWobble } from './procedural/Wobble';
import { createBlink } from './states/Blink';
import { createDiscover } from './states/Discover';
import { createIdle } from './states/Idle';
import { createPlay } from './states/Play';
import { createSit } from './states/Sit';
import { createSleep } from './states/Sleep';
import { createWalk } from './states/Walk';

export interface AnimationContext {
  rig: PetRig;
  /** Seconds since the controller started. */
  time: number;
  /** Seconds elapsed this frame. */
  delta: number;
  /**
   * Global motion amplitude, 0..1+. States lower it to calm the creature down
   * (sleep) or raise it to energize ambient motion (walk).
   */
  intensity: number;
  /**
   * A point of interest in the pet root's local space, or null for "nothing
   * in particular". Set via `PetAnimationController.setLookTarget` — a future
   * behavior system would call this when the pet notices an object. Ambient
   * face motion blends toward it instead of idle wandering, and the Discover
   * state leans the whole creature at it.
   */
  lookTarget: { x: number; y: number } | null;
}

export interface PetMotionModule {
  readonly name: string;
  update(ctx: AnimationContext): void;
}

export interface PetAnimationState extends PetMotionModule {
  /** Runs before ambient modules, so a state can scale ambient motion. */
  modulate?(ctx: AnimationContext): void;
  enter?(ctx: AnimationContext): void;
  exit?(ctx: AnimationContext): void;
}

export const PET_STATE_NAMES = ['idle', 'walk', 'sit', 'sleep', 'play', 'discover'] as const;

export type PetStateName = (typeof PET_STATE_NAMES)[number];

export class PetAnimationController {
  private rig: PetRig;
  private ambient: PetMotionModule[];
  private states: Record<PetStateName, PetAnimationState>;
  private activeName: PetStateName = 'idle';
  private active: PetAnimationState;
  private ctx: AnimationContext;

  /** Captured so the blink module's writes can be undone each frame. */
  private restLid: { left: number; right: number };

  constructor(rig: PetRig) {
    this.rig = rig;
    this.restLid = {
      left: rig.face.eyeLeft.lid.scale.y,
      right: rig.face.eyeRight.lid.scale.y,
    };

    this.ambient = [
      createBreathing(),
      createFaceMotion(),
      createWobble(),
      // Blinking is ambient, not a state: the pet must keep blinking whatever
      // it happens to be doing (animation-approach.md section 8).
      createBlink(),
    ];

    this.states = {
      idle: createIdle(),
      walk: createWalk(),
      sit: createSit(),
      sleep: createSleep(),
      play: createPlay(),
      discover: createDiscover(),
    };

    this.active = this.states.idle;
    this.ctx = { rig, time: 0, delta: 0, intensity: 1, lookTarget: null };
    this.active.enter?.(this.ctx);
  }

  get state(): PetStateName {
    return this.activeName;
  }

  /**
   * Point the pet's attention at a location in its own local space, or clear
   * it with `null`. Read by ambient face motion (subtly, at any time) and by
   * the Discover state (fully, as its whole pose).
   */
  setLookTarget(point: { x: number; y: number } | null): void {
    this.ctx.lookTarget = point;
  }

  setState(name: PetStateName): void {
    if (name === this.activeName) return;

    this.active.exit?.(this.ctx);
    this.activeName = name;
    this.active = this.states[name];
    this.active.enter?.(this.ctx);
  }

  /**
   * Re-bind to a rebuilt rig, e.g. after the appearance changed.
   * Motion continues from the same clock, so the swap is not visible as a jump.
   */
  setRig(rig: PetRig): void {
    this.rig = rig;
    this.ctx.rig = rig;
    this.restLid = {
      left: rig.face.eyeLeft.lid.scale.y,
      right: rig.face.eyeRight.lid.scale.y,
    };
  }

  /** @param deltaMS milliseconds since the previous frame. */
  update(deltaMS: number): void {
    // Clamp: a backgrounded tab can hand us a huge delta, which would fling the
    // procedural motion to an extreme on the first frame back.
    const delta = Math.min(deltaMS, 100) / 1000;

    this.ctx.time += delta;
    this.ctx.delta = delta;
    this.ctx.intensity = 1;

    this.resetRig();

    this.active.modulate?.(this.ctx);

    for (const module of this.ambient) {
      module.update(this.ctx);
    }

    this.active.update(this.ctx);
  }

  /** Snap everything the motion layer can write back to its rest pose. */
  private resetRig(): void {
    const { joints, face } = this.rig;

    for (const name of Object.keys(joints) as (keyof typeof joints)[]) {
      resetJoint(joints[name]);
    }

    face.eyeLeft.lid.scale.y = this.restLid.left;
    face.eyeRight.lid.scale.y = this.restLid.right;
    face.eyeLeft.pupil.position.set(0, 0);
    face.eyeRight.pupil.position.set(0, 0);
  }
}
