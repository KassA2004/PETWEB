/**
 * Blink.
 *
 * Deliberately NOT part of the state machine: the pet has to keep blinking
 * whether it is idling, walking or sitting, so the controller runs this as an
 * ambient module (/Docs/animation-approach.md section 12).
 *
 * Blinks come in a natural rhythm — a random gap, and occasionally a quick
 * double blink.
 */

import { createRng } from '../../assets/shared/shapes';
import type { AnimationContext, PetMotionModule } from '../PetAnimationController';

export interface BlinkOptions {
  /** Shortest gap between blinks, seconds. */
  minGap?: number;
  maxGap?: number;
  /** How long one blink takes, seconds. */
  duration?: number;
  seed?: number;
}

export function createBlink(options: BlinkOptions = {}): PetMotionModule {
  const minGap = options.minGap ?? 1.8;
  const maxGap = options.maxGap ?? 6.5;
  const duration = options.duration ?? 0.16;
  const rng = createRng(options.seed ?? 5150);

  let cooldown = minGap + rng() * (maxGap - minGap);
  let remaining = 0;
  let queued = 0;

  return {
    name: 'blink',
    update(ctx: AnimationContext) {
      const { face } = ctx.rig;

      if (remaining > 0) {
        remaining -= ctx.delta;

        const progress = 1 - Math.max(0, remaining) / duration;
        // Down fast, up slightly slower.
        const coverage =
          progress < 0.45
            ? progress / 0.45
            : 1 - (progress - 0.45) / 0.55;

        const closed = Math.max(0, Math.min(1, coverage));

        // The lid only ever adds closure on top of the eye type's resting lid,
        // so a sleepy-eyed pet still blinks fully shut.
        face.eyeLeft.lid.scale.y = Math.max(face.eyeLeft.lid.scale.y, closed);
        face.eyeRight.lid.scale.y = Math.max(face.eyeRight.lid.scale.y, closed);

        if (remaining <= 0 && queued > 0) {
          queued -= 1;
          remaining = duration;
        }
        return;
      }

      cooldown -= ctx.delta;
      if (cooldown <= 0) {
        remaining = duration;
        cooldown = minGap + rng() * (maxGap - minGap);
        // Roughly one in five blinks is a double.
        queued = rng() < 0.2 ? 1 : 0;
      }
    },
  };
}
