/**
 * The room as the creature understands it: a floor, and the bits of it that
 * are taken.
 *
 * This is the *navigation world* — the third of the four the architecture
 * separates (visual, navigation, physics, behaviour), and the one that was
 * missing. Without it the creature had exactly one way to find out that
 * something was in its way, which was to walk into it, and exactly one way to
 * respond, which was to lean on it and hope. Everything that made it look
 * stupid came from that: the corner it could not leave, the ball it could not
 * reach, the six seconds spent pressed against the side of the bed.
 *
 * A grid, deliberately
 * --------------------
 * The room is a small box with a handful of solid things in it. A navmesh
 * would be more elegant and would have to be rebuilt every time the user drags
 * the bed two inches; a grid this size is rebuilt in a few hundred
 * microseconds and is *correct by construction* — there is no geometry to get
 * wrong, only cells that are taken and cells that are not.
 *
 *   ┌─────────────────────────────┐  z = minZ, the back wall
 *   │ · · · · ▓ ▓ · · · · · · · · │
 *   │ · · · · ▓ ▓ · · ▓ ▓ ▓ ▓ · · │  ▓  taken: solid, and too tall to step on
 *   │ · · · · · · · · ▓ ▓ ▓ ▓ · · │  ·  floor the creature can stand on
 *   │ · · · · · · · · · · · · · · │
 *   └─────────────────────────────┘  z = maxZ, nearest the viewer
 *
 * What counts as taken
 * --------------------
 * Only what would genuinely stop the walker, which is a much shorter list than
 * "things in the room":
 *
 *   scenery          never. The plant is drawn, not standing in the way.
 *   low things       never. A pillow is a step, not a wall.
 *   light things     never. A ball is shoved through, not walked around.
 *   what it is on    never. You cannot be blocked by the floor you stand on.
 *
 * Cells are marked out to the walker's own radius, so a route through open
 * cells is a route its whole body fits along, and the path follower never has
 * to think about width.
 *
 * The grid holds no path and no creature. It answers two questions — *is this
 * spot free* and *can I see from here to there* — and everything else in this
 * folder is built out of those two.
 */

import { footprintContains, topOf } from '../physics';
import type { PhysicsBody } from '../physics';

/**
 * Cell size, in world units.
 *
 * Twenty is a little under the creature's own radius, which is the property
 * that matters: gaps it can fit through survive quantisation, and the path it
 * gets back does not stagger visibly from cell to cell once it has been pulled
 * straight (see `PathFinder`).
 */
export const CELL = 20;

/** The patch of floor being navigated. */
export interface NavBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Whoever is being routed, and what it is able to ignore. */
export interface Walker {
  /** Footprint radius. Obstacles are grown by this so the route fits. */
  radius: number;
  /** How tall a ledge it steps onto rather than walks around. */
  stepHeight: number;
  /** Anything much lighter than this is shoved out of the way, not avoided. */
  mass: number;
  /** What it is currently standing on, which cannot also be in its way. */
  supportId?: string | null;
}

/** A cell, as two integers. */
export interface Cell {
  col: number;
  row: number;
}

export class NavGrid {
  bounds: NavBounds;

  readonly cell: number;
  cols = 0;
  rows = 0;

  /**
   * Bumped every time the grid is rebuilt.
   *
   * The only thing anyone outside needs in order to know that a route planned
   * a moment ago may no longer be a route.
   */
  version = 0;

  /** One byte per cell: 0 free, 1 taken. */
  private taken: Uint8Array = new Uint8Array(0);

  /** What the room looked like last time it was built. */
  private signature = '';

  constructor(bounds: NavBounds, cell = CELL) {
    this.cell = cell;
    this.bounds = bounds;
    this.resize(bounds);
  }

  /**
   * Bring the grid up to date with the room, cheaply.
   *
   * Called every frame. Almost every frame the answer is "nothing that blocks
   * anything has moved", and the cost is a walk over a dozen bodies building a
   * short string. When something *has* moved — the user dragged the bed, a toy
   * heavy enough to matter rolled — the grid is rebuilt and `version` changes,
   * which is how anyone holding a route finds out to check it (§6 of the
   * movement brief: a path is only valid until the room changes underneath it).
   *
   * @returns true if the grid was rebuilt.
   */
  sync(bodies: PhysicsBody[], walker: Walker, bounds?: NavBounds): boolean {
    const nextBounds = bounds ?? this.bounds;
    const blockers = bodies.filter((body) => blocks(body, walker));

    // The walker is part of the signature, not just the room: what it is
    // standing on is excluded from the obstacles below, so climbing onto the
    // bed has to rebuild the grid that says the bed is in the way.
    let signature =
      `${nextBounds.minX},${nextBounds.maxX},${nextBounds.minZ},${nextBounds.maxZ}` +
      `|${Math.round(walker.radius)},${Math.round(walker.stepHeight)},${walker.supportId ?? ''}`;

    for (const body of blockers) {
      // Rounded to the cell: a body jittering by a pixel is not a new room.
      signature += `;${body.id}:${Math.round(body.position.x / this.cell)},${Math.round(
        body.position.z / this.cell,
      )},${Math.round(body.position.y / this.cell)}`;
    }

    if (signature === this.signature) return false;

    this.signature = signature;
    if (
      nextBounds.minX !== this.bounds.minX ||
      nextBounds.maxX !== this.bounds.maxX ||
      nextBounds.minZ !== this.bounds.minZ ||
      nextBounds.maxZ !== this.bounds.maxZ
    ) {
      this.resize(nextBounds);
    }

    this.build(blockers, walker);
    this.version++;

    return true;
  }

  // --- Geometry -------------------------------------------------------------

  /** Which cell a floor position falls in. Not clamped. */
  cellAt(x: number, z: number): Cell {
    return {
      col: Math.floor((x - this.bounds.minX) / this.cell),
      row: Math.floor((z - this.bounds.minZ) / this.cell),
    };
  }

  /** The middle of a cell, in world units. */
  centreOf(col: number, row: number): { x: number; z: number } {
    return {
      x: this.bounds.minX + (col + 0.5) * this.cell,
      z: this.bounds.minZ + (row + 0.5) * this.cell,
    };
  }

  inside(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  index(col: number, row: number): number {
    return row * this.cols + col;
  }

  /** Is this cell taken, or outside the room? Outside counts as taken. */
  blocked(col: number, row: number): boolean {
    if (!this.inside(col, row)) return true;
    return this.taken[this.index(col, row)] === 1;
  }

  /** Is this floor position somewhere the walker could stand? */
  open(x: number, z: number): boolean {
    const { col, row } = this.cellAt(x, z);
    return !this.blocked(col, row);
  }

  /**
   * Is the straight line between two points clear?
   *
   * Used twice, for two quite different purposes: to pull a staircase of grid
   * cells into the two or three corners a creature would actually walk, and to
   * ask whether the route it is halfway along still exists. Sampled rather
   * than rasterised, at half a cell, which cannot skip a taken cell because no
   * cell is smaller than a cell.
   */
  clearLine(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const distance = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil((distance * 2) / this.cell));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.open(x0 + dx * t, z0 + dz * t)) return false;
    }

    return true;
  }

  /**
   * The nearest place to this one the walker could actually stand.
   *
   * Every destination goes through here, and it is what stops a whole class of
   * failure before it starts: a creature told to walk into the bed walks to
   * the edge of the bed instead of failing, and a creature that has somehow
   * ended up inside something is routed out of it rather than being declared
   * stuck. Rings outward from the cell, so the answer is the closest one.
   *
   * @returns null only if the entire room is taken.
   */
  nearestOpen(x: number, z: number, maxRadius = 10): { x: number; z: number } | null {
    if (this.open(x, z)) return { x, z };

    const origin = this.cellAt(x, z);

    for (let ring = 1; ring <= maxRadius; ring++) {
      let best: { x: number; z: number } | null = null;
      let bestDistance = Infinity;

      for (let dRow = -ring; dRow <= ring; dRow++) {
        for (let dCol = -ring; dCol <= ring; dCol++) {
          // Only the shell of the ring; the inside was searched last time.
          if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== ring) continue;

          const col = origin.col + dCol;
          const row = origin.row + dRow;
          if (this.blocked(col, row)) continue;

          const centre = this.centreOf(col, row);
          const distance = Math.hypot(centre.x - x, centre.z - z);

          if (distance < bestDistance) {
            best = centre;
            bestDistance = distance;
          }
        }
      }

      if (best) return best;
    }

    return null;
  }

  // --- Building -------------------------------------------------------------

  private resize(bounds: NavBounds): void {
    this.bounds = bounds;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / this.cell));
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / this.cell));
    this.taken = new Uint8Array(this.cols * this.rows);
  }

  private build(blockers: PhysicsBody[], walker: Walker): void {
    this.taken.fill(0);

    // Grown by the walker's own size, so a free cell means a cell its whole
    // body fits in and the follower can treat itself as a point. Not the full
    // radius: at four fifths of it a creature will squeeze between the bed and
    // the wall, which it can, rather than declaring the gap sealed and walking
    // the long way round the room.
    const margin = walker.radius * 0.8;

    for (const body of blockers) {
      const reachX = halfSpanX(body) + margin;
      const reachZ = halfSpanZ(body) + margin;

      const from = this.cellAt(body.position.x - reachX, body.position.z - reachZ);
      const to = this.cellAt(body.position.x + reachX, body.position.z + reachZ);

      for (let row = from.row; row <= to.row; row++) {
        for (let col = from.col; col <= to.col; col++) {
          if (!this.inside(col, row)) continue;

          const centre = this.centreOf(col, row);
          // The real footprint, not its bounding box: a round table does not
          // block its own corners, and the creature should be able to cut them.
          if (!footprintContains(body, centre.x, centre.z, margin)) continue;

          this.taken[this.index(col, row)] = 1;
        }
      }
    }
  }
}

/**
 * Would this body stop the walker?
 *
 * The short list. Everything excluded here is excluded because walking into it
 * is *fine* — the creature steps onto the pillow, shoulders the ball aside,
 * and strolls through the pot plant — and a navigator that routed around all
 * of it would produce long, cautious, obviously computed paths through a room
 * that is mostly empty.
 */
function blocks(body: PhysicsBody, walker: Walker): boolean {
  if (body.type === 'character' || body.held) return false;
  if (body.solidity === 'scenery') return false;
  if (body.id === walker.supportId) return false;

  // A step is not a wall.
  if (topOf(body) <= walker.stepHeight) return false;

  // Light enough to shove. The creature is allowed to barge past a toy, and
  // the physics will make that look like something.
  if (body.type === 'dynamic' && body.mass < walker.mass * 0.6) return false;

  return true;
}

function halfSpanX(body: PhysicsBody): number {
  return body.collider.shape === 'cylinder' ? body.collider.radius : body.collider.halfX;
}

function halfSpanZ(body: PhysicsBody): number {
  return body.collider.shape === 'cylinder' ? body.collider.radius : body.collider.halfZ;
}
