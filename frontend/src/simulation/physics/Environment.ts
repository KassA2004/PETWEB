/**
 * The room itself: a floor and four walls.
 *
 * These are not bodies. A wall has no mass, no velocity and nothing can ever
 * move it, so representing it as one only means the solver has to keep
 * discovering that fact. Instead the environment is a handful of planes that
 * bodies are clamped against — the cheapest and most stable contact there is.
 *
 * The floor is `y = 0`. The walls are the six numbers of the room box, and the
 * back and front walls are what turn depth from a drawing trick into a place:
 * a body cannot leave the room through the back of it any more than through
 * the left of it.
 */

import { halfX, halfZ } from './Collider';
import { effectiveInvMass } from './Body';
import { IMPACT_SPEED } from './constants';
import type { PhysicsBody } from './types';

/** The floor area anything can stand on, in room coordinates. */
export interface RoomBounds {
  minX: number;
  maxX: number;
  /** Nearest the back wall a body's centre may get. */
  minZ: number;
  /** Nearest the viewer a body's centre may get. */
  maxZ: number;
}

/** Which wall a body hit, and how hard. */
export interface WallHit {
  /** -1 left, +1 right, 0 for the back and front walls. */
  direction: -1 | 0 | 1;
  speed: number;
}

export class Environment {
  bounds: RoomBounds;

  constructor(bounds: RoomBounds) {
    this.bounds = bounds;
  }

  /**
   * Hold a body inside the room, and report the sideways collisions.
   *
   * Position is corrected and the velocity component into the wall is
   * reflected — separately, and in that order, so a body pressed into a corner
   * is pushed out without the correction being reinterpreted as speed. That
   * confusion is exactly what used to fire the creature over the roof.
   */
  contain(body: PhysicsBody): WallHit | null {
    if (effectiveInvMass(body) === 0) return null;

    const { minX, maxX, minZ, maxZ } = this.bounds;
    const spanX = halfX(body.collider);
    const spanZ = halfZ(body.collider);

    let hit: WallHit | null = null;

    const record = (direction: -1 | 0 | 1, speed: number) => {
      if (speed < IMPACT_SPEED) return;
      if (!hit || speed > hit.speed) hit = { direction, speed };
    };

    // --- Left and right ------------------------------------------------------
    const left = minX + spanX;
    const right = maxX - spanX;

    if (left <= right) {
      if (body.position.x < left) {
        record(-1, -body.velocity.x);
        body.position.x = left;
        if (body.velocity.x < 0) body.velocity.x *= -body.restitution;
      } else if (body.position.x > right) {
        record(1, body.velocity.x);
        body.position.x = right;
        if (body.velocity.x > 0) body.velocity.x *= -body.restitution;
      }
    } else {
      body.position.x = (minX + maxX) / 2;
      body.velocity.x = 0;
    }

    // --- Back and front ------------------------------------------------------
    const back = minZ + spanZ;
    const front = maxZ - spanZ;

    if (back <= front) {
      if (body.position.z < back) {
        record(0, -body.velocity.z);
        body.position.z = back;
        if (body.velocity.z < 0) body.velocity.z *= -body.restitution;
      } else if (body.position.z > front) {
        record(0, body.velocity.z);
        body.position.z = front;
        if (body.velocity.z > 0) body.velocity.z *= -body.restitution;
      }
    } else {
      body.position.z = (minZ + maxZ) / 2;
      body.velocity.z = 0;
    }

    return hit;
  }

  /** Is this point on the floor inside the room? */
  contains(x: number, z: number): boolean {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  }

  /**
   * Pull a floor point back inside the room.
   *
   * @param spanX @param spanZ half-extents of whatever is being placed there,
   *              so the *edge* stops at the wall rather than the centre.
   */
  clamp(x: number, z: number, spanX = 0, spanZ = 0): { x: number; z: number } {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const left = minX + spanX;
    const right = maxX - spanX;
    const back = minZ + spanZ;
    const front = maxZ - spanZ;

    return {
      x: left <= right ? Math.max(left, Math.min(right, x)) : (minX + maxX) / 2,
      z: back <= front ? Math.max(back, Math.min(front, z)) : (minZ + maxZ) / 2,
    };
  }
}
