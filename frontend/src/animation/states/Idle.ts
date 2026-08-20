/**
 * Idle — the default state, and the most important one.
 *
 * Idle is not "no animation". It is a slow weight shift from one side to the
 * other, with the feet taking the load and the face counter-balancing
 * (/Docs/animation-approach.md section 15).
 *
 * Ambient breathing, wobble, face drift and blinking all run underneath this
 * via the controller, so this state only has to contribute the weight shift.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import type { AnimationContext, PetAnimationState } from '../PetAnimationController';

export interface IdleOptions {
  amount?: number;
  /** Full weight-shift cycles per second. */
  rate?: number;
}

export function createIdle(options: IdleOptions = {}): PetAnimationState {
  const amount = options.amount ?? 1;
  const rate = options.rate ?? 0.13;

  return {
    name: 'idle',

    update(ctx: AnimationContext) {
      const { joints, proportions } = ctx.rig;
      const strength = amount * ctx.intensity;

      const phase = ctx.time * rate * Math.PI * 2;
      const shift = Math.sin(phase);
      // Sinking is strongest at the extremes of the shift, hence the doubled
      // frequency on the vertical component.
      const settle = Math.cos(phase * 2) * 0.5 + 0.5;

      offsetJoint(joints.body, {
        x: shift * proportions.bodyWidth * 0.018 * strength,
        y: settle * proportions.bodyHeight * 0.008 * strength,
        rotation: shift * 0.014 * strength,
        scaleX: 1 + settle * 0.008 * strength,
        scaleY: 1 - settle * 0.01 * strength,
      });

      // Weight lands on the foot the creature is leaning toward: it spreads
      // under the load while the other one lightens.
      const load = shift * 0.12 * strength;
      offsetJoint(joints.footLeft, { scaleX: 1 - load, scaleY: 1 + load * 0.5 });
      offsetJoint(joints.footRight, { scaleX: 1 + load, scaleY: 1 - load * 0.5 });

      // The face stays roughly put while the mass sways beneath it.
      offsetJoint(joints.face, {
        x: -shift * proportions.bodyWidth * 0.01 * strength,
      });
    },
  };
}
