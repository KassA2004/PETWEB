/**
 * Eyes.
 *
 * Eyes decide what kind of creature this is more than any other feature, so
 * this is the largest library in the project. A dot-eyed blob and a
 * white-sclera'd, pinprick-pupilled version of the *same* blob are not two
 * shades of cute — they are a pet and a warning.
 *
 * Every preset is described by the same fields, and ../parts/Eye renders all of
 * them the same way:
 *
 *   outline    the eye's own shape. Everything is clipped to it, which is why
 *              a pupil can never escape and a lid always follows the eye.
 *   sclera     0 = a solid dark eye, 1 = a white with a pupil floating in it
 *   pupil      size, shape and resting offset. Off-centre is a personality.
 *   lids       resting coverage. The expression system moves them from here.
 *   tilt       rest rotation, outward positive. Inward reads angry, outward
 *              reads sad, before a single brow is drawn.
 *   asymmetry  how differently the two eyes are built. The derp dial.
 *
 * Eye *state* — blinking, squinting, widening, looking around — is animated on
 * top of all this by the expression system. Nothing here is a pose.
 */

/** The eye's outline. Each one is a genuinely different silhouette. */
export type EyeOutline =
  | 'round'
  | 'oval'
  | 'tall'
  | 'almond'
  | 'angular'
  | 'wedge'
  | 'half'
  | 'sliver'
  | 'square';

export type PupilShape = 'round' | 'vertical' | 'square' | 'slit';

export interface EyeShape {
  label: string;
  hint: string;
  outline: EyeOutline;
  widthMul: number;
  heightMul: number;

  /** 0 = solid dark eye, 1 = white sclera with a pupil in it. */
  sclera: number;
  /** Pupil size as a share of the eye's half-width. */
  pupilScale: number;
  pupilShape: PupilShape;
  /** Resting pupil offset, as a share of the eye's radius. Outward positive. */
  pupilX: number;
  pupilY: number;
  /** How far the pupil may travel when looking around, 0..1. */
  mobility: number;

  /** Coloured iris behind the pupil, 0 = none. */
  iris: number;
  /** Highlight dots. */
  glints: number;

  /** Resting upper-lid coverage, 0..1. */
  lidRest: number;
  /** Resting lower-lid coverage, 0..1. */
  lowerRest: number;

  /** Rest rotation, radians. Positive tilts the outer corner up. */
  tilt: number;
  /** Left/right difference, 0..1. */
  asymmetry: number;

  /** A drawn outline around the eye. Reads as makeup or as a hard stare. */
  rim: number;
  /** A lash line on the upper lid. */
  lashes: number;
}

export const EYE_TYPES = {
  // --- Basic ---------------------------------------------------------------

  /** The simple round dot. Reads at any size, on any creature. */
  dot: {
    label: 'Dot',
    hint: 'The simple one. Works on anything',
    outline: 'round',
    widthMul: 1, heightMul: 1,
    sclera: 0, pupilScale: 1, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.28,
    iris: 0, glints: 1,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0, rim: 0, lashes: 0,
  },

  /** Tall oval — wide awake. */
  bean: {
    label: 'Bean',
    hint: 'Tall oval. Wide awake',
    outline: 'tall',
    widthMul: 0.84, heightMul: 1.34,
    sclera: 0, pupilScale: 1, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.24,
    iris: 0, glints: 1,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0, rim: 0, lashes: 0,
  },

  /** Small and beady, set in a large face. Unsettling for free. */
  beady: {
    label: 'Beady',
    hint: 'Tiny and hard. Unsettling for free',
    outline: 'round',
    widthMul: 0.46, heightMul: 0.46,
    sclera: 0, pupilScale: 1, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.2,
    iris: 0, glints: 1,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0, rim: 0, lashes: 0,
  },

  /** Big and shiny with a coloured iris. The cutest option in the set. */
  sparkle: {
    label: 'Sparkle',
    hint: 'Big, shiny, coloured. Peak adorable',
    outline: 'round',
    widthMul: 1.3, heightMul: 1.34,
    sclera: 0, pupilScale: 1, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.26,
    iris: 0.64, glints: 3,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.04, rim: 0, lashes: 0,
  },

  /** Enormous with a huge iris — straight past cute into absurd. */
  saucer: {
    label: 'Saucer',
    hint: 'Enormous. Past cute into absurd',
    outline: 'round',
    widthMul: 1.72, heightMul: 1.68,
    sclera: 0, pupilScale: 1, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.3,
    iris: 0.72, glints: 3,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.05, rim: 0, lashes: 0,
  },

  /** Squared off. The odd one out, deliberately. */
  pixel: {
    label: 'Pixel',
    hint: 'Squared off. Deliberately wrong',
    outline: 'square',
    widthMul: 0.9, heightMul: 1.05,
    sclera: 0, pupilScale: 1, pupilShape: 'square', pupilX: 0, pupilY: 0,
    mobility: 0.22,
    iris: 0, glints: 0,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0, rim: 0, lashes: 0,
  },

  // --- White and pupil -----------------------------------------------------

  /** A proper eye: white, iris, pupil. The most human option, for better or worse. */
  pearl: {
    label: 'Pearl',
    hint: 'White, iris, pupil. The most human one',
    outline: 'oval',
    widthMul: 1.16, heightMul: 1.16,
    sclera: 1, pupilScale: 0.46, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.6,
    iris: 0.72, glints: 2,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.04, rim: 0.2, lashes: 0,
  },

  /** Enormous pupils in a small white. Trusting to the point of stupid. */
  button: {
    label: 'Button',
    hint: 'Huge pupils. Trusting to the point of stupid',
    outline: 'round',
    widthMul: 1.28, heightMul: 1.28,
    sclera: 1, pupilScale: 0.78, pupilShape: 'round', pupilX: 0, pupilY: 0.06,
    mobility: 0.3,
    iris: 0.4, glints: 2,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.06, rim: 0.15, lashes: 0,
  },

  /** Tiny dots in a wide white. Nothing behind them. */
  pinprick: {
    label: 'Pinprick',
    hint: 'Tiny dots in a lot of white. Nothing behind them',
    outline: 'round',
    widthMul: 1.24, heightMul: 1.24,
    sclera: 1, pupilScale: 0.2, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.7,
    iris: 0, glints: 0,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.08, rim: 0.25, lashes: 0,
  },

  /** Vertical slits. Reptile, goat, or something that hunts. */
  slit: {
    label: 'Slit',
    hint: 'Vertical pupils. Something that hunts',
    outline: 'oval',
    widthMul: 1.2, heightMul: 1.06,
    sclera: 1, pupilScale: 0.34, pupilShape: 'vertical', pupilX: 0, pupilY: 0,
    mobility: 0.5,
    iris: 0.5, glints: 1,
    lidRest: 0.1, lowerRest: 0, tilt: 0.06, asymmetry: 0, rim: 0.3, lashes: 0,
  },

  /** Pupils shoved off to one side. Permanently distracted. */
  wander: {
    label: 'Wander',
    hint: 'Pupils off to one side. Permanently distracted',
    outline: 'round',
    widthMul: 1.2, heightMul: 1.2,
    sclera: 1, pupilScale: 0.42, pupilShape: 'round', pupilX: 0.62, pupilY: -0.2,
    mobility: 0.6,
    iris: 0.35, glints: 1,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.35, rim: 0.2, lashes: 0,
  },

  /** Both pupils pointing at the nose. */
  crossed: {
    label: 'Cross-eyed',
    hint: 'Both pupils aimed at the nose',
    outline: 'round',
    widthMul: 1.22, heightMul: 1.22,
    sclera: 1, pupilScale: 0.4, pupilShape: 'round', pupilX: -0.75, pupilY: 0.1,
    mobility: 0.55,
    iris: 0.3, glints: 1,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.12, rim: 0.2, lashes: 0,
  },

  // --- Emotional shapes ----------------------------------------------------

  /** Heavy-lidded and dreamy. */
  sleepy: {
    label: 'Sleepy',
    hint: 'Heavy-lidded and dreamy',
    outline: 'half',
    widthMul: 1.14, heightMul: 0.92,
    sclera: 0, pupilScale: 1, pupilShape: 'round', pupilX: 0, pupilY: 0.1,
    mobility: 0.2,
    iris: 0, glints: 1,
    lidRest: 0.64, lowerRest: 0.06, tilt: 0, asymmetry: 0.05, rim: 0, lashes: 0.4,
  },

  /** Corners down and out. Sad before anything has happened. */
  droop: {
    label: 'Droopy',
    hint: 'Corners down and out. Sad at rest',
    outline: 'almond',
    widthMul: 1.16, heightMul: 1.02,
    sclera: 0.6, pupilScale: 0.5, pupilShape: 'round', pupilX: 0, pupilY: 0.26,
    mobility: 0.34,
    iris: 0.4, glints: 2,
    lidRest: 0.3, lowerRest: 0, tilt: -0.42, asymmetry: 0.06, rim: 0.2, lashes: 0.5,
  },

  /** Hard angles, inner corners down. Angry with no brows required. */
  sharp: {
    label: 'Sharp',
    hint: 'Angled inward. Angry with no brows needed',
    outline: 'angular',
    widthMul: 1.2, heightMul: 0.82,
    sclera: 0.8, pupilScale: 0.36, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0.4,
    iris: 0.45, glints: 1,
    lidRest: 0.3, lowerRest: 0.1, tilt: 0.34, asymmetry: 0, rim: 0.5, lashes: 0,
  },

  /** Narrowed to a suspicious line. */
  narrow: {
    label: 'Suspicious',
    hint: 'Narrowed to a line. Does not believe you',
    outline: 'sliver',
    widthMul: 1.28, heightMul: 0.5,
    sclera: 0.9, pupilScale: 0.5, pupilShape: 'round', pupilX: -0.2, pupilY: 0,
    mobility: 0.45,
    iris: 0.4, glints: 0,
    lidRest: 0.16, lowerRest: 0.08, tilt: 0.1, asymmetry: 0.05, rim: 0.45, lashes: 0,
  },

  /** Wide open, small pupils, too much white. Alarm. */
  shock: {
    label: 'Shocked',
    hint: 'Too much white. Permanent alarm',
    outline: 'round',
    widthMul: 1.44, heightMul: 1.5,
    sclera: 1, pupilScale: 0.26, pupilShape: 'round', pupilX: 0, pupilY: -0.06,
    mobility: 0.55,
    iris: 0.2, glints: 1,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.1, rim: 0.3, lashes: 0,
  },

  /** Flat, level, unimpressed. The stare that ends conversations. */
  deadpan: {
    label: 'Deadpan',
    hint: 'Level and unimpressed. Ends conversations',
    outline: 'wedge',
    widthMul: 1.26, heightMul: 0.66,
    sclera: 0.85, pupilScale: 0.34, pupilShape: 'round', pupilX: 0, pupilY: 0.04,
    mobility: 0.3,
    iris: 0, glints: 0,
    lidRest: 0.42, lowerRest: 0, tilt: 0, asymmetry: 0, rim: 0.4, lashes: 0,
  },

  // --- The strange end -----------------------------------------------------

  /** Two different eyes. Nothing else needed to make a creature funny. */
  derp: {
    label: 'Derp',
    hint: 'Two different eyes. Instantly funny',
    outline: 'round',
    widthMul: 1.26, heightMul: 1.26,
    sclera: 1, pupilScale: 0.38, pupilShape: 'round', pupilX: 0.2, pupilY: 0.1,
    mobility: 0.3,
    iris: 0.25, glints: 1,
    lidRest: 0.06, lowerRest: 0, tilt: 0, asymmetry: 0.85, rim: 0.2, lashes: 0,
  },

  /** Huge, rimmed, heavy-lashed and half shut. */
  emo: {
    label: 'Emo',
    hint: 'Rimmed, lashed, half shut. Very tired of this',
    outline: 'almond',
    widthMul: 1.34, heightMul: 1.1,
    sclera: 0.55, pupilScale: 0.44, pupilShape: 'round', pupilX: 0, pupilY: 0.12,
    mobility: 0.3,
    iris: 0.55, glints: 1,
    lidRest: 0.56, lowerRest: 0.05, tilt: -0.16, asymmetry: 0.05, rim: 0.85, lashes: 1,
  },

  /** Blank white. No pupil at all. */
  blank: {
    label: 'Blank',
    hint: 'No pupils. Nobody home',
    outline: 'oval',
    widthMul: 1.2, heightMul: 1.18,
    sclera: 1, pupilScale: 0, pupilShape: 'round', pupilX: 0, pupilY: 0,
    mobility: 0,
    iris: 0, glints: 0,
    lidRest: 0, lowerRest: 0, tilt: 0, asymmetry: 0.06, rim: 0.3, lashes: 0,
  },

  /** Enormous, uneven, pupils high and small. Something is very wrong. */
  manic: {
    label: 'Manic',
    hint: 'Uneven, pupils high and small. Something is wrong',
    outline: 'round',
    widthMul: 1.5, heightMul: 1.54,
    sclera: 1, pupilScale: 0.22, pupilShape: 'round', pupilX: 0.2, pupilY: -0.42,
    mobility: 0.7,
    iris: 0.15, glints: 0,
    lidRest: 0, lowerRest: 0, tilt: 0.08, asymmetry: 0.5, rim: 0.35, lashes: 0,
  },
} as const satisfies Record<string, EyeShape>;

export type EyeType = keyof typeof EYE_TYPES;

export function getEyeShape(type: EyeType): EyeShape {
  return EYE_TYPES[type] ?? EYE_TYPES.dot;
}

export const EYE_TYPE_KEYS = Object.keys(EYE_TYPES) as EyeType[];

/**
 * The per-side differences for an asymmetric pair.
 *
 * Both eyes run one renderer; these are the only differences, so "derp" and
 * "manic" cost a row of data rather than a second code path.
 */
export function eyeSideVariation(
  shape: EyeShape,
  side: 'left' | 'right',
): { scale: number; lid: number; pupilX: number; pupilY: number; tilt: number } {
  const a = shape.asymmetry;
  if (a <= 0) return { scale: 1, lid: 0, pupilX: 0, pupilY: 0, tilt: 0 };

  const sign = side === 'left' ? -1 : 1;

  return {
    scale: 1 + sign * a * 0.2,
    // One eye droops a little more than the other.
    lid: Math.max(0, sign) * a * 0.22,
    pupilX: -sign * a * 0.26,
    pupilY: sign * a * 0.18,
    tilt: sign * a * 0.1,
  };
}
