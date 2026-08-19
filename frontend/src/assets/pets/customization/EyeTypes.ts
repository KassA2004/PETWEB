/**
 * Eye variants.
 *
 * Every eye type builds the same internal structure (socket shading, iris,
 * pupil, highlights, lid) so blinking and looking work identically across all
 * of them (/Docs/pet-anatomy.md section 15).
 */

export const EYE_TYPES = {
  /** Default: large, slightly almond, very readable. */
  dew: {
    label: 'Dew',
    widthMul: 1,
    heightMul: 1,
    /** Iris size relative to the eye. */
    irisScale: 0.78,
    /** Pupil size relative to the iris. */
    pupilScale: 0.52,
    /** Vertical squash of the lower lid — creates a friendly lower curve. */
    lowerLid: 0.12,
    /** Upper lid resting coverage, 0 = wide open, 1 = closed. */
    lidRest: 0.08,
    /** Number of specular highlights. */
    highlights: 2,
  },
  /** Perfectly round, very wide awake. */
  button: {
    label: 'Button',
    widthMul: 0.88,
    heightMul: 0.94,
    irisScale: 0.86,
    pupilScale: 0.62,
    lowerLid: 0.04,
    lidRest: 0,
    highlights: 2,
  },
  /** Heavy-lidded and dreamy. */
  sleepy: {
    label: 'Sleepy',
    widthMul: 1.08,
    heightMul: 0.78,
    irisScale: 0.72,
    pupilScale: 0.48,
    lowerLid: 0.2,
    lidRest: 0.34,
    highlights: 1,
  },
  /** Enormous — pushes the creature toward absurd. */
  saucer: {
    label: 'Saucer',
    widthMul: 1.3,
    heightMul: 1.28,
    irisScale: 0.82,
    pupilScale: 0.44,
    lowerLid: 0.08,
    lidRest: 0,
    highlights: 3,
  },
} as const;

export type EyeType = keyof typeof EYE_TYPES;

export interface EyeShape {
  label: string;
  widthMul: number;
  heightMul: number;
  irisScale: number;
  pupilScale: number;
  lowerLid: number;
  lidRest: number;
  highlights: number;
}

export function getEyeShape(type: EyeType): EyeShape {
  return EYE_TYPES[type];
}

export const EYE_TYPE_KEYS = Object.keys(EYE_TYPES) as EyeType[];
