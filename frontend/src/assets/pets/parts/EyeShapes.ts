/**
 * EyeShapes — the outline for each eye preset.
 *
 * One function per silhouette, all returning points in eye-local space with the
 * origin at the eye's centre. ../parts/Eye clips everything it draws to this
 * outline, so these functions decide three things at once: what the eye looks
 * like, where its lids can travel, and how far its pupil can move before it
 * would leave the eye.
 *
 * `mirror` is -1 on the creature's left eye and 1 on its right. Shapes with an
 * inner and an outer corner use it; symmetric ones ignore it.
 */

import { clamp } from '../../shared/shapes';
import type { Vec2 } from '../../shared/geometry';
import type { EyeOutline } from '../customization/EyeTypes';

function ellipsePoints(rx: number, ry: number, samples = 20): Vec2[] {
  const points: Vec2[] = [];

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    points.push({ x: Math.cos(angle) * rx, y: Math.sin(angle) * ry });
  }

  return points;
}

/** A lens with pointed corners, the outer one carried a little lower. */
function almondPoints(rx: number, ry: number, mirror: number): Vec2[] {
  return [
    { x: -rx, y: ry * 0.1 * mirror },
    { x: -rx * 0.6, y: -ry * 0.82 },
    { x: 0, y: -ry },
    { x: rx * 0.6, y: -ry * 0.82 },
    { x: rx, y: -ry * 0.1 * mirror },
    { x: rx * 0.62, y: ry * 0.8 },
    { x: 0, y: ry },
    { x: -rx * 0.62, y: ry * 0.8 },
  ];
}

/**
 * Hard angles with the inner corner dropped.
 *
 * This is the one shape that makes a creature look angry without a single brow,
 * which is why it exists as an eye rather than as an expression.
 */
function angularPoints(rx: number, ry: number, mirror: number): Vec2[] {
  const inner = -mirror;

  return [
    { x: inner * rx, y: ry * 0.55 },
    { x: inner * rx * 0.5, y: -ry * 0.55 },
    { x: 0, y: -ry * 0.9 },
    { x: -inner * rx * 0.62, y: -ry * 0.85 },
    { x: -inner * rx, y: -ry * 0.35 },
    { x: -inner * rx * 0.85, y: ry * 0.75 },
    { x: 0, y: ry },
    { x: inner * rx * 0.6, y: ry * 0.9 },
  ];
}

/** Flat along the top, rounded underneath. A permanently level gaze. */
function wedgePoints(rx: number, ry: number): Vec2[] {
  return [
    { x: -rx, y: -ry * 0.7 },
    { x: 0, y: -ry * 0.82 },
    { x: rx, y: -ry * 0.7 },
    { x: rx * 0.94, y: ry * 0.2 },
    { x: rx * 0.55, y: ry },
    { x: 0, y: ry * 1.05 },
    { x: -rx * 0.55, y: ry },
    { x: -rx * 0.94, y: ry * 0.2 },
  ];
}

/** A circle with its top third cut off — the lid is part of the shape. */
function halfPoints(rx: number, ry: number): Vec2[] {
  return [
    { x: -rx, y: -ry * 0.28 },
    { x: -rx * 0.4, y: -ry * 0.38 },
    { x: rx * 0.4, y: -ry * 0.38 },
    { x: rx, y: -ry * 0.28 },
    { x: rx * 0.92, y: ry * 0.44 },
    { x: rx * 0.5, y: ry },
    { x: 0, y: ry * 1.1 },
    { x: -rx * 0.5, y: ry },
    { x: -rx * 0.92, y: ry * 0.44 },
  ];
}

/** A narrow lens. Barely open, and reading everything you do. */
function sliverPoints(rx: number, ry: number, mirror: number): Vec2[] {
  return [
    { x: -rx, y: ry * 0.2 * mirror },
    { x: -rx * 0.5, y: -ry * 0.86 },
    { x: rx * 0.5, y: -ry * 0.86 },
    { x: rx, y: -ry * 0.2 * mirror },
    { x: rx * 0.5, y: ry * 0.9 },
    { x: -rx * 0.5, y: ry * 0.9 },
  ];
}

/** A rounded square. */
function squarePoints(rx: number, ry: number): Vec2[] {
  return [
    { x: -rx * 0.82, y: -ry },
    { x: rx * 0.82, y: -ry },
    { x: rx, y: -ry * 0.78 },
    { x: rx, y: ry * 0.78 },
    { x: rx * 0.82, y: ry },
    { x: -rx * 0.82, y: ry },
    { x: -rx, y: ry * 0.78 },
    { x: -rx, y: -ry * 0.78 },
  ];
}

export function eyeOutlinePoints(
  outline: EyeOutline,
  rx: number,
  ry: number,
  mirror: number,
): Vec2[] {
  switch (outline) {
    case 'oval':
      return ellipsePoints(rx, ry * 0.92);
    case 'tall':
      return ellipsePoints(rx, ry);
    case 'almond':
      return almondPoints(rx, ry, mirror);
    case 'angular':
      return angularPoints(rx, ry, mirror);
    case 'wedge':
      return wedgePoints(rx, ry);
    case 'half':
      return halfPoints(rx, ry);
    case 'sliver':
      return sliverPoints(rx, ry, mirror);
    case 'square':
      return squarePoints(rx, ry);
    case 'round':
    default:
      return ellipsePoints(rx, ry);
  }
}

/** How rounded the outline should be drawn. Hard-edged shapes want less. */
export function eyeOutlineTension(outline: EyeOutline): number {
  switch (outline) {
    case 'angular':
    case 'square':
      return 0.35;
    case 'wedge':
    case 'sliver':
      return 0.7;
    case 'almond':
      return 0.85;
    default:
      return 1;
  }
}

/**
 * How far the pupil may travel inside this eye, in pixels.
 *
 * Derived from the eye's own size and the space the pupil leaves, so a pupil
 * physically cannot reach the edge. A narrow eye restricts vertical travel far
 * more than horizontal, which is what makes a suspicious creature's glance
 * slide sideways instead of rolling.
 */
export function pupilTravel(
  outline: EyeOutline,
  rx: number,
  ry: number,
  pupilRadius: number,
  mobility: number,
): { x: number; y: number } {
  // How much of the eye box the outline actually fills, vertically.
  const verticalFill =
    outline === 'sliver' ? 0.72 : outline === 'wedge' || outline === 'half' ? 0.8 : 0.92;

  return {
    x: Math.max(0, (rx * 0.94 - pupilRadius) * clamp(mobility, 0, 1)),
    y: Math.max(0, (ry * verticalFill - pupilRadius) * clamp(mobility, 0, 1)),
  };
}
