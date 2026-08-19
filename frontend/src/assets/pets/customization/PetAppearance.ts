/**
 * PetAppearance — the configuration object the whole pet renderer is driven by.
 *
 * This is the "definition" half of the definition/renderer split: it is plain
 * serializable data that can live in the database (Pet.appearanceData), while
 * every drawing decision stays in frontend code.
 *
 * Appearance never changes the anatomy. It changes proportions, shapes and
 * colors of a rig that is always identical (/Docs/pet-anatomy.md section 8).
 */

import { PALETTE } from '../../shared/color';
import type { BodyType } from './BodyTypes';
import type { EarType } from './EarTypes';
import type { EyeType } from './EyeTypes';
import type { HeadType } from './HeadTypes';
import type { PatternType } from './Patterns';
import type { TailType } from './TailTypes';

export interface PetAppearance {
  bodyType: BodyType;
  bodyScale: number;

  headType: HeadType;
  headScale: number;

  earType: EarType;
  earScale: number;

  eyeType: EyeType;
  eyeScale: number;

  tailType: TailType;
  tailScale: number;

  /** Ground clearance multiplier — short legs are the default look. */
  legLength: number;
  legWidth: number;

  primaryColor: number;
  secondaryColor: number;
  /** Inner ears, nose, paw pads, blush. */
  accentColor: number;

  pattern: PatternType;

  /**
   * Drives all procedural irregularity. Two pets with the same seed are
   * pixel-identical; different seeds vary the small imperfections that keep
   * the creature from looking machine-made.
   */
  seed: number;
}

/** Everything is optional on the way in; `createPetAppearance` fills the gaps. */
export type PetAppearanceInput = Partial<PetAppearance>;

/**
 * The default creature.
 *
 * Deliberately not a generic cat: heavy dumpling body, oversized head, very
 * short legs, tall leafy ears and a cloud-tufted tail.
 */
export const DEFAULT_PET_APPEARANCE: PetAppearance = {
  bodyType: 'dumpling',
  bodyScale: 1,

  headType: 'moon',
  headScale: 1.12,

  earType: 'leaf',
  earScale: 1,

  eyeType: 'dew',
  eyeScale: 1,

  tailType: 'cloud',
  tailScale: 1,

  legLength: 0.9,
  legWidth: 1,

  primaryColor: PALETTE.lavender,
  secondaryColor: PALETTE.warmCream,
  accentColor: PALETTE.dustyRose,

  pattern: 'dapple',

  seed: 20260819,
};

/** Guard rails: absurd is allowed, unrenderable is not. */
const LIMITS: Record<string, { min: number; max: number }> = {
  bodyScale: { min: 0.4, max: 2.2 },
  headScale: { min: 0.35, max: 2.6 },
  earScale: { min: 0.25, max: 3 },
  eyeScale: { min: 0.3, max: 2.4 },
  tailScale: { min: 0.2, max: 3 },
  legLength: { min: 0.25, max: 2.6 },
  legWidth: { min: 0.35, max: 2.4 },
};

function clampField(key: string, value: number): number {
  const limit = LIMITS[key];
  if (!limit) return value;
  return Math.max(limit.min, Math.min(limit.max, value));
}

/**
 * Resolve a partial appearance into a complete, clamped one.
 *
 * Clamping keeps the rig assemblable — it is not there to enforce cuteness.
 * The design brief explicitly wants creatures that range into the ridiculous.
 */
export function createPetAppearance(input: PetAppearanceInput = {}): PetAppearance {
  const merged: PetAppearance = { ...DEFAULT_PET_APPEARANCE, ...input };

  return {
    ...merged,
    bodyScale: clampField('bodyScale', merged.bodyScale),
    headScale: clampField('headScale', merged.headScale),
    earScale: clampField('earScale', merged.earScale),
    eyeScale: clampField('eyeScale', merged.eyeScale),
    tailScale: clampField('tailScale', merged.tailScale),
    legLength: clampField('legLength', merged.legLength),
    legWidth: clampField('legWidth', merged.legWidth),
  };
}
