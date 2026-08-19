/**
 * Procedural shape primitives.
 *
 * Everything visual in this project is drawn from code (no sprite sheets, no
 * imported artwork). These helpers exist so parts and objects can be built from
 * organic curves instead of stacked circles — see /Docs/pet-anatomy.md section 9
 * and /Docs/theme-and-design.md section 12.
 */

import { FillGradient, Graphics } from 'pixi.js';
import { rgba } from './color';

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Small deterministic PRNG (mulberry32).
 *
 * Deterministic matters: the same pet must look identical every time it is
 * rendered, while still carrying the "designed imperfection" the visual design
 * doc asks for (section 14).
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max). */
export function rngRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Draw a closed shape through `points` using Catmull-Rom interpolation
 * converted to cubic beziers.
 *
 * This is what keeps silhouettes organic — the caller supplies a handful of
 * control points and gets a continuous soft curve rather than a polygon.
 */
export function smoothClosedPath(g: Graphics, points: Vec2[], tension = 1): Graphics {
  const n = points.length;
  if (n < 3) return g;

  const at = (i: number) => points[((i % n) + n) % n];

  g.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    g.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }

  g.closePath();
  return g;
}

export interface BlobOptions {
  /** Number of control points around the shape. More points = finer control. */
  segments?: number;
  /** Per-point radius wobble, 0..1. Keeps shapes from looking machine-made. */
  jitter?: number;
  /** Multiplier applied to the lower half — > 1 makes a pear/heavy-bottom form. */
  bottomBias?: number;
  /** Multiplier applied to the front (+x) half. */
  frontBias?: number;
  rng?: () => number;
}

/**
 * Generate control points for an organic blob centred on (cx, cy).
 *
 * Returned points are meant to be fed to `smoothClosedPath`.
 */
export function blobPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  options: BlobOptions = {},
): Vec2[] {
  const segments = options.segments ?? 14;
  const jitter = options.jitter ?? 0.05;
  const bottomBias = options.bottomBias ?? 1;
  const frontBias = options.frontBias ?? 1;
  const rng = options.rng ?? createRng(1337);

  const points: Vec2[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    // Bias factors fade in smoothly so the silhouette stays continuous.
    const bottomWeight = Math.max(0, sin);
    const frontWeight = Math.max(0, cos);
    const bias =
      1 + (bottomBias - 1) * bottomWeight + (frontBias - 1) * frontWeight;

    const wobble = 1 + (rng() - 0.5) * 2 * jitter;
    const radius = bias * wobble;

    points.push({
      x: cx + cos * rx * radius,
      y: cy + sin * ry * radius,
    });
  }

  return points;
}

/** Convenience: build and draw an organic blob in one call. */
export function drawBlob(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  options: BlobOptions = {},
): Graphics {
  return smoothClosedPath(g, blobPoints(cx, cy, rx, ry, options));
}

/**
 * A capsule that tapers from `topWidth` to `bottomWidth`.
 *
 * Used for limbs, tail segments, plant stems and lamp stands.
 */
export function drawTaperedCapsule(
  g: Graphics,
  x: number,
  y: number,
  topWidth: number,
  bottomWidth: number,
  length: number,
): Graphics {
  const ht = topWidth / 2;
  const hb = bottomWidth / 2;
  const bottom = y + length;

  g.moveTo(x - ht, y);
  // Rounded cap across the top.
  g.bezierCurveTo(x - ht, y - ht * 0.9, x + ht, y - ht * 0.9, x + ht, y);
  // Right side, bowed slightly outward so limbs read as soft rather than conical.
  g.bezierCurveTo(
    x + ht + (hb - ht) * 0.2,
    y + length * 0.45,
    x + hb,
    bottom - length * 0.25,
    x + hb,
    bottom,
  );
  // Rounded cap across the bottom.
  g.bezierCurveTo(x + hb, bottom + hb * 0.9, x - hb, bottom + hb * 0.9, x - hb, bottom);
  // Left side back up to the start.
  g.bezierCurveTo(
    x - hb,
    bottom - length * 0.25,
    x - ht - (hb - ht) * 0.2,
    y + length * 0.45,
    x - ht,
    y,
  );
  g.closePath();
  return g;
}

/**
 * Vertical gradient in the shape's own local space (0 = top, 1 = bottom).
 *
 * Gradients rather than blur filters do most of the shading work here: they
 * cost nothing per frame, which matters because the pet redraws while animating.
 */
export function verticalGradient(
  stops: { offset: number; color: number; alpha?: number }[],
): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
    textureSpace: 'local',
    colorStops: stops.map((stop) => ({
      offset: stop.offset,
      color: rgba(stop.color, stop.alpha ?? 1),
    })),
  });
}

/** Diagonal gradient, for surfaces lit from the upper left. */
export function diagonalGradient(
  stops: { offset: number; color: number; alpha?: number }[],
): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0.15, y: 0 },
    end: { x: 0.85, y: 1 },
    textureSpace: 'local',
    colorStops: stops.map((stop) => ({
      offset: stop.offset,
      color: rgba(stop.color, stop.alpha ?? 1),
    })),
  });
}

/**
 * Radial gradient used for glows, contact shadows and light pools.
 *
 * Cheaper and cleaner than a BlurFilter for soft round falloff, and it never
 * gets clipped by filter padding.
 */
export function radialGradient(
  stops: { offset: number; color: number; alpha?: number }[],
): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    textureSpace: 'local',
    colorStops: stops.map((stop) => ({
      offset: stop.offset,
      color: rgba(stop.color, stop.alpha ?? 1),
    })),
  });
}
