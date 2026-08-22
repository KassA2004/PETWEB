/**
 * Ambient layers: breathing, body lean, and gaze.
 *
 * These run under every state and never stop. Between them they cover the
 * difference between a creature standing still and a creature standing still
 * *while alive* — which is most of what people actually notice.
 *
 * All three are deliberately small. Anything big enough to read as an action
 * belongs in a state or a clip.
 */

import { offsetJoint } from '../../assets/pets/anatomy/joints';
import { clamp, lerp } from '../../assets/shared/shapes';
import type { AnimationContext, MotionLayer } from '../core/types';
import type { GazeTarget } from '../expression/FaceDriver';

/**
 * Breathing.
 *
 * Volume-preserving on purpose: the creature gets very slightly taller and
 * narrower, then shorter and wider, and its feet stay on the floor. It never
 * just scales up, because a creature that inflates looks like a balloon rather
 * than something with lungs.
 */
export function createBreathing(): MotionLayer {
  const rate = 0.3;

  return {
    name: 'breathing',
    update(ctx: AnimationContext) {
      const { joints, proportions } = ctx.rig;
      const strength = ctx.intensity;

      const phase = ctx.time * rate * Math.PI * 2;
      // Quicker inhale than settle — a sine wave alone reads as machinery.
      const breath = Math.sin(phase) * 0.5 + Math.sin(phase * 2) * 0.12;
      const amount = breath * 0.022 * strength;

      offsetJoint(joints.body, {
        scaleX: 1 - amount * 0.75,
        scaleY: 1 + amount,
        y: -amount * proportions.bodyHeight * 0.5,
      });

      // The face rides the chest a fraction of a beat late.
      const lag = Math.sin(phase - 0.6) * 0.5;
      offsetJoint(joints.face, {
        y: -lag * proportions.faceHeight * 0.012 * strength,
      });
    },
  };
}

/**
 * Body lean.
 *
 * Leans into travel and away from acceleration, so movement has a direction
 * even when the creature is a symmetrical blob. This is the layer that makes a
 * run look like a run rather than a hop that happens to move sideways.
 */
export function createBodyLean(): MotionLayer {
  let lean = 0;

  return {
    name: 'body-lean',
    update(ctx: AnimationContext) {
      const { joints } = ctx.rig;
      const motion = ctx.motion;

      const target = motion.held
        ? 0
        : clamp(motion.vx / 320, -1, 1) * 0.12 * ctx.intensity;

      // Eased rather than instant, so a direction change reads as a turn.
      lean = lerp(lean, target, 1 - Math.exp(-9 * ctx.delta));

      offsetJoint(joints.body, { rotation: lean });

      // The face counter-rotates slightly, keeping the eyes level.
      offsetJoint(joints.face, { rotation: -lean * 0.4 });
    },
  };
}

/**
 * Gaze.
 *
 * Produces a target for the face driver rather than writing to the rig: eyes
 * are the expression system's business, and having two layers fight over the
 * pupils is exactly the sort of thing this rewrite is meant to end.
 *
 * With nothing to look at, the creature's attention wanders on two
 * incommensurate sine waves so it never visibly loops.
 */
export class Gaze {
  current: GazeTarget = { x: 0, y: 0 };

  update(ctx: AnimationContext): GazeTarget {
    const { proportions } = ctx.rig;
    const t = ctx.time;

    const wanderX = Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.73 + 1.2) * 0.4;
    const wanderY = Math.sin(t * 0.24 + 2.1) * 0.7 + Math.sin(t * 0.61) * 0.3;

    let targetX = wanderX * 0.6;
    let targetY = wanderY * 0.4;

    if (ctx.lookTarget) {
      const lookX = clamp(ctx.lookTarget.x / (proportions.bodyWidth * 1.1), -1, 1);
      const lookY = clamp(
        (ctx.lookTarget.y + proportions.bodyHeight * 0.5) /
          (proportions.bodyHeight * 0.9),
        -1,
        1,
      );

      // Mostly locked on, with a sliver of wander so a held gaze is not frozen.
      targetX = lerp(lookX, wanderX * 0.5, 0.12);
      targetY = lerp(lookY, wanderY * 0.5, 0.12);
    }

    const rate = 1 - Math.exp(-7 * ctx.delta);
    this.current = {
      x: lerp(this.current.x, targetX, rate),
      y: lerp(this.current.y, targetY, rate),
    };

    return this.current;
  }
}
