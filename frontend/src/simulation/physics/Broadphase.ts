/**
 * Which pairs are worth testing properly.
 *
 * A room holds a couple of dozen things, so this could be a double loop and
 * nobody would notice. It is a sweep instead for one reason that matters more
 * than speed: the sweep is along x, and the reject that follows is along z,
 * which means the *first* question ever asked about two objects is "are they
 * even in the same part of the room". That is precisely the question the old
 * system answered last, and answered with a fudge factor.
 */

import { halfX, halfZ } from './Collider';
import { topOf } from './Collider';
import type { PhysicsBody } from './types';

export interface Pair {
  a: PhysicsBody;
  b: PhysicsBody;
}

/**
 * Every pair whose bounding boxes overlap in all three axes.
 *
 * Static/static pairs and sleeping/sleeping pairs are dropped here: neither
 * can produce motion, and skipping them is what lets a settled room cost
 * almost nothing.
 */
export function findPairs(bodies: PhysicsBody[], out: Pair[] = []): Pair[] {
  out.length = 0;

  const active = bodies.slice();
  active.sort((a, b) => a.position.x - halfX(a.collider) - (b.position.x - halfX(b.collider)));

  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const aMaxX = a.position.x + halfX(a.collider);

    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];

      // Sorted by left edge, so once one starts past a's right edge, so does
      // everything after it.
      if (b.position.x - halfX(b.collider) > aMaxX) break;

      if (!interesting(a, b)) continue;
      if (!overlapsZ(a, b) || !overlapsY(a, b)) continue;

      out.push({ a, b });
    }
  }

  // Bottom of the room first. The solver is Gauss-Seidel, so the order pairs
  // are visited in is the order support propagates: resolving the floor
  // contact before the thing standing on it means one pass carries the answer
  // all the way up a stack instead of one rung of it.
  out.sort(
    (p, q) =>
      Math.min(p.a.position.y, p.b.position.y) - Math.min(q.a.position.y, q.b.position.y),
  );

  return out;
}

/** Can this pair produce any motion at all? */
function interesting(a: PhysicsBody, b: PhysicsBody): boolean {
  // Anchored bodies are wall decor. They hold a floor-plane collider only so
  // the wall grid can borrow the floor's columns, and a clock two hundred
  // units up the plaster is not something a thrown ball should ricochet off.
  // Nothing lands on one either — `PhysicsWorld.surfaceBodyAt` skips them —
  // so leaving them in the narrowphase only ever produced invisible geometry.
  if (a.anchored || b.anchored) return false;

  const aFixed = a.type === 'static' || a.held;
  const bFixed = b.type === 'static' || b.held;
  if (aFixed && bFixed) return false;
  if (a.sleeping && b.sleeping) return false;
  if (a.sleeping && bFixed) return false;
  if (b.sleeping && aFixed) return false;
  return true;
}

function overlapsZ(a: PhysicsBody, b: PhysicsBody): boolean {
  return (
    Math.abs(a.position.z - b.position.z) <= halfZ(a.collider) + halfZ(b.collider)
  );
}

function overlapsY(a: PhysicsBody, b: PhysicsBody): boolean {
  return a.position.y <= topOf(b) && b.position.y <= topOf(a);
}
