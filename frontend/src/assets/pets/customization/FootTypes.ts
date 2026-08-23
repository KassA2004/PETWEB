/**
 * Feet.
 *
 * Feet are not appendages. They never move on their own — a legless creature
 * with animated legs looks like a puppet — so they exist to say which way is
 * down and to give the bottom of the silhouette some weight.
 *
 * The old system had one foot shape and changed its width and height. That is
 * exactly why they read as pasted on: a hoof and a paw are not the same pad at
 * two sizes. Each type here names a `kind`, and ../parts/Foot draws a genuinely
 * different outline for each one.
 *
 * `sink` is the important number. It is how far the top of the foot is buried
 * inside the body silhouette, as a share of the foot's own height. Feet are
 * drawn behind the mass, so a high sink means the body swallows the seam and
 * the foot grows out of the creature instead of touching it.
 */

export type FootKind =
  | 'none'
  | 'nub'
  | 'paw'
  | 'hoof'
  | 'talon'
  | 'flipper'
  | 'boot';

export interface FootShape {
  label: string;
  hint: string;
  kind: FootKind;
  widthMul: number;
  heightMul: number;
  /** How many feet across the bottom of the body. */
  count: number;
  /** Toe divisions cut into the outline, 0 for a smooth pad. */
  toes: number;
  /** 0..1 — how much of the foot hides inside the mass. */
  sink: number;
  /** How far apart the feet sit, scaling the body type's own stance. */
  spread: number;
}

export const FOOT_TYPES = {
  /** Two soft pads. The default, and the one that survives any body. */
  nubs: {
    label: 'Nubs',
    hint: 'Two soft pads',
    kind: 'nub',
    widthMul: 1.05,
    heightMul: 1.1,
    count: 2,
    toes: 0,
    sink: 0.44,
    spread: 1,
  },

  none: {
    label: 'None',
    hint: 'Sits directly on the floor',
    kind: 'none',
    widthMul: 0,
    heightMul: 0,
    count: 0,
    toes: 0,
    sink: 0,
    spread: 1,
  },

  /** Wide, with real toe bumps cut into the front edge. */
  paws: {
    label: 'Paws',
    hint: 'Wide, with toe bumps',
    kind: 'paw',
    widthMul: 1.2,
    heightMul: 1.12,
    count: 2,
    toes: 3,
    sink: 0.42,
    spread: 1,
  },

  /** Narrow, tall, flat-bottomed, with a cleft. Reads as a hard surface. */
  hooves: {
    label: 'Hooves',
    hint: 'Narrow and hard, with a cleft',
    kind: 'hoof',
    widthMul: 0.8,
    heightMul: 1.3,
    count: 2,
    toes: 1,
    sink: 0.34,
    spread: 0.92,
  },

  /** Three splayed toes. The only foot that makes a creature look predatory. */
  talons: {
    label: 'Talons',
    hint: 'Three splayed toes. Predatory',
    kind: 'talon',
    widthMul: 0.98,
    heightMul: 0.95,
    count: 2,
    toes: 3,
    sink: 0.34,
    spread: 1.08,
  },

  /** Broad and flat, sticking out sideways. Comic. */
  flippers: {
    label: 'Flippers',
    hint: 'Broad and flat. Comic',
    kind: 'flipper',
    widthMul: 1.32,
    heightMul: 0.78,
    count: 2,
    toes: 0,
    sink: 0.28,
    spread: 1.1,
  },

  /** Chunky with an ankle, like a boot. Grounds a tall body. */
  boots: {
    label: 'Boots',
    hint: 'Chunky, with an ankle',
    kind: 'boot',
    widthMul: 1.05,
    heightMul: 1.5,
    count: 2,
    toes: 0,
    sink: 0.24,
    spread: 0.95,
  },

  /** Four small feet, for the long-bodied ones. */
  quad: {
    label: 'Four',
    hint: 'Four small ones, for long bodies',
    kind: 'nub',
    widthMul: 0.82,
    heightMul: 1.05,
    count: 4,
    toes: 0,
    sink: 0.44,
    spread: 1.12,
  },
} as const satisfies Record<string, FootShape>;

export type FootType = keyof typeof FOOT_TYPES;

export function getFootShape(type: FootType): FootShape {
  return FOOT_TYPES[type] ?? FOOT_TYPES.nubs;
}

export const FOOT_TYPE_KEYS = Object.keys(FOOT_TYPES) as FootType[];
