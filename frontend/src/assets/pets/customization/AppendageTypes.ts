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
 */

// --- Ears -------------------------------------------------------------------

export const EAR_TYPES = {
  /** Long upright rabbit ears. */
  bunny: {
    label: 'Bunny',
    widthMul: 0.42,
    heightMul: 1.9,
    /** Rest angle outward from vertical, radians. */
    tilt: 0.14,
    /** How far the tip bends over. */
    droop: 0.1,
    /** Inner-ear shape coverage, 0 = none. */
    inner: 0.62,
    floppiness: 1.5,
    weight: 0.8,
    /** Drawn behind the body rather than on top of it. */
    behind: false,
  },
  none: {
    label: 'None',
    widthMul: 0, heightMul: 0, tilt: 0, droop: 0, inner: 0,
    floppiness: 0, weight: 1, behind: false,
  },
  /** Pointed cat/fox triangles. */
  cat: {
    label: 'Cat',
    widthMul: 0.78, heightMul: 0.78, tilt: 0.3, droop: 0, inner: 0.6,
    floppiness: 0.7, weight: 1, behind: false,
  },
  /** Big round bear/pig discs. */
  round: {
    label: 'Round',
    widthMul: 0.95, heightMul: 0.9, tilt: 0.5, droop: 0.04, inner: 0.58,
    floppiness: 0.8, weight: 1.1, behind: true,
  },
  /** Long and hanging down beside the cheeks. */
  floppy: {
    label: 'Floppy',
    widthMul: 0.72, heightMul: 1.35, tilt: 1.15, droop: 0.7, inner: 0.4,
    floppiness: 2, weight: 0.7, behind: true,
  },
  /** Thin stalks with a bobble — insects and antennae. */
  antenna: {
    label: 'Antennae',
    widthMul: 0.2, heightMul: 1.5, tilt: 0.36, droop: 0.28, inner: 0,
    floppiness: 2.4, weight: 0.5, behind: false,
  },
  /** Curved horns. Does not flop; it is bone. */
  horns: {
    label: 'Horns',
    widthMul: 0.4, heightMul: 1.05, tilt: 0.42, droop: 0, inner: 0,
    floppiness: 0.15, weight: 1.6, behind: false,
  },
  /** Side fins, low on the head. */
  fins: {
    label: 'Fins',
    widthMul: 1.05, heightMul: 0.55, tilt: 1.35, droop: 0, inner: 0.5,
    floppiness: 1.1, weight: 0.9, behind: true,
  },
} as const;

export type EarType = keyof typeof EAR_TYPES;

export interface EarShape {
  label: string;
  widthMul: number;
  heightMul: number;
  tilt: number;
  droop: number;
  inner: number;
  floppiness: number;
  weight: number;
  behind: boolean;
}

export function getEarShape(type: EarType): EarShape {
  return EAR_TYPES[type];
}

export const EAR_TYPE_KEYS = Object.keys(EAR_TYPES) as EarType[];

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
