/**
 * The lean, the roll and the wobble — all of it purely visual.
 *
 * Objects used to get their character from being soft bodies: a lamp rocked
 * because its shade was a node lagging behind its base, and a thrown cube
 * tumbled because a collision had spun its constraint frame. That was lovely
 * and it was also the reason the room could not hold still, because every one
 * of those degrees of freedom was a degree of freedom the solver had to keep
 * arguing about.
 *
 * So the physics gave up rotation entirely, and it lives here instead: one
 * damped spring per object, driven by the things that ought to rock it —
 * being knocked, being accelerated, being thrown — and answering to nothing
 * else. The lamp still rocks. It just cannot fall over and take the room with
 * it (/Docs/animation-approach.md §14, wobble).
 */

import type { PhysicsBody } from '../../simulation/physics';

export type MotionStyle = 'rigid' | 'wobble' | 'roll' | 'tumble';

/** How stiff and how damped each style's spring is, and how far it leans. */
const STYLES: Record<MotionStyle, { stiffness: number; damping: number; lean: number }> = {
  // Furniture: barely moves, and settles immediately.
  rigid: { stiffness: 220, damping: 22, lean: 0.00018 },
  // Tall and top-heavy: a knock sets it swinging for a good second.
  wobble: { stiffness: 44, damping: 4.2, lean: 0.0013 },
  // Round things do not lean, they roll. Handled separately.
  roll: { stiffness: 0, damping: 0, lean: 0 },
  // Soft toys: floppy, slow to right themselves, and no hurry about it.
  tumble: { stiffness: 26, damping: 3.4, lean: 0.0022 },
};

export class PropMotion {
  angle = 0;

  private style: MotionStyle;
  private spin = 0;
  private lastVx = 0;
  private radius: number;

  constructor(style: MotionStyle, radius: number) {
    this.style = style;
    this.radius = Math.max(8, radius);
  }

  /** Something hit it. `force` is roughly 0..2. */
  knock(force: number, direction = 1): void {
    this.spin += force * direction * 5.5;
  }

  /** Set it spinning, for something that has just been thrown. */
  fling(spin: number): void {
    this.spin += spin;
  }

  update(dt: number, body: PhysicsBody): void {
    if (this.style === 'roll') {
      // A rolling thing's angle is not a spring, it is arithmetic: distance
      // travelled over circumference. It also has to stop when the ball does,
      // which a spring would never quite do.
      const grounded = body.grounded;
      const travel = grounded ? body.velocity.x : body.velocity.x * 0.35;
      this.angle += (travel / this.radius) * dt;
      return;
    }

    const spec = STYLES[this.style];

    // Acceleration leans it: starting to move tips it back, stopping tips it
    // forward. The same effect the ragdoll used to produce by lagging.
    const acceleration = (body.velocity.x - this.lastVx) / Math.max(dt, 1e-4);
    this.lastVx = body.velocity.x;

    const rest = body.held ? -body.velocity.x * spec.lean * 0.5 : 0;
    const target = rest - acceleration * spec.lean * dt * 60;

    const pull = (target - this.angle) * spec.stiffness * dt;
    this.spin += pull;
    this.spin -= this.spin * Math.min(1, spec.damping * dt);
    this.angle += this.spin * dt;

    // A hard cap, because a shade that swings past horizontal reads as broken
    // rather than as lively.
    const limit = this.style === 'tumble' ? 1.3 : 0.5;
    if (this.angle > limit) {
      this.angle = limit;
      this.spin *= -0.3;
    } else if (this.angle < -limit) {
      this.angle = -limit;
      this.spin *= -0.3;
    }
  }
}

/** Which spring a given kind of object should have. */
export function motionStyleFor(options: {
  rolls?: boolean;
  isStatic: boolean;
  height: number;
}): MotionStyle {
  if (options.rolls) return 'roll';
  if (!options.isStatic) return 'tumble';
  // Tall furniture rocks; a bed does not.
  return options.height > 120 ? 'wobble' : 'rigid';
}
