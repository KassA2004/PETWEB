/**
 * Discover — the pet has noticed something and is investigating it.
 *
 * This is the animation half of "interact with objects": nothing here decides
 * *what* the pet noticed or *when* — a future behavior system calls
 * `PetAnimationController.setLookTarget(point)` and then `setState('discover')`,
 * and this state turns that into a convincing curious pose. With no target set
 * it still reads fine, just leaning generally forward and up.
 *
 * The pose: the mass stretches tall and leans toward whatever it is looking at
 * (a blob's version of craning a neck), the arms reach forward, and the mouth
 * opens into a small "oh?". FaceMotion.ts does the actual aiming at the look
 * target — this state only holds the body's half of the pose.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import { clamp, smoothstep } from '../../assets/shared/shapes';
import type { AnimationContext, PetAnimationState } from '../PetAnimationController';

export interface DiscoverOptions {
  blendIn?: number;
}

export function createDiscover(options: DiscoverOptions = {}): PetAnimationState {
  const blendIn = options.blendIn ?? 0.4;
  let elapsed = 0;

  return {
    name: 'discover',

    enter() {
      elapsed = 0;
    },

    modulate(ctx: AnimationContext) {
      // Alert but controlled — calmer than idle's ambient wander so the held
      // lean does not get lost under it.
      ctx.intensity = 0.7;
    },

    update(ctx: AnimationContext) {
      elapsed += ctx.delta;
      const blend = smoothstep(elapsed / blendIn);

      const { joints, proportions } = ctx.rig;

      // Lean toward the thing of interest, or forward-ish if there is nothing.
      const towards = ctx.lookTarget
        ? clamp(ctx.lookTarget.x / (proportions.bodyWidth * 1.2), -1, 1)
        : 0.5;

      // Stretched tall: the blob equivalent of standing up to see better.
      offsetJoint(joints.body, {
        x: towards * proportions.bodyWidth * 0.06 * blend,
        y: -proportions.bodyHeight * 0.04 * blend,
        rotation: towards * 0.06 * blend,
        scaleY: 1 + 0.07 * blend,
        scaleX: 1 - 0.05 * blend,
      });

      // A slow pulse on top of the lean reads as held attention rather than a
      // frozen pose — small enough not to fight the ambient breathing.
      const alert = Math.sin(ctx.time * 2.2) * 0.012 * blend;
      offsetJoint(joints.body, { scaleY: 1 + alert });

      // Arms reach out toward the target side.
      offsetJoint(joints.armLeft, { rotation: (-0.3 + towards * 0.2) * blend });
      offsetJoint(joints.armRight, { rotation: (0.3 + towards * 0.2) * blend });

      // The topper tips forward, dragged by the lean.
      offsetJoint(joints.topper, {
        rotation: towards * 0.18 * blend * ctx.rig.topperFloppiness,
      });

      // A small "oh?" mouth: it opens slightly rather than going wide the way
      // Play does.
      offsetJoint(joints.mouth, { scaleY: 1 + 0.2 * blend });
    },
  };
}
