/**
 * Eye variants.
 *
 * Eyes are flat dark shapes with a highlight dot — no iris, no socket shading.
 * Every type builds the same structure (a movable dark shape plus a lid), so
 * blinking and looking work identically across all of them
 * (/Docs/pet-anatomy.md section 15).
 */

export const EYE_TYPES = {
  /** Default: the simple round dot. Reads at any size. */
  dot: {
    label: 'Dot',
    widthMul: 1,
    heightMul: 1,
    /** 0 = nearly a box, 1 = a plain ellipse. */
    roundness: 1,
    /** Number of white highlight dots. */
    glints: 1,
    /** Resting lid coverage, 0 = wide open, 1 = shut. */
    lidRest: 0,
  },
  /** Tall oval — wide awake and slightly startled. */
  bean: {
    label: 'Bean',
    widthMul: 0.82,
    heightMul: 1.36,
    roundness: 1,
    glints: 1,
    lidRest: 0,
  },
  /** Big and shiny, two highlights. The most cartoonish option. */
  sparkle: {
    label: 'Sparkle',
    widthMul: 1.34,
    heightMul: 1.34,
    roundness: 1,
    glints: 2,
    lidRest: 0,
  },
  /** Heavy-lidded and dreamy. */
  sleepy: {
    label: 'Sleepy',
    widthMul: 1.12,
    heightMul: 0.92,
    roundness: 1,
    glints: 1,
    lidRest: 0.42,
  },
  /** Squared-off pixels — the odd one out, deliberately. */
  pixel: {
    label: 'Pixel',
    widthMul: 0.9,
    heightMul: 1.05,
    roundness: 0.1,
    glints: 0,
    lidRest: 0,
  },
} as const;

export type EyeType = keyof typeof EYE_TYPES;

export interface EyeShape {
  label: string;
  widthMul: number;
  heightMul: number;
  roundness: number;
  glints: number;
  lidRest: number;
}

export function getEyeShape(type: EyeType): EyeShape {
  return EYE_TYPES[type];
}

export const EYE_TYPE_KEYS = Object.keys(EYE_TYPES) as EyeType[];
