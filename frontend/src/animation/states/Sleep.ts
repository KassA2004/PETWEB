/**
 * Sleep — four different ways to be unconscious.
 *
 * One sleep pose is a screensaver. The creature picks a pose when it lies down,
 * shuffles occasionally in the night, and picks a different one next time, so
 * finding it asleep is a small event rather than the same frame again
 * (/Docs/animation-approach.md §19).
 *
 * Every pose keeps the mass intact: the creature tips, slumps and settles, and
 * the only scaling is the couple of percent a real sleeping body does when it
 * breathes.
 */

import { lerp } from '../../assets/shared/shapes';
import type { Pose } from '../core/Pose';
import { easeInOut } from '../core/Pose';
import type { AnimationContext, EmotionRequest, PetState } from '../core/types';

export const SLEEP_POSES = ['curled', 'slumped', 'sprawled', 'doze'] as const;

export type SleepPose = (typeof SLEEP_POSES)[number];

export function createSleep(): PetState {
  let pose: SleepPose = 'curled';
  let elapsed = 0;
  /** Time until the next shuffle in the night. */
  let nextShuffle = 8;
  let shuffleTime = 0;
  let shuffling = false;
  let previous: SleepPose | null = null;

  const choose = (ctx: AnimationContext): SleepPose => {
    const options = SLEEP_POSES.filter((option) => option !== previous);
    const chosen = options[Math.floor(ctx.random() * options.length)];
    previous = chosen;
    return chosen;
  };

  return {
    name: 'sleep',
    // Everything ambient drops to a fraction — this is what makes sleep feel
    // like sleep, more than the pose does.
    intensity: 0.3,
    blendIn: 0.9,

    enter(ctx) {
      elapsed = 0;
      shuffling = false;
      shuffleTime = 0;
      nextShuffle = 7 + ctx.random() * 9;
      pose = choose(ctx);
    },

    pose(ctx: AnimationContext): Pose {
      elapsed += ctx.delta;
      const blend = easeInOut(elapsed / 1.1);

      // --- Shuffling in the night ------------------------------------------
      if (shuffling) {
        shuffleTime += ctx.delta;
        if (shuffleTime > 1.4) {
          shuffling = false;
          shuffleTime = 0;
          nextShuffle = 9 + ctx.random() * 12;
          pose = choose(ctx);
        }
      } else {
        nextShuffle -= ctx.delta;
        if (nextShuffle <= 0) {
          shuffling = true;
          shuffleTime = 0;
        }
      }

      const shuffle = shuffling ? Math.sin((shuffleTime / 1.4) * Math.PI) : 0;
      const target = posePose(pose, ctx, blend);

      if (shuffle > 0) {
        // A slow roll toward the next position, rather than a cut.
        const next = posePose(previous ?? pose, ctx, blend);
        return blendPoses(target, next, shuffle * 0.5, ctx, shuffle);
      }

      return target;
    },

    emotion(): EmotionRequest {
      return { emotion: 'sleepy', strength: 1, response: 0.15 };
    },
  };
}

function posePose(pose: SleepPose, ctx: AnimationContext, blend: number): Pose {
  const { proportions } = ctx.rig;
  // A long slow swell, so a sleeping creature is never actually still.
  const breath = Math.sin(ctx.time * 0.55) * 0.5 + 0.5;

  switch (pose) {
    case 'curled':
      // Tucked into itself, tipped slightly forward.
      return {
        body: {
          y: proportions.bodyHeight * 0.1 * blend,
          scaleY: 1 - 0.05 * blend,
          scaleX: 1 + 0.04 * blend,
          rotation: 0.06 * blend,
        },
        face: {
          y: proportions.faceHeight * 0.05 * blend,
          x: -proportions.bodyWidth * 0.02 * blend,
          rotation: 0.04 * blend,
        },
        tail: { rotation: -0.5 * blend },
        earLeft: { rotation: -0.55 * blend },
        earRight: { rotation: 0.5 * blend },
      };

    case 'slumped':
      // Fallen over to one side, face half buried.
      return {
        body: {
          y: proportions.bodyHeight * 0.14 * blend,
          scaleY: 1 - 0.06 * blend,
          scaleX: 1 + 0.05 * blend,
          rotation: 0.28 * blend,
          x: -proportions.bodyWidth * 0.05 * blend,
        },
        face: {
          y: proportions.faceHeight * 0.06 * blend,
          rotation: -0.1 * blend,
        },
        tail: { rotation: 0.35 * blend },
        // Slumped to one side: the underneath ear folds, the top one flops.
        earLeft: { rotation: -0.95 * blend },
        earRight: { rotation: -0.25 * blend },
      };

    case 'sprawled':
      // Flat out, taking up as much floor as possible.
      return {
        body: {
          y: proportions.bodyHeight * 0.17 * blend,
          scaleY: 1 - 0.08 * blend * (1 - breath * 0.15),
          scaleX: 1 + 0.07 * blend,
          rotation: -0.05 * blend,
        },
        face: { y: proportions.faceHeight * 0.07 * blend },
        tail: { rotation: 0.15 * blend },
        earLeft: { rotation: -0.8 * blend },
        earRight: { rotation: 0.8 * blend },
        wingLeft: { rotation: 0.4 * blend },
        wingRight: { rotation: -0.4 * blend },
      };

    case 'doze':
      // Still sitting up, nodding off, catching itself. Barely asleep.
      return {
        body: {
          y: proportions.bodyHeight * 0.04 * blend,
          rotation: lerp(0, 0.05, breath) * blend,
        },
        face: {
          y: proportions.faceHeight * 0.03 * blend * breath,
          rotation: lerp(-0.02, 0.06, breath) * blend,
        },
        topper: { rotation: lerp(-0.05, 0.12, breath) * blend },
        // Dozing upright: ears droop outward a little on each slow breath.
        earLeft: { rotation: -0.32 * blend * breath },
        earRight: { rotation: 0.28 * blend * breath },
      };
  }
}

/** Mid-shuffle: a roll from one sleeping position toward the next. */
function blendPoses(
  from: Pose,
  to: Pose,
  weight: number,
  ctx: AnimationContext,
  shuffle: number,
): Pose {
  const { proportions } = ctx.rig;
  const merged: Pose = { ...from };

  merged.body = {
    ...from.body,
    rotation: (from.body?.rotation ?? 0) * (1 - weight) + (to.body?.rotation ?? 0) * weight,
    // A small lift as it rolls over, so it does not slide through the floor.
    y: (from.body?.y ?? 0) - shuffle * proportions.bodyHeight * 0.03,
  };

  return merged;
}
