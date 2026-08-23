/**
 * geometry.ts — the curve maths every creature part is built from.
 *
 * Three ideas cover the whole character system:
 *
 *   smooth path     a closed or open curve through a list of points, so a part
 *                   is authored as "where the edge goes" rather than as a pile
 *                   of hand-tuned bezier control points nobody can edit later.
 *   width profile   a silhouette described as half-widths down a vertical axis.
 *                   Bodies are this: one array per body type, and the shapes
 *                   genuinely differ instead of being one path stretched.
 *   ribbon          a spine plus a width along it. Ears, horns, antennae and
 *                   tails are this, which is why a bunny ear tapers and curls
 *                   instead of reading as a rod with a rounded end.
 *
 * Nothing here knows what a pet is. Parts supply numbers; this file turns them
 * into outlines.
 */

import type { Graphics } from 'pixi.js';
import { clamp, lerp } from './shapes';
import type { Vec2 } from './shapes';

export type { Vec2 };

/* -------------------------------------------------------------------------- */
/* Smooth paths                                                               */
/* -------------------------------------------------------------------------- */

function catmullControl(a: Vec2, b: Vec2, c: Vec2, tension: number): Vec2 {
  return {
    x: b.x + ((c.x - a.x) / 6) * tension,
    y: b.y + ((c.y - a.y) / 6) * tension,
  };
}

/**
 * A closed curve passing through every point.
 *
 * Catmull-Rom converted to cubic beziers, so PixiJS gets real curves rather
 * than a many-sided polygon. A tension below 1 tightens the curve toward the
 * straight-line polygon, which is how a body type asks for a boxier corner.
 */
export function drawSmoothClosed(
  g: Graphics,
  points: readonly Vec2[],
  tension = 1,
): Graphics {
  const n = points.length;
  if (n < 3) return g;

  g.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    const c1 = catmullControl(p0, p1, p2, tension);
    const c2 = catmullControl(p3, p2, p1, tension);

    g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
  }

  g.closePath();
  return g;
}

/** The same curve, left open. Used for strokes: mouths, brows, ridges. */
export function drawSmoothOpen(
  g: Graphics,
  points: readonly Vec2[],
  tension = 1,
): Graphics {
  const n = points.length;
  if (n < 2) return g;

  if (n === 2) {
    g.moveTo(points[0].x, points[0].y);
    g.lineTo(points[1].x, points[1].y);
    return g;
  }

  g.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];

    const c1 = catmullControl(p0, p1, p2, tension);
    const c2 = catmullControl(p3, p2, p1, tension);

    g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
  }

  return g;
}

/* -------------------------------------------------------------------------- */
/* Width profiles                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One sample down a silhouette: t runs 0 (top) to 1 (bottom), and w is the
 * half-width there as a fraction of the shape's half-width.
 */
export type ProfileSample = readonly [t: number, w: number];

export interface OutlineOptions {
  /** Half-width in pixels at w = 1. */
  rx: number;
  /** Half-height in pixels. */
  ry: number;
  /** Vertical centre of the shape. */
  cy?: number;
  /**
   * Gentle left/right difference, 0..1. Hand-drawn shapes are never mirror
   * symmetric, and a perfectly symmetric blob reads as clip art.
   */
  asymmetry?: number;
  /** Chooses where the asymmetry sits. Same phase = same creature. */
  phase?: number;
}

/**
 * Turn a half-width profile into a closed outline.
 *
 * The profile describes the right-hand edge from top to bottom; the left edge
 * is the mirror of it, walked back up, with a slow wave applied so the two
 * sides never match exactly.
 */
export function profileOutline(
  profile: readonly ProfileSample[],
  options: OutlineOptions,
): Vec2[] {
  const { rx, ry, cy = 0 } = options;
  const asymmetry = options.asymmetry ?? 0;
  const phase = options.phase ?? 0;

  const right: Vec2[] = [];
  const left: Vec2[] = [];

  for (const [t, w] of profile) {
    const y = cy + lerp(-ry, ry, clamp(t, 0, 1));

    // One slow wave down each side, out of phase with the other. Small enough
    // to read as "drawn by hand", never as "the mesh is broken".
    const rightWave = 1 + asymmetry * 0.06 * Math.sin(t * 4.1 + phase);
    const leftWave = 1 + asymmetry * 0.06 * Math.sin(t * 3.3 + phase + 2.2);

    right.push({ x: w * rx * rightWave, y });
    left.push({ x: -w * rx * leftWave, y });
  }

  // Down the right side, then back up the left. The shared top and bottom
  // points are dropped from the return leg so the curve never doubles back.
  const back = left.slice(1, left.length - 1).reverse();
  return [...right, ...back];
}

/** Sample a profile at an arbitrary t, so parts can ask how wide it is here. */
export function profileWidthAt(profile: readonly ProfileSample[], t: number): number {
  const target = clamp(t, 0, 1);
  if (profile.length === 0) return 0;

  for (let i = 1; i < profile.length; i++) {
    const [t0, w0] = profile[i - 1];
    const [t1, w1] = profile[i];

    if (target <= t1) {
      const span = t1 - t0;
      const local = span <= 0 ? 0 : (target - t0) / span;
      return lerp(w0, w1, local);
    }
  }

  return profile[profile.length - 1][1];
}

/* -------------------------------------------------------------------------- */
/* Ribbons                                                                    */
/* -------------------------------------------------------------------------- */

export interface SpineOptions {
  /** Length in pixels, measured along the spine. */
  length: number;
  /** Total turn from base to tip, in radians. Positive turns toward +x. */
  bend?: number;
  /** How far the tip folds over, 0..1. Adds up to ~140° of extra turn. */
  droop?: number;
  /** Number of samples. More is smoother, 8 is plenty. */
  samples?: number;
}

/** A fully drooped ear turns this far on top of its own bend. */
const DROOP_TURN = 2.4;

/**
 * A spine growing upward from the origin, curving as it goes.
 *
 * The spine is integrated along an arc rather than offset sideways, which is
 * the difference between an ear that *bends* and an ear that *folds over*. A
 * floppy ear needs to end up pointing back down at the floor, and no amount of
 * horizontal offset will do that.
 *
 * The turn is eased so it accumulates toward the tip: an ear that bends from
 * its root looks broken, one that bends toward its tip looks alive.
 */
export function growSpine(options: SpineOptions): Vec2[] {
  const { length } = options;
  const bend = options.bend ?? 0;
  const droop = options.droop ?? 0;
  const samples = options.samples ?? 8;

  const turn = bend + Math.sign(bend || 1) * droop * DROOP_TURN;
  const step = length / samples;

  const points: Vec2[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    // -PI/2 is straight up; the turn rotates the direction from there.
    const angle = -Math.PI / 2 + turn * t * t;
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    points.push({ x, y });
  }

  return points;
}

/**
 * Thicken a spine into a closed outline.
 *
 * `widths` is the half-width at each spine point, so a taper, a bulb or a
 * pinched waist are all just different arrays. This is the whole reason ear
 * types can share one renderer and still look nothing alike.
 */
export function ribbonOutline(
  spine: readonly Vec2[],
  widths: readonly number[],
): Vec2[] {
  const n = spine.length;
  if (n < 2) return [];

  const normals: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / len, y: dx / len });
  }

  const right: Vec2[] = [];
  const left: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const w = widths[Math.min(i, widths.length - 1)];
    right.push({
      x: spine[i].x + normals[i].x * w,
      y: spine[i].y + normals[i].y * w,
    });
    left.push({
      x: spine[i].x - normals[i].x * w,
      y: spine[i].y - normals[i].y * w,
    });
  }

  return [...right, ...left.reverse()];
}

/**
 * Half-widths along a ribbon.
 *
 * `base` and `tip` are the ends; `belly` bulges or pinches the middle. Three
 * numbers describe every ear, horn and antenna shape in the library.
 */
export function taperWidths(
  count: number,
  base: number,
  tip: number,
  belly = 0,
): number[] {
  const widths: number[] = [];

  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const straight = lerp(base, tip, t);
    const bulge = Math.sin(t * Math.PI) * belly;
    widths.push(Math.max(0.4, straight + bulge));
  }

  return widths;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Draw a list of points as a straight-edged closed polygon. */
export function drawPolygon(g: Graphics, points: readonly Vec2[]): Graphics {
  if (points.length < 3) return g;

  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath();

  return g;
}

/** Scale every point about the origin. */
export function scalePoints(points: readonly Vec2[], sx: number, sy = sx): Vec2[] {
  return points.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

/** Move every point. */
export function translatePoints(
  points: readonly Vec2[],
  dx: number,
  dy: number,
): Vec2[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Mirror every point across x = 0. Winding is reversed to stay consistent. */
export function mirrorPoints(points: readonly Vec2[]): Vec2[] {
  return points.map((p) => ({ x: -p.x, y: p.y })).reverse();
}

/** An arc as points, for stroking. Angles in radians, 0 pointing right. */
export function arcPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  samples = 12,
): Vec2[] {
  const points: Vec2[] = [];

  for (let i = 0; i <= samples; i++) {
    const angle = lerp(from, to, i / samples);
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }

  return points;
}
