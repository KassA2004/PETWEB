/**
 * Face features: eyes, brows and snouts.
 *
 * Note what is NOT here: mouth shapes. The mouth is drawn every frame from the
 * creature's current expression, not chosen from a list — picking "grin" from a
 * menu and then watching it stay grinning while the creature is terrified is
 * exactly what makes a pet feel dead. The only mouth choices a user makes are
 * cosmetic (size, line weight, fangs) plus a resting-mood bias, which is
 * personality rather than a pose (/Docs/animation-approach.md §55).
 *
 * Eyes and brows are the other half of every expression, so their *styles* live
 * here while their *state* is animated.
 */

// --- Eyes -------------------------------------------------------------------

export const EYE_TYPES = {
  /** The simple round dot. Reads at any size. */
  dot: {
    label: 'Dot',
    widthMul: 1,
    heightMul: 1,
    roundness: 1,
    glints: 1,
    /** Visible iris ring inside the pupil, 0 = solid dark. */
    iris: 0,
    /** Resting lid coverage. Expression moves this. */
    lidRest: 0,
  },
  /** Tall oval — wide awake. */
  bean: {
    label: 'Bean',
    widthMul: 0.84, heightMul: 1.34, roundness: 1, glints: 1, iris: 0, lidRest: 0,
  },
  /** Big and shiny with a coloured iris. The cutest option. */
  sparkle: {
    label: 'Sparkle',
    widthMul: 1.32, heightMul: 1.32, roundness: 1, glints: 2, iris: 0.62, lidRest: 0,
  },
  /** Heavy-lidded and dreamy. */
  sleepy: {
    label: 'Sleepy',
    widthMul: 1.1, heightMul: 0.9, roundness: 1, glints: 1, iris: 0, lidRest: 0.4,
  },
  /** Squared off. The odd one out, deliberately. */
  pixel: {
    label: 'Pixel',
    widthMul: 0.9, heightMul: 1.05, roundness: 0.1, glints: 0, iris: 0, lidRest: 0,
  },
  /** Small and beady, set in a large face. Unsettling. */
  beady: {
    label: 'Beady',
    widthMul: 0.5, heightMul: 0.5, roundness: 1, glints: 1, iris: 0, lidRest: 0,
  },
  /** Enormous with a huge iris — pushes straight past cute into absurd. */
  saucer: {
    label: 'Saucer',
    widthMul: 1.7, heightMul: 1.66, roundness: 1, glints: 3, iris: 0.7, lidRest: 0,
  },
} as const;

export type EyeType = keyof typeof EYE_TYPES;

export interface EyeShape {
  label: string;
  widthMul: number;
  heightMul: number;
  roundness: number;
  glints: number;
  iris: number;
  lidRest: number;
}

export function getEyeShape(type: EyeType): EyeShape {
  return EYE_TYPES[type];
}

export const EYE_TYPE_KEYS = Object.keys(EYE_TYPES) as EyeType[];

// --- Brows ------------------------------------------------------------------

/**
 * Brows are the single biggest lever on whether a creature reads as sweet or
 * as a threat, which is why they are a part rather than a detail. The shape is
 * chosen; the angle is animated by the expression system.
 */
export const BROW_TYPES = {
  none: { label: 'None', widthMul: 0, weight: 0, arch: 0, angular: 0 },
  thin: { label: 'Thin', widthMul: 0.9, weight: 0.1, arch: 0.5, angular: 0 },
  thick: { label: 'Thick', widthMul: 1, weight: 0.22, arch: 0.35, angular: 0 },
  fuzzy: { label: 'Fuzzy', widthMul: 1.1, weight: 0.34, arch: 0.2, angular: 0 },
  /** Straight, hard-edged wedges. Instantly menacing. */
  angular: { label: 'Angular', widthMul: 1.05, weight: 0.26, arch: 0, angular: 1 },
} as const;

export type BrowType = keyof typeof BROW_TYPES;

export interface BrowShape {
  label: string;
  widthMul: number;
  weight: number;
  arch: number;
  angular: number;
}

export function getBrowShape(type: BrowType): BrowShape {
  return BROW_TYPES[type];
}

export const BROW_TYPE_KEYS = Object.keys(BROW_TYPES) as BrowType[];

// --- Snouts -----------------------------------------------------------------

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
  return SNOUT_TYPES[type];
}

export const SNOUT_TYPE_KEYS = Object.keys(SNOUT_TYPES) as SnoutType[];
