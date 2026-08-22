/**
 * Procedural shape primitives.
 *
 * Everything visual in this project is drawn from code (no sprite sheets, no
 * imported artwork). Forms are shaded with soft vertical gradients built from
 * a single base color's tone ramp (`tones` in ./color), plus flat shapes
 * stacked on top for shine, markings and contact shade.
 *
 * There are only three silhouette primitives in the whole project:
 *
 *   drawSquircle      rounded-square masses  — the blob, cushions, screens
 *   drawOrganicOval   soft wobbly ovals      — foliage, background shapes
 *   drawCapsule       stubby limbs and stems — arms, feet, legs, stalks
 */

import { FillGradient } from 'pixi.js';
import type { Graphics } from 'pixi.js';
import { rgba } from './color';
import type { Tones } from './color';

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

/**
 * Vertical gradient in the shape's own local space (0 = top, 1 = bottom).
 *
 * `textureSpace: 'local'` matters: it makes the ramp follow the shape rather
 * than the screen, so a part keeps its own lighting wherever it is drawn and
 * however the rig moves it.
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

/** Diagonal gradient, for forms lit from the upper left. */
export function diagonalGradient(
  stops: { offset: number; color: number; alpha?: number }[],
): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0.2, y: 0 },
    end: { x: 0.8, y: 1 },
    textureSpace: 'local',
    colorStops: stops.map((stop) => ({
      offset: stop.offset,
      color: rgba(stop.color, stop.alpha ?? 1),
    })),
  });
}

/** Radial gradient, for glows and soft round falloff. */
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

/**
 * The standard body shading ramp: light at the top, base through the middle,
 * shade along the bottom.
 *
 * `weight` biases how much of the form the light claims — a small creature
 * wants a higher light so it does not read as dirty.
 */
export function formShading(ramp: Tones, weight = 0.5): FillGradient {
  return verticalGradient([
    { offset: 0, color: ramp.light },
    { offset: 0.3 + weight * 0.1, color: ramp.base },
    { offset: 0.82, color: ramp.shade },
    { offset: 1, color: ramp.deep },
  ]);
}
