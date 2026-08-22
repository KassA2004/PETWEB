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
import { LANES } from '../../world/Lanes';
import { ROOM_DEPTH, ROOM_WIDTH, floorLine, project } from '../../world/Projection';

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

  // Lane seams: the room's depth ruler.
  const seams = new Graphics();
  for (const lane of LANES) {
    if (lane.from <= 0) continue;
    const [left, right] = floorLine(lane.from);
    seams.moveTo(left.x, left.y);
    seams.lineTo(right.x, right.y);
  }
  seams.stroke({ color: outline(color, 0.3), width: 3, alpha: 0.28 });
  root.addChild(seams);

  // A handful of boards running into the room. Sparse on purpose: enough
  // converging lines to sell the perspective, not so many it becomes a grid.
  const boards = new Graphics();
  for (let i = 1; i < 8; i++) {
    const x = (ROOM_WIDTH / 8) * i;
    const back = project(x, 0, 0);
    const front = project(x, 0, ROOM_DEPTH);
    boards.moveTo(back.x, back.y);
    boards.lineTo(front.x, front.y);
  }
  boards.stroke({ color: outline(color, 0.24), width: 2, alpha: 0.14 });
  root.addChild(boards);

  return root;
}
