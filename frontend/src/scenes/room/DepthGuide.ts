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
 * The one rule this layer has to obey
 * -----------------------------------
 * **It shows where the thing will land, not where the pointer is.**
 *
 * That sounds obvious and it was previously wrong: the guide highlighted the
 * tile under the cursor while the drop snapped a whole footprint somewhere
 * else, so a bed being carried against the right wall lit up one tile and then
 * landed across two others. Everything below is fed the *snapped placement* —
 * the same `snapFootprint` result the drop itself uses — so what is drawn is a
 * promise rather than a hint.
 *
 * Five things appear while something is carried, and nothing when it is not:
 *
 *   the footprint  the cells the thing will occupy, filled in perspective —
 *                  two cells for a bed, one for a chair
 *   the row        the rest of those depth rows, brightened much more faintly,
 *                  so depth still reads at a glance
 *   the pips       one mark per row up the left edge, the occupied ones filled
 *   the ring       an ellipse exactly where it will come down, drawn flat
 *   the tether     a line from the ring up to the carried object, because the
 *                  object is above the floor and the eye needs the two joined
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, mix } from '../../assets/shared/color';
import {
  CELL_1X1,
  GRID_ROWS,
  areaPolygon,
  cellCenter,
  rowEdges,
  rowLine,
} from '../../world/FloorGrid';
import type { Footprint, GridAnchor } from '../../world/FloorGrid';
import { ROOM_WIDTH, project, scaleAt } from '../../world/Projection';

/** Where the row-pip column sits, so the room can keep it clear of props. */
export const GUIDE_MARGIN_X = ROOM_WIDTH * 0.045;

export interface DepthTarget {
  /** The cells the carried thing will land on. */
  anchor: GridAnchor;
  footprint: Footprint;
  /** Where on the floor it will come down — the centre of those cells. */
  x: number;
  z: number;
  /** How high the surface it will land on is. */
  surfaceY: number;
  /** Where the carried thing is now. */
  bodyY: number;
  /** Footprint radius, so the ring matches the thing it belongs to. */
  radius: number;
  /** True when this is not somewhere the carried thing may be set down. */
  invalid?: boolean;
}

export interface DepthGuideView {
  root: Container;
  /** Show the guide for a carried object, or pass null to hide it. */
  update(target: DepthTarget | null, dt: number): void;
}

/** One depth row as a flat screen-space polygon spanning the whole grid. */
function rowPolygon(row: number): number[] {
  const { from, to } = rowEdges(row);
  const back = rowLine(from);
  const front = rowLine(to);
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

  // One pre-drawn wash per row; only the occupied ones are ever visible, so
  // nothing in this layer is redrawn while the pointer moves along a row.
  const rowWashes: Graphics[] = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    const wash = new Graphics();
    wash.poly(rowPolygon(row));
    wash.fill({ color: PALETTE.cream, alpha: 0.09 });
    wash.visible = false;
    root.addChild(wash);
    rowWashes.push(wash);
  }

  // The footprint itself has to be redrawn: it moves in two axes and changes
  // size with whatever is being carried, and pre-drawing every cell would be
  // dozens of Graphics for the sake of the one that is visible.
  const area = new Graphics();
  root.addChild(area);

  // The row pips: one mark per depth row stacked up the left edge of the
  // floor, the occupied ones filled. A wordless answer to "how far back".
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

  /** What the area layer currently shows, so it is only redrawn on a change. */
  let drawn: { col: number; row: number; cols: number; rows: number; invalid: boolean } | null =
    null;
  let shown = false;

  return {
    root,

    update(target, dt) {
      const wanted = target ? 1 : 0;
      root.alpha += (wanted - root.alpha) * Math.min(1, dt * 12);
      shown = root.alpha > 0.01;
      root.visible = shown;

      if (!target || !shown) return;

      const { anchor, footprint, invalid = false } = target;
      const size = footprint ?? CELL_1X1;

      if (
        !drawn ||
        drawn.col !== anchor.col ||
        drawn.row !== anchor.row ||
        drawn.cols !== size.cols ||
        drawn.rows !== size.rows ||
        drawn.invalid !== invalid
      ) {
        drawn = { col: anchor.col, row: anchor.row, cols: size.cols, rows: size.rows, invalid };

        // Invalid placements read as a warning rather than a promise: the
        // punch red the rest of the interface already uses for "no".
        const tone = invalid ? PALETTE.punch : PALETTE.cream;

        const polygon = areaPolygon(anchor, size);

        area.clear();
        area.poly(polygon);
        area.fill({ color: tone, alpha: invalid ? 0.28 : 0.24 });
        area.poly(polygon);
        area.stroke({ color: tone, width: 2.5, alpha: 0.85 });

        // The seams *inside* a multi-cell footprint, so a bed reads as two
        // boxes rather than as one wide box. This is the visible statement of
        // the grid's whole promise.
        if (size.cols > 1 || size.rows > 1) {
          for (let c = 1; c < size.cols; c++) {
            area.poly(areaPolygon({ col: anchor.col + c, row: anchor.row }, { cols: 1, rows: size.rows }));
          }
          for (let r = 1; r < size.rows; r++) {
            area.poly(areaPolygon({ col: anchor.col, row: anchor.row + r }, { cols: size.cols, rows: 1 }));
          }
          area.stroke({ color: tone, width: 1.2, alpha: 0.35 });
        }

        for (let row = 0; row < GRID_ROWS; row++) {
          const inside = row >= anchor.row && row < anchor.row + size.rows;
          rowWashes[row].visible = inside;
          pipShapes[row].alpha = inside ? 1 : 0.35;
        }
      }

      const scale = scaleAt(target.z);
      const ground = project(target.x, target.surfaceY, target.z);
      const body = project(target.x, target.bodyY, target.z);
      const ringTone = target.invalid ? PALETTE.punch : PALETTE.cream;

      marker.clear();

      // The tether. Dashed by hand — a solid line reads as a stick holding the
      // object up rather than as a measurement of how far it has to fall.
      const span = body.y - ground.y;
      for (let t = 0; t < 1; t += 0.16) {
        marker.moveTo(body.x, body.y - span * t);
        marker.lineTo(body.x, body.y - span * Math.min(1, t + 0.08));
      }
      marker.stroke({ color: ringTone, width: 2, alpha: 0.5 });

      // The landing ring. Flattened by the camera's own foreshortening, so it
      // sits on the floor rather than standing up in it.
      const rx = target.radius * scale;
      const ry = rx * 0.42;

      marker.ellipse(ground.x, ground.y, rx, ry);
      marker.stroke({ color: ringTone, width: 3, alpha: 0.8 });
      marker.ellipse(ground.x, ground.y, rx * 0.62, ry * 0.62);
      marker.fill({
        color: target.invalid ? mix(PALETTE.punch, PALETTE.ink, 0.2) : mix(PALETTE.cream, PALETTE.sky, 0.4),
        alpha: target.invalid ? 0.24 : 0.18,
      });
    },
  };
}
