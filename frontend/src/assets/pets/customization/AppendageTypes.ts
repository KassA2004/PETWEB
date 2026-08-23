/**
 * Appendages: ears, wings and tails.
 *
 * These carry almost all of a creature's identity. A pink blob with long ears
 * is a rabbit; the same blob with round ears and a curl is a pig; with wings
 * and antennae it is a bee. Nothing about the body changed.
 *
 * They are also where the animation lives. Every appendage hangs off a joint
 * with a spring, so shaking, falling and running produce flapping and trailing
 * for free — the body itself barely has to deform (/Docs/animation-approach.md
 * §52).
 *
 * `floppiness` scales how far a part lags behind the body. `weight` scales how
 * long it keeps moving afterwards.
 *
 * Ears used to live here too. They grew into the largest identity library in
 * the project and moved to ./EarTypes; they are re-exported at the bottom so
 * "appendages" still means all three.
 */

// --- Wings ------------------------------------------------------------------

export const WING_TYPES = {
  none: {
    label: 'None',
    widthMul: 0, heightMul: 0, tilt: 0, alpha: 1, veins: 0,
    flutter: 0, floppiness: 0,
  },
  /** Rounded translucent bee wings. Flutter fast. */
  bee: {
    label: 'Bee',
    widthMul: 1, heightMul: 0.62, tilt: -0.5, alpha: 0.72, veins: 2,
    /** Cycles per second of idle flutter. 0 = still. */
    flutter: 7,
    floppiness: 1.4,
  },
  /** Two big paired panels. */
  butterfly: {
    label: 'Butterfly',
    widthMul: 1.15, heightMul: 1.1, tilt: -0.28, alpha: 0.9, veins: 0,
    flutter: 1.6,
    floppiness: 1.1,
  },
  /** Feathered, opaque, slow. */
  bird: {
    label: 'Bird',
    widthMul: 1.05, heightMul: 0.8, tilt: -0.16, alpha: 1, veins: 3,
    flutter: 0.9,
    floppiness: 0.8,
  },
  /** Scalloped bat membrane. */
  bat: {
    label: 'Bat',
    widthMul: 1.1, heightMul: 0.72, tilt: -0.2, alpha: 0.95, veins: 3,
    flutter: 1.2,
    floppiness: 1.2,
  },
  /** Comically undersized. Cannot possibly work. */
  tiny: {
    label: 'Tiny',
    widthMul: 0.42, heightMul: 0.36, tilt: -0.6, alpha: 0.8, veins: 1,
    flutter: 11,
    floppiness: 1.8,
  },
} as const;

export type WingType = keyof typeof WING_TYPES;

export interface WingShape {
  label: string;
  widthMul: number;
  heightMul: number;
  tilt: number;
  alpha: number;
  veins: number;
  flutter: number;
  floppiness: number;
}

export function getWingShape(type: WingType): WingShape {
  return WING_TYPES[type];
}

export const WING_TYPE_KEYS = Object.keys(WING_TYPES) as WingType[];

// --- Tails ------------------------------------------------------------------

export const TAIL_TYPES = {
  none: {
    label: 'None',
    widthMul: 0, heightMul: 0, curl: 0, segments: 0, tuft: 0,
    floppiness: 0, weight: 1,
  },
  /** A cotton ball. */
  puff: {
    label: 'Puff',
    widthMul: 0.62, heightMul: 0.62, curl: 0, segments: 0, tuft: 1,
    floppiness: 0.7, weight: 1,
  },
  /** The pig's corkscrew. */
  curl: {
    label: 'Curl',
    widthMul: 0.5, heightMul: 0.5, curl: 1, segments: 0, tuft: 0,
    floppiness: 0.9, weight: 0.8,
  },
  /** A long jointed cat tail that sways down its length. */
  long: {
    label: 'Long',
    widthMul: 0.34, heightMul: 1.5, curl: 0.4, segments: 6, tuft: 0.3,
    floppiness: 1.6, weight: 0.6,
  },
  /** Bee. Pointy. */
  stinger: {
    label: 'Stinger',
    widthMul: 0.42, heightMul: 0.66, curl: 0, segments: 0, tuft: 0,
    floppiness: 0.4, weight: 1.4,
  },
  /** Enormous plume, bigger than the creature. */
  fluffy: {
    label: 'Fluffy',
    widthMul: 1.05, heightMul: 1.15, curl: 0.5, segments: 3, tuft: 1.6,
    floppiness: 1.1, weight: 0.9,
  },
} as const;

export type TailType = keyof typeof TAIL_TYPES;

export interface TailShape {
  label: string;
  widthMul: number;
  heightMul: number;
  curl: number;
  segments: number;
  tuft: number;
  floppiness: number;
  weight: number;
}

export function getTailShape(type: TailType): TailShape {
  return TAIL_TYPES[type];
}

export const TAIL_TYPE_KEYS = Object.keys(TAIL_TYPES) as TailType[];

/* Ears are their own system now — see ./EarTypes. */
export {
  EAR_TYPES,
  EAR_TYPE_KEYS,
  earSideVariation,
  getEarShape,
} from './EarTypes';
export type { EarKind, EarShape, EarType } from './EarTypes';
