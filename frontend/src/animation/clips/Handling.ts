/**
 * Handling clips: being shaken, and pouncing on a toy.
 *
 * Shake is the one looping clip in the project. It has no natural length —
 * it lasts exactly as long as you keep doing it — so the controller starts it
 * when the room detects the pointer thrashing and stops it when you stop, and
 * the clip's blend-out does the rest.
 */

import { clamp } from '../../assets/shared/shapes';
import type { ClipDefinition } from '../core/Clip';
import { easeOutBack, easeOutCubic } from '../core/Pose';
import type { Pose } from '../core/Pose';
import type { AnimationContext, EmotionRequest } from '../core/types';

/**
 * Being shaken.
 *
 * The body snaps back and forth on a fast axis while the head lags behind it,
 * which is what makes a shake look like it is happening *to* the creature
 * rather than being performed by it. Intensity is live: the room updates it as
 * you shake harder.
 */
export function createShakeClip(getIntensity: () => number): ClipDefinition {
  return {
    name: 'shake',
    duration: 0,
    loop: true,
    blendIn: 0.06,
    blendOut: 0.35,
    priority: 80,

    pose(elapsed: number, ctx: AnimationContext): Pose {
      const { proportions } = ctx.rig;
      const power = clamp(getIntensity(), 0, 1);

      // Two frequencies that do not divide into each other, so the shake never
      // settles into a readable rhythm.
      const fast = Math.sin(elapsed * 41) * 0.7 + Math.sin(elapsed * 57 + 1.1) * 0.3;
      const lag = Math.sin(elapsed * 41 - 1.1) * 0.7 + Math.sin(elapsed * 57 + 0.2) * 0.3;

      return {
        body: {
          x: fast * proportions.bodyWidth * 0.05 * power,
          y: lag * proportions.bodyHeight * 0.02 * power,
          rotation: fast * 0.12 * power,
          // Barely any scaling: the violence is all travel and rotation.
          scaleY: 1 + Math.abs(fast) * 0.02 * power,
          scaleX: 1 - Math.abs(fast) * 0.02 * power,
        },
        // The face arrives a beat after the body, every time.
        face: {
          x: lag * proportions.bodyWidth * 0.03 * power,
          rotation: lag * 0.08 * power,
        },
        earLeft: { rotation: -lag * 1.1 * power },
        earRight: { rotation: lag * 1.1 * power },
        topper: { rotation: -lag * 0.9 * power },
        tail: { rotation: lag * 1.2 * power },
        wingLeft: { rotation: -lag * 0.7 * power },
        wingRight: { rotation: lag * 0.7 * power },
      };
    },

    emotion(): EmotionRequest {
      return { emotion: 'fear', strength: clamp(getIntensity(), 0.4, 1), response: 1 };
    },
  };
}

/** How long a pounce takes, start to wiggle. */
const POUNCE_DURATION = 1.05;

/**
 * The two moments in a pounce the *physics* has to agree with.
 *
 * A pounce that is only a clip is a creature miming: the artwork springs
 * forward, the body stays where it is, and the toy is sent flying at some
 * unrelated instant. So the clip publishes when its feet leave the ground and
 * when it lands on the thing, in seconds, and the room launches the body and
 * bats the toy on those two beats. One source of truth, and the animation and
 * the simulation are describing the same event.
 */
export const POUNCE_TIMING = {
  /** Feet leave the ground: the end of the crouch. */
  leap: 0.28 * POUNCE_DURATION,
  /** Paws arrive on the toy. */
  contact: 0.65 * POUNCE_DURATION,
};

/**
 * Pouncing on a toy.
 *
 * The one clip with a proper anticipation, because this time the creature
 * chose to do it: crouch, spring, land on the thing, then wiggle in triumph.
 *
 * @param direction which way the toy is, -1 or +1.
 */
export function createPounceClip(direction: number): ClipDefinition {
  const dir = Math.sign(direction) || 1;

  return {
    name: 'pounce',
    duration: POUNCE_DURATION,
    blendIn: 0.08,
    blendOut: 0.2,
    priority: 40,

    pose(t: number, ctx: AnimationContext): Pose {
      const { proportions } = ctx.rig;

      // 0 ─ crouch ─ 0.28 ─ leap ─ 0.62 ─ land ─ 0.78 ─ wiggle ─ 1
      const crouch = t < 0.28 ? easeOutCubic(t / 0.28) : Math.max(0, 1 - (t - 0.28) / 0.12);
      const leap =
        t > 0.28 && t < 0.68 ? Math.sin(((t - 0.28) / 0.4) * Math.PI) : 0;
      const land =
        t > 0.62 && t < 0.82 ? Math.sin(((t - 0.62) / 0.2) * Math.PI) : 0;
      const wiggle = t > 0.75 ? Math.sin((t - 0.75) * 34) * (1 - (t - 0.75) / 0.25) : 0;

      return {
        body: {
          // Gathers, springs forward and up, thumps down, then celebrates.
          y:
            crouch * proportions.bodyHeight * 0.06 -
            leap * proportions.bodyHeight * 0.3 +
            land * proportions.bodyHeight * 0.05,
          x:
            dir *
            proportions.bodyWidth *
            (leap * 0.14 - crouch * 0.03 + wiggle * 0.02),
          scaleY: 1 - crouch * 0.06 + leap * 0.07 - land * 0.05,
          scaleX: 1 + crouch * 0.05 - leap * 0.05 + land * 0.04,
          rotation: dir * (leap * 0.16 - crouch * 0.04) + wiggle * 0.05,
        },
        face: {
          y: -leap * proportions.faceHeight * 0.02 + land * proportions.faceHeight * 0.02,
        },
        // Ears pin back in the crouch, then fly up with the leap.
        earLeft: { rotation: leap * 0.45 - crouch * 0.35 },
        earRight: { rotation: -leap * 0.45 + crouch * 0.35 },
        tail: { rotation: -crouch * 0.6 + leap * 0.4 + wiggle * 0.3 },
        wingLeft: { rotation: -leap * 0.6 },
        wingRight: { rotation: leap * 0.6 },
        topper: { rotation: -leap * 0.5 * easeOutBack(t) },
      };
    },

    emotion(t: number): EmotionRequest {
      return t < 0.3
        ? { emotion: 'surprise', strength: 0.5, response: 0.9 }
        : { emotion: 'joy', strength: 1, response: 0.9 };
    },
  };
}
