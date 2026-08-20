/**
 * Wobble — the jelly layer.
 *
 * A blob is soft, and soft things keep moving after they stop. This module is
 * what carries that: a slow lean of the whole mass, with the arms and the
 * topper trailing behind it on their own delay.
 *
 * It replaces the ear and tail motion the old quadruped rig had — same job
 * (small independent parts that never sit perfectly still), one module instead
 * of two, because a blob only has these two trailing parts.
 *
 * The lag is what sells it: everything runs off one wobble wave, sampled at a
 * slightly earlier time the further out on the creature it sits.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import type { AnimationContext, PetMotionModule } from '../PetAnimationController';

export interface WobbleOptions {
  amount?: number;
  /** Wobbles per second. */
  rate?: number;
}

/** Two incommensurate sines, so the wobble never visibly loops. */
function wobbleAt(t: number): number {
  return Math.sin(t) * 0.65 + Math.sin(t * 1.63 + 1.1) * 0.35;
}

export function createWobble(options: WobbleOptions = {}): PetMotionModule {
  const amount = options.amount ?? 1;
  const rate = options.rate ?? 0.36;

  return {
    name: 'wobble',
    update(ctx: AnimationContext) {
      const { joints, topperFloppiness } = ctx.rig;
      const strength = amount * ctx.intensity;
      const phase = ctx.time * rate * Math.PI * 2;

      const lean = wobbleAt(phase);

      offsetJoint(joints.body, {
        rotation: lean * 0.016 * strength,
      });

      // Arms trail a quarter beat behind, and mirror each other.
      const armLag = wobbleAt(phase - 0.5);
      offsetJoint(joints.armLeft, { rotation: armLag * 0.1 * strength });
      offsetJoint(joints.armRight, { rotation: -armLag * 0.09 * strength });

      // The topper trails furthest, scaled by how floppy its type is.
      const topperLag = wobbleAt(phase - 0.9);
      offsetJoint(joints.topper, {
        rotation: -topperLag * 0.09 * strength * topperFloppiness,
      });
    },
  };
}
