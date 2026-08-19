/**
 * Head silhouette variants.
 *
 * `headType` is part of the PetAppearance contract, so head shapes get the same
 * data-driven treatment as bodies, ears and tails.
 */

export const HEAD_TYPES = {
  /** Default: wide cheeks, gentle forehead dome, short soft muzzle. */
  moon: {
    label: 'Moon',
    widthMul: 1,
    heightMul: 1,
    /** Vertical position of the widest point, 0 = top, 1 = chin. */
    cheekBias: 0.58,
    /** How far the muzzle pushes out from the face. */
    muzzle: 1,
    /** Size of the fur tufts on the cheek silhouette. */
    cheekFluff: 1,
    jitter: 0.04,
  },
  /** Rounder, more infant-like. */
  bubble: {
    label: 'Bubble',
    widthMul: 1.08,
    heightMul: 0.96,
    cheekBias: 0.5,
    muzzle: 0.82,
    cheekFluff: 1.3,
    jitter: 0.035,
  },
  /** Narrower with a longer snout — reads slightly older, slightly odd. */
  fawn: {
    label: 'Fawn',
    widthMul: 0.9,
    heightMul: 1.06,
    cheekBias: 0.66,
    muzzle: 1.3,
    cheekFluff: 0.6,
    jitter: 0.05,
  },
  /** Squat and wide, heavy jowls. */
  toad: {
    label: 'Toad',
    widthMul: 1.18,
    heightMul: 0.86,
    cheekBias: 0.7,
    muzzle: 0.9,
    cheekFluff: 1.5,
    jitter: 0.06,
  },
} as const;

export type HeadType = keyof typeof HEAD_TYPES;

export interface HeadShape {
  label: string;
  widthMul: number;
  heightMul: number;
  cheekBias: number;
  muzzle: number;
  cheekFluff: number;
  jitter: number;
}

export function getHeadShape(type: HeadType): HeadShape {
  return HEAD_TYPES[type];
}

export const HEAD_TYPE_KEYS = Object.keys(HEAD_TYPES) as HeadType[];
