/**
 * Play — energetic, bouncy excitement.
 *
 * The animation half of "interact with objects": a behavior system decides
 * when the pet is playing and with what — this state only has to look like
 * play. It combines two rhythms:
 *
 *   - a fast bounce, the blob hopping in place
 *   - a slower wind-up, where it crouches low before a bigger jump
 *
 * That combination is deliberately not a single clean sine wave: real play
 * looks like bursts of energy, not a metronome, and alternating two unrelated
 * periods gets that without any randomness (so it stays perfectly
 * reproducible, matching every other procedural system in this project).
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import type { AnimationContext, PetAnimationState } from '../PetAnimationController';

export interface PlayOptions {
  /** Hops per second. */
  bounceRate?: number;
  /** Wind-up cycles per second — slower, so crouches read as distinct beats. */
  crouchRate?: number;
}

export function createPlay(options: PlayOptions = {}): PetAnimationState {
  const bounceRate = options.bounceRate ?? 2.1;
  const crouchRate = options.crouchRate ?? 0.55;

  return {
    name: 'play',

    modulate(ctx: AnimationContext) {
      // Everything ambient gets more energetic: livelier wobble, bigger
      // breathing — play is the highest-intensity state.
      ctx.intensity = 1.6;
    },

    update(ctx: AnimationContext) {
      const { joints, proportions } = ctx.rig;
      const t = ctx.time;

      // The crouch cycle: 0 at rest, ramping to 1 at the bottom of a crouch,
      // held briefly, then releasing — an eased pulse rather than a plain sine
      // so it has a distinct "down... down... spring!" shape.
      const crouchPhase = (t * crouchRate) % 1;
      const crouch = Math.max(0, Math.sin(crouchPhase * Math.PI)) ** 0.6;

      // Bouncing suppresses itself while deep in a crouch, so the two rhythms
      // read as connected rather than fighting each other.
      const bounce = Math.abs(Math.sin(t * bounceRate * Math.PI));
      const height = bounce * (1 - crouch * 0.55);

      offsetJoint(joints.body, {
        y: -height * proportions.bodyHeight * 0.14 + crouch * proportions.bodyHeight * 0.05,
        scaleY: 1 + height * 0.08 - crouch * 0.12,
        scaleX: 1 - height * 0.06 + crouch * 0.1,
        rotation: Math.sin(t * bounceRate * Math.PI) * 0.04,
      });

      // Feet kick up under the body on every hop.
      offsetJoint(joints.footLeft, {
        y: -height * proportions.footHeight * 0.7,
        rotation: -height * 0.5,
      });
      offsetJoint(joints.footRight, {
        y: -height * proportions.footHeight * 0.6,
        rotation: height * 0.5,
      });

      // Arms thrown up and flapping.
      const flap = Math.sin(t * bounceRate * Math.PI * 2) * 0.25;
      offsetJoint(joints.armLeft, { rotation: 0.7 + flap });
      offsetJoint(joints.armRight, { rotation: -0.7 - flap });

      // The topper bounces hardest of anything on the creature.
      offsetJoint(joints.topper, {
        rotation: Math.sin(t * bounceRate * Math.PI * 2 + 0.8) * 0.22 * ctx.rig.topperFloppiness,
        y: -height * proportions.topperHeight * 0.06,
      });

      // Face lifted and mouth wide open — held, rather than cycling, so it
      // does not flap.
      offsetJoint(joints.face, { y: -proportions.faceHeight * 0.02 });
      offsetJoint(joints.mouth, { scaleY: 1.45, scaleX: 1.12 });
    },
  };
}
