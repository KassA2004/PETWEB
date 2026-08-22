/**
 * Picking things up.
 *
 * The pointer is two-dimensional and the room is not, which is the whole
 * problem this file exists to solve. The answer is to give the pointer one
 * unambiguous job: it addresses a point on the **floor**. Screen y maps to
 * depth, not to height, and the projection makes that a clean one-to-one
 * mapping — every pixel inside the room is exactly one place on the floor.
 *
 * A carried object therefore hovers over a floor position rather than
 * following the cursor in screen space, and it hovers *above whatever is
 * underneath it*: drag a ball over the table and it rises to clear the
 * tabletop, let go and it lands on the table. You never have to express
 * "height" with a mouse, because you never need to.
 *
 * Held bodies are kinematic — infinite mass, driven straight at the carry
 * point — so the hand always wins, but they keep an honest velocity, so they
 * shove what they are dragged through and throw properly when released.
 */

import { wake } from './Body';
import { halfX, halfZ, topOf } from './Collider';
import { clamp } from './math';
import type { PhysicsBody, Vec3 } from './types';

/** How far above whatever is underneath a carried object floats. */
const CARRY_CLEARANCE = 34;

/** How briskly a carried body chases the pointer, per second. */
const CARRY_RESPONSE = 18;

/** Smoothing on the velocity a throw inherits. Raw pointer deltas are spiky. */
const THROW_BLEND = 0.4;

/** A flick upward as you let go — what makes a throw an arc, not a slide. */
const THROW_LIFT = 0.35;

export const MAX_THROW_SPEED = 1800;

/** What the manipulator needs to know about the room around the held body. */
export interface ManipulatorHost {
  /**
   * Height of the highest thing a body at this floor point would land on,
   * ignoring the body doing the asking.
   */
  surfaceHeightAt(x: number, z: number, ignoreId: string): number;
  /** Keep a floor point inside the room, allowing for the body's own size. */
  clampToRoom(x: number, z: number, body: PhysicsBody): { x: number; z: number };
}

export class Manipulator {
  private host: ManipulatorHost;

  private body: PhysicsBody | null = null;
  /** Where on the floor the pointer is asking the body to be. */
  private target = { x: 0, z: 0 };
  /**
   * Extra height, above the carry hover, that the pointer is asking for.
   *
   * Depth runs out at the back wall. The pointer does not: it can keep going
   * up the screen, and once the floor beneath it has run out that travel means
   * *lift*. Which is the natural reading — there is nowhere further back to
   * put something, so the only place left is up — and it means picking a thing
   * up and hurling it is the same gesture as sliding it around the room, just
   * continued past the end of the floor.
   */
  private lift = 0;
  private smoothed: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(host: ManipulatorHost) {
    this.host = host;
  }

  get held(): PhysicsBody | null {
    return this.body;
  }

  grab(body: PhysicsBody): void {
    if (this.body) this.release();

    this.body = body;
    body.held = true;
    body.support = null;
    body.grounded = false;
    body.passThrough = null;
    this.target = { x: body.position.x, z: body.position.z };
    this.lift = 0;
    this.smoothed = { x: 0, y: 0, z: 0 };
    wake(body);
  }

  /**
   * Point the carry at a place on the floor.
   *
   * @param lift how far above the ordinary carry height to hold it. Zero for
   *             everything inside the room; positive once the pointer has run
   *             out of floor at the back wall and is asking for height.
   */
  moveTo(x: number, z: number, lift = 0): void {
    if (!this.body) return;
    this.target = this.host.clampToRoom(x, z, this.body);
    this.lift = Math.max(0, lift);
  }

  /**
   * Advance the carry.
   *
   * Called from inside the fixed step so the velocity a throw inherits is
   * measured against the same clock as everything else.
   */
  update(dt: number): void {
    const body = this.body;
    if (!body) return;

    const rest = this.host.surfaceHeightAt(this.target.x, this.target.z, body.id);
    const goal = {
      x: this.target.x,
      y: rest + CARRY_CLEARANCE + this.lift,
      z: this.target.z,
    };

    const chase = Math.min(1, CARRY_RESPONSE * dt);

    const moved = {
      x: (goal.x - body.position.x) * chase,
      y: (goal.y - body.position.y) * chase,
      z: (goal.z - body.position.z) * chase,
    };

    body.position.x += moved.x;
    body.position.y += moved.y;
    body.position.z += moved.z;
    body.previous = { ...body.position };

    // The body's own velocity, honestly measured, so it shoves what it is
    // dragged through and leaves the hand at the speed the hand was going.
    const instant = { x: moved.x / dt, y: moved.y / dt, z: moved.z / dt };
    this.smoothed.x += (instant.x - this.smoothed.x) * THROW_BLEND;
    this.smoothed.y += (instant.y - this.smoothed.y) * THROW_BLEND;
    this.smoothed.z += (instant.z - this.smoothed.z) * THROW_BLEND;

    body.velocity.x = this.smoothed.x;
    body.velocity.y = this.smoothed.y;
    body.velocity.z = this.smoothed.z;
  }

  /**
   * Let go.
   *
   * @returns the body and the velocity it left with, or null if nothing was
   *          being carried.
   */
  release(): { body: PhysicsBody; velocity: Vec3 } | null {
    const body = this.body;
    if (!body) return null;

    const speed = Math.hypot(this.smoothed.x, this.smoothed.z);

    const velocity: Vec3 = {
      x: clamp(this.smoothed.x, -MAX_THROW_SPEED, MAX_THROW_SPEED),
      // A throw across the floor lobs a little, which is what makes it an arc
      // the creature can watch rather than a puck sliding away.
      y: clamp(this.smoothed.y + speed * THROW_LIFT, -MAX_THROW_SPEED, MAX_THROW_SPEED),
      z: clamp(this.smoothed.z, -MAX_THROW_SPEED, MAX_THROW_SPEED),
    };

    body.held = false;

    // Furniture does not fly. A static body is *placed*: it keeps the velocity
    // it was measured at only so the caller can tell a throw from a set-down,
    // and its own velocity goes back to nothing.
    body.velocity = body.type === 'static' ? { x: 0, y: 0, z: 0 } : { ...velocity };
    wake(body);

    this.body = null;
    this.lift = 0;
    this.smoothed = { x: 0, y: 0, z: 0 };

    return { body, velocity };
  }

  /** Where the carried body would land if you let go now. */
  dropPoint(): { x: number; z: number; y: number } | null {
    const body = this.body;
    if (!body) return null;

    return {
      x: body.position.x,
      z: body.position.z,
      y: this.host.surfaceHeightAt(body.position.x, body.position.z, body.id),
    };
  }
}

/**
 * Would a body standing at this floor point be on top of `holder`?
 *
 * Lives here rather than in the collider module because it is a question about
 * carrying, not about geometry: the margin is deliberately generous so that
 * dragging a toy *near* the table already lifts it clear of the edge.
 */
export function overFootprint(
  holder: PhysicsBody,
  x: number,
  z: number,
  margin: number,
): boolean {
  const dx = Math.abs(x - holder.position.x);
  const dz = Math.abs(z - holder.position.z);

  if (holder.collider.shape === 'cylinder') {
    const reach = holder.collider.radius + margin;
    return dx * dx + dz * dz <= reach * reach;
  }

  return dx <= halfX(holder.collider) + margin && dz <= halfZ(holder.collider) + margin;
}

/**
 * How high a carried body has to float to clear this one.
 *
 * A container is carried *over*, not into: you should be able to drag a toy
 * across the room without it snagging on the basket, so the lip counts.
 */
export function clearanceOf(holder: PhysicsBody): number {
  const rim = holder.surface?.kind === 'container' ? (holder.surface.rim ?? 0) : 0;
  return Math.max(topOf(holder), holder.position.y + rim);
}
