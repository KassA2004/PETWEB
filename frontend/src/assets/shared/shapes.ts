/**
 * Procedural shape primitives.
 *
 * Everything visual in this project is drawn from code (no sprite sheets, no
 * imported artwork), and everything is drawn flat: one silhouette, one fill.
 * Depth comes from stacking simple shapes, never from gradients or filters.
 *
 * There are only three silhouette primitives in the whole project:
 *
 *   drawSquircle      rounded-square masses  — the blob, cushions, screens
 *   drawOrganicOval   soft wobbly ovals      — foliage, background shapes
 *   drawCapsule       stubby limbs and stems — arms, feet, legs, stalks
 */

import type { Graphics } from 'pixi.js';

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Small deterministic PRNG (mulberry32).
 *
 * Deterministic matters: the same pet or prop must look identical every time
 * it is rendered, while still carrying a little hand-made irregularity.
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

/** Classic ease-in-out curve, clamped to [0, 1]. Used to blend poses in. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export interface SquircleOptions {
  /**
   * 0 = almost a rectangle, 1 = a plain ellipse. The default sits where a
   * rounded square still reads as a soft mass.
   */
  roundness?: number;
  segments?: number;
  /** Radius wobble, 0..1 — keeps the outline from looking machine-cut. */
  wobble?: number;
  /** Shifts where the wobble sits, so two squircles never match exactly. */
  phase?: number;
}

/**
 * The signature shape of the whole project: a superellipse.
 *
 * A blob drawn as a squircle reads as a soft body with weight, where a circle
 * reads as a ball and a rounded rect reads as a box. Everything that needs to
 * feel squishy uses this.
 */
export function drawSquircle(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  options: SquircleOptions = {},
): Graphics {
  const roundness = clamp(options.roundness ?? 0.45, 0, 1);
  const segments = options.segments ?? 56;
  const wobble = options.wobble ?? 0;
  const phase = options.phase ?? 0;

  // roundness 1 -> exponent 2 (ellipse); roundness 0 -> exponent 8 (near box).
  const exponent = 2 + (1 - roundness) * 6;
  const power = 2 / exponent;

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);

    const wave = wobble === 0 ? 1 : 1 + wobble * Math.cos(3 * t + phase);

    const x = cx + Math.sign(cos) * Math.abs(cos) ** power * rx * wave;
    const y = cy + Math.sign(sin) * Math.abs(sin) ** power * ry * wave;

    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }

  g.closePath();
  return g;
}

/**
 * A soft oval with a gentle harmonic wobble in its radius.
 *
 * One continuous curve, no bezier joins to go wrong — used wherever something
 * should look grown rather than built: leaves, cloud puffs, background shapes.
 */
export function drawOrganicOval(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = 32,
  organicity = 0.05,
  phase = 0,
): Graphics {
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;

    const wobble =
      1 +
      organicity * Math.cos(3 * t + phase) +
      organicity * 0.45 * Math.sin(5 * t + phase);

    const x = cx + Math.cos(t) * rx * wobble;
    const y = cy + Math.sin(t) * ry * wobble;

    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }

  g.closePath();
  return g;
}

/**
 * A vertical capsule: a rectangle with fully rounded caps, hanging from
 * (x, y) downward. Limbs, stalks and table legs are all this shape.
 */
export function drawCapsule(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  length: number,
): Graphics {
  const r = width / 2;
  g.roundRect(x - r, y, width, Math.max(length, width), r);
  return g;
}

/**
 * A stroked arc between two points, bowing by `bow` pixels at its middle.
 *
 * Positive `bow` curves downward. Mouths, wicker weave and plant stems are all
 * drawn with this.
 */
export function curveBetween(
  g: Graphics,
  from: Vec2,
  to: Vec2,
  bow: number,
): Graphics {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;

  g.moveTo(from.x, from.y);
  g.quadraticCurveTo(mx, my + bow * 2, to.x, to.y);
  return g;
}
