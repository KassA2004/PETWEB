/**
 * The wall grid — the floor grid's answer for everything that hangs up.
 *
 * A room has two surfaces you put things on, and only one of them had a
 * system. Pictures, shelves, vines and the window were all positioned by hand
 * in world coordinates, which meant they lined up with each other by luck and
 * with the furniture below them not at all.
 *
 * So the back wall gets the same treatment the floor got, and it inherits the
 * floor's columns exactly:
 *
 *      wall row 3   ┌───┬───┬───┬───┬───┐
 *      wall row 2   ├───┼───┼───┼───┼───┤
 *      wall row 1   ├───┼───┼───┼───┼───┤
 *      wall row 0   ├───┼───┼───┼───┼───┤
 *                   └───┴───┴───┴───┴───┘
 *      floor row 0  ╱   │   │   │   │   ╲     ← the same column boundaries
 *
 * A painting above the bookshelf is *above the bookshelf*, because both are
 * anchored to column three.
 *
 * Square, and this time square on screen as well
 * ----------------------------------------------
 * The back wall sits at one depth, so the camera scales all of it by the same
 * factor. A cell that is square in world units is therefore square in pixels —
 * unlike a floor cell, which the perspective foreshortens. Making the wall rows
 * the same 120 units as the floor columns is what buys that, and it is the one
 * place in the room where the grid can be seen to be square rather than
 * reasoned to be.
 */

import { GRID_COLUMNS, GRID_ORIGIN_X, TILE } from './FloorGrid';
import { project } from './Projection';
import type { ScreenPoint } from './Projection';

/** Wall columns are floor columns. That is the entire point of them. */
export const WALL_COLUMNS = GRID_COLUMNS;

/**
 * How many rows of hanging space there are.
 *
 * Measured against the projection, not chosen freely: at 3 rows the top of the
 * grid sits at screen y=125 in the 720-tall room image, at 4 rows it is at
 * y=62, and at 5 rows it is at y=0 — the very top edge of the image, with no
 * margin left for a piece like `vines` or `bunting` whose art overflows its
 * own cell. 4 is as far as this room can go before the ceiling and the grid
 * collide.
 */
export const WALL_ROWS = 4;

/**
 * How far up the wall the bottom row starts, in world units.
 *
 * Above the furniture and clear of the skirting: below this you are hanging
 * things behind the bed.
 */
export const WALL_BASE_Y = 150;

/** Cells are square in world units, which on the back wall is square on screen. */
export const WALL_CELL = TILE;

export const WALL_TOP_Y = WALL_BASE_Y + WALL_ROWS * WALL_CELL;

export interface WallAnchor {
  col: number;
  /** 0 is the lowest row of hanging space. */
  row: number;
}

/** How many cells a wall decoration takes up. */
export interface WallFootprint {
  cols: number;
  rows: number;
}

export const WALL_CELL_1X1: WallFootprint = { cols: 1, rows: 1 };

function clampAnchor(value: number, span: number, count: number): number {
  return Math.max(0, Math.min(count - span, Math.round(value)));
}

export function normalizeWallFootprint(footprint: WallFootprint): WallFootprint {
  return {
    cols: Math.max(1, Math.min(WALL_COLUMNS, Math.round(footprint.cols))),
    rows: Math.max(1, Math.min(WALL_ROWS, Math.round(footprint.rows))),
  };
}

/**
 * The world position of the centre of a wall footprint anchored at a cell.
 *
 * Returns a point on the back wall — `z` is always 0 — so it can be handed
 * straight to `project`.
 */
export function wallCenter(
  anchor: WallAnchor,
  footprint: WallFootprint = WALL_CELL_1X1,
): { x: number; y: number } {
  const size = normalizeWallFootprint(footprint);
  return {
    x: GRID_ORIGIN_X + (anchor.col + size.cols / 2) * TILE,
    y: WALL_BASE_Y + (anchor.row + size.rows / 2) * WALL_CELL,
  };
}

/** Snap a world point on the wall to the cells a footprint would occupy. */
export function snapWall(
  x: number,
  y: number,
  footprint: WallFootprint = WALL_CELL_1X1,
): WallAnchor & { x: number; y: number; footprint: WallFootprint } {
  const size = normalizeWallFootprint(footprint);

  const col = clampAnchor((x - GRID_ORIGIN_X) / TILE - size.cols / 2, size.cols, WALL_COLUMNS);
  const row = clampAnchor(
    (y - WALL_BASE_Y) / WALL_CELL - size.rows / 2,
    size.rows,
    WALL_ROWS,
  );

  return { col, row, footprint: size, ...wallCenter({ col, row }, size) };
}

/**
 * Every cell a wall footprint covers.
 *
 * The wall's answer to the floor's "a footprint claims whole cells". Three
 * separate places used to expand a footprint into cells with their own nested
 * loop — the clash check, the guide and the occupancy wash — which is three
 * chances to disagree about what a two-by-three piece of ivy actually covers.
 */
export function wallCells(
  anchor: WallAnchor,
  footprint: WallFootprint = WALL_CELL_1X1,
): WallAnchor[] {
  const size = normalizeWallFootprint(footprint);
  const cells: WallAnchor[] = [];

  for (let row = 0; row < size.rows; row++) {
    for (let col = 0; col < size.cols; col++) {
      cells.push({ col: anchor.col + col, row: anchor.row + row });
    }
  }

  return cells;
}

/** A cell as a map key, so occupancy can be a `Set` rather than a search. */
export function wallCellKey(cell: WallAnchor): string {
  return `${cell.col}:${cell.row}`;
}

/** The world-space box a wall footprint occupies. */
export function wallBox(
  footprint: WallFootprint,
  fill = 0.86,
): { width: number; height: number } {
  const size = normalizeWallFootprint(footprint);
  return { width: size.cols * TILE * fill, height: size.rows * WALL_CELL * fill };
}

/** A wall cell rectangle as a screen-space polygon, top-left first, clockwise. */
export function wallQuadAt(
  anchor: WallAnchor,
  footprint: WallFootprint = WALL_CELL_1X1,
): ScreenPoint[] {
  const size = normalizeWallFootprint(footprint);
  const left = GRID_ORIGIN_X + anchor.col * TILE;
  const right = left + size.cols * TILE;
  const bottom = WALL_BASE_Y + anchor.row * WALL_CELL;
  const top = bottom + size.rows * WALL_CELL;

  return [
    project(left, top, 0),
    project(right, top, 0),
    project(right, bottom, 0),
    project(left, bottom, 0),
  ];
}
