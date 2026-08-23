/**
 * Expressions.
 *
 * An expression is twelve numbers, not a picture. Every one of them is
 * continuous, so a creature can be four-fifths of the way from delighted to
 * alarmed and look exactly like that — which is what being alive looks like,
 * and what a menu of faces can never do (/Docs/animation-approach.md §27).
 *
 * These numbers are **modifiers**, not a face. They are applied on top of the
 * design the user chose: the mouth type decides how far a curve bends it, the
 * eye preset decides where its lids start from, the brow type decides what
 * angle means. A `:3` mouth and a jagged mouth handed the same `mouthCurve: -1`
 * both read as miserable and still look nothing like each other. That is the
 * character-versus-expression contract, and it lives here and in
 * /src/assets/pets/parts/Mouth.ts.
 *
 * Emotions here are *targets*. The driver eases toward them, so feelings arrive
 * and fade instead of switching.
 */

export type Emotion =
  | 'neutral'
  | 'joy'
  | 'excited'
  | 'sad'
  | 'disappointed'
  | 'anger'
  | 'frustrated'
  | 'fear'
  | 'surprise'
  | 'confused'
  | 'curious'
  | 'playful'
  | 'sleepy'
  | 'tired'
  | 'relaxed'
  | 'embarrassed'
  | 'love'
  | 'dizzy'
  | 'smug';

export interface FaceParams {
  /** -1 miserable .. +1 delighted. The mouth design decides how far it bends. */
  mouthCurve: number;
  /** 0 shut .. 1 yelling. */
  mouthOpen: number;
  /** Multiplier on the mouth's authored width. */
  mouthWidth: number;
  /** -1 .. 1 sideways pull. Smirks, chewing, uncertainty. */
  mouthTwist: number;
  /** 1 fully open, 0 shut. Layered over the eye preset's own resting lid. */
  eyeOpen: number;
  /** Lower lid rising — the happy squint. */
  eyeSquint: number;
  /** Extra eye scale. Fear and surprise blow the eyes up. */
  eyeWide: number;
  /** Extra eye rotation, radians. Positive lifts the outer corner: angry. */
  eyeTilt: number;
  /** -1 inner ends down (angry) .. +1 inner ends up (worried, sad). */
  browInner: number;
  /** Both brows lifted. */
  browRaise: number;
  /** Multiplier on the creature's own blush. */
  blush: number;
  /** Pupil scale. Small pupils read cold, large read soft. */
  pupil: number;
}

const BASE: FaceParams = {
  mouthCurve: 0,
  mouthOpen: 0,
  mouthWidth: 1,
  mouthTwist: 0,
  eyeOpen: 1,
  eyeSquint: 0,
  eyeWide: 1,
  eyeTilt: 0,
  browInner: 0,
  browRaise: 0,
  blush: 1,
  pupil: 1,
};

export const EXPRESSIONS: Record<Emotion, FaceParams> = {
  neutral: { ...BASE },

  joy: {
    ...BASE,
    mouthCurve: 1,
    mouthOpen: 0.45,
    mouthWidth: 1.15,
    // Squinting is what separates a real smile from a drawn-on one.
    eyeSquint: 0.55,
    eyeOpen: 0.9,
    browRaise: 0.35,
    blush: 1.5,
    pupil: 1.1,
  },

  excited: {
    ...BASE,
    mouthCurve: 1,
    mouthOpen: 0.75,
    mouthWidth: 1.25,
    eyeOpen: 1,
    eyeWide: 1.2,
    eyeSquint: 0.2,
    browRaise: 0.8,
    blush: 1.6,
    pupil: 1.3,
  },

  sad: {
    ...BASE,
    mouthCurve: -0.75,
    mouthOpen: 0.05,
    mouthWidth: 0.85,
    eyeOpen: 0.72,
    eyeTilt: -0.16,
    // Inner brows up is the single most reliable sadness cue there is.
    browInner: 1,
    browRaise: 0.15,
    blush: 0.6,
    pupil: 1.2,
  },

  /** Sadder about a specific thing, and less theatrical about it. */
  disappointed: {
    ...BASE,
    mouthCurve: -0.45,
    mouthOpen: 0,
    mouthWidth: 0.9,
    mouthTwist: -0.2,
    eyeOpen: 0.66,
    eyeTilt: -0.1,
    browInner: 0.55,
    browRaise: -0.15,
    blush: 0.7,
    pupil: 1.05,
  },

  anger: {
    ...BASE,
    mouthCurve: -0.5,
    mouthOpen: 0.3,
    mouthWidth: 1.25,
    eyeOpen: 0.78,
    eyeSquint: 0.3,
    eyeTilt: 0.2,
    browInner: -1,
    blush: 0.4,
    pupil: 0.72,
  },

  /** Anger with nowhere to go. Held in rather than let out. */
  frustrated: {
    ...BASE,
    mouthCurve: -0.35,
    mouthOpen: 0.08,
    mouthWidth: 0.8,
    mouthTwist: 0.5,
    eyeOpen: 0.62,
    eyeSquint: 0.45,
    eyeTilt: 0.14,
    browInner: -0.7,
    browRaise: -0.2,
    blush: 0.9,
    pupil: 0.85,
  },

  fear: {
    ...BASE,
    mouthCurve: -0.35,
    mouthOpen: 0.6,
    mouthWidth: 0.75,
    eyeOpen: 1,
    eyeWide: 1.3,
    browInner: 0.8,
    browRaise: 0.85,
    blush: 0.3,
    pupil: 1.35,
  },

  surprise: {
    ...BASE,
    mouthCurve: 0,
    mouthOpen: 0.8,
    mouthWidth: 0.7,
    eyeWide: 1.35,
    browRaise: 1,
    browInner: 0.2,
    pupil: 1.25,
  },

  /** One brow up, mouth off to one side, nothing lines up. */
  confused: {
    ...BASE,
    mouthCurve: -0.1,
    mouthOpen: 0.14,
    mouthWidth: 0.85,
    mouthTwist: 0.75,
    eyeOpen: 0.86,
    eyeSquint: 0.2,
    browInner: 0.35,
    browRaise: 0.45,
    pupil: 1.1,
  },

  /** Leaning in. Eyes wide, mouth small and shut. */
  curious: {
    ...BASE,
    mouthCurve: 0.2,
    mouthOpen: 0.06,
    mouthWidth: 0.8,
    eyeOpen: 1,
    eyeWide: 1.12,
    browRaise: 0.6,
    browInner: 0.1,
    pupil: 1.2,
  },

  playful: {
    ...BASE,
    mouthCurve: 0.85,
    mouthOpen: 0.35,
    mouthWidth: 1.1,
    mouthTwist: 0.35,
    eyeSquint: 0.4,
    eyeOpen: 0.92,
    browRaise: 0.45,
    blush: 1.35,
    pupil: 1.15,
  },

  sleepy: {
    ...BASE,
    mouthCurve: 0.15,
    mouthOpen: 0.12,
    mouthWidth: 0.8,
    eyeOpen: 0.06,
    eyeSquint: 0.2,
    browRaise: -0.1,
    blush: 0.9,
    pupil: 0.9,
  },

  /** Awake, but only just. Heavier than sleepy and less peaceful. */
  tired: {
    ...BASE,
    mouthCurve: -0.15,
    mouthOpen: 0.05,
    mouthWidth: 0.85,
    eyeOpen: 0.4,
    eyeSquint: 0.15,
    eyeTilt: -0.08,
    browInner: 0.3,
    browRaise: -0.3,
    blush: 0.8,
    pupil: 1,
  },

  /** Nothing is wrong and nothing is happening. */
  relaxed: {
    ...BASE,
    mouthCurve: 0.4,
    mouthOpen: 0,
    mouthWidth: 0.95,
    eyeOpen: 0.7,
    eyeSquint: 0.3,
    browRaise: 0.05,
    blush: 1.15,
    pupil: 1.05,
  },

  /** Looking away, blushing hard, mouth pulled to one side. */
  embarrassed: {
    ...BASE,
    mouthCurve: 0.15,
    mouthOpen: 0.05,
    mouthWidth: 0.75,
    mouthTwist: -0.6,
    eyeOpen: 0.55,
    eyeSquint: 0.45,
    browInner: 0.6,
    browRaise: 0.3,
    blush: 2.2,
    pupil: 1.15,
  },

  love: {
    ...BASE,
    mouthCurve: 0.9,
    mouthOpen: 0.2,
    mouthWidth: 1,
    eyeSquint: 0.75,
    eyeOpen: 0.85,
    browRaise: 0.4,
    blush: 2,
    pupil: 1.3,
  },

  dizzy: {
    ...BASE,
    mouthCurve: -0.2,
    mouthOpen: 0.35,
    mouthWidth: 0.9,
    mouthTwist: 0.4,
    eyeOpen: 0.55,
    eyeSquint: 0.25,
    browInner: 0.3,
    browRaise: 0.3,
    pupil: 0.8,
  },

  smug: {
    ...BASE,
    mouthCurve: 0.55,
    mouthOpen: 0,
    mouthWidth: 0.9,
    mouthTwist: 0.55,
    eyeOpen: 0.62,
    eyeSquint: 0.4,
    eyeTilt: 0.1,
    browInner: -0.35,
    blush: 0.8,
    pupil: 0.95,
  },
};

export const EMOTION_KEYS = Object.keys(EXPRESSIONS) as Emotion[];

/**
 * The creature's face when it is not feeling anything in particular.
 *
 * `restingMood` is personality: a creature can be built naturally cheerful or
 * naturally unimpressed, and every other expression blends out of that rather
 * than out of a blank slate.
 */
export function restingFace(restingMood: number): FaceParams {
  const mood = Math.max(-1, Math.min(1, restingMood));

  return {
    ...BASE,
    mouthCurve: mood * 0.8,
    mouthWidth: 1 + mood * 0.05,
    eyeSquint: Math.max(0, mood) * 0.2,
    eyeTilt: mood < 0 ? mood * 0.08 : 0,
    browInner: mood < 0 ? mood * 0.45 : 0,
    blush: 1 + Math.max(0, mood) * 0.2,
  };
}

export function lerpFace(a: FaceParams, b: FaceParams, t: number): FaceParams {
  const mix = (from: number, to: number) => from + (to - from) * t;

  return {
    mouthCurve: mix(a.mouthCurve, b.mouthCurve),
    mouthOpen: mix(a.mouthOpen, b.mouthOpen),
    mouthWidth: mix(a.mouthWidth, b.mouthWidth),
    mouthTwist: mix(a.mouthTwist, b.mouthTwist),
    eyeOpen: mix(a.eyeOpen, b.eyeOpen),
    eyeSquint: mix(a.eyeSquint, b.eyeSquint),
    eyeWide: mix(a.eyeWide, b.eyeWide),
    eyeTilt: mix(a.eyeTilt, b.eyeTilt),
    browInner: mix(a.browInner, b.browInner),
    browRaise: mix(a.browRaise, b.browRaise),
    blush: mix(a.blush, b.blush),
    pupil: mix(a.pupil, b.pupil),
  };
}

/** Apply a partial override on top of a full set — used by clips. */
export function overrideFace(
  base: FaceParams,
  override: Partial<FaceParams>,
  weight = 1,
): FaceParams {
  if (weight <= 0) return base;
  const target: FaceParams = { ...base, ...override };
  return weight >= 1 ? target : lerpFace(base, target, weight);
}

/**
 * Blend an emotion into the resting face by strength.
 *
 * Strength comes from the simulation: a creature that is a little bit annoyed
 * looks a little bit annoyed.
 */
export function emotionFace(
  emotion: Emotion,
  strength: number,
  resting: FaceParams,
): FaceParams {
  if (emotion === 'neutral') return resting;
  return lerpFace(resting, EXPRESSIONS[emotion], Math.max(0, Math.min(1, strength)));
}
