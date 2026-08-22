/**
 * Hopping and running.
 *
 * A creature with no legs travels by hopping, and a hop is two curves:
 *
 *   lift    0 on the ground, 1 at the apex
 *   land    a brief pulse at the moment of contact
 *
 * Everything else hangs off those. The body stretches slightly on the way up
 * and compresses slightly on contact — *slightly*, because the ears, tail and
 * topper are already broadcasting the motion through their springs, and the
 * old habit of flattening the whole creature to sell a hop is exactly what this
 * rewrite is for.
 *
 * Running is the same cycle with a shorter period, a longer arc and a forward
 * pitch, so the two read as the same creature moving at two speeds rather than
 * two unrelated animations (/Docs/animation-approach.md §15-17).
 */

import { clamp } from '../../assets/shared/shapes';
import type { Pose } from '../core/Pose';
import type { AnimationContext, EmotionRequest, PetState } from '../core/types';

interface GaitOptions {
  name: string;
  /** Hops per second at reference speed. */
  rate: number;
  /** Apex height as a share of body height. */
  lift: number;
  /** Forward pitch at the apex, radians. */
  pitch: number;
  intensity: number;
  emotion?: EmotionRequest;
}

function createGait(options: GaitOptions): PetState {
  // Kept across frames so a speed change does not restart the cycle mid-air.
  let cycle = 0;

  return {
    name: options.name,
    intensity: options.intensity,
    blendIn: 0.18,

    pose(ctx: AnimationContext): Pose {
      const { proportions, weights } = ctx.rig;
      const motion = ctx.motion;

      // A big creature hops slower than a small one, and a creature moving
      // faster hops more often. Both fall out of the same number.
      const sizeFactor = clamp(220 / Math.max(80, proportions.bodyWidth), 0.6, 1.4);
      const speedFactor = clamp(0.7 + motion.speed / 260, 0.7, 1.9);

      cycle = (cycle + ctx.delta * options.rate * sizeFactor * speedFactor) % 1;

      const lift = Math.sin(cycle * Math.PI);
      // Sharpest at the instant of contact, gone a moment later.
      const land = Math.max(0, 1 - Math.abs(cycle - 1) * 9) + Math.max(0, 1 - cycle * 9);

      const direction = Math.sign(motion.vx || 1);
      const height = lift * proportions.bodyHeight * options.lift;

      const pose: Pose = {
        body: {
          y: -height,
          // Total scale change stays under 8%: enough to feel springy, not
          // enough to look like the creature is being crushed.
          scaleY: 1 + lift * 0.05 - land * 0.06,
          scaleX: 1 - lift * 0.04 + land * 0.05,
          rotation: direction * options.pitch * lift,
        },
        // The face lags the launch by a hair, which is where the sense of
        // weight comes from.
        face: { y: lift * proportions.faceHeight * 0.02 },
      };

      // Wings beat harder while airborne on anything that has them.
      if (weights.wing.flutter > 0) {
        pose.wingLeft = { rotation: -lift * 0.34 };
        pose.wingRight = { rotation: lift * 0.34 };
      }

      return pose;
    },

    emotion(): EmotionRequest | null {
      return options.emotion ?? null;
    },
  };
}

export function createHop(): PetState {
  return createGait({
    name: 'hop',
    rate: 1.05,
    lift: 0.15,
    pitch: 0.05,
    intensity: 1.2,
  });
}

export function createRun(): PetState {
  return createGait({
    name: 'run',
    rate: 1.9,
    lift: 0.24,
    pitch: 0.11,
    intensity: 1.5,
    // Chasing something is the happiest a creature gets without being fed.
    emotion: { emotion: 'joy', strength: 0.55, response: 0.6 },
  });
}
