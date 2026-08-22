/**
 * Turning an overlap into a contact.
 *
 * Both colliders are footprints extruded upward, so every test here is the
 * same shape of arithmetic: work out the overlap in the floor plane, work out
 * the overlap in height, and separate along whichever is shallower. Choosing
 * the shallower axis is what makes a ball on a table rest on it rather than
 * squirt out of the side, and what makes a ball beside a table stay beside it
 * rather than climb it.
 *
 * One correction to pure minimum-penetration: a body that was above another
 * one last step and is inside it now *landed on it*, no matter how far it got
 * in. Without that, something dropped from a height passes the point where the
 * side is the nearer exit and is spat out horizontally at speed.
 */

import { footprintContains, halfX, halfZ, topOf } from './Collider';
import type { Contact, PhysicsBody } from './types';

/**
 * How far below a top face a body may already be and still be treated as
 * resting on it rather than standing beside it.
 *
 * Generous enough to absorb a fast landing and the hair of overlap a resting
 * contact always keeps, and never more than a third of the thing's height —
 * which is what stops the creature being served up onto the dining table
 * because it walked into the side of it.
 */
function sinkAllowance(height: number): number {
  return Math.max(20, height * 0.3);
}

/**
 * Test one pair.
 *
 * @returns the contact, or null if they are not actually touching.
 */
export function collide(a: PhysicsBody, b: PhysicsBody): Contact | null {
  // Sides open, top intact. Two different things want exactly this — climbing
  // and scenery — and both want it for the same reason, so they share the test
  // rather than each getting a subsystem (see `sidesOpen`).
  const openSides = sidesOpen(a, b);

  const plane =
    a.collider.shape === 'cylinder' && b.collider.shape === 'cylinder'
      ? circleCircle(a, b)
      : a.collider.shape === 'box' && b.collider.shape === 'box'
        ? rectRect(a, b)
        : a.collider.shape === 'cylinder'
          ? circleRect(a, b, 1)
          : circleRect(b, a, -1);

  if (!plane) return null;

  const vertical = heightOverlap(a, b);
  if (!vertical) return null;

  const sideways: Contact | null = openSides
    ? null
    : {
        a,
        b,
        normal: { x: plane.nx, y: 0, z: plane.nz },
        depth: plane.depth,
        standing: false,
      };

  // Is one of them genuinely *on* the other, as opposed to merely beside it?
  //
  // Minimum penetration alone gets this catastrophically wrong for a short
  // wide thing and a tall narrow one: a creature that walks into the side of a
  // table overlaps it by the table's whole height and by only a few pixels
  // sideways, so the shallower axis is the sideways one — and the creature is
  // quietly lifted onto the table it just bumped into. The test that actually
  // means "on top of" is where the body *was*, not how deep it is now.
  const upper = vertical.aOnTop ? a : b;
  const lower = vertical.aOnTop ? b : a;
  const resting =
    upper.previous.y >= topOf(lower) - sinkAllowance(lower.collider.height);

  if (!resting) return sideways;

  // A container is only enterable from above. Nothing else in the room needs a
  // one-way surface, and scoping the rule to baskets keeps it a footnote
  // rather than the subsystem it used to be.
  if (blockedByRim(lower, upper)) return sideways;

  if (vertical.depth <= plane.depth) {
    return {
      a,
      b,
      normal: { x: 0, y: vertical.aOnTop ? 1 : -1, z: 0 },
      depth: vertical.depth,
      standing: vertical.aOnTop,
    };
  }

  return sideways;
}

/**
 * Should the pair be allowed through each other's sides?
 *
 * Suppressing the whole body was the obvious thing to do and it was wrong: the
 * creature sailed through the bed, landed on the floor inside it, and was then
 * squeezed out of the side like a pip. So only the sides ever open, and the
 * top face always catches.
 *
 * Two callers, and it is worth being clear that they are the same question:
 *
 *   climbing   the climber is let through the thing it is climbing, but only
 *              while it is still below the top of it. The moment its feet
 *              clear the surface the contact comes back and the surface
 *              catches it — the whole of "scrambles onto the chair" without a
 *              single line about paws.
 *   scenery    the creature walks through the plant, the lamp and the table
 *              legs, because a room furnished densely enough to look lived in
 *              is a room the creature cannot cross (see `Solidity`).
 *
 * Scenery opens only against a *character*. A ball still bounces off the
 * plant, because a ball has nowhere it is trying to get to.
 */
function sidesOpen(a: PhysicsBody, b: PhysicsBody): boolean {
  if (a.passThrough === b.id || b.passThrough === a.id) return true;

  if (a.type === 'character' && b.solidity === 'scenery') return true;
  if (b.type === 'character' && a.solidity === 'scenery') return true;

  return false;
}

/**
 * Is something trying to walk into a container rather than drop into it?
 *
 * @param holder the possible container
 * @param rider  whatever is arriving on top of it
 */
function blockedByRim(holder: PhysicsBody, rider: PhysicsBody): boolean {
  if (holder.surface?.kind !== 'container') return false;
  if (rider.passThrough === holder.id) return false;

  // The test is where the rider's *middle* is. Over the opening means it is
  // dropping in; merely overlapping the edge means it walked into the side,
  // and the side of a basket is a side. Stateless, and it stays true for as
  // long as the thing is in there.
  return !footprintContains(holder, rider.position.x, rider.position.z);
}

interface PlaneOverlap {
  nx: number;
  nz: number;
  depth: number;
}

/** Two circles in the floor plane. */
function circleCircle(a: PhysicsBody, b: PhysicsBody): PlaneOverlap | null {
  const ra = halfX(a.collider);
  const rb = halfX(b.collider);
  const reach = ra + rb;

  const dx = a.position.x - b.position.x;
  const dz = a.position.z - b.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance >= reach) return null;

  // Exactly concentric: pick an axis rather than dividing by zero.
  if (distance === 0) return { nx: 1, nz: 0, depth: reach };

  return { nx: dx / distance, nz: dz / distance, depth: reach - distance };
}

/** Two rectangles in the floor plane. */
function rectRect(a: PhysicsBody, b: PhysicsBody): PlaneOverlap | null {
  const dx = a.position.x - b.position.x;
  const dz = a.position.z - b.position.z;

  const overlapX = halfX(a.collider) + halfX(b.collider) - Math.abs(dx);
  if (overlapX <= 0) return null;

  const overlapZ = halfZ(a.collider) + halfZ(b.collider) - Math.abs(dz);
  if (overlapZ <= 0) return null;

  if (overlapX < overlapZ) {
    return { nx: dx < 0 ? -1 : 1, nz: 0, depth: overlapX };
  }

  return { nx: 0, nz: dz < 0 ? -1 : 1, depth: overlapZ };
}

/**
 * A circle against a rectangle.
 *
 * @param sign +1 when the circle is body `a` of the contact, -1 when it is
 *             body `b`, so the normal always points from `b` toward `a`.
 */
function circleRect(
  circle: PhysicsBody,
  rect: PhysicsBody,
  sign: 1 | -1,
): PlaneOverlap | null {
  const radius = halfX(circle.collider);
  const hx = halfX(rect.collider);
  const hz = halfZ(rect.collider);

  const dx = circle.position.x - rect.position.x;
  const dz = circle.position.z - rect.position.z;

  const clampedX = Math.max(-hx, Math.min(hx, dx));
  const clampedZ = Math.max(-hz, Math.min(hz, dz));

  const ox = dx - clampedX;
  const oz = dz - clampedZ;
  const outside = ox * ox + oz * oz;

  if (outside > 0) {
    if (outside >= radius * radius) return null;
    const distance = Math.sqrt(outside);
    return {
      nx: (ox / distance) * sign,
      nz: (oz / distance) * sign,
      depth: radius - distance,
    };
  }

  // Centre inside the rectangle: leave by the nearest face.
  const faceX = hx - Math.abs(dx);
  const faceZ = hz - Math.abs(dz);

  if (faceX < faceZ) {
    return { nx: (dx < 0 ? -1 : 1) * sign, nz: 0, depth: faceX + radius };
  }

  return { nx: 0, nz: (dz < 0 ? -1 : 1) * sign, depth: faceZ + radius };
}

interface HeightOverlap {
  depth: number;
  /** True when `a` is the upper body — i.e. `a` would be standing on `b`. */
  aOnTop: boolean;
}

function heightOverlap(a: PhysicsBody, b: PhysicsBody): HeightOverlap | null {
  const aTop = topOf(a);
  const bTop = topOf(b);

  const overlap = Math.min(aTop, bTop) - Math.max(a.position.y, b.position.y);
  if (overlap <= 0) return null;

  // Whoever's middle is higher is the one on top.
  const aMiddle = a.position.y + a.collider.height / 2;
  const bMiddle = b.position.y + b.collider.height / 2;

  return { depth: overlap, aOnTop: aMiddle >= bMiddle };
}
