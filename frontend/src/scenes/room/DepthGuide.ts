/**
 * Telling the user where in the room they are about to put something.
 *
 * This is the other half of the depth problem, and it is a user-interface
 * problem rather than a physics one. A pointer has two axes and the room has
 * three, so even with a projection that maps every pixel of floor to exactly
 * one place, the person holding the mouse still has to be *told* which place
 * that is — otherwise picking a chair up and putting it down is a guess, and
 * the room slowly fills with furniture nobody meant to arrange that way.
 *
 * Four things appear while something is being carried, and nothing appears
 * when it is not:
 *
 *   the tile     the square of floor the thing will land on, filled in
 *                perspective, so it is visibly one tile of the grid already
 *                drawn into the floor
 *   the row      the rest of that depth row, brightened much more faintly, so
 *                depth still reads at a glance without hunting for the tile
 *   the ring     an ellipse exactly where the thing will come down, drawn flat
 *   the tether   a line from the ring up to the carried object, because the
 *                object is above the floor and the eye needs the two joined
 *
 * Together they answer "where in the room is this going" before the drop, which
 * is the only moment at which the answer is worth anything.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, mix } from '../../assets/shared/color';
import {
  GRID_ROWS,
  TILE_DEPTH,
  cellAt,
  cellCenter,
  tilePolygon,
} from '../../world/FloorGrid';
import type { GridCell } from '../../world/FloorGrid';
import { ROOM_WIDTH, floorLine, project, scaleAt } from '../../world/Projection';

/** Where the row-pip column sits, so the room can keep it clear of props. */
export const GUIDE_MARGIN_X = ROOM_WIDTH * 0.045;

export interface DepthTarget {
  /** Where on the floor the carried thing will come down. */
  x: number;
  z: number;
  /** How high the surface it will land on is. */
  surfaceY: number;
  /** Where the carried thing is now. */
  bodyY: number;
  /** Footprint radius, so the ring matches the thing it belongs to. */
  radius: number;
}

export interface DepthGuideView {
  root: Container;
  /** Show the guide for a carried object, or pass null to hide it. */
  update(target: DepthTarget | null, dt: number): void;
}

/** One depth row as a flat screen-space polygon spanning the whole floor. */
function rowPolygon(row: number): number[] {
  const back = floorLine(row * TILE_DEPTH);
  const front = floorLine((row + 1) * TILE_DEPTH);
  return [
    back[0].x, back[0].y,
    back[1].x, back[1].y,
    front[1].x, front[1].y,
    front[0].x, front[0].y,
  ];
}

export function createDepthGuide(): DepthGuideView {
  const root = new Container();
  root.label = 'depth-guide';
  root.alpha = 0;
  root.eventMode = 'none';

  // One pre-drawn wash per row; only the active one is ever visible, so nothing
  // in this layer is redrawn while the pointer moves along a row.
  const rowWashes: Graphics[] = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    const wash = new Graphics();
    wash.poly(rowPolygon(row));
    wash.fill({ color: PALETTE.cream, alpha: 0.09 });
    wash.visible = false;
    root.addChild(wash);
    rowWashes.push(wash);
  }

  // The tile itself has to be redrawn, because it moves in two axes rather than
  // one and pre-drawing every cell would be dozens of Graphics for the sake of
  // one that is visible.
  const tile = new Graphics();
  root.addChild(tile);

  // The row pips: one mark per depth row stacked up the left edge of the floor,
  // the active one filled. A wordless answer to "how far back is this".
  const pips = new Container();
  const pipShapes = Array.from({ length: GRID_ROWS }, (_, row) => {
    const centre = cellCenter(0, row);
    const at = project(GUIDE_MARGIN_X, 0, centre.z);
    const shape = new Graphics();
    const radius = 6 * scaleAt(centre.z);

    shape.circle(at.x, at.y, radius);
    shape.fill({ color: PALETTE.cream, alpha: 0.28 });
    shape.circle(at.x, at.y, radius);
    shape.stroke({ color: PALETTE.ink, width: 1.5, alpha: 0.25 });

    pips.addChild(shape);
    return shape;
  });
  root.addChild(pips);

  const marker = new Graphics();
  root.addChild(marker);

  let drawnCell: GridCell | null = null;
  let shown = false;

  return {
    root,

    update(target, dt) {
      const wanted = target ? 1 : 0;
      root.alpha += (wanted - root.alpha) * Math.min(1, dt * 12);
      shown = root.alpha > 0.01;
      root.visible = shown;

      if (!target || !shown) return;

      const cell = cellAt(target.x, target.z);

      // Redraw the tile only when the pointer actually crosses into a new one.
      if (!drawnCell || drawnCell.col !== cell.col || drawnCell.row !== cell.row) {
        drawnCell = cell;

        tile.clear();
        tile.poly(tilePolygon(cell));
        tile.fill({ color: PALETTE.cream, alpha: 0.24 });
        tile.poly(tilePolygon(cell));
        tile.stroke({ color: PALETTE.cream, width: 2.5, alpha: 0.85 });

        for (let row = 0; row < GRID_ROWS; row++) {
          rowWashes[row].visible = row === cell.row;
          pipShapes[row].alpha = row === cell.row ? 1 : 0.35;
        }
      }

      const scale = scaleAt(target.z);
      const ground = project(target.x, target.surfaceY, target.z);
      const body = project(target.x, target.bodyY, target.z);

      marker.clear();

      // The tether. Dashed by hand — a solid line reads as a stick holding the
      // object up rather than as a measurement of how far it has to fall.
      const span = body.y - ground.y;
      for (let t = 0; t < 1; t += 0.16) {
        marker.moveTo(body.x, body.y - span * t);
        marker.lineTo(body.x, body.y - span * Math.min(1, t + 0.08));
      }
      marker.stroke({ color: PALETTE.cream, width: 2, alpha: 0.5 });

      // The landing ring. Flattened by the camera's own foreshortening, so it
      // sits on the floor rather than standing up in it.
      const rx = target.radius * scale;
      const ry = rx * 0.42;

      marker.ellipse(ground.x, ground.y, rx, ry);
      marker.stroke({ color: PALETTE.cream, width: 3, alpha: 0.8 });
      marker.ellipse(ground.x, ground.y, rx * 0.62, ry * 0.62);
      marker.fill({ color: mix(PALETTE.cream, PALETTE.sky, 0.4), alpha: 0.18 });
    },
  };
}
