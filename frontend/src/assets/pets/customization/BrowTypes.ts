/**
 * Brows.
 *
 * Brows are the single biggest lever on whether a creature reads as sweet or as
 * a problem, which is why they are a part rather than a detail. The *shape* is
 * chosen here; the *angle* is animated by the expression system, which rotates
 * and raises the joints every frame.
 *
 * Each type declares a resting tilt of its own, so a design can be permanently
 * cross or permanently worried before a single feeling arrives — and the
 * expression system still moves it from there.
 */

export type BrowKind = 'none' | 'arc' | 'wedge' | 'bar' | 'tuft' | 'dot';

export interface BrowShape {
  label: string;
  hint: string;
  kind: BrowKind;
  widthMul: number;
  /** Thickness as a share of the brow's width. */
  weight: number;
  /** How much the arc bows upward, 0..1. */
  arch: number;
  /** Rest rotation, radians. Positive drops the inner end — cross. */
  tilt: number;
  /** Extra vertical distance from the eye, as a share of brow width. */
  lift: number;
  /** Number of marks for tufted brows. */
  segments: number;
  /** Left/right difference, 0..1. */
  asymmetry: number;
}

export const BROW_TYPES = {
  none: {
    label: 'None',
    hint: 'No brows',
    kind: 'none',
    widthMul: 0, weight: 0, arch: 0, tilt: 0, lift: 0, segments: 0, asymmetry: 0,
  },

  /** A fine line. Barely there, and reads young. */
  thin: {
    label: 'Thin',
    hint: 'A fine line. Reads young',
    kind: 'arc',
    widthMul: 0.9, weight: 0.09, arch: 0.55, tilt: 0, lift: 0, segments: 0,
    asymmetry: 0,
  },

  /** A solid stroke with presence. */
  thick: {
    label: 'Thick',
    hint: 'Solid, with presence',
    kind: 'arc',
    widthMul: 1, weight: 0.2, arch: 0.35, tilt: 0, lift: 0, segments: 0,
    asymmetry: 0,
  },

  /** Small tufts rather than one line. Scruffy. */
  fuzzy: {
    label: 'Fuzzy',
    hint: 'Tufts rather than a line. Scruffy',
    kind: 'tuft',
    widthMul: 1.15, weight: 0.16, arch: 0.2, tilt: 0, lift: 0, segments: 4,
    asymmetry: 0.1,
  },

  /** Hard wedges, thick at the inner end. Instantly menacing. */
  angular: {
    label: 'Angular',
    hint: 'Hard wedges, heavy inner ends. Menacing',
    kind: 'wedge',
    widthMul: 1.05, weight: 0.24, arch: 0, tilt: 0.28, lift: 0, segments: 0,
    asymmetry: 0,
  },

  /** Straight bars, dead level. Bureaucratic. */
  flat: {
    label: 'Flat',
    hint: 'Dead level. Bureaucratic',
    kind: 'bar',
    widthMul: 1.05, weight: 0.15, arch: 0, tilt: 0, lift: 0.05, segments: 0,
    asymmetry: 0,
  },

  /** Steep arches, inner ends already up. Worried before anything happens. */
  worried: {
    label: 'Worried',
    hint: 'Inner ends already up. Anxious at rest',
    kind: 'arc',
    widthMul: 0.95, weight: 0.14, arch: 0.75, tilt: -0.34, lift: 0.08,
    segments: 0, asymmetry: 0.05,
  },

  /** Two small dots. Barely a brow, and very silly. */
  dots: {
    label: 'Dots',
    hint: 'Barely a brow. Very silly',
    kind: 'dot',
    widthMul: 0.5, weight: 0.4, arch: 0, tilt: 0, lift: 0.1, segments: 0,
    asymmetry: 0.15,
  },

  /** Heavy, low, and covering half the eye. */
  bushy: {
    label: 'Bushy',
    hint: 'Heavy and low, half over the eye',
    kind: 'tuft',
    widthMul: 1.2, weight: 0.3, arch: 0.15, tilt: 0.12, lift: -0.08,
    segments: 5, asymmetry: 0.12,
  },

  /** One up, one down. Permanently sceptical. */
  uneven: {
    label: 'Uneven',
    hint: 'One up, one down. Permanently sceptical',
    kind: 'arc',
    widthMul: 1, weight: 0.18, arch: 0.35, tilt: 0, lift: 0, segments: 0,
    asymmetry: 0.9,
  },
} as const satisfies Record<string, BrowShape>;

export type BrowType = keyof typeof BROW_TYPES;

export function getBrowShape(type: BrowType): BrowShape {
  return BROW_TYPES[type] ?? BROW_TYPES.none;
}

export const BROW_TYPE_KEYS = Object.keys(BROW_TYPES) as BrowType[];

/** The per-side differences for an uneven pair. */
export function browSideVariation(
  shape: BrowShape,
  side: 'left' | 'right',
): { tilt: number; lift: number } {
  const a = shape.asymmetry;
  if (a <= 0) return { tilt: 0, lift: 0 };

  const sign = side === 'left' ? -1 : 1;
  return { tilt: sign * a * 0.32, lift: sign * a * 0.18 };
}
