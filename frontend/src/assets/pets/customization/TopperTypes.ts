/**
 * Toppers — the one thing that sits on top of the blob.
 *
 * The blob has no ears and no tail, so the topper carries all of the
 * silhouette variety the creature has: it is what makes a pink blob with a
 * sprout read as a different creature from a pink blob with an antenna.
 *
 * Toppers attach to a single anchor at the crown and rotate around their base,
 * which is what lets the wobble module drag them a frame behind the body.
 */

export const TOPPER_TYPES = {
  /** Default: a stack of soft puffs, like a little cloud or a brain. */
  puff: {
    label: 'Puff',
    widthMul: 1,
    heightMul: 1,
    /** How far the topper lags behind the body when it wobbles. */
    floppiness: 0.9,
  },
  /** Nothing at all — a perfectly bald blob. */
  none: {
    label: 'None',
    widthMul: 0,
    heightMul: 0,
    floppiness: 0,
  },
  /** A stem with a single leaf. */
  sprout: {
    label: 'Sprout',
    widthMul: 0.8,
    heightMul: 1.15,
    floppiness: 1.4,
  },
  /** A thin stalk with a ball on the end. */
  antenna: {
    label: 'Antenna',
    widthMul: 0.5,
    heightMul: 1.7,
    floppiness: 1.8,
  },
  /** A single fat curl. */
  swirl: {
    label: 'Swirl',
    widthMul: 0.7,
    heightMul: 0.85,
    floppiness: 1.1,
  },
} as const;

export type TopperType = keyof typeof TOPPER_TYPES;

export interface TopperShape {
  label: string;
  widthMul: number;
  heightMul: number;
  floppiness: number;
}

export function getTopperShape(type: TopperType): TopperShape {
  return TOPPER_TYPES[type];
}

export const TOPPER_TYPE_KEYS = Object.keys(TOPPER_TYPES) as TopperType[];
