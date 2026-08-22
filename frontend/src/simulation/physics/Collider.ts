/**
 * Collider geometry.
 *
 * Both shapes are extrusions of a footprint: a circle or a rectangle in the
 * floor plane, pushed up from the body's base by `height`. Nothing rotates, so
 * every query here is arithmetic on intervals — no matrices, no support
 * functions, no iterative solvers.
 *
 * These are the only functions that know what a collider *is*. Everything else
 * asks in terms of extents, tops and footprints.
 */

import type { Collider, PhysicsBody, Vec3 } from './types';

/** Half-extent along x — how far the footprint reaches left and right. */
export function halfX(collider: Collider): number {
  return collider.shape === 'cylinder' ? collider.radius : collider.halfX;
}

/** Half-extent along z — how much floor the footprint takes front to back. */
export function halfZ(collider: Collider): number {
  return collider.shape === 'cylinder' ? collider.radius : collider.halfZ;
}

/** The largest footprint radius, for broad tests and for perception. */
export function footprintRadius(collider: Collider): number {
  return collider.shape === 'cylinder'
    ? collider.radius
    : Math.hypot(collider.halfX, collider.halfZ);
}

/** World height of the body's top face. */
export function topOf(body: PhysicsBody): number {
  return body.position.y + body.collider.height;
}

/**
 * Where a body's artwork should be anchored: the middle of its footprint on
 * the floor it stands on.
 */
export function baseOf(body: PhysicsBody): Vec3 {
  return { x: body.position.x, y: body.position.y, z: body.position.z };
}

/**
 * Is a point inside the body's footprint, seen from above?
 *
 * Used for "what would this land on" and for the container walls. Height is
 * not consulted — this is a question about the floor plan.
 */
export function footprintContains(
  body: PhysicsBody,
  x: number,
  z: number,
  margin = 0,
): boolean {
  const collider = body.collider;
  const dx = x - body.position.x;
  const dz = z - body.position.z;

  if (collider.shape === 'cylinder') {
    const reach = collider.radius + margin;
    return dx * dx + dz * dz <= reach * reach;
  }

  return (
    Math.abs(dx) <= collider.halfX + margin && Math.abs(dz) <= collider.halfZ + margin
  );
}

/**
 * How far into the footprint a point is, or 0 when it is outside.
 *
 * Overlap rather than a yes/no, so "which surface am I most over" can prefer
 * the one the body is actually standing in the middle of.
 */
export function footprintOverlap(
  a: PhysicsBody,
  b: PhysicsBody,
): { dx: number; dz: number; overlapX: number; overlapZ: number } {
  const dx = a.position.x - b.position.x;
  const dz = a.position.z - b.position.z;

  return {
    dx,
    dz,
    overlapX: halfX(a.collider) + halfX(b.collider) - Math.abs(dx),
    overlapZ: halfZ(a.collider) + halfZ(b.collider) - Math.abs(dz),
  };
}

/**
 * Pull a point back inside a footprint, leaving `inset` of clearance.
 *
 * This is the inside of the basket: things dropped in are held away from the
 * walls rather than being allowed to clip through them.
 */
export function clampToFootprint(
  body: PhysicsBody,
  point: { x: number; z: number },
  inset: number,
): { x: number; z: number } {
  const collider = body.collider;
  const dx = point.x - body.position.x;
  const dz = point.z - body.position.z;

  if (collider.shape === 'cylinder') {
    const reach = Math.max(0, collider.radius - inset);
    const distance = Math.hypot(dx, dz);
    if (distance <= reach || distance === 0) return { x: point.x, z: point.z };
    const scale = reach / distance;
    return { x: body.position.x + dx * scale, z: body.position.z + dz * scale };
  }

  const reachX = Math.max(0, collider.halfX - inset);
  const reachZ = Math.max(0, collider.halfZ - inset);

  return {
    x: body.position.x + Math.max(-reachX, Math.min(reachX, dx)),
    z: body.position.z + Math.max(-reachZ, Math.min(reachZ, dz)),
  };
}
