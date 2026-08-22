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
 * Three things appear while something is being carried, and nothing appears
 * when it is not:
 *
 *   the band     the depth row under the pointer, brightened across the floor
 *   the ring     an ellipse on the floor exactly where the thing will land,
 *                drawn in perspective, so it is visibly a circle lying flat
 *   the tether   a line from the ring up to the carried object, because the
 *                object is above the floor and the eye needs the two joined
 *
 * Together they answer "how far into the room is this" before the drop, which
 * is the only moment at which the answer is worth anything.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, mix } from '../../assets/shared/color';
import { LANES, laneAt } from '../../world/Lanes';
import { ROOM_WIDTH, floorLine, project, scaleAt } from '../../world/Projection';
import type { Lane } from '../../world/Lanes';

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

/** The floor quad for one lane, as a flat screen-space polygon. */
function lanePolygon(lane: Lane): number[] {
  const back = floorLine(lane.from);
  const front = floorLine(lane.to);
  return [back[0].x, back[0].y, back[1].x, back[1].y, front[1].x, front[1].y, front[0].x, front[0].y];
}

export function createDepthGuide(): DepthGuideView {
  const root = new Container();
  root.label = 'depth-guide';
  root.alpha = 0;
  root.eventMode = 'none';

  // One pre-drawn highlight per lane; only the active one is ever visible, so
  // nothing is redrawn while the pointer moves.
  const bands = new Map<string, Graphics>();

  for (const lane of LANES) {
    const band = new Graphics();
    band.poly(lanePolygon(lane));
    band.fill({ color: PALETTE.cream, alpha: 0.12 });

    const [edgeLeft, edgeRight] = floorLine(lane.from === 0 ? 1 : lane.from);
    band.moveTo(edgeLeft.x, edgeLeft.y);
    band.lineTo(edgeRight.x, edgeRight.y);
    band.stroke({ color: PALETTE.cream, width: 3, alpha: 0.35 });

    band.visible = false;
    root.addChild(band);
    bands.set(lane.id, band);
  }

  // The row pips: three marks stacked up the left edge of the floor, the
  // active one filled. A wordless answer to "which row is this".
  const pips = new Container();
  const pipShapes = LANES.map((lane) => {
    const at = project(60, 0, lane.z);
    const shape = new Graphics();
    shape.circle(at.x, at.y, 7 * scaleAt(lane.z));
    shape.fill({ color: PALETTE.cream, alpha: 0.28 });
    shape.circle(at.x, at.y, 7 * scaleAt(lane.z));
    shape.stroke({ color: PALETTE.ink, width: 1.5, alpha: 0.25 });
    pips.addChild(shape);
    return { lane, shape };
  });
  root.addChild(pips);

  const marker = new Graphics();
  root.addChild(marker);

  let shown = false;

  return {
    root,

    update(target, dt) {
      const wanted = target ? 1 : 0;
      root.alpha += (wanted - root.alpha) * Math.min(1, dt * 12);
      shown = root.alpha > 0.01;
      root.visible = shown;

      if (!target || !shown) return;

      const lane = laneAt(target.z);
      for (const [id, band] of bands) band.visible = id === lane.id;
      for (const pip of pipShapes) {
        pip.shape.alpha = pip.lane.id === lane.id ? 1 : 0.35;
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

/** Where the row-pip column sits, so the room can keep it clear of props. */
export const GUIDE_MARGIN_X = ROOM_WIDTH * 0.06;
