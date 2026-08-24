/**
 * The floor grid: how the room tells you where things are, and the only place
 * that decides how big anything standing on it is.
 *
 * Physics uses continuous `x` and `z` and always will — a creature walking
 * toward a ball has to be able to be halfway there. But a *user* placing
 * furniture with a mouse does not want continuous position. They want blocks,
 * and they want the block they aimed at to be the block they get.
 *
 * The grid went through two wrong shapes before this one, and both failures
 * are worth naming because they are the reason for every rule below.
 *
 *   three depth rows        depth was the axis people wanted control over and
 *                           it was the one with almost none
 *   snap-then-clamp         a tile centre, then a clamp by the object's own
 *                           half-extents. A bed's centre snapped to the last
 *                           column and was then shoved a hundred units back
 *                           inside the room to keep it out of the wall, so the
 *                           thing landed *between* two tiles and the corners
 *                           of the room were unreachable by anything large.
 *
 * The fix is to stop snapping centres at all. An object occupies a whole
 * number of cells — a chair is 1x1, a bed is 2x1 — and what snaps is the
 * **cell rectangle**, clamped in cell units so it always lands wholly on the
 * grid. The centre is then wherever the middle of that rectangle happens to
 * be, which for an even-width object is a cell *boundary* and for an odd-width
 * one is a cell centre. Both are correct, and both reach the wall.
 *
 *      1x1 chair                     2x1 bed
 *      ┌───┬───┬───┐                 ┌───┬───┬───┐
 *      │   │   │ ▓ │  centre on      │   │ ▓▓▓▓▓ │  centre on the seam
 *      └───┴───┴───┘  a cell centre  └───┴───┴───┘  between two cells
 *                     ↑ reaches the wall in both cases
 *
 * Size follows from the same number. `footprintBox` turns a footprint into the
 * world-space box an object is drawn and collided at, so "a bed takes two
 * boxes" is not a convention anyone has to remember — it is where the bed's
 * width comes from.
 *
 * The creature ignores all of it and walks wherever it likes.
 */

import { ROOM_DEPTH, ROOM_WIDTH, floorLine, project } from './Projection';
import type { ScreenPoint } from './Projection';

/**
 * The side of a tile, in world units. Square, in both axes, deliberately.
 *
 * Square *in the room* is the only definition of square that survives the
 * camera. A grid built to look square on screen would have to grow its rows
 * toward the back to fight the foreshortening, and a floor whose tiles all
 * measure the same on screen reads as flat — it would fight the converging
 * walls rather than agree with them. So the tiles are square on the floor, and
 * the camera foreshortens the far ones exactly as much as it foreshortens
 * everything else standing on them.
 *
 * A hundred and twenty is chosen against the **creature**, which is the thing
 * every other size in the room is judged against. The default rig is about
 * 170 units across, so a cell is a bit more than one creature: a chair is a
 * little smaller than the pet, a bed is visibly bigger than it, and a shelf
 * towers over it. The grid was briefly 100 and the room read as a doll's house
 * the creature had been dropped into — every proportion was internally
 * consistent and the whole thing was wrong, because the only ruler a viewer
 * actually has is the character.
 */
export const TILE = 120;

/**
 * How many cells the floor is divided into: ten across, five deep.
 *
 * The room is 1280 x 600, so the depth divides exactly and the width does not.
 * Rather than distort the tiles to make ten-and-a-bit columns fit, the grid is
 * ten whole columns centred in the room, leaving a 40-unit margin at each side
 * wall. That margin is not wasted space — it is the strip of floor that runs
 * under the skirting board, which is where a room's floor stops being usable
 * anyway.
 */
export const GRID_COLUMNS = Math.floor(ROOM_WIDTH / TILE);
export const GRID_ROWS = Math.round(ROOM_DEPTH / TILE);

/** World position of the grid's back-left corner. */
export const GRID_ORIGIN_X = (ROOM_WIDTH - GRID_COLUMNS * TILE) / 2;
export const GRID_ORIGIN_Z = ROOM_DEPTH - GRID_ROWS * TILE;

/** World position of the grid's front-right corner. */
export const GRID_MAX_X = GRID_ORIGIN_X + GRID_COLUMNS * TILE;
export const GRID_MAX_Z = GRID_ORIGIN_Z + GRID_ROWS * TILE;

/**
 * The patch of floor the grid covers, as room bounds.
 *
 * This is what the physics clamps placed objects against, so that "inside the
 * room" and "on the grid" are the same statement. They used to be two
 * different rectangles, which is precisely how an object could be legally
 * placed somewhere the grid had no cell for it.
 */
export const GRID_BOUNDS = {
  minX: GRID_ORIGIN_X,
  maxX: GRID_MAX_X,
  minZ: GRID_ORIGIN_Z,
  maxZ: GRID_MAX_Z,
};

/* -------------------------------------------------------------------------- */
/* Cells and footprints                                                       */
/* -------------------------------------------------------------------------- */

export interface GridCell {
  /** 0 at the left edge of the grid. */
  col: number;
  /** 0 at the back wall. */
  row: number;
  /** World position of the tile's centre. */
  x: number;
  z: number;
}

/**
 * How many cells an object takes up.
 *
 * The whole standardisation, in two integers. Everything else about an
 * object's size — the width it is drawn at, the depth of its collider, how
 * much of a rug it covers — is derived from this rather than authored beside
 * it and hoped to agree.
 */
export interface Footprint {
  /** Cells across the room's x axis. */
  cols: number;
  /** Cells into the room's z axis. */
  rows: number;
}

/** The back-left cell of a placed footprint. */
export interface GridAnchor {
  col: number;
  row: number;
}

/** A footprint placed on the grid: which cells, and where its centre is. */
export interface GridPlacement extends GridAnchor {
  /** World centre of the occupied rectangle. */
  x: number;
  z: number;
  footprint: Footprint;
}

export const CELL_1X1: Footprint = { cols: 1, rows: 1 };

function clampIndex(value: number, count: number): number {
  return Math.max(0, Math.min(count - 1, value));
}

/** How many whole cells of a `count`-cell axis a `span`-cell thing can start at. */
function clampAnchor(value: number, span: number, count: number): number {
  return Math.max(0, Math.min(count - span, Math.round(value)));
}

/** A footprint clamped to something the grid can actually hold. */
export function normalizeFootprint(footprint: Footprint): Footprint {
  return {
    cols: Math.max(1, Math.min(GRID_COLUMNS, Math.round(footprint.cols))),
    rows: Math.max(1, Math.min(GRID_ROWS, Math.round(footprint.rows))),
  };
}

/** The centre of a single tile, in world units. */
export function cellCenter(col: number, row: number): { x: number; z: number } {
  return {
    x: GRID_ORIGIN_X + (clampIndex(col, GRID_COLUMNS) + 0.5) * TILE,
    z: GRID_ORIGIN_Z + (clampIndex(row, GRID_ROWS) + 0.5) * TILE,
  };
}

/** Which tile a world position falls in. */
export function cellAt(x: number, z: number): GridCell {
  const col = clampIndex(Math.floor((x - GRID_ORIGIN_X) / TILE), GRID_COLUMNS);
  const row = clampIndex(Math.floor((z - GRID_ORIGIN_Z) / TILE), GRID_ROWS);
  return { col, row, ...cellCenter(col, row) };
}

/** World centre of a footprint anchored at a cell. */
export function anchorCenter(anchor: GridAnchor, footprint: Footprint): {
  x: number;
  z: number;
} {
  const size = normalizeFootprint(footprint);
  return {
    x: GRID_ORIGIN_X + (anchor.col + size.cols / 2) * TILE,
    z: GRID_ORIGIN_Z + (anchor.row + size.rows / 2) * TILE,
  };
}

/**
 * Where a footprint lands if it is let go over this world position.
 *
 * The one function the whole placement system rests on. It converts a
 * continuous position into a cell rectangle, clamps *that rectangle* onto the
 * grid, and reports the centre it implies — so the answer is always a legal
 * placement, never a legal placement that then has to be corrected into an
 * illegal one.
 *
 * A thing dropped past the right wall ends up flush against the right wall,
 * with its far edge exactly on the grid's last column line. That is the case
 * the old snap-then-clamp got wrong, and it is the case the user notices
 * first, because the corners of a room are where furniture wants to go.
 */
export function snapFootprint(
  x: number,
  z: number,
  footprint: Footprint = CELL_1X1,
): GridPlacement {
  const size = normalizeFootprint(footprint);

  const col = clampAnchor((x - GRID_ORIGIN_X) / TILE - size.cols / 2, size.cols, GRID_COLUMNS);
  const row = clampAnchor((z - GRID_ORIGIN_Z) / TILE - size.rows / 2, size.rows, GRID_ROWS);

  return { col, row, footprint: size, ...anchorCenter({ col, row }, size) };
}

/**
 * The world-space box a footprint occupies.
 *
 * `fill` is how much of its cells an object claims. Slightly under 1 by
 * default, so that two things on neighbouring tiles have a visible gap between
 * them rather than a shared edge — a room where the furniture touches reads as
 * a packed shelf rather than as a room.
 */
export function footprintBox(
  footprint: Footprint,
  fill = 0.9,
): { width: number; depth: number } {
  const size = normalizeFootprint(footprint);
  return {
    width: size.cols * TILE * fill,
    depth: size.rows * TILE * fill,
  };
}

/** Whether two cells are the same tile. */
export function sameCell(
  a: GridAnchor | null,
  b: GridAnchor | null,
): boolean {
  if (!a || !b) return a === b;
  return a.col === b.col && a.row === b.row;
}

/**
 * Human-readable, for the drag affordance. One-based, because people count.
 *
 * A footprint bigger than one cell is named by the range it covers, so the
 * label answers "where is this going" for a bed as precisely as it does for a
 * chair.
 */
export function cellLabel(cell: GridAnchor, footprint: Footprint = CELL_1X1): string {
  const size = normalizeFootprint(footprint);

  const rows =
    size.rows === 1 ? `Row ${cell.row + 1}` : `Rows ${cell.row + 1}–${cell.row + size.rows}`;
  const cols =
    size.cols === 1
      ? `column ${cell.col + 1}`
      : `columns ${cell.col + 1}–${cell.col + size.cols}`;

  return `${rows}, ${cols}`;
}

/* -------------------------------------------------------------------------- */
/* Where things start                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A coarse depth preference, used only to decide where a *new* object appears.
 *
 * This is not a constraint — once it is in the room it can go on any cell. It
 * exists so the object library can say "a lamp belongs against the wall" in
 * words rather than in row indices that would go stale if the grid changed.
 */
export type DepthBand = 'back' | 'middle' | 'front';

export const DEPTH_BAND_LABELS: Record<DepthBand, string> = {
  back: 'Back of the room',
  middle: 'Middle of the room',
  front: 'Front of the room',
};

/** The anchor row a depth band starts a new object of this depth on. */
export function rowForBand(band: DepthBand, rows = 1): number {
  const span = Math.max(1, Math.min(GRID_ROWS, Math.round(rows)));
  const last = GRID_ROWS - span;

  switch (band) {
    case 'back':
      return 0;
    case 'middle':
      return Math.max(0, Math.floor((GRID_ROWS - span) / 2));
    case 'front':
    default:
      return Math.max(0, last);
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
  return {
    from: GRID_ORIGIN_Z + row * TILE,
    to: GRID_ORIGIN_Z + (row + 1) * TILE,
  };
}

/** World x of a column's left and right edges. */
export function columnEdges(col: number): { from: number; to: number } {
  return {
    from: GRID_ORIGIN_X + col * TILE,
    to: GRID_ORIGIN_X + (col + 1) * TILE,
  };
}

/**
 * A rectangle of cells as a screen-space polygon, back edge first, clockwise.
 *
 * Drawn in perspective, so a patch at the back of the room is a small squashed
 * trapezium and one at the front is a big one — which is exactly the shape the
 * floor already told the eye to expect.
 */
export function areaQuad(
  anchor: GridAnchor,
  footprint: Footprint = CELL_1X1,
): ScreenPoint[] {
  const size = normalizeFootprint(footprint);
  const xLeft = GRID_ORIGIN_X + anchor.col * TILE;
  const xRight = xLeft + size.cols * TILE;
  const zBack = GRID_ORIGIN_Z + anchor.row * TILE;
  const zFront = zBack + size.rows * TILE;

  return [
    project(xLeft, 0, zBack),
    project(xRight, 0, zBack),
    project(xRight, 0, zFront),
    project(xLeft, 0, zFront),
  ];
}

/** The same area as a flat number array, which is what `Graphics.poly` wants. */
export function areaPolygon(
  anchor: GridAnchor,
  footprint: Footprint = CELL_1X1,
): number[] {
  return areaQuad(anchor, footprint).flatMap((point) => [point.x, point.y]);
}

/** One tile as a screen-space polygon. */
export function tilePolygon(cell: GridAnchor): number[] {
  return areaPolygon(cell, CELL_1X1);
}

/**
 * A line down the room at a constant x, as two screen points, clipped to the
 * grid's own depth. Column seams stop where the grid stops.
 */
export function columnLine(x: number): [ScreenPoint, ScreenPoint] {
  return [project(x, 0, GRID_ORIGIN_Z), project(x, 0, GRID_MAX_Z)];
}

/**
 * A line across the room at a constant z, clipped to the grid's own width.
 *
 * Not `floorLine`: the grid is inset from the side walls, and a row seam that
 * ran the full width of the floor would advertise cells that are not there.
 */
export function rowLine(z: number): [ScreenPoint, ScreenPoint] {
  return [project(GRID_ORIGIN_X, 0, z), project(GRID_MAX_X, 0, z)];
}

export { floorLine };
