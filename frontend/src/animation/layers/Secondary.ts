/**
 * Secondary motion — the layer that does most of the acting.
 *
 * Nothing in here is authored. Every appendage is a spring pulled by what the
 * body just did: accelerate left and the ears swing right, land hard and
 * everything bounces, get shaken and the whole set flails. One rule produces
 * correct-looking follow-through for animations nobody wrote, including the
 * ones the user invents by throwing the creature at a wall.
 *
 * This is also the reason the body itself barely deforms any more. Motion is
 * legible because the loose parts move, so the mass does not have to be
 * squashed to prove that something happened (/Docs/animation-approach.md §56).
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import type { PetRig } from '../../assets/pets/anatomy/PetRig';
import { clamp } from '../../assets/shared/shapes';
import { Spring, SpringChain } from '../core/Spring';
import type { AnimationContext, MotionLayer } from '../core/types';

/** Velocity is divided by this before it drives anything, to keep units sane. */
const VELOCITY_SCALE = 420;

export interface SecondaryMotion extends MotionLayer {
  /**
   * Shock the whole creature — a landing, a wall, a poke.
   * @param strength roughly 0..1 for a normal event; higher for a real slam.
   */
  impulse(strength: number, direction?: number): void;
  /** Reset every spring, e.g. after the creature is rebuilt. */
  settle(): void;
}

export function createSecondaryMotion(rig: PetRig): SecondaryMotion {
  let current = rig;

  const ears = { left: new Spring(), right: new Spring() };
  const wings = { left: new Spring(), right: new Spring() };
  const topper = new Spring();
  const hat = new Spring({ stiffness: 140, damping: 0.7, limit: 0.5 });
  let tail = new SpringChain(Math.max(1, current.tail.segments.length || 1));

  /** Previous horizontal velocity, for working out acceleration. */
  let lastVx = 0;

  const tune = () => {
    const { ear, wing, tail: tailWeights, topper: topperWeights } = current.weights;

    // Floppier parts are looser and ring for longer; a horn barely moves.
    const earStiffness = 150 / (0.5 + ear.floppiness);
    ears.left.configure({ stiffness: earStiffness, damping: 0.42 + ear.weight * 0.14, limit: 1 });
    ears.right.configure({ stiffness: earStiffness, damping: 0.42 + ear.weight * 0.14, limit: 1 });

    const wingStiffness = 190 / (0.5 + wing.floppiness);
    wings.left.configure({ stiffness: wingStiffness, damping: 0.5, limit: 0.9 });
    wings.right.configure({ stiffness: wingStiffness, damping: 0.5, limit: 0.9 });

    topper.configure({
      stiffness: 130 / (0.4 + topperWeights.floppiness),
      damping: 0.45,
      limit: 0.8,
    });

    const segments = Math.max(1, current.tail.segments.length || 1);
    tail = new SpringChain(segments, {
      stiffness: 120 / (0.4 + tailWeights.floppiness),
      damping: 0.4 + tailWeights.weight * 0.15,
      limit: 0.85,
    });
  };

  tune();

  return {
    name: 'secondary',

    setRig(next: PetRig) {
      current = next;
      tune();
    },

    settle() {
      ears.left.reset();
      ears.right.reset();
      wings.left.reset();
      wings.right.reset();
      topper.reset();
      hat.reset();
      for (const link of tail.links) link.reset();
      lastVx = 0;
    },

    impulse(strength: number, direction = 1) {
      const kick = clamp(strength, -6, 6) * direction;

      // Both ears swing the same way: they are on the same head, and a head
      // that moves left throws both ears right. Mirroring them looks like the
      // creature is signalling.
      ears.left.push(kick * 5.5);
      ears.right.push(kick * 5.2);
      wings.left.push(kick * 4);
      wings.right.push(-kick * 4);
      topper.push(kick * 4.5);
      hat.push(kick * 2.2);
      tail.push(-kick * 4.5);
    },

    update(ctx: AnimationContext) {
      const { joints, weights } = ctx.rig;
      const dt = ctx.delta;
      const motion = ctx.motion;

      // --- What the body is doing ------------------------------------------
      const vx = motion.vx / VELOCITY_SCALE;
      const ax = dt > 0 ? (vx - lastVx) / dt : 0;
      lastVx = vx;

      // Appendages lag behind acceleration, and trail behind steady motion.
      const drag = clamp(-vx * 0.35, -0.6, 0.6);
      const lurch = clamp(-ax * 0.06, -1.2, 1.2);
      const target = drag + lurch;

      // Being carried adds a little sway of its own.
      const carried = motion.held ? Math.sin(ctx.time * 3.4) * 0.06 : 0;

      // --- Ears -------------------------------------------------------------
      const earTarget = (target + carried) * (0.4 + weights.ear.floppiness * 0.5);
      const earLeft = ears.left.update(dt, earTarget);
      const earRight = ears.right.update(dt, earTarget);

      offsetJoint(joints.earLeft, { rotation: earLeft });
      offsetJoint(joints.earRight, { rotation: earRight });

      // --- Wings ------------------------------------------------------------
      // Idle flutter is the wing's own property: a bee buzzes, a bird glides.
      const flutterRate = weights.wing.flutter;
      const flutter =
        flutterRate > 0
          ? Math.sin(ctx.time * flutterRate * Math.PI * 2) *
            (0.12 + Math.min(0.5, motion.speed / 500) * 0.3) *
            ctx.intensity
          : 0;

      const wingTarget = target * 0.6;
      const wingLeft = wings.left.update(dt, wingTarget) + flutter;
      const wingRight = wings.right.update(dt, wingTarget) - flutter;

      offsetJoint(joints.wingLeft, { rotation: -wingLeft });
      offsetJoint(joints.wingRight, { rotation: wingRight });

      // --- Topper and hat ---------------------------------------------------
      offsetJoint(joints.topper, { rotation: topper.update(dt, target * 0.8) });
      offsetJoint(joints.accessoryHead, { rotation: hat.update(dt, target * 0.35) });

      // --- Tail -------------------------------------------------------------
      // The chain drives the tail joint and, on segmented tails, each link.
      const values = tail.update(dt, -target * 0.9);
      offsetJoint(joints.tail, { rotation: values[0] ?? 0 });

      const segments = ctx.rig.tail.segments;
      for (let i = 0; i < segments.length; i++) {
        const rest = ctx.rig.tail.restRotations[i] ?? 0;
        segments[i].rotation = rest + (values[i] ?? 0) * 0.5;
      }
    },
  };
}
