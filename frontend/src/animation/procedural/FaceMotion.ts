/**
 * Face motion — slow, wandering attention, or a fixed gaze when something has
 * caught the pet's eye.
 *
 * A blob has no neck to turn, so "looking" is done by sliding the face group
 * across the front of the mass and shifting the eyes inside it. Two layers of
 * the same motion, the eyes leading the face, is enough to read as a head
 * turn — and it costs two container moves.
 *
 * When `ctx.lookTarget` is set (via `PetAnimationController.setLookTarget`),
 * the face turns toward it instead of wandering. That is what makes Discover
 * (and, more subtly, any other state) able to react to "there is something
 * over there" without needing its own aiming logic.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import { clamp, lerp } from '../../assets/shared/shapes';
import type { AnimationContext, PetMotionModule } from '../PetAnimationController';

export interface FaceMotionOptions {
  amount?: number;
}

export function createFaceMotion(options: FaceMotionOptions = {}): PetMotionModule {
  const amount = options.amount ?? 1;

  return {
    name: 'face-motion',
    update(ctx: AnimationContext) {
      const { joints, proportions, face } = ctx.rig;
      const strength = amount * ctx.intensity;
      const t = ctx.time;

      // Two incommensurate frequencies per axis -> non-repeating wander.
      const wanderX = Math.sin(t * 0.31) * 0.65 + Math.sin(t * 0.73 + 1.2) * 0.35;
      const wanderY = Math.sin(t * 0.24 + 2.1) * 0.7 + Math.sin(t * 0.61) * 0.3;

      let targetX = wanderX;
      let targetY = wanderY;

      if (ctx.lookTarget) {
        const lookX = clamp(ctx.lookTarget.x / (proportions.bodyWidth * 1.2), -1, 1);
        const lookY = clamp(ctx.lookTarget.y / (proportions.totalHeight * 0.6), -1, 1);

        // Mostly locked onto the target, with a sliver of the ambient wander
        // still mixed in so a held gaze does not look frozen.
        targetX = lerp(lookX, wanderX, 0.12);
        targetY = lerp(lookY, wanderY, 0.12);
      }

      offsetJoint(joints.face, {
        x: targetX * proportions.bodyWidth * 0.035 * strength,
        y: targetY * proportions.bodyHeight * 0.02 * strength,
        rotation: targetX * 0.03 * strength,
      });

      // The eyes lead the face turn.
      const gazeX = ctx.lookTarget
        ? targetX
        : targetX * 0.6 + Math.sin(t * 0.19 + 3.3) * 0.4;
      const gazeY = targetY * 0.5;

      for (const eye of [face.eyeLeft, face.eyeRight]) {
        eye.pupil.position.set(
          gazeX * eye.radiusX * 0.3 * strength,
          gazeY * eye.radiusY * 0.24 * strength,
        );
      }
    },
  };
}
