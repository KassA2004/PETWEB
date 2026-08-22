/**
 * Getting there, and knowing when you are not going to.
 *
 * The brain says *where*, the physics says *what happened*, and this says
 * *which way now*. It owns a route and the question of whether that route is
 * still worth believing:
 *
 *   destination
 *        ↓
 *   find a route  ←──────────────┐
 *        ↓                       │
 *   walk the next corner         │ the room changed, something shoved me,
 *        ↓                       │ my target moved, or I have got nowhere
 *   arrived?  ── no ── blocked? ─┘ for a second and a bit
 *        ↓ yes                  ╲
 *      done                      ╲ too many times → give up, and say so
 *
 * The last arrow is the one that was missing and the one that matters most.
 * A creature that cannot reach the ball is not a bug to be solved by better
 * pathing — sometimes the ball really is under the bed — it is a creature that
 * has to be able to shrug and go and do something else. So failure here is a
 * first-class result rather than an exception: `status` becomes `failed`, the
 * scene tells the brain, and the brain abandons the behaviour and picks
 * another (§9 of the movement brief).
 *
 * Nothing in this file touches a velocity. It hands back a point to walk at,
 * and the character controller decides how hard to lean to get there — which
 * is what keeps navigation independent of the solver: being knocked off course
 * changes where the creature *is*, and the route is re-derived from that
 * rather than fought over.
 */

import { findPath } from './PathFinder';
import type { Waypoint } from './PathFinder';
import type { NavGrid } from './NavGrid';

export type NavStatus = 'idle' | 'moving' | 'arrived' | 'failed';

/**
 * Somewhere to go.
 *
 * Either a place — "the far corner", for a wander — or a *thing*, which is the
 * interesting case. A creature going to a thing does not want the middle of
 * it: it wants anywhere it can stand that is close enough to play with it, sit
 * on it or sniff it, and if one side is against the wall it wants another
 * side. That is what `objectId`, `radius` and `standOff` buy (§8).
 */
export interface Destination {
  /** The place, or the middle of the thing. */
  x: number;
  z: number;
  /** The thing, if it is a thing. Two destinations with one id are one goal. */
  objectId?: string | null;
  /** The thing's footprint radius. Ignored for a plain place. */
  radius?: number;
  /** How far from its edge is a good place to stand, walker included. */
  standOff?: number;
  /** How close counts as arrived, for a plain place. */
  arrive?: number;
}

export interface NavResult {
  status: NavStatus;
  /** Where to head right now, or null when there is nowhere to be. */
  waypoint: Waypoint | null;
}

/** How close to a corner counts as having turned it. */
const WAYPOINT_RADIUS = 24;

/** How close to a plain destination counts as arrived. */
const ARRIVE = 26;

/** Slack on top of the wanted standing distance from a thing. */
const ARRIVE_SLACK = 26;

/** How far a thing has to move before the route to it is out of date. */
const TARGET_MOVED = 55;

/**
 * How long the creature will make no progress before deciding it is stuck.
 *
 * Long enough to survive a stumble, a shove and the moment spent squeezing
 * past the chair; short enough that nobody watching has time to conclude the
 * animation has frozen.
 */
const STALL_TIME = 1.1;

/** Progress, in pixels, that counts as having moved at all. */
const STALL_PROGRESS = 10;

/** Fresh routes per destination before the destination is written off. */
const MAX_ATTEMPTS = 3;

/** A moment between attempts, so a failure is not three failures in a frame. */
const RETRY_DELAY = 0.45;

/**
 * Longest the creature will spend trying to get anywhere, in seconds.
 *
 * The final backstop, for the cases none of the others catch: a route that
 * technically exists and keeps being re-found while something keeps pushing
 * the creature back down it. Crossing the whole room takes about six seconds,
 * so this is generous.
 */
const TIME_LIMIT = 16;

/** Directions tried when looking for somewhere to stand next to a thing. */
const APPROACH_ANGLES = [0, 0.6, -0.6, 1.3, -1.3, 2.1, -2.1, Math.PI];

export class Navigator {
  private grid: NavGrid;

  private destination: Destination | null = null;
  private path: Waypoint[] = [];
  private goal: Waypoint | null = null;

  private state: NavStatus = 'idle';

  private attempts = 0;
  private retryIn = 0;
  private elapsed = 0;

  /** Distance to the goal at the last check, and how long since it improved. */
  private closest = Infinity;
  private stalled = 0;

  /** The grid generation the current route was planned against. */
  private plannedAt = -1;

  /** Where the thing was when the route to it was planned. */
  private plannedFor: Waypoint | null = null;

  constructor(grid: NavGrid) {
    this.grid = grid;
  }

  get status(): NavStatus {
    return this.state;
  }

  /** The route as it stands, for the debug overlay and for tests. */
  get route(): readonly Waypoint[] {
    return this.path;
  }

  /** What it is heading for, if anything. */
  get targetId(): string | null {
    return this.destination?.objectId ?? null;
  }

  /**
   * Say where to go.
   *
   * Safe to call every frame with the same destination — that is the expected
   * use, since the brain re-states its intent continuously and a thing being
   * chased moves while it is being chased. Restating a destination keeps the
   * route, the attempt count and the clock; changing one starts them again.
   */
  setDestination(destination: Destination | null): void {
    if (!destination) {
      if (this.state !== 'idle') this.clear();
      return;
    }

    if (this.destination && this.sameGoal(this.destination, destination)) {
      // The same errand. Keep everything; only the thing's position is news.
      this.destination = { ...destination };
      return;
    }

    this.destination = { ...destination };
    this.path = [];
    this.goal = null;
    this.plannedFor = null;
    this.state = 'moving';
    this.attempts = 0;
    this.retryIn = 0;
    this.elapsed = 0;
    this.closest = Infinity;
    this.stalled = 0;
  }

  /** Give up on wherever it was going. */
  clear(): void {
    this.destination = null;
    this.path = [];
    this.goal = null;
    this.plannedFor = null;
    this.state = 'idle';
    this.stalled = 0;
  }

  /**
   * Something happened to the creature that the route did not expect.
   *
   * A shove, a landing, a stumble. Cheap: it only marks the route for
   * re-checking on the next update, which is where all the actual thinking
   * happens.
   */
  disturb(): void {
    this.plannedAt = -1;
  }

  /**
   * Work out where to walk this frame.
   *
   * @param from    where the creature actually is now — not where the route
   *                assumed it would be, which is the entire trick.
   * @param options `suspended` freezes the clocks: held, airborne or
   *                mid-stumble is not the same as making no progress.
   */
  update(
    dt: number,
    from: Waypoint,
    options: { suspended?: boolean } = {},
  ): NavResult {
    const destination = this.destination;
    if (!destination || this.state === 'idle') {
      return { status: this.state, waypoint: null };
    }

    if (this.state === 'failed') return { status: 'failed', waypoint: null };

    // Arriving is not permanent. What it arrived at can roll away, and a
    // creature that considers a chase finished the first time it catches up
    // with the ball is a creature that stands still watching the ball leave.
    if (this.state === 'arrived') {
      if (this.reached(from, destination)) return { status: 'arrived', waypoint: null };

      this.state = 'moving';
      this.attempts = 0;
      this.elapsed = 0;
      this.stalled = 0;
      this.closest = Infinity;
      this.path = [];
    }

    const suspended = options.suspended ?? false;

    if (!suspended) {
      this.elapsed += dt;
      this.retryIn = Math.max(0, this.retryIn - dt);
    }

    if (this.reached(from, destination)) {
      this.state = 'arrived';
      this.path = [];
      return { status: 'arrived', waypoint: null };
    }

    if (this.elapsed > TIME_LIMIT) return this.fail();

    if (!suspended) this.trackProgress(dt, from);

    // Pressed against something for over a second, getting nowhere. A stall is
    // an attempt spent, exactly like a search that came back empty: both mean
    // "that idea did not work", and both have to run out.
    let replan = this.needsRoute(from, destination);

    if (this.stalled >= STALL_TIME) {
      this.stalled = 0;
      this.attempts++;
      replan = true;
    }

    if (replan) {
      if (this.attempts >= MAX_ATTEMPTS) return this.fail();

      if (this.retryIn > 0) {
        // Between attempts. Keep walking at the old corner rather than
        // stopping dead: a creature that pauses to think looks broken, and the
        // old corner is still, usually, roughly the right way.
        return { status: 'moving', waypoint: this.path[0] ?? null };
      }

      if (!this.plan(from, destination)) {
        this.attempts++;
        this.retryIn = RETRY_DELAY;
        this.stalled = 0;

        if (this.attempts >= MAX_ATTEMPTS) return this.fail();
        return { status: 'moving', waypoint: null };
      }
    }

    // --- Walk the route ------------------------------------------------------
    while (this.path.length > 1 && near(from, this.path[0], WAYPOINT_RADIUS)) {
      this.path.shift();
    }

    const waypoint = this.path[0] ?? null;
    if (!waypoint) return this.fail();

    // The last corner is the destination itself, and arrival at *that* is the
    // `reached` test above rather than this one — a creature going to a ball
    // has arrived when it is beside the ball, not when it is standing on it.
    if (this.path.length === 1 && near(from, waypoint, WAYPOINT_RADIUS) && !destination.objectId) {
      this.state = 'arrived';
      this.path = [];
      return { status: 'arrived', waypoint: null };
    }

    return { status: 'moving', waypoint };
  }

  // --- Internals -------------------------------------------------------------

  /** Two destinations are the same errand if they are the same thing, or near. */
  private sameGoal(a: Destination, b: Destination): boolean {
    if (a.objectId || b.objectId) return a.objectId === b.objectId;
    return Math.hypot(a.x - b.x, a.z - b.z) < 8;
  }

  /** Close enough to do whatever it came here to do. */
  private reached(from: Waypoint, destination: Destination): boolean {
    const distance = Math.hypot(destination.x - from.x, destination.z - from.z);

    if (destination.objectId) {
      const want = (destination.radius ?? 0) + (destination.standOff ?? 0);
      return distance <= want + ARRIVE_SLACK;
    }

    return distance <= (destination.arrive ?? ARRIVE);
  }

  /**
   * Is the route missing, stale, or no longer a route?
   *
   * A question, not a decision: it never touches the attempt count, so it can
   * be asked as often as the caller likes.
   */
  private needsRoute(from: Waypoint, destination: Destination): boolean {
    if (this.path.length === 0) return true;

    // The room changed under it. Only the part still to be walked matters.
    if (this.grid.version !== this.plannedAt) {
      this.plannedAt = this.grid.version;
      if (!this.walkable(from)) return true;
    }

    // The thing it is going to went somewhere.
    if (destination.objectId && this.plannedFor) {
      const drift = Math.hypot(
        destination.x - this.plannedFor.x,
        destination.z - this.plannedFor.z,
      );
      if (drift > TARGET_MOVED) return true;
    }

    // Knocked sideways far enough that the next corner is behind something.
    if (!this.grid.clearLine(from.x, from.z, this.path[0].x, this.path[0].z)) return true;

    return false;
  }

  /** Is every remaining leg of the route still clear? */
  private walkable(from: Waypoint): boolean {
    let previous = from;

    for (const corner of this.path) {
      if (!this.grid.clearLine(previous.x, previous.z, corner.x, corner.z)) return false;
      previous = corner;
    }

    return true;
  }

  /**
   * Find a route, trying each side of the destination in turn.
   *
   * For a place there is one candidate and it either works or it does not. For
   * a *thing* there are eight, arranged around it starting from the side the
   * creature is already on — so it walks to the near side of the ball, and if
   * the near side is jammed against the bed it walks round to the far one
   * rather than standing there wanting.
   */
  private plan(from: Waypoint, destination: Destination): boolean {
    const start = this.grid.nearestOpen(from.x, from.z) ?? from;

    for (const candidate of this.candidates(from, destination)) {
      const spot = this.grid.nearestOpen(candidate.x, candidate.z, 4);
      if (!spot) continue;

      const path = findPath(this.grid, start, spot);
      if (!path || path.length === 0) continue;

      this.path = path;
      this.goal = spot;
      this.plannedAt = this.grid.version;
      this.plannedFor = { x: destination.x, z: destination.z };
      this.closest = Infinity;
      this.stalled = 0;

      return true;
    }

    return false;
  }

  /** Every place worth trying to stand, best first. */
  private candidates(from: Waypoint, destination: Destination): Waypoint[] {
    if (!destination.objectId) return [{ x: destination.x, z: destination.z }];

    const gap = (destination.radius ?? 0) + (destination.standOff ?? 0);
    if (gap <= 0) return [{ x: destination.x, z: destination.z }];

    // Start from the side the creature is already on: the nearest approach is
    // almost always the right one, and trying it first means the usual case
    // costs one search.
    const toward = Math.atan2(from.z - destination.z, from.x - destination.x);

    return APPROACH_ANGLES.map((offset) => ({
      x: destination.x + Math.cos(toward + offset) * gap,
      z: destination.z + Math.sin(toward + offset) * gap,
    }));
  }

  /** Am I actually getting anywhere? */
  private trackProgress(dt: number, from: Waypoint): void {
    const goal = this.goal ?? this.path[this.path.length - 1] ?? null;
    if (!goal) return;

    const distance = Math.hypot(goal.x - from.x, goal.z - from.z);

    if (distance < this.closest - STALL_PROGRESS) {
      this.closest = distance;
      this.stalled = 0;
      return;
    }

    this.stalled += dt;
  }

  private fail(): NavResult {
    this.state = 'failed';
    this.path = [];
    this.stalled = 0;
    return { status: 'failed', waypoint: null };
  }
}

function near(a: Waypoint, b: Waypoint, radius: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) <= radius;
}
