/**
 * Impact clips: landing, and hitting a wall.
 *
 * Both are built the same way — anticipation is impossible (the creature did
 * not agree to this), so they start at the impact and spend their length
 * recovering from it:
 *
 *   0.00 ── hit ──0.10── flattened, stunned ──0.45── push up ──0.75── settle ──1.0
 *
 * A hard landing keeps the creature down longer, which is the difference
 * between a bounce and a fall. Both clips scale their squash with the force but
 * cap it well short of deformation: the mass keeps its shape, and the ears,
 * tail and topper — already flying, courtesy of the spring layer — carry the
 * violence (/Docs/animation-approach.md §54).
 */

import { clamp } from '../../assets/shared/shapes';
import type { ClipDefinition } from '../core/Clip';
import { easeOutBack, easeOutCubic } from '../core/Pose';
import type { Pose } from '../core/Pose';
import type { AnimationContext, EmotionRequest } from '../core/types';

/**
 * Landing after a fall.
 *
 * @param force 0..1, from the impact speed. Harder means flatter and longer.
 */
export function createLandClip(force: number): ClipDefinition {
  const strength = clamp(force, 0, 1);
  // Hard falls keep it on the floor for over a second and a half.
  const duration = 0.55 + strength * 1.25;
  const squash = 0.06 + strength * 0.09;

  return {
    name: 'land',
    duration,
    blendIn: 0.02,
    blendOut: 0.25,
    priority: 60,

    pose(t: number, ctx: AnimationContext): Pose {
      const { proportions } = ctx.rig;

      // Three windows: the hit, the time spent lying there, the push back up.
      const hit = t < 0.12 ? easeOutCubic(t / 0.12) : 1;
      const down = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.3);
      const rise = t > 0.55 ? easeOutBack((t - 0.55) / 0.45, 1.9) : 0;

      const flat = hit * down * squash * (1 - rise * 0.9);

      return {
        body: {
          // Sinks into the floor, then springs back with a little overshoot.
          y: proportions.bodyHeight * flat * 0.6 - rise * proportions.bodyHeight * 0.05,
          scaleY: 1 - flat,
          // Widening is capped at half the squash, so it spreads rather than
          // smears sideways.
          scaleX: 1 + flat * 0.5,
          rotation: Math.sin(t * Math.PI * 3) * 0.02 * (1 - t),
        },
        face: { y: proportions.faceHeight * flat * 0.25 },
        // Everything loose is thrown by the stop. Both ears go the same way —
        // they are attached to the same head, and mirroring them makes them
        // cross over the face instead of flying.
        earLeft: { rotation: -flat * 1.6 },
        earRight: { rotation: -flat * 1.4 },
        topper: { rotation: -flat * 1.5 },
        tail: { rotation: flat * 1.8 },
      };
    },

    emotion(t: number): EmotionRequest | null {
      if (strength < 0.35) return null;
      // Winded first, then just cross about it.
      return t < 0.5
        ? { emotion: 'surprise', strength: 0.9, response: 1 }
        : { emotion: 'dizzy', strength: 0.5 * strength, response: 0.5 };
    },
  };
}

/**
 * Hitting a wall.
 *
 * The creature stops dead, pivots against the surface and peels off it. The
 * squash is deliberately tiny and along the axis of travel only — a creature
 * smeared flat against a wall stops being the creature.
 *
 * @param direction -1 if it hit the left wall, +1 the right.
 */
export function createSmashClip(force: number, direction: number): ClipDefinition {
  const strength = clamp(force, 0, 1);
  const duration = 0.45 + strength * 0.5;
  const dir = Math.sign(direction) || 1;

  return {
    name: 'smash',
    duration,
    blendIn: 0.02,
    blendOut: 0.2,
    priority: 70,

    pose(t: number, ctx: AnimationContext): Pose {
      const { proportions } = ctx.rig;

      const hit = t < 0.1 ? easeOutCubic(t / 0.1) : Math.max(0, 1 - (t - 0.1) / 0.5);
      const peel = t > 0.25 ? easeOutCubic((t - 0.25) / 0.75) : 0;

      // Pressed against the wall, then pushed away from it.
      const press = hit * strength;

      return {
        body: {
          x: dir * proportions.bodyWidth * (press * 0.06 - peel * press * 0.14),
          y: -press * proportions.bodyHeight * 0.02,
          // The only compression is across the direction of travel, and it is
          // small enough that the silhouette stays the same shape.
          scaleX: 1 - press * 0.07,
          scaleY: 1 + press * 0.05,
          // The pivot is what actually sells the impact.
          rotation: -dir * press * 0.28 + dir * peel * press * 0.16,
        },
        face: {
          x: dir * proportions.bodyWidth * press * 0.03,
          rotation: -dir * press * 0.1,
        },
        earLeft: { rotation: -dir * press * 0.85 },
        earRight: { rotation: -dir * press * 0.9 },
        topper: { rotation: -dir * press * 0.8 },
        tail: { rotation: dir * press * 1.1 },
      };
    },

    emotion(t: number): EmotionRequest {
      return t < 0.45
        ? { emotion: 'surprise', strength: 1, response: 1 }
        : { emotion: 'dizzy', strength: 0.7 * strength, response: 0.6 };
    },
  };
}
