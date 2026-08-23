/**
 * PetConstraints — every limit in the character system, in one place.
 *
 * There are two kinds of limit here, and keeping them apart is the whole point.
 *
 * **Absolute ranges** are what a slider may produce. They are deliberately wide:
 * the brief asks for creatures that are ridiculous, so "tiny eyes on an enormous
 * body" has to be reachable. These are exported so the editor's sliders and the
 * clamp agree — a slider whose range is wider than the clamp is a control that
 * silently does nothing, which is worse than no control at all.
 *
 * **Dependent constraints** are relationships between values, and they are
 * applied in pixel space when the proportions are computed, *not* to the stored
 * appearance. That distinction matters: if eye spacing snapped back while you
 * dragged it, the editor would feel broken. Instead the value you chose is
 * kept, and the renderer refuses to let the two eyes actually overlap.
 *
 * The rule this file exists to enforce is:
 *
 *   maximum creative variety within a coherent visual language
 *
 * not "clamp everything until nothing can look bad".
 */

import { clamp } from '../../shared/shapes';

export interface Range {
  min: number;
  max: number;
  step?: number;
}

/**
 * What a slider may produce.
 *
 * Wide on purpose. The renderer, not this table, is responsible for making the
 * extremes survivable.
 */
export const APPEARANCE_RANGES = {
  // --- Mass ---------------------------------------------------------------
  bodyScale: { min: 0.6, max: 1.6 },
  bodyWidth: { min: 0.6, max: 1.6 },
  bodyHeight: { min: 0.6, max: 1.6 },
  /** How lopsided the silhouette is allowed to be. */
  asymmetry: { min: 0, max: 1, step: 0.05 },
  footScale: { min: 0, max: 2 },

  // --- Appendages ---------------------------------------------------------
  earScale: { min: 0, max: 2.2 },
  earSpread: { min: 0.05, max: 0.55, step: 0.01 },
  earTilt: { min: -0.8, max: 1.2, step: 0.02 },
  wingScale: { min: 0, max: 2 },
  tailScale: { min: 0, max: 2 },
  topperScale: { min: 0, max: 2.2 },

  // --- Face ---------------------------------------------------------------
  eyeScale: { min: 0.3, max: 2.2 },
  eyeSpacing: { min: 0.06, max: 0.42, step: 0.005 },
  eyeHeight: { min: 0.12, max: 0.88, step: 0.02 },
  /** Multiplier on the eye preset's own pupil size. */
  pupilScale: { min: 0.35, max: 1.9 },
  /** Extra rotation on top of the eye preset's rest tilt, radians. */
  eyeTilt: { min: -0.5, max: 0.5, step: 0.02 },

  browScale: { min: 0.4, max: 1.8 },
  snoutScale: { min: 0.4, max: 1.9 },

  mouthWidth: { min: 0.45, max: 1.9 },
  mouthWeight: { min: 0.5, max: 2.2 },
  restingMood: { min: -1, max: 1, step: 0.05 },
  /** Tooth size. 0 hides the set entirely. */
  fangs: { min: 0, max: 1, step: 0.05 },
  blush: { min: 0, max: 1, step: 0.05 },

  // --- Accessories --------------------------------------------------------
  accessoryScale: { min: 0.35, max: 2.5 },
} as const satisfies Record<string, Range>;

export type RangedField = keyof typeof APPEARANCE_RANGES;

export function getRange(field: RangedField): Range {
  return APPEARANCE_RANGES[field];
}

export function clampField(field: RangedField, value: number): number {
  const range = APPEARANCE_RANGES[field];
  if (!range) return value;
  return clamp(value, range.min, range.max);
}

/* -------------------------------------------------------------------------- */
/* Dependent constraints                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Keep the mass from collapsing into a line.
 *
 * Width and height are free individually; only their *ratio* is bounded, and
 * the bounds are generous — a 2.6:1 pancake and a 1:2.6 pole are both allowed.
 * What is not allowed is a creature with no silhouette left.
 */
export function constrainBodyAspect(
  width: number,
  height: number,
): { width: number; height: number } {
  const ratio = width / Math.max(1, height);
  const min = 0.38;
  const max = 2.6;

  if (ratio >= min && ratio <= max) return { width, height };

  // Meet in the middle rather than moving one value, so neither dimension is
  // silently ignored when someone pushes both sliders to an end stop.
  const target = clamp(ratio, min, max);
  const correction = Math.sqrt(target / ratio);

  return { width: width * correction, height: height / correction };
}

/**
 * Half the distance between the eyes, in pixels.
 *
 * Two independent rules, both of which the user can otherwise break:
 *
 *   eyes must not overlap    — the gap has to clear their own width, or a
 *                              creature with saucer eyes becomes a cyclops
 *   eyes must stay on the face — the outer edge has to stay inside the mass,
 *                              or they float beside it
 *
 * The second is why the face reflows when the body narrows, instead of the body
 * having to stay wide enough for the face.
 */
export function constrainEyeGap(
  gap: number,
  eyeWidth: number,
  bodyHalfWidth: number,
): number {
  const minimum = eyeWidth * 0.54;
  const maximum = Math.max(minimum, bodyHalfWidth * 0.94 - eyeWidth * 0.42);

  return clamp(gap, minimum, maximum);
}

/**
 * How far out the ears may sit, in pixels from the centre.
 *
 * An ear anchored past the edge of the crown has nothing to grow out of, so
 * this follows the body's actual width up there rather than a fixed fraction.
 */
export function constrainEarOffset(
  offset: number,
  crownHalfWidth: number,
  earWidth: number,
): number {
  return clamp(offset, 0, Math.max(0, crownHalfWidth * 0.96 - earWidth * 0.18));
}

/**
 * Foot size, given how many of them have to fit across the body.
 *
 * Huge feet on a small creature is a look worth keeping, so the limit is
 * generous — the whole set may be a fifth wider than the body. What it stops is
 * feet so wide they detach into two separate objects on either side.
 */
export function constrainFootWidth(
  footWidth: number,
  count: number,
  bodyWidth: number,
): number {
  if (count <= 0) return 0;
  return Math.min(footWidth, (bodyWidth * 1.2) / count);
}

/**
 * Mouth width, given the face it is on.
 *
 * A mouth wider than the head is funny; a mouth that leaves the head entirely
 * is a bug. The face clip would hide the overflow anyway — this keeps the shape
 * from being *cut off* rather than merely wide.
 */
export function constrainMouthWidth(width: number, bodyHalfWidth: number): number {
  return Math.min(width, bodyHalfWidth * 1.72);
}

/**
 * Wing size, relative to the creature carrying them.
 *
 * Wings bigger than the body are a look worth keeping — a butterfly blob is
 * funny. Wings *three times* the body are not a look, they are two planks with
 * a pet between them, which is what a large wing scale on a small creature
 * produced before this existed.
 */
export function constrainWing(
  width: number,
  height: number,
  bodyWidth: number,
  bodyHeight: number,
): { width: number; height: number } {
  const limit = Math.max(bodyWidth, bodyHeight) * 1.15;
  if (width <= limit) return { width, height };

  const scale = limit / width;
  return { width: limit, height: height * scale };
}

/** Snout size, so a muzzle cannot swallow the whole face. */
export function constrainSnout(
  width: number,
  height: number,
  bodyHalfWidth: number,
): { width: number; height: number } {
  const limit = bodyHalfWidth * 1.25;
  if (width <= limit) return { width, height };

  const scale = limit / width;
  return { width: limit, height: height * scale };
}
