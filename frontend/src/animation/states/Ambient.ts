/**
 * Idle and sit — what the creature does when nothing is happening.
 *
 * Idle is the most important animation in the project, and the easiest to get
 * wrong. It is not a loop: it is a slow weight shift with occasional small
 * beats laid over it, so watching for ten seconds never shows you the same
 * second twice (/Docs/animation-approach.md §7).
 *
 * Note how little scaling there is here. The creature sways, tips and settles;
 * the springs on its ears and tail turn that into visible motion. Nothing has
 * to be compressed for the pose to read.
 */

import type { Pose } from '../core/Pose';
import { easeInOut } from '../core/Pose';
import type { AnimationContext, EmotionRequest, PetState } from '../core/types';

/** Occasional one-second beats that break up a long idle. */
type IdleBeat = 'settle' | 'lookAround' | 'shiver' | 'stretch';

const BEATS: IdleBeat[] = ['settle', 'lookAround', 'shiver', 'stretch'];

export function createIdle(): PetState {
  let beat: IdleBeat | null = null;
  let beatTime = 0;
  let nextBeat = 4;
  let lastBeat: IdleBeat | null = null;

  return {
    name: 'idle',
    intensity: 1,
    blendIn: 0.3,

    pose(ctx: AnimationContext): Pose {
      const { proportions } = ctx.rig;
      const pose: Pose = {};

      // --- The slow shift ---------------------------------------------------
      const phase = ctx.time * 0.13 * Math.PI * 2;
      const shift = Math.sin(phase);
      const settle = Math.cos(phase * 2) * 0.5 + 0.5;

      pose.body = {
        x: shift * proportions.bodyWidth * 0.02,
        y: settle * proportions.bodyHeight * 0.006,
        rotation: shift * 0.02,
      };

      pose.face = { x: -shift * proportions.bodyWidth * 0.008 };

      // --- Beats ------------------------------------------------------------
      if (beat === null) {
        nextBeat -= ctx.delta;
        if (nextBeat <= 0) {
          // Never the same beat twice running (§30).
          const options = BEATS.filter((option) => option !== lastBeat);
          beat = options[Math.floor(ctx.random() * options.length)];
          lastBeat = beat;
          beatTime = 0;
          nextBeat = 5 + ctx.random() * 8;
        }
      } else {
        beatTime += ctx.delta;
        const t = beatTime / beatDuration(beat);

        if (t >= 1) {
          beat = null;
        } else {
          applyBeat(pose, beat, t, ctx);
        }
      }

      return pose;
    },
  };
}

function beatDuration(beat: IdleBeat): number {
  switch (beat) {
    case 'settle':
      return 1.1;
    case 'lookAround':
      return 2.2;
    case 'shiver':
      return 0.6;
    case 'stretch':
      return 1.6;
  }
}

function applyBeat(pose: Pose, beat: IdleBeat, t: number, ctx: AnimationContext): void {
  const { proportions } = ctx.rig;
  const arc = Math.sin(t * Math.PI);

  switch (beat) {
    case 'settle':
      // A small drop, as if adjusting its footing.
      pose.body = {
        ...pose.body,
        y: (pose.body?.y ?? 0) + arc * proportions.bodyHeight * 0.02,
        scaleY: 1 - arc * 0.02,
        scaleX: 1 + arc * 0.015,
      };
      break;

    case 'lookAround': {
      // Turns to one side, holds, comes back.
      const turn = Math.sin(t * Math.PI * 2) * 0.6 + Math.sin(t * Math.PI) * 0.4;
      pose.face = {
        ...pose.face,
        x: (pose.face?.x ?? 0) + turn * proportions.bodyWidth * 0.05,
        rotation: turn * 0.05,
      };
      pose.body = { ...pose.body, rotation: (pose.body?.rotation ?? 0) + turn * 0.02 };
      break;
    }

    case 'shiver': {
      // Fast, tiny, and over before you are sure you saw it.
      const shake = Math.sin(t * Math.PI * 14) * (1 - t);
      pose.body = {
        ...pose.body,
        x: (pose.body?.x ?? 0) + shake * proportions.bodyWidth * 0.012,
        rotation: (pose.body?.rotation ?? 0) + shake * 0.03,
      };
      break;
    }

    case 'stretch':
      // Up onto its toes and back down.
      pose.body = {
        ...pose.body,
        y: (pose.body?.y ?? 0) - arc * proportions.bodyHeight * 0.05,
        scaleY: 1 + arc * 0.04,
        scaleX: 1 - arc * 0.03,
      };
      break;
  }
}

/**
 * Sit — a pose rather than a cycle.
 *
 * The mass settles onto the floor and spreads a little. Ambient layers keep
 * running underneath, which is what stops a held pose from looking like a
 * frozen frame.
 */
export function createSit(): PetState {
  let elapsed = 0;

  return {
    name: 'sit',
    intensity: 0.8,
    blendIn: 0.45,

    enter() {
      elapsed = 0;
    },

    pose(ctx: AnimationContext): Pose {
      elapsed += ctx.delta;
      const blend = easeInOut(elapsed / 0.5);
      const { proportions } = ctx.rig;

      return {
        body: {
          y: proportions.bodyHeight * 0.07 * blend,
          scaleY: 1 - 0.06 * blend,
          scaleX: 1 + 0.05 * blend,
          rotation: 0.015 * blend,
        },
        face: { y: proportions.faceHeight * 0.015 * blend },
      };
    },

    emotion(): EmotionRequest {
      return { emotion: 'neutral', strength: 1, response: 0.2 };
    },
  };
}
