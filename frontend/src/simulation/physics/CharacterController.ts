/**
 * The creature's legs.
 *
 * A character does not move because forces are applied to it. It moves because
 * it has decided to, and the physics is then obliged to deal with the
 * consequences — that is the difference between a creature and a crate, and
 * the old system had it backwards: locomotion was produced by reaching into
 * the solver and editing a node's position, so every step was an argument
 * between what the creature wanted and what the constraints allowed.
 *
 * Here the controller owns the horizontal velocity and nothing else. Gravity,
 * collision, friction and landing all still happen to the body in the ordinary
 * way. The one concession to being alive is acceleration: the legs may change
 * the creature's speed by so much per second and no more, which is what stops
 * it bulldozing the furniture, and what gives it a moment of lean at the start
 * of a walk and a stagger at the end of one.
 */

import { wake } from './Body';
import { approach, clamp, lengthXZ } from './math';
import type { PhysicsBody } from './types';

export interface CharacterOptions {
  walkSpeed: number;
  runSpeed: number;
  /** px/s² the legs may push with while on the ground. */
  acceleration: number;
  /** Fraction of that available mid-air, 0..1. Low: a jump commits. */
  airControl?: number;
  /** How close counts as arrived, in pixels. */
  arriveRadius?: number;
  /**
   * How tall a ledge the creature simply steps onto.
   *
   * Without it a rug edge or a dropped pillow is a wall, and the creature
   * spends its afternoon shuffling against a cushion.
   */
  stepHeight?: number;
}

export class CharacterController {
  readonly body: PhysicsBody;
  readonly options: Required<CharacterOptions>;

  /** Where it is trying to get to on the floor, or null to stand still. */
  private target: { x: number; z: number } | null = null;
  private running = false;

  /**
   * Sideways bias, in the floor plane, that steers around an obstacle.
   *
   * Set by the room when the way ahead is blocked and decayed here, so the
   * creature curves past a chair instead of pressing into it until the brain
   * changes its mind.
   */
  private avoid = { x: 0, z: 0, time: 0 };

  constructor(body: PhysicsBody, options: CharacterOptions) {
    this.body = body;
    this.options = {
      airControl: 0.25,
      arriveRadius: 22,
      stepHeight: 26,
      ...options,
    };
  }

  /** Head for a point on the floor. */
  moveTo(x: number, z: number, running = false): void {
    this.target = { x, z };
    this.running = running;
  }

  stop(): void {
    this.target = null;
  }

  /** Which way it is facing, as a unit-ish vector. Read by the animation. */
  get heading(): { x: number; z: number } {
    const { x, z } = this.body.velocity;
    const speed = lengthXZ(x, z);
    return speed < 1 ? { x: 0, z: 0 } : { x: x / speed, z: z / speed };
  }

  get speed(): number {
    return lengthXZ(this.body.velocity.x, this.body.velocity.z);
  }

  /** True while the creature is trying to get somewhere. */
  get walking(): boolean {
    return this.target !== null;
  }

  /** Steer around whatever is in the way for the next moment. */
  steerAround(x: number, z: number, seconds = 0.6): void {
    this.avoid = { x, z, time: seconds };
  }

  /** Launch: a climb, a pounce, a startled hop. */
  jump(velocity: { x?: number; y?: number; z?: number }): void {
    const body = this.body;
    if (velocity.x !== undefined) body.velocity.x = velocity.x;
    if (velocity.y !== undefined) body.velocity.y = velocity.y;
    if (velocity.z !== undefined) body.velocity.z = velocity.z;
    body.grounded = false;
    wake(body);
  }

  update(dt: number): void {
    const body = this.body;

    this.avoid.time = Math.max(0, this.avoid.time - dt);
    if (this.avoid.time === 0) {
      this.avoid.x = 0;
      this.avoid.z = 0;
    }

    // Carried creatures do not walk. Their velocity belongs to the pointer.
    if (body.held) return;

    let desiredX = 0;
    let desiredZ = 0;

    if (this.target) {
      const dx = this.target.x - body.position.x;
      const dz = this.target.z - body.position.z;
      const distance = lengthXZ(dx, dz);

      if (distance <= this.options.arriveRadius) {
        this.target = null;
      } else {
        const top = this.running ? this.options.runSpeed : this.options.walkSpeed;

        // Ease off over the last stride so it arrives rather than skids.
        const eased = top * clamp(distance / (this.options.arriveRadius * 2.5), 0.35, 1);

        let dirX = dx / distance + this.avoid.x;
        let dirZ = dz / distance + this.avoid.z;
        const dirLength = lengthXZ(dirX, dirZ) || 1;
        dirX /= dirLength;
        dirZ /= dirLength;

        desiredX = dirX * eased;
        desiredZ = dirZ * eased;
      }
    }

    const authority =
      this.options.acceleration * dt * (body.grounded ? 1 : this.options.airControl);

    body.velocity.x = approach(body.velocity.x, desiredX, authority);
    body.velocity.z = approach(body.velocity.z, desiredZ, authority);

    if (desiredX !== 0 || desiredZ !== 0) wake(body);
  }
}
