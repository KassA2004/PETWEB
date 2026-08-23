/**
 * Foot — one shape, drawn behind the mass so the body swallows its top edge.
 *
 * The old feet looked pasted on for two reasons: every type was the same pad at
 * a different size, and the pad sat *below* the body with a visible seam. Both
 * are fixed here. Each kind builds its own outline, and every foot is drawn
 * with its top buried inside the silhouette (`sink` on the foot type), so what
 * you see is the part of the foot the body has not covered.
 *
 * Foot-local space: the origin is the attachment point at the top centre, and
 * the foot extends downward to `height`. Positive x is outward — the caller
 * mirrors the left one, so a boot always points away from the creature.
 */

import { Graphics } from 'pixi.js';
import { darken, mix } from '../../shared/color';
import type { Tones } from '../../shared/color';
import { drawSmoothClosed, mirrorPoints } from '../../shared/geometry';
import type { Vec2 } from '../../shared/geometry';
import type { FootShape } from '../customization/FootTypes';

export interface FootOptions {
  shape: FootShape;
  width: number;
  height: number;
  /** -1 for the left foot, 1 for the right. */
  mirror: number;
  ramp: Tones;
  /** The lighter surface, used for pads and hoof caps. */
  accent: number;
}

/* -------------------------------------------------------------------------- */
/* Outlines                                                                   */
/* -------------------------------------------------------------------------- */

/** A soft pad. Wider at the bottom than the top, like weight settling. */
function nubOutline(w: number, h: number): Vec2[] {
  const half = w / 2;

  return [
    { x: -half * 0.78, y: 0 },
    { x: -half * 0.95, y: h * 0.34 },
    { x: -half, y: h * 0.72 },
    { x: -half * 0.7, y: h },
    { x: 0, y: h * 1.06 },
    { x: half * 0.7, y: h },
    { x: half, y: h * 0.72 },
    { x: half * 0.95, y: h * 0.34 },
    { x: half * 0.78, y: 0 },
  ];
}

/**
 * A pad with toe bumps cut into its lower edge.
 *
 * The toes are part of the silhouette rather than dots painted on top, which is
 * what stops them from reading as a decal.
 */
function pawOutline(w: number, h: number, toes: number): Vec2[] {
  const half = w / 2;
  const count = Math.max(2, Math.min(4, toes));
  const points: Vec2[] = [
    { x: -half * 0.82, y: 0 },
    { x: -half * 1, y: h * 0.42 },
    { x: -half * 0.96, y: h * 0.78 },
  ];

  // Scallop across the bottom: out to a toe tip, back into the web, repeat.
  for (let i = 0; i < count; i++) {
    const centre = (-1 + (2 * i + 1) / count) * half * 0.86;
    const toeHalf = (half * 0.86) / count;

    points.push({ x: centre - toeHalf * 0.72, y: h * 0.92 });
    points.push({ x: centre, y: h * 1.08 });
    points.push({ x: centre + toeHalf * 0.72, y: h * 0.92 });

    if (i < count - 1) points.push({ x: centre + toeHalf, y: h * 0.84 });
  }

  points.push({ x: half * 0.96, y: h * 0.78 });
  points.push({ x: half * 1, y: h * 0.42 });
  points.push({ x: half * 0.82, y: 0 });

  return points;
}

/** Narrow, flat-bottomed, tapering downward. A hard surface. */
function hoofOutline(w: number, h: number): Vec2[] {
  const half = w / 2;

  return [
    { x: -half * 0.94, y: 0 },
    { x: -half * 0.88, y: h * 0.45 },
    { x: -half * 0.78, y: h * 0.86 },
    { x: -half * 0.7, y: h },
    { x: 0, y: h * 1.02 },
    { x: half * 0.7, y: h },
    { x: half * 0.78, y: h * 0.86 },
    { x: half * 0.88, y: h * 0.45 },
    { x: half * 0.94, y: 0 },
  ];
}

/** A small ankle above three splayed toes. */
function talonOutline(w: number, h: number, toes: number): Vec2[] {
  const half = w / 2;
  const count = Math.max(2, Math.min(4, toes));
  const points: Vec2[] = [
    { x: -half * 0.42, y: 0 },
    { x: -half * 0.5, y: h * 0.4 },
  ];

  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const centre = (-1 + t * 2) * half * 0.88;
    // Outer toes reach further down and further out, so the set splays.
    const reach = 1 - Math.abs(t - 0.5) * 0.5;

    points.push({ x: centre - half * 0.3, y: h * 0.6 });
    points.push({ x: centre, y: h * (0.9 + reach * 0.3) });
    points.push({ x: centre + half * 0.3, y: h * 0.6 });
  }

  points.push({ x: half * 0.5, y: h * 0.4 });
  points.push({ x: half * 0.42, y: 0 });

  return points;
}

/** Broad, low, flaring outward. */
function flipperOutline(w: number, h: number, mirror: number): Vec2[] {
  const half = w / 2;

  return [
    { x: -half * 0.5, y: 0 },
    { x: -half * (0.8 + (mirror < 0 ? 0.35 : 0)), y: h * 0.55 },
    { x: -half * (0.94 + (mirror < 0 ? 0.4 : 0)), y: h },
    { x: 0, y: h * 1.12 },
    { x: half * (0.94 + (mirror > 0 ? 0.4 : 0)), y: h },
    { x: half * (0.8 + (mirror > 0 ? 0.35 : 0)), y: h * 0.55 },
    { x: half * 0.5, y: 0 },
  ];
}

/** A narrow ankle opening into a heavy rounded toe, pointed outward. */
function bootOutline(w: number, h: number): Vec2[] {
  const half = w / 2;

  return [
    { x: -half * 0.52, y: 0 },
    { x: -half * 0.6, y: h * 0.4 },
    { x: -half * 0.66, y: h * 0.78 },
    { x: -half * 0.5, y: h },
    { x: half * 0.35, y: h * 1.04 },
    { x: half * 0.95, y: h * 0.94 },
    { x: half * 1.02, y: h * 0.66 },
    { x: half * 0.72, y: h * 0.42 },
    { x: half * 0.56, y: 0 },
  ];
}

function footOutline(shape: FootShape, w: number, h: number, mirror: number): Vec2[] {
  switch (shape.kind) {
    case 'paw':
      return pawOutline(w, h, shape.toes);
    case 'hoof':
      return hoofOutline(w, h);
    case 'talon':
      return talonOutline(w, h, shape.toes);
    case 'flipper':
      return flipperOutline(w, h, mirror);
    case 'boot':
      return bootOutline(w, h);
    case 'nub':
      return nubOutline(w, h);
    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One foot, drawn into `g`.
 *
 * Feet share a Graphics because they share a fill: the whole set is one flat
 * shape in the coat's shade tone, which is what keeps them reading as part of
 * the creature rather than as objects it is standing on.
 */
export function drawFoot(
  g: Graphics,
  x: number,
  y: number,
  options: FootOptions,
): void {
  const { shape, width, height, mirror } = options;
  if (shape.kind === 'none' || width <= 0 || height <= 0) return;

  let points = footOutline(shape, width, height, mirror);
  if (points.length < 3) return;

  if (mirror < 0) points = mirrorPoints(points);

  // Feet are drawn from their attachment point downward, then lifted so the
  // top sinks into the mass.
  const translated = points.map((p) => ({ x: x + p.x, y: y + p.y }));

  // A hoof is hard and a paw is soft; the curve tension says which.
  const tension = shape.kind === 'hoof' || shape.kind === 'talon' ? 0.6 : 1;
  drawSmoothClosed(g, translated, tension);
}

/**
 * The detail pass: pads, hoof caps and claw tips.
 *
 * Kept separate from the silhouette so it can be drawn in one colour on top of
 * the whole set, in the flat-shape spirit — a second solid shape, never a
 * gradient or a shadow.
 */
export function drawFootDetail(
  g: Graphics,
  x: number,
  y: number,
  options: FootOptions,
): void {
  const { shape, width, height, mirror, ramp, accent } = options;
  if (width <= 0 || height <= 0) return;

  const half = width / 2;

  switch (shape.kind) {
    case 'paw': {
      // One soft pad shape, sitting low on the foot.
      g.ellipse(x, y + height * 0.72, half * 0.52, height * 0.3);
      g.fill({ color: mix(accent, ramp.deep, 0.25), alpha: 0.5 });
      break;
    }

    case 'hoof': {
      // The hard cap, plus the cleft that makes it a hoof and not a peg.
      g.moveTo(x - half * 0.72, y + height * 0.68);
      g.lineTo(x + half * 0.72, y + height * 0.68);
      g.lineTo(x + half * 0.7, y + height * 1);
      g.lineTo(x - half * 0.7, y + height * 1);
      g.closePath();
      g.fill({ color: darken(ramp.deep, 0.3), alpha: 0.55 });

      g.rect(x - half * 0.05, y + height * 0.7, half * 0.1, height * 0.3);
      g.fill({ color: darken(ramp.deep, 0.5), alpha: 0.5 });
      break;
    }

    case 'talon': {
      const count = Math.max(2, Math.min(4, shape.toes));
      for (let i = 0; i < count; i++) {
        const t = count <= 1 ? 0.5 : i / (count - 1);
        const centre = (-1 + t * 2) * half * 0.88 * (mirror < 0 ? -1 : 1);
        const reach = 1 - Math.abs(t - 0.5) * 0.5;
        g.circle(x + centre, y + height * (0.88 + reach * 0.26), half * 0.2);
      }
      g.fill({ color: darken(ramp.deep, 0.42), alpha: 0.7 });
      break;
    }

    case 'boot': {
      // A sole: one flat bar along the bottom.
      const dir = mirror < 0 ? -1 : 1;
      g.moveTo(x - half * 0.5 * dir, y + height * 0.9);
      g.lineTo(x + half * 1.0 * dir, y + height * 0.82);
      g.lineTo(x + half * 0.95 * dir, y + height * 0.98);
      g.lineTo(x + half * 0.3 * dir, y + height * 1.06);
      g.closePath();
      g.fill({ color: darken(ramp.deep, 0.32), alpha: 0.6 });
      break;
    }

    default:
      break;
  }
}
