/**
 * Tail variants.
 *
 * Tails are built as a chain of segments so they can be animated procedurally
 * rather than redrawn per frame (/Docs/pet-anatomy.md section 16).
 * A tail type only changes segment count, taper and rest curvature.
 */

export const TAIL_TYPES = {
  /** Default: long, tapering, curling upward, with a soft cloud tuft. */
  cloud: {
    label: 'Cloud',
    lengthMul: 1,
    thicknessMul: 1,
    segments: 7,
    /** Rest curvature per segment, in radians. Negative curls upward. */
    curl: -0.16,
    /** Puff at the tip, relative to base thickness. 0 = none. */
    tipTuft: 1.5,
    /** How much of the base thickness survives to the tip. */
    taper: 0.32,
    /** How strongly the tail responds to motion. */
    floppiness: 1,
  },
  /** Short and stubby. */
  nub: {
    label: 'Nub',
    lengthMul: 0.34,
    thicknessMul: 1.25,
    segments: 3,
    curl: -0.22,
    tipTuft: 1.1,
    taper: 0.6,
    floppiness: 0.5,
  },
  /** Thin whip with a small tip. */
  whisker: {
    label: 'Whisker',
    lengthMul: 1.24,
    thicknessMul: 0.5,
    segments: 9,
    curl: -0.1,
    tipTuft: 0.6,
    taper: 0.2,
    floppiness: 1.6,
  },
  /** Absurdly large plume, bigger than the pet's head. */
  plume: {
    label: 'Plume',
    lengthMul: 1.1,
    thicknessMul: 1.6,
    segments: 6,
    curl: -0.24,
    tipTuft: 2.6,
    taper: 0.55,
    floppiness: 0.8,
  },
} as const;

export type TailType = keyof typeof TAIL_TYPES;

export interface TailShape {
  label: string;
  lengthMul: number;
  thicknessMul: number;
  segments: number;
  curl: number;
  tipTuft: number;
  taper: number;
  floppiness: number;
}

export function getTailShape(type: TailType): TailShape {
  return TAIL_TYPES[type];
}

export const TAIL_TYPE_KEYS = Object.keys(TAIL_TYPES) as TailType[];
