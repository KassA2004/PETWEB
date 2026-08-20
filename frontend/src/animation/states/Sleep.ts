/**
 * Sleep — lowest-energy pose.
 *
 * Everything slows down rather than stopping: the pet keeps breathing and the
 * topper keeps drifting faintly. A sleeping creature that is completely still
 * reads as broken, not asleep.
 *
 * The eyes are held shut here by pushing the lids closed. The blink module
 * uses `Math.max` when it writes, so it can never re-open them mid-sleep.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import { smoothstep } from '../../assets/shared/shapes';
import type { AnimationContext, PetAnimationState } from '../PetAnimationController';

export interface SleepOptions {
  blendIn?: number;
}

export function createSleep(options: SleepOptions = {}): PetAnimationState {
  const blendIn = options.blendIn ?? 1.1;
  let elapsed = 0;

  return {
    name: 'sleep',

    enter() {
      elapsed = 0;
    },

    modulate(ctx: AnimationContext) {
      // Ambient motion drops to a fraction — this is what makes sleep feel like
      // sleep, more than the pose does.
      ctx.intensity = 0.3;
    },

    update(ctx: AnimationContext) {
      elapsed += ctx.delta;
      const blend = smoothstep(elapsed / blendIn);

      const { joints, proportions, face } = ctx.rig;

      // The whole body melts toward the floor.
      offsetJoint(joints.body, {
        y: proportions.bodyHeight * 0.16 * blend,
        scaleX: 1 + 0.18 * blend,
        scaleY: 1 - 0.22 * blend,
        rotation: 0.03 * blend,
      });

      // Feet slide out and go slack.
      offsetJoint(joints.footLeft, {
        x: -proportions.footWidth * 0.5 * blend,
        rotation: -0.5 * blend,
      });
      offsetJoint(joints.footRight, {
        x: proportions.footWidth * 0.5 * blend,
        rotation: 0.5 * blend,
      });

      // Arms flop outward.
      offsetJoint(joints.armLeft, { rotation: -0.6 * blend });
      offsetJoint(joints.armRight, { rotation: 0.6 * blend });

      // The topper droops to one side.
      offsetJoint(joints.topper, { rotation: 0.4 * blend });

      // The face slides down the front of the melted mass.
      offsetJoint(joints.face, {
        y: proportions.bodyHeight * 0.05 * blend,
      });

      // Eyes closed.
      face.eyeLeft.lid.scale.y = Math.max(face.eyeLeft.lid.scale.y, blend);
      face.eyeRight.lid.scale.y = Math.max(face.eyeRight.lid.scale.y, blend);
    },
  };
}
