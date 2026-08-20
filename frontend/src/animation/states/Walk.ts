/**
 * Walk — the blob does not walk, it hops.
 *
 * One hop is the whole cycle, and the cycle is built from two curves:
 *
 *   hop     0 on the ground, 1 at the apex — drives height and stretch
 *   squash  strongest the instant it lands — drives the splat
 *
 * Stretch on the way up, squash on the landing: that pairing is what makes a
 * soft body read as soft. Everything else (feet swinging under, arms flapping,
 * the face lagging a frame behind) hangs off the same two curves.
 *
 * Hop height scales with the creature's ground clearance, so a blob with tiny
 * feet takes small hops and one on stilts takes big ones — the animation
 * adapts to the rig parameters rather than assuming a fixed body.
 *
 * Nothing here decides *when* the pet walks; that belongs to a behavior system
 * which is not part of this task.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import { clamp } from '../../assets/shared/shapes';
import type { AnimationContext, PetAnimationState } from '../PetAnimationController';

export interface WalkOptions {
  /** Hops per second. */
  rate?: number;
  amount?: number;
}

export function createWalk(options: WalkOptions = {}): PetAnimationState {
  const rate = options.rate ?? 1.05;
  const amount = options.amount ?? 1;

  return {
    name: 'walk',

    modulate(ctx: AnimationContext) {
      // Ambient motion picks up while moving.
      ctx.intensity = 1.25;
    },

    update(ctx: AnimationContext) {
      const { joints, proportions } = ctx.rig;

      // Reference clearance is the default pet's; everything scales from there.
      const hopScale = clamp(proportions.groundClearance / 12, 0.5, 1.8);
      const strength = amount * hopScale;

      const cycle = (ctx.time * rate) % 1;
      const hop = Math.sin(cycle * Math.PI);
      const squash = (1 - hop) ** 3;

      offsetJoint(joints.body, {
        y: -hop * proportions.bodyHeight * 0.16 * strength,
        x: Math.sin(cycle * Math.PI * 2) * proportions.bodyWidth * 0.02 * strength,
        scaleY: 1 + hop * 0.07 * strength - squash * 0.1 * strength,
        scaleX: 1 - hop * 0.05 * strength + squash * 0.09 * strength,
        rotation: Math.sin(cycle * Math.PI * 2) * 0.03 * strength,
      });

      // Feet tuck up and swing forward at the apex, alternating so successive
      // hops do not look identical.
      const lead = Math.sin(ctx.time * rate * Math.PI) > 0 ? 1 : -1;
      offsetJoint(joints.footLeft, {
        y: -hop * proportions.footHeight * 0.6,
        rotation: -hop * 0.4 * lead,
      });
      offsetJoint(joints.footRight, {
        y: -hop * proportions.footHeight * 0.5,
        rotation: hop * 0.4 * lead,
      });

      // Arms fling out on the way up.
      offsetJoint(joints.armLeft, { rotation: hop * 0.55 });
      offsetJoint(joints.armRight, { rotation: -hop * 0.55 });

      // The face sinks a little as the body launches — the classic lag that
      // makes weight read as weight rather than as a moving picture.
      offsetJoint(joints.face, {
        y: hop * proportions.faceHeight * 0.035,
      });

      // The topper whips over on the way up and settles on landing.
      offsetJoint(joints.topper, {
        rotation: -Math.sin(cycle * Math.PI * 2) * 0.18 * ctx.rig.topperFloppiness,
      });
    },
  };
}
