/**
 * Breathing.
 *
 * Present during almost every state — it is the single motion that makes the
 * difference between "a drawing" and "something alive"
 * (/Docs/animation-approach.md section 18).
 *
 * On a blob, breathing is squash and stretch: the mass gets taller and thinner
 * on the inhale, wider and shorter on the settle, and it keeps its feet on the
 * floor by moving down as it widens. The face and the topper ride on top with
 * a slight lag, so the creature moves as one soft mass rather than as a
 * pulsing shape with decorations glued to it.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import type { AnimationContext, PetMotionModule } from '../PetAnimationController';

export interface BreathingOptions {
  /** Breaths per second. */
  rate?: number;
  /** Base amplitude multiplier. */
  amount?: number;
}

export function createBreathing(options: BreathingOptions = {}): PetMotionModule {
  const rate = options.rate ?? 0.32;
  const amount = options.amount ?? 1;

  return {
    name: 'breathing',
    update(ctx: AnimationContext) {
      const { joints, proportions } = ctx.rig;
      const strength = amount * ctx.intensity;

      // Asymmetric curve: the inhale is quicker than the settle, which reads as
      // breathing rather than a sine wave.
      const phase = ctx.time * rate * Math.PI * 2;
      const wave = Math.sin(phase);
      const breath = wave * 0.5 + Math.sin(phase * 2) * 0.12;

      const stretch = breath * 0.03 * strength;

      offsetJoint(joints.body, {
        scaleX: 1 - stretch * 0.7,
        scaleY: 1 + stretch,
        // Growing upward from the floor rather than from the centre.
        y: -stretch * proportions.bodyHeight * 0.5,
      });

      // The face and topper lag a fraction of a beat behind the mass.
      const lag = Math.sin(phase - 0.6) * 0.5;
      offsetJoint(joints.face, {
        y: -lag * proportions.faceHeight * 0.015 * strength,
      });
      offsetJoint(joints.topper, {
        y: -lag * proportions.topperHeight * 0.03 * strength,
      });
    },
  };
}
