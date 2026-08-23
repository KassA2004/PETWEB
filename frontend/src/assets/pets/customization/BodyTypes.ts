/**
 * Body silhouettes.
 *
 * A body type is a **width profile**: half-widths sampled from the crown down
 * to the floor. That is the whole definition — no per-type drawing code, no
 * conditionals in the renderer. Two profiles that disagree about where the mass
 * sits produce two genuinely different creatures, which is what a single
 * stretched rounded-rectangle could never do.
 *
 *   t = 0   the crown
 *   t = 1   the bottom, where the feet fuse in
 *   w       half-width there, 1 = the body's full half-width
 *
 * Reading a profile out loud is a good test of whether the shape is designed:
 * "pear" narrows to 0.62 at the shoulders and swells to 1.0 low down; "egg" does
 * the opposite. Neither is the other one squashed.
 *
 * `tension` is the only rendering hint a type carries: 1 is a fully rounded
 * curve through the samples, and lower values pull the outline toward straight
 * segments, which is how the boxy shapes get their corners.
 *
 * The creature has no arms and no separate legs. Feet are shapes drawn into the
 * bottom of this silhouette (see ./FootTypes and ../parts/Foot).
 */

import type { ProfileSample } from '../../shared/geometry';

export interface BodyShape {
  label: string;
  /** What this silhouette is for, shown in the editor. */
  hint: string;
  widthMul: number;
  heightMul: number;
  /** Half-widths from crown to floor. */
  profile: readonly ProfileSample[];
  /** 1 = fully rounded corners, lower = boxier. */
  tension: number;
  /** How much left/right difference to allow, 0..1. */
  asymmetry: number;
  /**
   * Where the feet want to sit, as a share of half-width from the centre.
   * A wide body plants its feet wide; a narrow one cannot.
   */
  stance: number;
}

/**
 * Ten silhouettes covering the range the brief asks for: round, square, tall,
 * short, wide, narrow, chunky, long, soft, and deliberately lopsided.
 */
export const BODY_TYPES = {
  /** The default. A soft mass with real shoulders and a heavy seat. */
  blob: {
    label: 'Blob',
    hint: 'Soft shoulders, heavy seat',
    widthMul: 1,
    heightMul: 1,
    profile: [
      [0, 0.02], [0.04, 0.42], [0.1, 0.66], [0.2, 0.84], [0.34, 0.95],
      [0.5, 1], [0.66, 1], [0.8, 0.96], [0.9, 0.86], [0.97, 0.62], [1, 0.3],
    ],
    tension: 1,
    asymmetry: 0.35,
    stance: 0.52,
  },

  /** A plain soft ball. Reads youngest. */
  round: {
    label: 'Round',
    hint: 'A ball. Youngest read in the set',
    widthMul: 1.04,
    heightMul: 0.98,
    profile: [
      [0, 0.02], [0.04, 0.4], [0.12, 0.66], [0.24, 0.87], [0.38, 0.97],
      [0.5, 1], [0.62, 0.99], [0.76, 0.9], [0.88, 0.72], [0.96, 0.44], [1, 0.06],
    ],
    tension: 1,
    asymmetry: 0.28,
    stance: 0.46,
  },

  /** Flat top, flat sides, soft corners. A creature shaped like furniture. */
  square: {
    label: 'Square',
    hint: 'Flat sides, soft corners. Reads stubborn',
    widthMul: 1,
    heightMul: 1,
    profile: [
      [0, 0.12], [0.03, 0.62], [0.08, 0.86], [0.14, 0.96], [0.3, 1],
      [0.5, 1], [0.7, 1], [0.86, 0.97], [0.93, 0.9], [0.98, 0.72], [1, 0.42],
    ],
    tension: 0.55,
    asymmetry: 0.18,
    stance: 0.6,
  },

  /** Narrow and upright — a loaf standing on end. */
  tall: {
    label: 'Tall',
    hint: 'Narrow and upright',
    widthMul: 0.76,
    heightMul: 1.4,
    profile: [
      [0, 0.02], [0.05, 0.44], [0.12, 0.72], [0.22, 0.88], [0.36, 0.95],
      [0.55, 0.99], [0.72, 1], [0.85, 0.98], [0.93, 0.9], [0.98, 0.68], [1, 0.36],
    ],
    tension: 0.9,
    asymmetry: 0.3,
    stance: 0.5,
  },

  /** Barely taller than it is wide, and pleased about it. */
  short: {
    label: 'Short',
    hint: 'Compact. Barely taller than wide',
    widthMul: 1.08,
    heightMul: 0.7,
    profile: [
      [0, 0.06], [0.06, 0.52], [0.16, 0.8], [0.3, 0.94], [0.46, 1],
      [0.62, 1], [0.76, 0.97], [0.88, 0.88], [0.95, 0.68], [1, 0.34],
    ],
    tension: 1,
    asymmetry: 0.32,
    stance: 0.55,
  },

  /** Low and broad. Smug by default. */
  wide: {
    label: 'Wide',
    hint: 'Low and broad. Smug by default',
    widthMul: 1.4,
    heightMul: 0.78,
    profile: [
      [0, 0.1], [0.05, 0.5], [0.14, 0.76], [0.28, 0.92], [0.44, 0.99],
      [0.6, 1], [0.74, 1], [0.86, 0.96], [0.94, 0.85], [0.99, 0.62], [1, 0.4],
    ],
    tension: 0.85,
    asymmetry: 0.3,
    stance: 0.62,
  },

  /** A thin column. Nearly all silhouette, almost no mass. */
  narrow: {
    label: 'Narrow',
    hint: 'A thin column. Odd on purpose',
    widthMul: 0.58,
    heightMul: 1.22,
    profile: [
      [0, 0.04], [0.05, 0.5], [0.13, 0.8], [0.26, 0.94], [0.44, 0.98],
      [0.62, 0.98], [0.78, 0.96], [0.89, 0.9], [0.96, 0.76], [1, 0.44],
    ],
    tension: 0.95,
    asymmetry: 0.36,
    stance: 0.66,
  },

  /** Small shoulders, enormous bottom. */
  pear: {
    label: 'Pear',
    hint: 'Small shoulders, enormous bottom',
    widthMul: 1.1,
    heightMul: 1.06,
    profile: [
      [0, 0.02], [0.05, 0.34], [0.13, 0.52], [0.26, 0.62], [0.4, 0.7],
      [0.56, 0.83], [0.7, 0.95], [0.82, 1], [0.91, 0.97], [0.97, 0.8], [1, 0.46],
    ],
    tension: 1,
    asymmetry: 0.34,
    stance: 0.56,
  },

  /** Wide shoulders tapering to a small seat. Top-heavy, faintly menacing. */
  egg: {
    label: 'Egg',
    hint: 'Top-heavy. Faintly menacing',
    widthMul: 1.06,
    heightMul: 1.14,
    profile: [
      [0, 0.06], [0.05, 0.52], [0.13, 0.8], [0.24, 0.95], [0.36, 1],
      [0.5, 0.99], [0.64, 0.93], [0.78, 0.82], [0.89, 0.68], [0.96, 0.48], [1, 0.2],
    ],
    tension: 1,
    asymmetry: 0.3,
    stance: 0.44,
  },

  /** Long, lumpy, with a waist. The one that looks grown rather than drawn. */
  bean: {
    label: 'Bean',
    hint: 'Long and lumpy, with a waist',
    widthMul: 0.92,
    heightMul: 1.26,
    profile: [
      [0, 0.03], [0.05, 0.44], [0.13, 0.74], [0.24, 0.9], [0.36, 0.86],
      [0.48, 0.78], [0.6, 0.84], [0.73, 0.96], [0.85, 1], [0.94, 0.86], [1, 0.44],
    ],
    tension: 1,
    asymmetry: 0.55,
    stance: 0.5,
  },

  /** Enormous. The far end of the range, with no neck to speak of. */
  chonk: {
    label: 'Chonk',
    hint: 'Enormous. No neck to speak of',
    widthMul: 1.52,
    heightMul: 1.08,
    profile: [
      [0, 0.08], [0.05, 0.46], [0.13, 0.72], [0.25, 0.88], [0.38, 0.96],
      [0.52, 1], [0.66, 1], [0.79, 0.98], [0.89, 0.92], [0.96, 0.76], [1, 0.5],
    ],
    tension: 1,
    asymmetry: 0.3,
    stance: 0.6,
  },

  /** Flared at the bottom like a bell. Sits rather than stands. */
  bell: {
    label: 'Bell',
    hint: 'Flared skirt. Sits rather than stands',
    widthMul: 1.16,
    heightMul: 1.02,
    profile: [
      [0, 0.02], [0.05, 0.36], [0.14, 0.56], [0.28, 0.66], [0.44, 0.74],
      [0.6, 0.84], [0.74, 0.94], [0.86, 1], [0.94, 1], [0.98, 0.92], [1, 0.68],
    ],
    tension: 0.8,
    asymmetry: 0.24,
    stance: 0.68,
  },

  /** Pinched at the crown, round below. A drip that learned to stand. */
  drop: {
    label: 'Drop',
    hint: 'Pinched crown, round below',
    widthMul: 1,
    heightMul: 1.16,
    profile: [
      [0, 0.01], [0.06, 0.2], [0.16, 0.4], [0.28, 0.6], [0.42, 0.8],
      [0.56, 0.94], [0.7, 1], [0.82, 0.99], [0.91, 0.9], [0.97, 0.66], [1, 0.32],
    ],
    tension: 1,
    asymmetry: 0.3,
    stance: 0.5,
  },

  /** Deliberately lopsided. The profile does not agree with itself. */
  lump: {
    label: 'Lump',
    hint: 'Deliberately lopsided. A mistake, kept',
    widthMul: 1.08,
    heightMul: 1,
    profile: [
      [0, 0.04], [0.04, 0.38], [0.1, 0.72], [0.19, 0.94], [0.3, 0.88],
      [0.42, 0.8], [0.54, 0.9], [0.68, 1], [0.8, 0.98], [0.9, 0.84], [0.97, 0.58], [1, 0.28],
    ],
    tension: 1,
    asymmetry: 1,
    stance: 0.54,
  },
} as const satisfies Record<string, BodyShape>;

export type BodyType = keyof typeof BODY_TYPES;

export function getBodyShape(type: BodyType): BodyShape {
  return BODY_TYPES[type] ?? BODY_TYPES.blob;
}

export const BODY_TYPE_KEYS = Object.keys(BODY_TYPES) as BodyType[];

/* Feet used to live here. They are their own system now — see ./FootTypes. */
export {
  FOOT_TYPES,
  FOOT_TYPE_KEYS,
  getFootShape,
} from './FootTypes';
export type { FootShape, FootType } from './FootTypes';
