/**
 * Body silhouette variants.
 *
 * The creature is a blob: one soft mass with a face on it. A body type only
 * supplies shape multipliers for that mass — it never changes the rig, so every
 * body keeps the same anchors and every animation keeps working
 * (/Docs/pet-anatomy.md sections 6 and 8).
 */

export const BODY_TYPES = {
  /** Default: the rounded-square blob. Slightly wider than tall. */
  blob: {
    label: 'Blob',
    widthMul: 1,
    heightMul: 1,
    /** 0 = nearly a box, 1 = a plain ellipse. */
    roundness: 0.45,
    /** Outline wobble — a little hand-drawn irregularity. */
    wobble: 0.012,
    /** Size of the lighter belly patch, relative to the body. */
    belly: 0.52,
  },
  /** Taller and rounder, like a standing jelly bean. */
  bean: {
    label: 'Bean',
    widthMul: 0.86,
    heightMul: 1.2,
    roundness: 0.72,
    wobble: 0.02,
    belly: 0.5,
  },
  /** Wide and low — a puddle that decided to sit up. */
  pebble: {
    label: 'Pebble',
    widthMul: 1.28,
    heightMul: 0.78,
    roundness: 0.66,
    wobble: 0.016,
    belly: 0.6,
  },
  /** Narrow and tall, almost a loaf standing on end. */
  tower: {
    label: 'Tower',
    widthMul: 0.72,
    heightMul: 1.42,
    roundness: 0.3,
    wobble: 0.01,
    belly: 0.44,
  },
  /** Heavy bottom, small shoulders — a drop of something about to fall. */
  drop: {
    label: 'Drop',
    widthMul: 1.06,
    heightMul: 1.06,
    roundness: 0.86,
    wobble: 0.028,
    belly: 0.64,
  },
} as const;

export type BodyType = keyof typeof BODY_TYPES;

export interface BodyShape {
  label: string;
  widthMul: number;
  heightMul: number;
  roundness: number;
  wobble: number;
  belly: number;
}

export function getBodyShape(type: BodyType): BodyShape {
  return BODY_TYPES[type];
}

export const BODY_TYPE_KEYS = Object.keys(BODY_TYPES) as BodyType[];
