/**
 * Floor — the plane everything stands on, drawn in perspective.
 *
 * A trapezoid rather than a rectangle: narrow at the back wall, full width at
 * the viewer. That single shape does most of the work of making the room read
 * as a room, because it gives the eye converging lines to measure depth
 * against before anything has been put in it.
 *
 * The seams are not decoration. They sit exactly on the boundaries between the
 * room's depth lanes (see world/Lanes.ts), so "which row is that chair in" has
 * a visible answer at all times, not only while something is being dragged.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, outline } from '../shared/color';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  TILE_DEPTH,
  TILE_WIDTH,
  columnLine,
} from '../../world/FloorGrid';
import { ROOM_DEPTH, floorLine } from '../../world/Projection';

export interface FloorOptions {
  color?: number;
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

export function createFloor(options: FloorOptions = {}): Container {
  const color = options.color ?? PALETTE.sand;

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

  // The placement grid, drawn into the floor itself. This is the room's ruler:
  // it is what makes depth legible with nothing in the room at all, and it is
  // the same grid a dropped object snaps to, so what you see is what you get.
  //
  // Rows read stronger than columns on purpose. Depth is the axis the eye finds
  // hard and the axis the pointer is worst at, so the lines that answer "how far
  // back is this" are the ones worth drawing clearly; the columns only need to
  // be present enough to make the tiles read as tiles.
  const rows = new Graphics();
  for (let i = 1; i < GRID_ROWS; i++) {
    const [left, right] = floorLine(i * TILE_DEPTH);
    rows.moveTo(left.x, left.y);
    rows.lineTo(right.x, right.y);
  }
  rows.stroke({ color: outline(color, 0.3), width: 2.5, alpha: 0.26 });
  root.addChild(rows);

  const columns = new Graphics();
  for (let i = 1; i < GRID_COLUMNS; i++) {
    const [back, front] = columnLine(i * TILE_WIDTH);
    columns.moveTo(back.x, back.y);
    columns.lineTo(front.x, front.y);
  }
  columns.stroke({ color: outline(color, 0.26), width: 2, alpha: 0.17 });
  root.addChild(columns);

  return root;
}
