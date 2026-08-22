/**
 * Body silhouettes, and the feet fused into them.
 *
 * The creature is one soft mass. It has no arms and no separate legs: feet are
 * small shapes drawn into the bottom of the body silhouette, not joints. That
 * decision is what frees the animation system from squashing the poor thing to
 * express everything — motion lives in the whole body's lean, hop and rotation,
 * and in the springy appendages hanging off it (/Docs/pet-anatomy.md §17).
 *
 * A body type supplies shape multipliers only. Every body keeps the same
 * anchors, so any head, ear, wing or tail fits any of them.
 */

export const BODY_TYPES = {
  /** Default: the rounded-square blob. */
  blob: {
    label: 'Blob',
    widthMul: 1,
    heightMul: 1,
    /** 0 = nearly a box, 1 = a plain ellipse. */
    roundness: 0.52,
    /** < 1 narrows the top, > 1 widens it. Shoulders. */
    topTaper: 1,
    /** > 1 pushes mass into the lower half. */
    bottomBias: 1.02,
    wobble: 0.005,
  },
  /** A plain soft ball. Reads youngest. */
  round: {
    label: 'Round',
    widthMul: 1.02,
    heightMul: 0.96,
    roundness: 0.95,
    topTaper: 1,
    bottomBias: 1.04,
    wobble: 0.01,
  },
  /** Narrow and tall — a loaf standing on end. */
  tall: {
    label: 'Tall',
    widthMul: 0.74,
    heightMul: 1.42,
    roundness: 0.4,
    topTaper: 0.94,
    bottomBias: 1.02,
    wobble: 0.004,
  },
  /** Low and wide. Smug. */
  wide: {
    label: 'Wide',
    widthMul: 1.34,
    heightMul: 0.76,
    roundness: 0.66,
    topTaper: 0.96,
    bottomBias: 1.05,
    wobble: 0.006,
  },
  /** Small shoulders, heavy bottom. */
  pear: {
    label: 'Pear',
    widthMul: 1.06,
    heightMul: 1.06,
    roundness: 0.8,
    topTaper: 0.72,
    bottomBias: 1.2,
    wobble: 0.012,
  },
  /** Wide shoulders, narrow bottom — top-heavy and a little menacing. */
  egg: {
    label: 'Egg',
    widthMul: 1.04,
    heightMul: 1.12,
    roundness: 0.86,
    topTaper: 1.24,
    bottomBias: 0.86,
    wobble: 0.008,
  },
  /** Long and lumpy. */
  bean: {
    label: 'Bean',
    widthMul: 0.9,
    heightMul: 1.24,
    roundness: 0.82,
    topTaper: 0.9,
    bottomBias: 1.14,
    wobble: 0.022,
  },
  /** Enormous. The "very fat" end of the range. */
  chonk: {
    label: 'Chonk',
    widthMul: 1.5,
    heightMul: 1.1,
    roundness: 0.78,
    topTaper: 0.88,
    bottomBias: 1.16,
    wobble: 0.01,
  },
} as const;

export type BodyType = keyof typeof BODY_TYPES;

export interface BodyShape {
  label: string;
  widthMul: number;
  heightMul: number;
  roundness: number;
  topTaper: number;
  bottomBias: number;
  wobble: number;
}

export function getBodyShape(type: BodyType): BodyShape {
  return BODY_TYPES[type];
}

export const BODY_TYPE_KEYS = Object.keys(BODY_TYPES) as BodyType[];

/**
 * Feet.
 *
 * Drawn into the body silhouette rather than hung off it, so they never swing
 * independently and never need their own animation. They exist to tell you
 * which way is down.
 */
export const FOOT_TYPES = {
  nubs: { label: 'Nubs', widthMul: 1, heightMul: 1, count: 2, toes: 0, round: 1 },
  none: { label: 'None', widthMul: 0, heightMul: 0, count: 0, toes: 0, round: 1 },
  paws: { label: 'Paws', widthMul: 1.16, heightMul: 1.05, count: 2, toes: 3, round: 1 },
  hooves: { label: 'Hooves', widthMul: 0.82, heightMul: 1.2, count: 2, toes: 1, round: 0.35 },
  talons: { label: 'Talons', widthMul: 1.1, heightMul: 0.78, count: 2, toes: 3, round: 0.2 },
  /** Four little feet, for the long-bodied ones. */
  quad: { label: 'Four', widthMul: 0.86, heightMul: 0.92, count: 4, toes: 0, round: 1 },
} as const;

export type FootType = keyof typeof FOOT_TYPES;

export interface FootShape {
  label: string;
  widthMul: number;
  heightMul: number;
  count: number;
  toes: number;
  round: number;
}

export function getFootShape(type: FootType): FootShape {
  return FOOT_TYPES[type];
}

export const FOOT_TYPE_KEYS = Object.keys(FOOT_TYPES) as FootType[];
