/**
 * The floor grid: how the room tells you where things are.
 *
 * Physics uses continuous `x` and `z` and always will — a creature walking
 * toward a ball has to be able to be halfway there. But a *user* placing
 * furniture with a mouse does not want continuous position, they want to know
 * which part of the floor a thing is in, and they want the answer to be
 * obvious at a glance.
 *
 * This used to be three depth rows and nothing at all across the width, which
 * meant an object could be anywhere on the x axis and only ever in one of three
 * places on the z axis. Depth was the axis people actually wanted control over,
 * and it was the one that had almost none. So the floor is a grid of tiles now:
 * the same tidiness, in both directions, at a much finer resolution.
 *
 * The tiles exist for three separate reasons, and it is worth being clear about
 * each. They give the floor its seam lines, so depth is visible with nothing in
 * the room at all. They give a dropped object somewhere definite to land, so
 * two things never end up two pixels apart and permanently in each other's way.
 * And they give the drag affordance something to name, so the room can say
 * *row 3, column 7* while you are deciding.
 *
 * The creature ignores all of it and walks wherever it likes.
 */

import { ROOM_DEPTH, ROOM_WIDTH, floorLine, project } from './Projection';
import type { ScreenPoint } from './Projection';

/**
 * How big a tile wants to be, in world units.
 *
 * Chosen against the furniture rather than against the room: a chair's
 * footprint is about 70 units across and a bed's is about 180, so a hundred-unit
 * tile is "one small thing per tile, one big thing across two". Much finer and
 * the grid stops reading as a grid; much coarser and it is the old lane problem
 * again.
 */
const TILE_TARGET = 100;

/**
 * The room is 1280 x 600, so a hundred-unit target lands on 13 x 6.
 *
 * Both numbers are derived rather than typed in, which keeps the tiles square
 * (98.5 x 100 world units) if the room is ever resized. Thirteen columns is
 * deliberately odd: it puts a tile on the room's centre line, and things end up
 * on the centre line more often than anywhere else.
 */
export const GRID_COLUMNS = Math.round(ROOM_WIDTH / TILE_TARGET);
export const GRID_ROWS = Math.round(ROOM_DEPTH / TILE_TARGET);

export const TILE_WIDTH = ROOM_WIDTH / GRID_COLUMNS;
export const TILE_DEPTH = ROOM_DEPTH / GRID_ROWS;

export interface GridCell {
  /** 0 at the left wall. */
  col: number;
  /** 0 at the back wall. */
  row: number;
  /** World position of the tile's centre. */
  x: number;
  z: number;
}

function clampIndex(value: number, count: number): number {
  return Math.max(0, Math.min(count - 1, value));
}

/** The centre of a tile, in world units. */
export function cellCenter(col: number, row: number): { x: number; z: number } {
  return {
    x: (clampIndex(col, GRID_COLUMNS) + 0.5) * TILE_WIDTH,
    z: (clampIndex(row, GRID_ROWS) + 0.5) * TILE_DEPTH,
  };
}

/** Which tile a world position falls in. */
export function cellAt(x: number, z: number): GridCell {
  const col = clampIndex(Math.floor(x / TILE_WIDTH), GRID_COLUMNS);
  const row = clampIndex(Math.floor(z / TILE_DEPTH), GRID_ROWS);
  return { col, row, ...cellCenter(col, row) };
}

/**
 * Pull a position to the middle of its tile.
 *
 * Applied when something is *placed* — set down deliberately — and never when
 * something is thrown, because a ball that snapped to a tile mid-bounce would
 * look broken. Placement wants tidiness; physics wants to be left alone.
 */
export function snapToGrid(x: number, z: number): { x: number; z: number } {
  const cell = cellAt(x, z);
  return { x: cell.x, z: cell.z };
}

/**
 * Human-readable, for the drag affordance. One-based, because people count.
 *
 * Takes only the indices, so the status layer can name a tile it was handed as
 * two numbers without having to invent world coordinates for it.
 */
export function cellLabel(cell: { row: number; col: number }): string {
  return `Row ${cell.row + 1}, column ${cell.col + 1}`;
}

/** Whether two cells are the same tile. */
export function sameCell(
  a: { row: number; col: number } | null,
  b: { row: number; col: number } | null,
): boolean {
  if (!a || !b) return a === b;
  return a.col === b.col && a.row === b.row;
}

/* -------------------------------------------------------------------------- */
/* Where things start                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A coarse depth preference, used only to decide where a *new* object appears.
 *
 * This is not a constraint — once it is in the room it can go on any tile. It
 * exists so the object library can say "a lamp belongs against the wall" in
 * words rather than in row indices that would go stale if the grid changed.
 */
export type DepthBand = 'back' | 'middle' | 'front';

export const DEPTH_BAND_LABELS: Record<DepthBand, string> = {
  back: 'Back of the room',
  middle: 'Middle of the room',
  front: 'Front of the room',
};

/** The row a depth band starts a new object on. */
export function rowForBand(band: DepthBand): number {
  switch (band) {
    case 'back':
      return 0;
    case 'middle':
      return Math.floor((GRID_ROWS - 1) / 2);
    case 'front':
    default:
      return GRID_ROWS - 1;
  }
}

/** Which band a row reads as, for anything that wants a word instead of a number. */
export function bandForRow(row: number): DepthBand {
  const third = GRID_ROWS / 3;
  if (row < third) return 'back';
  if (row < third * 2) return 'middle';
  return 'front';
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

/** World z of a row's back and front edges. */
export function rowEdges(row: number): { from: number; to: number } {
  return { from: row * TILE_DEPTH, to: (row + 1) * TILE_DEPTH };
}

/** World x of a column's left and right edges. */
export function columnEdges(col: number): { from: number; to: number } {
  return { from: col * TILE_WIDTH, to: (col + 1) * TILE_WIDTH };
}

/**
 * One tile as a screen-space polygon, back edge first, going clockwise.
 *
 * Drawn in perspective, so a tile at the back of the room is a small squashed
 * trapezium and one at the front is a big one — which is exactly the shape the
 * floor already told the eye to expect.
 */
export function tileQuad(cell: GridCell): ScreenPoint[] {
  const { from: zBack, to: zFront } = rowEdges(cell.row);
  const { from: xLeft, to: xRight } = columnEdges(cell.col);

  return [
    project(xLeft, 0, zBack),
    project(xRight, 0, zBack),
    project(xRight, 0, zFront),
    project(xLeft, 0, zFront),
  ];
}

/** The same tile as a flat number array, which is what `Graphics.poly` wants. */
export function tilePolygon(cell: GridCell): number[] {
  return tileQuad(cell).flatMap((point) => [point.x, point.y]);
}

/**
 * A line down the room at a constant x, as two screen points.
 *
 * The grid's column seams. Row seams are `floorLine` from the projection,
 * which already draws a line across the room at a constant depth.
 */
export function columnLine(x: number): [ScreenPoint, ScreenPoint] {
  return [project(x, 0, 0), project(x, 0, ROOM_DEPTH)];
}

export { floorLine as rowLine };
