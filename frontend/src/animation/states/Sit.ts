/**
 * Sit — a pose rather than a cycle.
 *
 * The pet transitions into sitting instead of snapping into it
 * (/Docs/animation-approach.md section 25): the pose blends in over a short
 * ramp, so entering and leaving the state is smooth.
 *
 * For a blob, sitting is settling: the mass spreads sideways and drops onto
 * the floor, the feet splay out from under it, and the arms come to rest.
 * Ambient breathing and wobble keep running underneath, which is what stops a
 * held pose from looking like a frozen frame.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import { smoothstep } from '../../assets/shared/shapes';
import type { AnimationContext, PetAnimationState } from '../PetAnimationController';

export interface SitOptions {
  /** Seconds to blend the pose in. */
  blendIn?: number;
}

export function createSit(options: SitOptions = {}): PetAnimationState {
  const blendIn = options.blendIn ?? 0.55;
  let elapsed = 0;

  return {
    name: 'sit',

    enter() {
      elapsed = 0;
    },

    modulate(ctx: AnimationContext) {
      ctx.intensity = 0.8;
    },

    update(ctx: AnimationContext) {
      elapsed += ctx.delta;
      const blend = smoothstep(elapsed / blendIn);

      const { joints, proportions } = ctx.rig;

      // The mass settles: shorter, wider, lower.
      offsetJoint(joints.body, {
        y: proportions.bodyHeight * 0.1 * blend,
        scaleY: 1 - 0.14 * blend,
        scaleX: 1 + 0.11 * blend,
      });

      // Feet slide out from under the spreading body.
      offsetJoint(joints.footLeft, {
        x: -proportions.footWidth * 0.35 * blend,
        rotation: -0.3 * blend,
      });
      offsetJoint(joints.footRight, {
        x: proportions.footWidth * 0.35 * blend,
        rotation: 0.3 * blend,
      });

      // Arms drop to rest against the sides.
      offsetJoint(joints.armLeft, { rotation: -0.28 * blend });
      offsetJoint(joints.armRight, { rotation: 0.28 * blend });

      // The face rides down with the mass, but less than the mass moves — a
      // sitting creature still looks up.
      offsetJoint(joints.face, {
        y: proportions.bodyHeight * 0.03 * blend,
      });
    },
  };
}
