/**
 * Finding a way across the room.
 *
 * A* over the occupancy grid, eight-connected, with two details that matter
 * more to how the creature *looks* than to whether it arrives:
 *
 *   corners are not cut     a diagonal step is only taken when both cells
 *                           beside it are free, so the route never clips the
 *                           edge of the bed on the way past
 *   the path is pulled taut afterwards, which is the difference between a
 *                           creature walking round the table and a creature
 *                           descending a staircase of twenty-pixel cells
 *
 * The taut path is the whole point of doing it this way. A grid gives a route
 * that is correct and looks computed; string-pulling it against the same
 * line-of-sight test the grid already provides gives back the two or three
 * corners an animal would actually turn, and the walk that comes out reads as
 * a decision rather than as an algorithm.
 *
 *        ▓▓▓▓▓▓                    ▓▓▓▓▓▓
 *     ·  ▓▓▓▓▓▓  ·              ·  ▓▓▓▓▓▓  ·
 *     ·· ▓▓▓▓▓▓ ··      →        ╲ ▓▓▓▓▓▓ ╱
 *      ··▓▓▓▓▓▓··                 ╲▓▓▓▓▓▓╱
 *       ·······                    ╲····╱
 *          A*                       taut
 */

import type { NavGrid } from './NavGrid';

/** A point on the floor the route passes through. */
export interface Waypoint {
  x: number;
  z: number;
}

/**
 * How many cells the search will look at before giving up.
 *
 * The room is about 1300 cells, so this is "the whole room, twice over" — a
 * backstop against a pathological case rather than a budget. A search that
 * hits it has been asked for somewhere genuinely unreachable, and the honest
 * answer to that is null rather than a path to somewhere else.
 */
const MAX_VISITED = 4000;

/** Straight and diagonal step costs, ×100 so they stay integers-ish. */
const STRAIGHT = 100;
const DIAGONAL = 141;

/**
 * Find a route from one floor position to another.
 *
 * Both ends are taken as given: the caller is expected to have moved them onto
 * open floor already (`NavGrid.nearestOpen`), because "where should I stand
 * instead" is a question about what the creature is *trying to do*, and the
 * search has no opinion about that.
 *
 * @returns the corners to walk, ending at `to`, or null if there is no way
 *          through. A destination already in sight comes back as a single
 *          waypoint without the search running at all.
 */
export function findPath(
  grid: NavGrid,
  from: Waypoint,
  to: Waypoint,
): Waypoint[] | null {
  // Most of the time, in a room this size, the answer is "just walk at it".
  if (grid.clearLine(from.x, from.z, to.x, to.z)) return [{ x: to.x, z: to.z }];

  const start = grid.cellAt(from.x, from.z);
  const goal = grid.cellAt(to.x, to.z);

  if (grid.blocked(start.col, start.row) || grid.blocked(goal.col, goal.row)) return null;

  const size = grid.cols * grid.rows;
  const startIndex = grid.index(start.col, start.row);
  const goalIndex = grid.index(goal.col, goal.row);

  if (startIndex === goalIndex) return [{ x: to.x, z: to.z }];

  const cost = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  const open = new Heap();
  cost[startIndex] = 0;
  open.push(startIndex, heuristic(start.col, start.row, goal.col, goal.row));

  let visited = 0;
  let found = false;

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current] === 1) continue;
    closed[current] = 1;

    if (current === goalIndex) {
      found = true;
      break;
    }

    if (++visited > MAX_VISITED) break;

    const col = current % grid.cols;
    const row = (current - col) / grid.cols;

    for (let dRow = -1; dRow <= 1; dRow++) {
      for (let dCol = -1; dCol <= 1; dCol++) {
        if (dCol === 0 && dRow === 0) continue;

        const nextCol = col + dCol;
        const nextRow = row + dRow;
        if (grid.blocked(nextCol, nextRow)) continue;

        // No squeezing diagonally between two corners. Without this the route
        // is geometrically valid and physically impossible, and the creature
        // spends the corner grinding against both pieces of furniture at once.
        if (dCol !== 0 && dRow !== 0) {
          if (grid.blocked(col + dCol, row) || grid.blocked(col, row + dRow)) continue;
        }

        const next = grid.index(nextCol, nextRow);
        if (closed[next] === 1) continue;

        const step = dCol !== 0 && dRow !== 0 ? DIAGONAL : STRAIGHT;
        const tentative = cost[current] + step;
        if (tentative >= cost[next]) continue;

        cost[next] = tentative;
        cameFrom[next] = current;
        open.push(next, tentative + heuristic(nextCol, nextRow, goal.col, goal.row));
      }
    }
  }

  if (!found) return null;

  // --- Unwind, then pull taut ----------------------------------------------
  const cells: Waypoint[] = [];
  for (let at = goalIndex; at !== -1; at = cameFrom[at]) {
    const col = at % grid.cols;
    const row = (at - col) / grid.cols;
    cells.push(grid.centreOf(col, row));
    if (at === startIndex) break;
  }
  cells.reverse();

  // The true start and end, rather than the middles of the cells they fall in.
  cells[0] = { x: from.x, z: from.z };
  cells[cells.length - 1] = { x: to.x, z: to.z };

  return smooth(grid, cells);
}

/**
 * Drop every waypoint the one before it can already see past.
 *
 * Greedy and linear, and quite good enough: what comes out is a path whose
 * corners are all real corners, which is all the follower needs to produce a
 * walk that looks intended.
 */
function smooth(grid: NavGrid, path: Waypoint[]): Waypoint[] {
  if (path.length <= 2) return path;

  const out: Waypoint[] = [path[0]];
  let anchor = 0;

  while (anchor < path.length - 1) {
    let furthest = anchor + 1;

    for (let candidate = path.length - 1; candidate > anchor + 1; candidate--) {
      const a = path[anchor];
      const b = path[candidate];
      if (grid.clearLine(a.x, a.z, b.x, b.z)) {
        furthest = candidate;
        break;
      }
    }

    out.push(path[furthest]);
    anchor = furthest;
  }

  // The first entry is where the creature already is; it has no business being
  // walked to.
  out.shift();

  return out;
}

function heuristic(col: number, row: number, goalCol: number, goalRow: number): number {
  // Octile: exact for eight-connected movement with these step costs, so the
  // search never expands a cell it did not need to.
  const dCol = Math.abs(col - goalCol);
  const dRow = Math.abs(row - goalRow);
  return STRAIGHT * (dCol + dRow) + (DIAGONAL - 2 * STRAIGHT) * Math.min(dCol, dRow);
}

/**
 * A binary heap of cell indices, ordered by score.
 *
 * Sorting an array of open cells would be simpler and, at this size, fast
 * enough — but this runs on a frame where the creature has just decided to go
 * somewhere, and the frame it runs on is the one the eye is on. Keeping it off
 * the sort is free.
 */
class Heap {
  private items: number[] = [];
  private scores: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, score: number): void {
    this.items.push(item);
    this.scores.push(score);

    let child = this.items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.scores[parent] <= this.scores[child]) break;
      this.swap(parent, child);
      child = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastScore = this.scores.pop() as number;

    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;

      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;

        if (left < this.items.length && this.scores[left] < this.scores[smallest]) {
          smallest = left;
        }
        if (right < this.items.length && this.scores[right] < this.scores[smallest]) {
          smallest = right;
        }
        if (smallest === parent) break;

        this.swap(parent, smallest);
        parent = smallest;
      }
    }

    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}
