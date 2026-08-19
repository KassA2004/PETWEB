/**
 * Ear variants.
 *
 * Ears attach to fixed anchors on the head and rotate around their base, so any
 * ear shape works with the ear motion in the animation layer
 * (/Docs/pet-anatomy.md section 17).
 */

export const EAR_TYPES = {
  /** Default: tall leaf shape with a soft droop near the tip. */
  leaf: {
    label: 'Leaf',
    widthMul: 1,
    heightMul: 1,
    /** Sideways lean of the tip, in radians, before animation. */
    tipLean: 0.22,
    /** How far the tip curls over. 0 = straight, 1 = fully flopped. */
    droop: 0.28,
    /** Inner ear coverage, 0..1. */
    innerScale: 0.62,
    /** Fur tuft at the base of the ear. */
    baseTuft: 1,
  },
  /** Small and rounded. */
  pebble: {
    label: 'Pebble',
    widthMul: 1.06,
    heightMul: 0.52,
    tipLean: 0.1,
    droop: 0.1,
    innerScale: 0.68,
    baseTuft: 1.2,
  },
  /** Long and fully floppy, hanging beside the cheeks. */
  flop: {
    label: 'Flop',
    widthMul: 1.12,
    heightMul: 1.24,
    tipLean: 0.5,
    droop: 0.85,
    innerScale: 0.5,
    baseTuft: 0.7,
  },
  /** Absurdly tall antenna ears — the "ridiculous" end of the range. */
  antenna: {
    label: 'Antenna',
    widthMul: 0.58,
    heightMul: 1.85,
    tipLean: 0.34,
    droop: 0.14,
    innerScale: 0.42,
    baseTuft: 0.5,
  },
} as const;

export type EarType = keyof typeof EAR_TYPES;

export interface EarShape {
  label: string;
  widthMul: number;
  heightMul: number;
  tipLean: number;
  droop: number;
  innerScale: number;
  baseTuft: number;
}

export function getEarShape(type: EarType): EarShape {
  return EAR_TYPES[type];
}

export const EAR_TYPE_KEYS = Object.keys(EAR_TYPES) as EarType[];
