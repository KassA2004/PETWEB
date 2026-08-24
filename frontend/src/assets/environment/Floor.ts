/**
 * Floor — the plane everything stands on, drawn in perspective.
 *
 * A trapezoid rather than a rectangle: narrow at the back wall, full width at
 * the viewer. That single shape does most of the work of making the room read
 * as a room, because it gives the eye converging lines to measure depth
 * against before anything has been put in it.
 *
 * The seams are not decoration. They sit exactly on the boundaries of the
 * placement grid (`world/FloorGrid.ts`), so "which cell is that chair in" has
 * a visible answer at all times and not only while something is being dragged.
 *
 * Two things about the grid that are worth stating plainly, because both look
 * like bugs and neither is:
 *
 *   it is inset      the grid is twelve whole 100-unit columns centred in a
 *                    1280-unit room, so there is a 40-unit margin at each side
 *                    wall. That strip is the floor under the skirting board.
 *                    Drawing seams across it would advertise cells that do not
 *                    exist.
 *   it foreshortens  the cells are square *on the floor*. The camera squashes
 *                    the far ones, exactly as it squashes everything else
 *                    standing on them. A grid built to look square on screen
 *                    would have to grow its rows toward the back, and a floor
 *                    whose tiles all measure the same on screen reads as flat —
 *                    it would fight the converging walls rather than agree with
 *                    them.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, outline } from '../shared/color';
import { createRng, rngRange } from '../shared/shapes';
import {
  GRID_COLUMNS,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_ROWS,
  TILE,
  areaPolygon,
  columnLine,
  rowLine,
} from '../../world/FloorGrid';
import { ROOM_DEPTH, floorLine } from '../../world/Projection';

/**
 * What the floor is made of.
 *
 * Surface *pattern*, not colour — the colour is the room's tint, graded by the
 * hour (world/Ambience.ts). These change what the boards are, and the grid is
 * drawn over whichever is chosen.
 */
export const FLOOR_PATTERNS = ['boards', 'tiles', 'checker', 'stone', 'plain'] as const;

export type FloorPattern = (typeof FLOOR_PATTERNS)[number];

export const FLOOR_PATTERN_LABELS: Record<FloorPattern, string> = {
  boards: 'Floorboards',
  tiles: 'Tiles',
  checker: 'Checkerboard',
  stone: 'Flagstones',
  plain: 'Plain',
};

export interface FloorOptions {
  color?: number;
  pattern?: FloorPattern;
  /** How strongly the placement grid is drawn into the floor, 0..1. */
  gridStrength?: number;
  seed?: number;
}

/** Fill the quad between two depths, right across the room. */
function band(graphics: Graphics, fromZ: number, toZ: number, color: number, alpha = 1) {
  const back = floorLine(fromZ);
  const front = floorLine(toZ);

  graphics.poly([
    back[0].x,
    back[0].y,
    back[1].x,
    back[1].y,
    front[1].x,
    front[1].y,
    front[0].x,
    front[0].y,
  ]);
  graphics.fill({ color, alpha });
}

/* -------------------------------------------------------------------------- */
/* Patterns                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Boards running into the room, at the grid's own column spacing.
 *
 * They converge on the vanishing point because they are drawn in world space
 * and projected, which is the only way boards can look right in a perspective
 * room — a fan of straight screen-space lines never does.
 */
function boards(color: number, seed: number): Graphics {
  const rng = createRng(seed);
  const g = new Graphics();

  // Twice the grid's column density: a floorboard is narrower than a cell.
  const count = GRID_COLUMNS * 2;
  const span = GRID_COLUMNS * TILE;

  for (let i = 1; i < count; i++) {
    const x = GRID_ORIGIN_X + (i / count) * span;
    const [back, front] = columnLine(x);
    g.moveTo(back.x, back.y);
    g.lineTo(front.x, front.y);
  }
  g.stroke({ color: darken(color, 0.22), width: 1.6, alpha: 0.28 });

  // A dozen short cross-cuts where one board ends and the next begins. Each is
  // a segment of a row line clipped to a single board, which keeps it in
  // perspective for free.
  const joints = new Graphics();
  for (let i = 0; i < 14; i++) {
    const board = Math.floor(rngRange(rng, 0, count));
    const z = GRID_ORIGIN_Z + rngRange(rng, 0, GRID_ROWS * TILE);
    const [left, right] = rowLine(z);
    const from = board / count;
    const to = (board + 1) / count;

    joints.moveTo(left.x + (right.x - left.x) * from, left.y + (right.y - left.y) * from);
    joints.lineTo(left.x + (right.x - left.x) * to, left.y + (right.y - left.y) * to);
  }
  joints.stroke({ color: darken(color, 0.3), width: 1.4, alpha: 0.16 });
  g.addChild(joints);

  return g;
}

/** One flat tone per cell, alternating. Reads immediately as square tiles. */
function checker(color: number, contrast: number): Graphics {
  const g = new Graphics();

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col++) {
      if ((row + col) % 2 === 0) continue;
      g.poly(areaPolygon({ col, row }));
    }
  }
  g.fill({ color: darken(color, 0.3), alpha: contrast });

  return g;
}

/** Square tiles: every cell outlined, with a grout line and a soft inner face. */
function tiles(color: number): Graphics {
  const g = new Graphics();

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col++) {
      g.poly(areaPolygon({ col, row }));
    }
  }
  g.stroke({ color: darken(color, 0.34), width: 2, alpha: 0.3 });

  const highlights = new Graphics();
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col += 1) {
      if ((row + col) % 3 !== 0) continue;
      highlights.poly(areaPolygon({ col, row }));
    }
  }
  highlights.fill({ color: lighten(color, 0.16), alpha: 0.14 });
  g.addChild(highlights);

  return g;
}

/** Irregular flags: the grid, but with the seams jittered off the cell lines. */
function stone(color: number, seed: number): Graphics {
  const rng = createRng(seed + 31);
  const g = new Graphics();

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col++) {
      const polygon = areaPolygon({ col, row });
      // Pull every corner in by a random few units, so no two flags match.
      for (let i = 0; i < polygon.length; i += 2) {
        polygon[i] += rngRange(rng, -3, 3);
        polygon[i + 1] += rngRange(rng, -1.5, 1.5);
      }
      g.poly(polygon);
      g.fill({
        color: rng() < 0.5 ? darken(color, 0.1) : lighten(color, 0.06),
        alpha: 0.28,
      });
    }
  }

  return g;
}

/* -------------------------------------------------------------------------- */

export function createFloor(options: FloorOptions = {}): Container {
  const color = options.color ?? PALETTE.sand;
  const pattern = options.pattern ?? 'boards';
  const gridStrength = options.gridStrength ?? 1;
  const seed = options.seed ?? 7;

  const root = new Container();
  root.label = 'floor';

  // Main surface.
  const plane = new Graphics();
  band(plane, 0, ROOM_DEPTH, color);
  root.addChild(plane);

  // The strip in the wall's shadow, and a faint warm wash at the very front —
  // together they read as light falling into the room from above and ahead.
  const shading = new Graphics();
  band(shading, 0, 90, darken(color, 0.26), 0.9);
  band(shading, 90, 200, darken(color, 0.12), 0.55);
  band(shading, ROOM_DEPTH - 110, ROOM_DEPTH, lighten(color, 0.1), 0.35);
  root.addChild(shading);

  // --- The material --------------------------------------------------------
  switch (pattern) {
    case 'boards':
      root.addChild(boards(color, seed));
      break;
    case 'tiles':
      root.addChild(tiles(color));
      break;
    case 'checker':
      root.addChild(checker(color, 0.26));
      break;
    case 'stone':
      root.addChild(stone(color, seed));
      break;
    case 'plain':
    default:
      break;
  }

  // --- The placement grid --------------------------------------------------
  // Drawn into the floor itself. This is the room's ruler: it is what makes
  // depth legible with nothing in the room at all, and it is the same grid a
  // dropped object snaps to, so what you see is what you get.
  //
  // Rows read stronger than columns on purpose. Depth is the axis the eye
  // finds hard and the axis the pointer is worst at, so the lines that answer
  // "how far back is this" are the ones worth drawing clearly; the columns only
  // need to be present enough to make the cells read as cells.
  if (gridStrength > 0.01) {
    // A whisper of a checker under the seams, unless the floor already is one.
    // Two adjacent cells that differ by three per cent is not a pattern anybody
    // notices, and it is the difference between a grid of lines and a grid of
    // squares.
    if (pattern !== 'checker' && pattern !== 'stone') {
      const wash = checker(color, 0.05 * gridStrength);
      root.addChild(wash);
    }

    const rows = new Graphics();
    for (let i = 0; i <= GRID_ROWS; i++) {
      const [left, right] = rowLine(GRID_ORIGIN_Z + i * TILE);
      rows.moveTo(left.x, left.y);
      rows.lineTo(right.x, right.y);
    }
    rows.stroke({
      color: outline(color, 0.3),
      width: 2.5,
      alpha: 0.26 * gridStrength,
    });
    root.addChild(rows);

    const columns = new Graphics();
    for (let i = 0; i <= GRID_COLUMNS; i++) {
      const [back, front] = columnLine(GRID_ORIGIN_X + i * TILE);
      columns.moveTo(back.x, back.y);
      columns.lineTo(front.x, front.y);
    }
    columns.stroke({
      color: outline(color, 0.26),
      width: 2,
      alpha: 0.17 * gridStrength,
    });
    root.addChild(columns);

    // The grid's own outer edge, a shade stronger, so the usable floor has a
    // visible boundary and the margin under the skirting reads as margin.
    const border = new Graphics();
    border.poly(
      areaPolygon({ col: 0, row: 0 }, { cols: GRID_COLUMNS, rows: GRID_ROWS }),
    );
    border.stroke({
      color: mix(outline(color, 0.34), PALETTE.cream, 0.15),
      width: 2.5,
      alpha: 0.2 * gridStrength,
    });
    root.addChild(border);
  }

  return root;
}
