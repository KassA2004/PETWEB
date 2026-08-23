/** What sits between the eyes and the mouth, if anything. */
export const SNOUT_TYPES = {
  none: { label: 'None', widthMul: 0, heightMul: 0, nostrils: 0, beak: 0, muzzle: 0 },
  /** A small triangular nose, like the rabbit reference. */
  nose: { label: 'Nose', widthMul: 0.38, heightMul: 0.3, nostrils: 0, beak: 0, muzzle: 0 },
  /** A lighter muzzle patch with a nose on it. */
  muzzle: { label: 'Muzzle', widthMul: 1, heightMul: 0.72, nostrils: 0, beak: 0, muzzle: 1 },
  /** The pig disc, complete with two holes. */
  snout: { label: 'Snout', widthMul: 0.78, heightMul: 0.62, nostrils: 2, beak: 0, muzzle: 0 },
  /** A hard beak, which replaces the mouth entirely. */
  beak: { label: 'Beak', widthMul: 0.72, heightMul: 0.66, nostrils: 0, beak: 1, muzzle: 0 },
} as const;

export type SnoutType = keyof typeof SNOUT_TYPES;

export interface SnoutShape {
  label: string;
  widthMul: number;
  heightMul: number;
  nostrils: number;
  beak: number;
  muzzle: number;
}

export function getSnoutShape(type: SnoutType): SnoutShape {
  return SNOUT_TYPES[type] ?? SNOUT_TYPES.none;
}

export const SNOUT_TYPE_KEYS = Object.keys(SNOUT_TYPES) as SnoutType[];
