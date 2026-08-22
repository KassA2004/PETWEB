/**
 * Springs.
 *
 * One damped spring per appendage is what buys most of this project's
 * liveliness. Ears, wings, tails and hats are never keyframed: they are given a
 * stiffness and a weight, pushed by whatever the body just did, and left to
 * settle on their own.
 *
 * The consequence is that every animation gets its follow-through for free.
 * Shaking the creature, landing on the floor, hitting a wall and skidding to a
 * stop all produce completely different ear behaviour without anybody authoring
 * ear behaviour, and the body never has to distort to sell the motion
 * (/Docs/animation-approach.md §46).
 */

export interface SpringOptions {
  /** How hard it pulls back to rest. Higher = snappier. */
  stiffness?: number;
  /** How quickly it stops ringing. 1 = critically damped, < 1 = wobbly. */
  damping?: number;
  /** Absolute limit on displacement, so a hard hit cannot fold an ear inside out. */
  limit?: number;
}

export class Spring {
  value = 0;
  velocity = 0;

  private stiffness: number;
  private damping: number;
  private limit: number;

  constructor(options: SpringOptions = {}) {
    this.stiffness = options.stiffness ?? 90;
    this.damping = options.damping ?? 0.55;
    this.limit = options.limit ?? 1.2;
  }

  /** Kick it. Used for impacts and direction changes. */
  push(impulse: number): void {
    this.velocity += impulse;
  }

  /** Retune at runtime — a floppy ear and a horn use the same spring class. */
  configure(options: SpringOptions): void {
    if (options.stiffness !== undefined) this.stiffness = options.stiffness;
    if (options.damping !== undefined) this.damping = options.damping;
    if (options.limit !== undefined) this.limit = options.limit;
  }

  reset(value = 0): void {
    this.value = value;
    this.velocity = 0;
  }

  /**
   * Integrate toward `target`.
   *
   * Semi-implicit Euler with a clamped step: a dropped frame must not be able
   * to launch an ear into orbit, so long deltas are split rather than trusted.
   */
  update(dt: number, target = 0): number {
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const step = dt / steps;
    const damping = 2 * this.damping * Math.sqrt(this.stiffness);

    for (let i = 0; i < steps; i++) {
      const acceleration =
        (target - this.value) * this.stiffness - this.velocity * damping;

      this.velocity += acceleration * step;
      this.value += this.velocity * step;

      if (this.value > this.limit) {
        this.value = this.limit;
        this.velocity *= -0.35;
      } else if (this.value < -this.limit) {
        this.value = -this.limit;
        this.velocity *= -0.35;
      }
    }

    return this.value;
  }
}

/**
 * A chain of springs that passes motion down its length.
 *
 * Used for segmented tails: each link is pulled toward the one before it, so a
 * flick at the base arrives at the tip a moment later instead of the whole tail
 * swinging as one rigid arm.
 */
export class SpringChain {
  readonly links: Spring[];

  constructor(count: number, options: SpringOptions = {}) {
    this.links = Array.from({ length: count }, (_, i) =>
      new Spring({
        // Further out is looser and floppier.
        stiffness: (options.stiffness ?? 90) * (1 - i * 0.1),
        damping: (options.damping ?? 0.5) * (1 - i * 0.04),
        limit: options.limit ?? 0.9,
      }),
    );
  }

  push(impulse: number): void {
    if (this.links.length > 0) this.links[0].push(impulse);
  }

  update(dt: number, base = 0): number[] {
    let driver = base;

    for (const link of this.links) {
      driver = link.update(dt, driver * 0.72);
    }

    return this.links.map((link) => link.value);
  }
}
