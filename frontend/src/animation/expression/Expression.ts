/**
 * Expressions.
 *
 * An expression is ten numbers, not a picture. The mouth, both lids, both brows
 * and the blush are all continuous, so the creature can be four-fifths of the
 * way from delighted to alarmed and look exactly like that — which is what
 * being alive looks like, and what a menu of mouth shapes can never do
 * (/Docs/animation-approach.md §27).
 *
 * Emotions here are *targets*. The driver eases toward them, so feelings arrive
 * and fade instead of switching.
 */

export type Emotion =
  | 'neutral'
  | 'joy'
  | 'sad'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'sleepy'
  | 'love'
  | 'dizzy'
  | 'smug';

export interface FaceParams {
  /** -1 miserable .. +1 delighted. */
  mouthCurve: number;
  /** 0 shut .. 1 yelling. */
  mouthOpen: number;
  /** Multiplier on the mouth's authored width. */
  mouthWidth: number;
  /** 1 fully open, 0 shut. */
  eyeOpen: number;
  /** Lower lid rising — the happy squint. */
  eyeSquint: number;
  /** Extra eye scale. Fear and surprise blow the eyes up. */
  eyeWide: number;
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
  eyeOpen: 1,
  eyeSquint: 0,
  eyeWide: 1,
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

  sad: {
    ...BASE,
    mouthCurve: -0.75,
    mouthOpen: 0.05,
    mouthWidth: 0.85,
    eyeOpen: 0.72,
    // Inner brows up is the single most reliable sadness cue there is.
    browInner: 1,
    browRaise: 0.15,
    blush: 0.6,
    pupil: 1.2,
  },

  anger: {
    ...BASE,
    mouthCurve: -0.5,
    mouthOpen: 0.3,
    mouthWidth: 1.25,
    eyeOpen: 0.78,
    eyeSquint: 0.3,
    browInner: -1,
    blush: 0.4,
    pupil: 0.72,
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
    eyeOpen: 0.62,
    eyeSquint: 0.4,
    browInner: -0.35,
    blush: 0.8,
    pupil: 0.95,
  },
};

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
    eyeOpen: mix(a.eyeOpen, b.eyeOpen),
    eyeSquint: mix(a.eyeSquint, b.eyeSquint),
    eyeWide: mix(a.eyeWide, b.eyeWide),
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
