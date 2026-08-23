/**
 * Ears — and horns, antennae and fins, which are ears as far as the rig is
 * concerned: one shape on one joint at the top of the mass.
 *
 * Ears carry more identity than any other part. A pink blob with long ears is a
 * rabbit; the same blob with round discs is a pig. So the library invests here.
 *
 * Every type is described the same way, and the descriptions genuinely differ
 * rather than being one primitive at different sizes:
 *
 *   kind      ribbon (a spine with a width along it), disc, or fin
 *   base/tip  half-widths at each end — a taper, a stalk or a wedge
 *   belly     bulge or pinch through the middle
 *   bend      how far the tip leans outward
 *   droop     how far it folds over
 *
 * `baseSink` is what stops an ear from reading as a rod stuck on top: the shape
 * starts *below* its own joint, inside the body, so the silhouette is continuous
 * where the two meet. ../parts/Ear caps that seam with the coat colour for ears
 * that draw in front of the mass.
 */

export type EarKind = 'none' | 'ribbon' | 'disc' | 'fin';

export interface EarShape {
  label: string;
  hint: string;
  kind: EarKind;
  widthMul: number;
  heightMul: number;

  /** Half-width at the root, as a share of the ear's half-width. */
  base: number;
  /** Half-width at the tip. Near 0 gives a point. */
  tip: number;
  /** Added through the middle. Positive bulges, negative pinches. */
  belly: number;
  /** Total turn from base to tip, in radians. Positive turns outward. */
  bend: number;
  /** How far the tip folds over, 0..1. A full droop is another ~140 degrees. */
  droop: number;
  /** How far the shape continues below the joint, as a share of ear height. */
  baseSink: number;
  /** 1 = fully rounded outline, lower = straighter edges. */
  tension: number;

  /** Rest angle outward from vertical, radians. */
  tilt: number;
  /** Inner-ear shape coverage, 0 = none. */
  inner: number;
  /**
   * Left/right difference, 0..1. The lopsided pair is the whole reason this
   * exists — one ear up and one folded is a personality, not a defect.
   */
  asymmetry: number;

  floppiness: number;
  weight: number;
  /** Drawn behind the mass rather than on top of it. */
  behind: boolean;
}

export const EAR_TYPES = {
  /** Long upright rabbit ears: a real taper, a bulge low down, a bent tip. */
  bunny: {
    label: 'Bunny',
    hint: 'Long, tapered, tips bent outward',
    kind: 'ribbon',
    widthMul: 0.46,
    heightMul: 1.95,
    base: 0.72,
    tip: 0.3,
    belly: 0.3,
    bend: 0.16,
    droop: 0.08,
    baseSink: 0.16,
    tension: 1,
    tilt: 0.12,
    inner: 0.6,
    asymmetry: 0.05,
    floppiness: 1.5,
    weight: 0.8,
    behind: false,
  },

  none: {
    label: 'None',
    hint: 'No ears at all',
    kind: 'none',
    widthMul: 0, heightMul: 0, base: 0, tip: 0, belly: 0, bend: 0, droop: 0,
    baseSink: 0, tension: 1, tilt: 0, inner: 0, asymmetry: 0,
    floppiness: 0, weight: 1, behind: false,
  },

  /** Small rounded ears, barely clearing the head. */
  nubs: {
    label: 'Small round',
    hint: 'Barely clear the head',
    kind: 'disc',
    widthMul: 0.62,
    heightMul: 0.5,
    base: 0.9, tip: 0.9, belly: 0, bend: 0, droop: 0,
    baseSink: 0.4,
    tension: 1,
    tilt: 0.45,
    inner: 0.5,
    asymmetry: 0.06,
    floppiness: 0.6,
    weight: 1.2,
    behind: true,
  },

  /** Big round bear discs. */
  round: {
    label: 'Big round',
    hint: 'Bear discs. Reads friendly',
    kind: 'disc',
    widthMul: 1.05,
    heightMul: 0.98,
    base: 1, tip: 1, belly: 0, bend: 0, droop: 0.04,
    baseSink: 0.3,
    tension: 1,
    tilt: 0.5,
    inner: 0.58,
    asymmetry: 0.08,
    floppiness: 0.8,
    weight: 1.1,
    behind: true,
  },

  /** Pointed cat triangles, with straight edges. */
  cat: {
    label: 'Pointed',
    hint: 'Straight-edged triangles',
    kind: 'ribbon',
    widthMul: 0.9,
    heightMul: 0.86,
    base: 1,
    tip: 0.06,
    belly: -0.08,
    bend: 0.1,
    droop: 0,
    baseSink: 0.22,
    tension: 0.45,
    tilt: 0.3,
    inner: 0.6,
    asymmetry: 0.06,
    floppiness: 0.7,
    weight: 1,
    behind: false,
  },

  /** Tall thin spikes. Alert to the point of alarming. */
  spikes: {
    label: 'Spikes',
    hint: 'Tall and thin. Permanently alert',
    kind: 'ribbon',
    widthMul: 0.5,
    heightMul: 1.55,
    base: 1,
    tip: 0.04,
    belly: -0.1,
    bend: 0.06,
    droop: 0,
    baseSink: 0.16,
    tension: 0.5,
    tilt: 0.22,
    inner: 0.34,
    asymmetry: 0.05,
    floppiness: 0.9,
    weight: 0.9,
    behind: false,
  },

  /** Broad and short, sticking out sideways. */
  wide: {
    label: 'Wide',
    hint: 'Broad and short, sticking out',
    kind: 'ribbon',
    widthMul: 1.4,
    heightMul: 1,
    base: 0.72,
    tip: 0.46,
    belly: 0.35,
    bend: 0.3,
    droop: 0.05,
    baseSink: 0.3,
    tension: 1,
    tilt: 1.32,
    inner: 0.55,
    asymmetry: 0.1,
    floppiness: 1.2,
    weight: 0.9,
    behind: true,
  },

  /** Long and hanging down beside the cheeks. */
  floppy: {
    label: 'Floppy',
    hint: 'Hang down past the cheeks',
    kind: 'ribbon',
    widthMul: 0.86,
    heightMul: 1.85,
    base: 0.68,
    tip: 0.5,
    belly: 0.26,
    // Already hanging at the base (tilt), then curling gently outward.
    bend: 0.28,
    droop: 0.1,
    baseSink: 0.24,
    tension: 1,
    tilt: 2.25,
    inner: 0.4,
    asymmetry: 0.12,
    floppiness: 2,
    weight: 0.7,
    // In front of the mass: a lop ear hangs *over* the head, and behind it the
    // body simply swallows the whole thing.
    behind: false,
  },

  /** Upright to halfway, then folded over. The sad-dog ear. */
  drooping: {
    label: 'Drooping',
    hint: 'Upright, then folded over. Reads tired',
    kind: 'ribbon',
    widthMul: 0.68,
    heightMul: 1.4,
    base: 0.8,
    tip: 0.3,
    belly: 0.18,
    bend: 0.25,
    droop: 0.5,
    baseSink: 0.18,
    tension: 1,
    tilt: 0.28,
    inner: 0.45,
    asymmetry: 0.14,
    floppiness: 1.7,
    weight: 0.75,
    behind: false,
  },

  /** One up, one folded. Nobody designed this on purpose, which is the point. */
  lopsided: {
    label: 'Lopsided',
    hint: 'One up, one folded. Derpy by construction',
    kind: 'ribbon',
    widthMul: 0.6,
    heightMul: 1.5,
    base: 0.78,
    tip: 0.32,
    belly: 0.22,
    bend: 0.22,
    droop: 0.16,
    baseSink: 0.18,
    tension: 1,
    tilt: 0.24,
    inner: 0.5,
    asymmetry: 0.85,
    floppiness: 1.8,
    weight: 0.7,
    behind: false,
  },

  /** Thin stalks with a bobble. */
  antenna: {
    label: 'Antennae',
    hint: 'Thin stalks with a bobble',
    kind: 'ribbon',
    widthMul: 0.22,
    heightMul: 1.55,
    base: 0.6,
    tip: 0.34,
    belly: 0,
    bend: 0.22,
    droop: 0.2,
    baseSink: 0.12,
    tension: 1,
    tilt: 0.36,
    inner: 0,
    asymmetry: 0.2,
    floppiness: 2.4,
    weight: 0.5,
    behind: false,
  },

  /** Curved horns. Does not flop; it is bone. */
  horns: {
    label: 'Horns',
    hint: 'Bone. Does not flop',
    kind: 'ribbon',
    widthMul: 0.46,
    heightMul: 1.1,
    base: 1,
    tip: 0.1,
    belly: -0.05,
    bend: 0.38,
    droop: 0,
    baseSink: 0.2,
    tension: 0.85,
    tilt: 0.5,
    inner: 0,
    asymmetry: 0.06,
    floppiness: 0.15,
    weight: 1.6,
    behind: false,
  },

  /** Side fins, low on the head. */
  fins: {
    label: 'Fins',
    hint: 'Low side fins',
    kind: 'fin',
    widthMul: 1.35,
    heightMul: 0.85,
    base: 1, tip: 0.4, belly: 0, bend: 0, droop: 0,
    baseSink: 0.3,
    tension: 0.8,
    tilt: 0.12,
    inner: 0.5,
    asymmetry: 0.08,
    floppiness: 1.1,
    weight: 0.9,
    behind: true,
  },
} as const satisfies Record<string, EarShape>;

export type EarType = keyof typeof EAR_TYPES;

export function getEarShape(type: EarType): EarShape {
  return EAR_TYPES[type] ?? EAR_TYPES.none;
}

export const EAR_TYPE_KEYS = Object.keys(EAR_TYPES) as EarType[];

/**
 * The per-side multipliers an asymmetric pair uses.
 *
 * Both ears run the same renderer; these numbers are the only difference, which
 * keeps "lopsided" from needing a second code path.
 */
export function earSideVariation(
  shape: EarShape,
  side: 'left' | 'right',
): { scale: number; droop: number; tilt: number } {
  const a = shape.asymmetry;
  if (a <= 0) return { scale: 1, droop: 0, tilt: 0 };

  const sign = side === 'left' ? -1 : 1;

  return {
    scale: 1 + sign * a * 0.16,
    // The left ear is the one that gives up.
    droop: sign < 0 ? a * 0.55 : a * 0.05,
    tilt: sign * a * 0.28,
  };
}
