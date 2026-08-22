/**
 * How hard, and which way, a batted toy goes.
 *
 * The obvious answer — send it away from the paw — is the answer that
 * eventually wedges the ball into a corner and leaves the creature pawing at
 * the skirting board for the rest of the afternoon. Away from the paw *is*
 * into the wall whenever the creature has chased the ball to the wall, which
 * is most of the time, because it chased it there with the last three swipes.
 *
 * The fix that suggests itself is to push back from the walls, and it does not
 * work. Pushing away from the wall and away from the bed are the same
 * direction as often as they are opposite, and in the gap between the bed and
 * the wall — the exact place a ball gets lost — the two cancel and the ball
 * spends the afternoon rattling up and down a sixty-pixel alley. Watched, it
 * is worse than the original problem, because it looks like effort.
 *
 * So the swipe asks the only question that actually distinguishes a good shot
 * from a bad one: *which way is there room?*
 *
 *            ▁▁▁▁▁▁▁▁▁▁▁▁▁▁                 sixteen directions, each measured
 *      wall │              │  bed           to the first thing in the way
 *           │   ↑ 210      │
 *           │ ↖ 60  ↗ 40   │                the paw's direction gets a bonus,
 *           │   ●          │                not a veto — so the usual shot is
 *           │ ↙ 55  ↘ 45   │                still "away from me", and the
 *           │   ↓ 180      │                cornered shot is "along the alley"
 *
 * Every direction is scored by how far the toy could travel down it, scaled by
 * how much the paw wanted to go that way and by a dose of chance, and the best
 * one wins. Out in the open every direction has room, so the paw and the
 * chance decide and the ball goes roughly where a paw would send it. In a
 * corner the scores collapse onto the one or two directions that lead
 * anywhere, and the ball leaves the corner.
 *
 * Nothing here is a special case, which is the property worth having: there is
 * no list of corners, no wall-reflection rule, and no arrangement of furniture
 * that needs a new clause.
 */

import type { RoomBounds, Vec3 } from '../../simulation/physics';

/**
 * Something a toy could get stuck behind: a footprint on the floor.
 *
 * Shaped, rather than reduced to a circle. Approximating the basket as the
 * circle round it was tried and it fails in the one place it matters: a ball
 * resting against the *side* of a box is inside the circle drawn round that
 * box, the measurement decides the toy is already overlapping it, and the
 * basket stops counting as an obstacle at exactly the moment the toy is stuck
 * against it. The creature then spends the afternoon patting the ball into the
 * side of the laundry basket, which is precisely the behaviour all of this
 * exists to prevent.
 */
export interface Blocker {
  x: number;
  z: number;
  /** Half-extents of the footprint. Equal, for a round one. */
  halfX: number;
  halfZ: number;
  /** True for a cylinder, false for a box. */
  round: boolean;
}

/** How many directions are considered. Sixteen is every 22.5°. */
const DIRECTIONS = 16;

/**
 * How far down a direction is worth measuring, in pixels.
 *
 * Past this the toy has plenty of room and exactly how much stops mattering —
 * which is what lets the paw's preference decide in the open, instead of the
 * ball always being sent down the room's longest diagonal.
 */
const REACH = 380;

/**
 * How much a direction is preferred for being the way the paw was going.
 *
 * A *multiplier* on the room available, not an amount added to it, and the
 * difference is the whole of getting out of the gap between the bed and the
 * wall. Added, a fixed bonus eventually outweighs the clearance itself:
 * thirty pixels of room in the direction of the swipe scores higher than two
 * hundred at right angles to it, and the ball is patted into the wall all
 * afternoon. Multiplied, the preference can only ever choose between
 * directions that lead somewhere — which is what a preference should do.
 */
const PAW_WEIGHT = 0.7;

/**
 * How much of the choice is left to chance, as a fraction.
 *
 * Multiplicative for the same reason. Out in the open, where every direction
 * has all the room it needs, this is most of what decides — and without it the
 * same geometry produces the same shot every time and a game of fetch becomes
 * a metronome.
 */
const JITTER = 0.5;

/** Base power of a swipe, and how much it varies. */
const POWER = 250;
const POWER_SPREAD = 240;

/** Extra power when the toy has to be got out of somewhere tight. */
const ESCAPE_POWER = 240;

/** Lift, so the toy leaves the floor rather than grinding along it. */
const LIFT = 330;
const LIFT_SPREAD = 190;

/** Extra lift for a shot that has to come back past the creature. */
const CONTESTED_LIFT = 260;

/** A final turn on the chosen direction, in radians. About 12° either way. */
const SCATTER = 0.42;

/**
 * Work out the impulse for one bat of a paw.
 *
 * @param toy      where the toy is, and how big it is.
 * @param awayX    unit vector from the creature toward the toy: the direction
 * @param awayZ    a paw on its own would send it.
 * @param bounds   the room.
 * @param blockers everything else in the room that a toy can be stuck behind.
 * @param random   injectable, so a swipe can be reproduced.
 */
export function swipeImpulse(
  toy: { x: number; z: number; radius: number },
  awayX: number,
  awayZ: number,
  bounds: RoomBounds,
  blockers: readonly Blocker[] = [],
  random: () => number = Math.random,
): Vec3 {
  let bestX = awayX;
  let bestZ = awayZ;
  let bestScore = -Infinity;
  let bestRoom = REACH;

  for (let i = 0; i < DIRECTIONS; i++) {
    const angle = (i / DIRECTIONS) * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);

    const room = clearance(toy, dirX, dirZ, bounds, blockers);

    // Depth is drawn foreshortened, so a shot across the room reads as further
    // than the same shot into it. Scoring x a little higher keeps the ball
    // moving in the direction the viewer can actually see it move.
    const seen = room * (1 - 0.25 * Math.abs(dirZ));

    const preference = 1 + PAW_WEIGHT * (dirX * awayX + dirZ * awayZ);
    const score = seen * preference * (1 - JITTER / 2 + random() * JITTER);

    if (score > bestScore) {
      bestScore = score;
      bestX = dirX;
      bestZ = dirZ;
      bestRoom = room;
    }
  }

  // A last turn, so that even the same choice is not quite the same shot.
  const scatter = (random() - 0.5) * SCATTER * 2;
  const cos = Math.cos(scatter);
  const sin = Math.sin(scatter);
  const dirX = bestX * cos - bestZ * sin;
  const dirZ = bestX * sin + bestZ * cos;

  // Tight spots are hit harder: the toy has to be got out, not nudged along.
  const tightness = 1 - Math.min(1, bestRoom / REACH);
  const power = POWER + random() * POWER_SPREAD + tightness * ESCAPE_POWER;

  // Is the shot having to come back past the creature? Then it goes over it.
  const contested = Math.max(0, -(dirX * awayX + dirZ * awayZ));

  return {
    x: dirX * power,
    z: dirZ * power * 0.6,
    y: LIFT + random() * LIFT_SPREAD + contested * CONTESTED_LIFT,
  };
}

/**
 * How far the toy could travel this way before something stops it.
 *
 * Analytic and cheap — a ray against four planes and a handful of circles —
 * because it is done sixteen times per swipe and a swipe happens on a frame
 * where the creature is already mid-pounce.
 *
 * Both shapes are grown by the toy's own radius first, so the toy can be
 * treated as a point and the whole thing is a ray against a rectangle or a
 * circle. Overlapping obstacles are skipped rather than scored zero: a toy
 * that has been dropped on the bed is inside the bed by this measure, and
 * every direction being equally blocked is the same as none of them being.
 */
function clearance(
  toy: { x: number; z: number; radius: number },
  dirX: number,
  dirZ: number,
  bounds: RoomBounds,
  blockers: readonly Blocker[],
): number {
  let limit = REACH;

  // The walls.
  if (dirX > 0) limit = Math.min(limit, (bounds.maxX - toy.radius - toy.x) / dirX);
  else if (dirX < 0) limit = Math.min(limit, (bounds.minX + toy.radius - toy.x) / dirX);

  if (dirZ > 0) limit = Math.min(limit, (bounds.maxZ - toy.radius - toy.z) / dirZ);
  else if (dirZ < 0) limit = Math.min(limit, (bounds.minZ + toy.radius - toy.z) / dirZ);

  // Everything else in the room.
  for (const blocker of blockers) {
    const hit = blocker.round
      ? rayCircle(toy, dirX, dirZ, blocker)
      : rayBox(toy, dirX, dirZ, blocker);

    if (hit !== null) limit = Math.min(limit, hit);
  }

  return Math.max(0, limit);
}

/** Distance to a round footprint, or null for "not in the way". */
function rayCircle(
  toy: { x: number; z: number; radius: number },
  dirX: number,
  dirZ: number,
  blocker: Blocker,
): number | null {
  const offsetX = toy.x - blocker.x;
  const offsetZ = toy.z - blocker.z;
  const reach = blocker.halfX + toy.radius;

  const along = offsetX * dirX + offsetZ * dirZ;
  const outside = offsetX * offsetX + offsetZ * offsetZ - reach * reach;

  if (outside <= 0) return null;
  if (along > 0) return null;

  const discriminant = along * along - outside;
  if (discriminant < 0) return null;

  const hit = -along - Math.sqrt(discriminant);

  return hit >= 0 ? hit : null;
}

/**
 * Distance to a rectangular footprint, or null for "not in the way".
 *
 * The standard slab test, against the rectangle grown by the toy's radius.
 */
function rayBox(
  toy: { x: number; z: number; radius: number },
  dirX: number,
  dirZ: number,
  blocker: Blocker,
): number | null {
  const spanX = blocker.halfX + toy.radius;
  const spanZ = blocker.halfZ + toy.radius;

  const offsetX = toy.x - blocker.x;
  const offsetZ = toy.z - blocker.z;

  // Already overlapping: every direction is equally blocked, which is no
  // information at all.
  if (Math.abs(offsetX) <= spanX && Math.abs(offsetZ) <= spanZ) return null;

  let near = -Infinity;
  let far = Infinity;

  for (const [offset, dir, span] of [
    [offsetX, dirX, spanX],
    [offsetZ, dirZ, spanZ],
  ] as const) {
    if (Math.abs(dir) < 1e-6) {
      // Parallel to this pair of edges, and outside them: it can never hit.
      if (Math.abs(offset) > span) return null;
      continue;
    }

    const first = (-span - offset) / dir;
    const second = (span - offset) / dir;

    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
  }

  if (near > far || far < 0) return null;

  return Math.max(0, near);
}
