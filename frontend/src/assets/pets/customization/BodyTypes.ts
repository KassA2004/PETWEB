/**
 * Body silhouette variants.
 *
 * A body type only supplies shape multipliers. It never changes the rig:
 * every body keeps the same anchors, so animation is unaffected
 * (/Docs/pet-anatomy.md sections 6 and 8).
 */

export const BODY_TYPES = {
  /** Default: soft rounded form, slightly heavier at the hindquarters. */
  dumpling: {
    label: 'Dumpling',
    widthMul: 1,
    heightMul: 1,
    /** > 1 pushes mass toward the belly. */
    bottomBias: 1.1,
    /** > 1 pushes mass toward the chest (+x). */
    frontBias: 0.94,
    jitter: 0.045,
    /** How far the spine arches up over the hips. */
    backArch: 0.14,
    /** Size of the chest fluff tuft. */
    chestFluff: 1,
  },
  /** Longer, lower — a stretched dreamy creature. */
  noodle: {
    label: 'Noodle',
    widthMul: 1.32,
    heightMul: 0.82,
    bottomBias: 1.04,
    frontBias: 0.9,
    jitter: 0.04,
    backArch: 0.2,
    chestFluff: 0.8,
  },
  /** Very round, barely any waist. */
  pebble: {
    label: 'Pebble',
    widthMul: 0.88,
    heightMul: 1.08,
    bottomBias: 1.16,
    frontBias: 1,
    jitter: 0.05,
    backArch: 0.08,
    chestFluff: 1.25,
  },
  /** Tall and narrow, pear shaped. */
  sprout: {
    label: 'Sprout',
    widthMul: 0.82,
    heightMul: 1.18,
    bottomBias: 1.24,
    frontBias: 0.86,
    jitter: 0.055,
    backArch: 0.22,
    chestFluff: 0.7,
  },
} as const;

export type BodyType = keyof typeof BODY_TYPES;

export interface BodyShape {
  label: string;
  widthMul: number;
  heightMul: number;
  bottomBias: number;
  frontBias: number;
  jitter: number;
  backArch: number;
  chestFluff: number;
}

export function getBodyShape(type: BodyType): BodyShape {
  return BODY_TYPES[type];
}

export const BODY_TYPE_KEYS = Object.keys(BODY_TYPES) as BodyType[];
