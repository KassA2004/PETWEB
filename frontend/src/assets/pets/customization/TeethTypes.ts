/**
 * Teeth.
 *
 * The old teeth were two hard triangles dropped into the mouth, which is why
 * they read as clip art. Every tooth here is a dome — a rounded shape with a
 * flat root — and the whole set is described by numbers rather than by shapes,
 * so a snaggletooth and a neat little row run the same renderer.
 *
 * `protrude` is the interesting one: how far a tooth shows when the mouth is
 * *shut*. That is what makes fangs a permanent feature of a creature's face
 * rather than something you only see when it yawns.
 */

export interface TeethShape {
  label: string;
  hint: string;
  count: number;
  /** 0 = hanging from the upper lip, 1 = rising from the lower one. */
  lower: number;
  /** Tooth width, as a share of the mouth's half-width. */
  width: number;
  /** Tooth length, as a share of the mouth's open depth. */
  length: number;
  /** 0 = a squared-off block, 1 = a full dome. */
  round: number;
  /** How far across the mouth the set spreads, 0..1. */
  spread: number;
  /** Irregularity in size and height, 0..1. */
  jitter: number;
  /** How far a tooth shows when the mouth is closed, as a share of length. */
  protrude: number;
}

export const TEETH_TYPES = {
  none: {
    label: 'None',
    hint: 'No teeth at all',
    count: 0, lower: 0, width: 0, length: 0, round: 1, spread: 0, jitter: 0,
    protrude: 0,
  },

  /** One big front tooth. Instantly goofy. */
  one: {
    label: 'One tooth',
    hint: 'One big front tooth. Instantly goofy',
    count: 1, lower: 0, width: 0.4, length: 0.6, round: 0.9, spread: 0,
    jitter: 0, protrude: 0.85,
  },

  /** Two front teeth, side by side. The rabbit read. */
  two: {
    label: 'Two front',
    hint: 'Side by side. The rabbit read',
    count: 2, lower: 0, width: 0.34, length: 0.58, round: 0.85, spread: 0.3,
    jitter: 0, protrude: 0.8,
  },

  /** A neat row of small ones. */
  row: {
    label: 'Small row',
    hint: 'A neat little row',
    count: 5, lower: 0, width: 0.19, length: 0.36, round: 0.6, spread: 0.82,
    jitter: 0.05, protrude: 0.2,
  },

  /** Big and round, filling the mouth. */
  chunky: {
    label: 'Chunky',
    hint: 'Big and round, filling the mouth',
    count: 3, lower: 0, width: 0.38, length: 0.5, round: 1, spread: 0.6,
    jitter: 0.08, protrude: 0.35,
  },

  /** Two rounded canines, well apart. Not a threat, quite. */
  fangs: {
    label: 'Fangs',
    hint: 'Two rounded canines, well apart',
    count: 2, lower: 0, width: 0.22, length: 0.68, round: 0.5, spread: 0.72,
    jitter: 0, protrude: 1,
  },

  /** One tooth, off to the side, longer than it should be. */
  snaggle: {
    label: 'Snaggle',
    hint: 'One tooth, off to one side, too long',
    count: 1, lower: 0, width: 0.3, length: 0.78, round: 0.75, spread: 0.55,
    jitter: 0.6, protrude: 1,
  },

  /** Nothing lines up. Deeply wrong and very funny. */
  uneven: {
    label: 'Uneven',
    hint: 'Nothing lines up. Wrong, and funny',
    count: 4, lower: 0, width: 0.24, length: 0.5, round: 0.7, spread: 0.78,
    jitter: 1, protrude: 0.5,
  },

  /** Two from the bottom jaw. An underbite. */
  underbite: {
    label: 'Underbite',
    hint: 'Two from the bottom jaw',
    count: 2, lower: 1, width: 0.26, length: 0.5, round: 0.7, spread: 0.5,
    jitter: 0.1, protrude: 0.9,
  },

  /** A full set, top and bottom. Alarming at any size. */
  full: {
    label: 'Full set',
    hint: 'Top and bottom. Alarming at any size',
    count: 6, lower: 0.5, width: 0.22, length: 0.4, round: 0.5, spread: 0.72,
    jitter: 0.15, protrude: 0.25,
  },
} as const satisfies Record<string, TeethShape>;

export type TeethType = keyof typeof TEETH_TYPES;

export function getTeethShape(type: TeethType): TeethShape {
  return TEETH_TYPES[type] ?? TEETH_TYPES.none;
}

export const TEETH_TYPE_KEYS = Object.keys(TEETH_TYPES) as TeethType[];
