/**
 * Mouth variants.
 *
 * A mouth is one or two flat strokes. That is the entire expression system for
 * the lower face: combined with the eyes and a head tilt it covers happy, shy,
 * surprised and asleep without a single extra asset
 * (/Docs/pet-anatomy.md section 18).
 */

export const MOUTH_TYPES = {
  /** Default: the small double curve, like a cat's mouth. */
  wave: {
    label: 'Wave',
    widthMul: 1,
    heightMul: 1,
    /** Stroke weight relative to the mouth width. */
    weight: 0.11,
    /** Filled shape rather than a stroke. */
    filled: false,
  },
  /** A single upward arc. */
  smile: {
    label: 'Smile',
    widthMul: 1.1,
    heightMul: 1,
    weight: 0.1,
    filled: false,
  },
  /** A short flat line — unbothered. */
  line: {
    label: 'Line',
    widthMul: 0.72,
    heightMul: 0.5,
    weight: 0.13,
    filled: false,
  },
  /** A small round open mouth. */
  oh: {
    label: 'Oh',
    widthMul: 0.6,
    heightMul: 1.25,
    weight: 0.12,
    filled: true,
  },
  /** A wide open grin, filled. */
  grin: {
    label: 'Grin',
    widthMul: 1.2,
    heightMul: 1.15,
    weight: 0.1,
    filled: true,
  },
} as const;

export type MouthType = keyof typeof MOUTH_TYPES;

export interface MouthShape {
  label: string;
  widthMul: number;
  heightMul: number;
  weight: number;
  filled: boolean;
}

export function getMouthShape(type: MouthType): MouthShape {
  return MOUTH_TYPES[type];
}

export const MOUTH_TYPE_KEYS = Object.keys(MOUTH_TYPES) as MouthType[];
