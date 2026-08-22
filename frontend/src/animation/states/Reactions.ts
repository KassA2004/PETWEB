/**
 * Reactions: held, scared, angry, dizzy, and play.
 *
 * These are the states the world puts the creature into rather than states it
 * chooses. Each one is built from a different *kind* of motion, so they never
 * blur together:
 *
 *   held     hanging — stretched, swinging, no ground
 *   scared   small and fast — pulled in, trembling at a frequency nothing else uses
 *   angry    big and slow — puffed up, leaning at you, juddering
 *   dizzy    loose and wandering — a slow circular sway that cannot hold a line
 *   play     bouncy — the only state that gets to be silly
 *
 * Fear and anger are deliberately opposites in size and frequency. That
 * contrast is what makes them readable at a glance, without either of them
 * having to flatten the creature (/Docs/animation-approach.md §27).
 */

import type { Pose } from '../core/Pose';
import { easeInOut } from '../core/Pose';
import type { AnimationContext, EmotionRequest, PetState } from '../core/types';

/** Held — dangling from your cursor. */
export function createHeld(): PetState {
  let elapsed = 0;

  return {
    name: 'held',
    intensity: 0.6,
    blendIn: 0.16,

    enter() {
      elapsed = 0;
    },

    pose(ctx: AnimationContext): Pose {
      elapsed += ctx.delta;
      const blend = easeInOut(elapsed / 0.2);
      const t = ctx.time;

      const { proportions } = ctx.rig;
      const sway = Math.sin(t * 3.1) * 0.5 + Math.sin(t * 4.7 + 1) * 0.5;

      return {
        body: {
          // Hanging: everything is pulled down by its own weight.
          y: proportions.bodyHeight * 0.04 * blend,
          scaleY: 1 + 0.07 * blend,
          scaleX: 1 - 0.05 * blend,
          rotation: sway * 0.09 * blend,
        },
        face: { y: proportions.faceHeight * 0.02 * blend },
        // Ears and tail stream upward — the springs add the rest.
        earLeft: { rotation: -0.3 * blend },
        earRight: { rotation: 0.3 * blend },
        tail: { rotation: 0.35 * blend },
      };
    },

    emotion(ctx): EmotionRequest {
      // Startled at first, resigned if you keep holding it.
      const settled = Math.min(1, elapsed / 2.5);
      void ctx;
      return {
        emotion: settled > 0.6 ? 'neutral' : 'surprise',
        strength: settled > 0.6 ? 0.6 : 0.85,
        response: 0.9,
      };
    },
  };
}

/** Scared — also the falling pose, because they feel the same from inside. */
export function createScared(): PetState {
  let elapsed = 0;

  return {
    name: 'scared',
    intensity: 0.35,
    blendIn: 0.1,

    enter() {
      elapsed = 0;
    },

    pose(ctx: AnimationContext): Pose {
      elapsed += ctx.delta;
      const blend = easeInOut(elapsed / 0.12);
      const { proportions } = ctx.rig;

      // ~18 Hz — faster than breathing, the gait, or any other motion here.
      const tremble = Math.sin(ctx.time * 38) * 0.6 + Math.sin(ctx.time * 53 + 1.3) * 0.4;

      return {
        body: {
          x: tremble * proportions.bodyWidth * 0.014 * blend,
          y: proportions.bodyHeight * 0.02 * blend,
          // Pulling in, not squashing: both axes shrink together.
          scaleX: 1 - 0.035 * blend,
          scaleY: 1 - 0.03 * blend,
        },
        face: { y: proportions.faceHeight * 0.02 * blend },
        // Ears pinned flat and out — the universal "make me smaller".
        earLeft: { rotation: -0.75 * blend },
        earRight: { rotation: 0.75 * blend },
        tail: { rotation: 0.6 * blend },
        wingLeft: { rotation: 0.5 * blend },
        wingRight: { rotation: -0.5 * blend },
      };
    },

    emotion(): EmotionRequest {
      return { emotion: 'fear', strength: 1, response: 1 };
    },
  };
}

/** Angry — you have thrown it one too many times. */
export function createAngry(): PetState {
  let elapsed = 0;

  return {
    name: 'angry',
    intensity: 0.55,
    blendIn: 0.25,

    enter() {
      elapsed = 0;
    },

    pose(ctx: AnimationContext): Pose {
      elapsed += ctx.delta;
      const blend = easeInOut(elapsed / 0.3);
      const { proportions } = ctx.rig;

      // Slow heavy judder, the opposite end of the frequency range from fear.
      const judder = Math.sin(ctx.time * 9.5);
      const swell = Math.sin(ctx.time * 1.6) * 0.5 + 0.5;

      return {
        body: {
          x: judder * proportions.bodyWidth * 0.008 * blend,
          y: -proportions.bodyHeight * 0.015 * blend,
          // Puffed up: bigger in both directions, not stretched in one.
          scaleX: 1 + (0.035 + swell * 0.015) * blend,
          scaleY: 1 + (0.035 + swell * 0.015) * blend,
          rotation: judder * 0.02 * blend,
        },
        face: { y: -proportions.faceHeight * 0.015 * blend },
        // Ears flat back — the universal "do not".
        earLeft: { rotation: -0.95 * blend },
        earRight: { rotation: 0.95 * blend },
        tail: { rotation: -0.4 * blend + judder * 0.1 * blend },
      };
    },

    emotion(): EmotionRequest {
      return { emotion: 'anger', strength: 1, response: 0.8 };
    },
  };
}

/** Dizzy — the state you get for shaking something with a face. */
export function createDizzy(): PetState {
  let elapsed = 0;

  return {
    name: 'dizzy',
    intensity: 0.5,
    blendIn: 0.2,

    enter() {
      elapsed = 0;
    },

    pose(ctx: AnimationContext): Pose {
      elapsed += ctx.delta;
      const blend = easeInOut(elapsed / 0.25);
      const { proportions } = ctx.rig;

      // A slow circle: the creature cannot hold a straight line.
      const wobble = ctx.time * 2.4;

      return {
        body: {
          x: Math.sin(wobble) * proportions.bodyWidth * 0.035 * blend,
          y: Math.sin(wobble * 2) * proportions.bodyHeight * 0.012 * blend,
          rotation: Math.cos(wobble) * 0.07 * blend,
        },
        face: {
          x: Math.sin(wobble + 0.6) * proportions.bodyWidth * 0.02 * blend,
          rotation: Math.cos(wobble + 0.6) * 0.05 * blend,
        },
        earLeft: { rotation: Math.sin(wobble * 1.3) * 0.3 * blend },
        earRight: { rotation: Math.sin(wobble * 1.3 + 2) * 0.3 * blend },
      };
    },

    emotion(): EmotionRequest {
      return { emotion: 'dizzy', strength: 1, response: 0.6 };
    },
  };
}

/** Play — bouncing, wiggling, thoroughly pleased with itself. */
export function createPlay(): PetState {
  return {
    name: 'play',
    intensity: 1.6,
    blendIn: 0.15,

    pose(ctx: AnimationContext): Pose {
      const { proportions } = ctx.rig;
      const t = ctx.time;

      // Two rhythms: quick bounces, and a slower wiggle that turns the body
      // side to side between them.
      const bounce = Math.abs(Math.sin(t * 2.2 * Math.PI));
      const wiggle = Math.sin(t * 1.1 * Math.PI);

      return {
        body: {
          y: -bounce * proportions.bodyHeight * 0.11,
          x: wiggle * proportions.bodyWidth * 0.03,
          rotation: wiggle * 0.07,
          scaleY: 1 + bounce * 0.05,
          scaleX: 1 - bounce * 0.04,
        },
        face: { y: bounce * proportions.faceHeight * 0.02 },
        earLeft: { rotation: bounce * 0.28 },
        earRight: { rotation: -bounce * 0.28 },
        wingLeft: { rotation: -bounce * 0.45 },
        wingRight: { rotation: bounce * 0.45 },
        tail: { rotation: Math.sin(t * 7) * 0.3 },
      };
    },

    emotion(): EmotionRequest {
      return { emotion: 'joy', strength: 1, response: 0.8 };
    },
  };
}

/** Discover — something caught its attention and it is deciding about it. */
export function createDiscover(): PetState {
  let elapsed = 0;

  return {
    name: 'discover',
    intensity: 0.7,
    blendIn: 0.25,

    enter() {
      elapsed = 0;
    },

    pose(ctx: AnimationContext): Pose {
      elapsed += ctx.delta;
      const blend = easeInOut(elapsed / 0.3);
      const { proportions } = ctx.rig;

      const towards = ctx.lookTarget
        ? Math.sign(ctx.lookTarget.x) * Math.min(1, Math.abs(ctx.lookTarget.x) / 200)
        : 0.4;

      // Up on its toes, craning toward whatever it is.
      const alert = Math.sin(ctx.time * 2.2) * 0.01;

      return {
        body: {
          x: towards * proportions.bodyWidth * 0.05 * blend,
          y: -proportions.bodyHeight * 0.03 * blend,
          rotation: towards * 0.05 * blend,
          scaleY: 1 + (0.04 + alert) * blend,
          scaleX: 1 - 0.03 * blend,
        },
        // Ears brought upright and together: maximum attention.
        earLeft: { rotation: 0.28 * blend },
        earRight: { rotation: -0.28 * blend },
        topper: { rotation: towards * 0.15 * blend },
      };
    },

    emotion(): EmotionRequest {
      return { emotion: 'surprise', strength: 0.45, response: 0.7 };
    },
  };
}
