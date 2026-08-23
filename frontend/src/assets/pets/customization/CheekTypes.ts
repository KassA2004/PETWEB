/**
 * Cheeks.
 *
 * Deliberately the smallest system in the face. Cheeks are one flat shape that
 * says "this creature has blood in it"; over-render them and the whole face
 * turns into a doll. Strength is animated by the expression system — joy and
 * love push them up, fear drains them — while the *shape* is chosen here.
 */

export type CheekKind = 'none' | 'round' | 'oval' | 'dots' | 'streak';

export interface CheekShape {
  label: string;
  hint: string;
  kind: CheekKind;
  /** Radius as a share of the eye's width. */
  scale: number;
  /** Baseline opacity multiplier. */
  strength: number;
}

export const CHEEK_TYPES = {
  none: { label: 'None', hint: 'No blush', kind: 'none', scale: 0, strength: 0 },
  round: {
    label: 'Round',
    hint: 'Two soft circles. The default',
    kind: 'round',
    scale: 0.62,
    strength: 1,
  },
  soft: {
    label: 'Soft',
    hint: 'Wide and faint',
    kind: 'oval',
    scale: 0.9,
    strength: 0.7,
  },
  bold: {
    label: 'Bold',
    hint: 'Large and obvious. Doll-like on purpose',
    kind: 'round',
    scale: 1.05,
    strength: 1.3,
  },
  freckles: {
    label: 'Freckles',
    hint: 'Small dots instead of a patch',
    kind: 'dots',
    scale: 0.6,
    strength: 1.1,
  },
  streaks: {
    label: 'Streaks',
    hint: 'Two diagonal marks. Not blush at all',
    kind: 'streak',
    scale: 0.8,
    strength: 1.1,
  },
} as const satisfies Record<string, CheekShape>;

export type CheekType = keyof typeof CHEEK_TYPES;

export function getCheekShape(type: CheekType): CheekShape {
  return CHEEK_TYPES[type] ?? CHEEK_TYPES.round;
}

export const CHEEK_TYPE_KEYS = Object.keys(CHEEK_TYPES) as CheekType[];
