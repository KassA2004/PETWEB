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
import type { EyeType } from './EyeTypes';
import type { MouthType } from './MouthTypes';
import type { PatternType } from './Patterns';
import type { TopperType } from './TopperTypes';

export interface PetAppearance {
  bodyType: BodyType;
  bodyScale: number;

  eyeType: EyeType;
  eyeScale: number;
  /** Horizontal gap between the eyes, as a share of body width. */
  eyeSpacing: number;

  mouthType: MouthType;
  mouthScale: number;

  topperType: TopperType;
  topperScale: number;

  /** The little side nubs. */
  armScale: number;
  /** The little feet under the body. */
  footScale: number;

  /** The blob itself. */
  primaryColor: number;
  /** Belly patch, topper, markings. */
  secondaryColor: number;
  /** Cheeks and small details. */
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
 * The default creature: a pink rounded-square blob with a puff on its head,
 * two dot eyes and a small wave mouth.
 */
export const DEFAULT_PET_APPEARANCE: PetAppearance = {
  bodyType: 'blob',
  bodyScale: 1,

  eyeType: 'dot',
  eyeScale: 1,
  eyeSpacing: 0.19,

  mouthType: 'wave',
  mouthScale: 1,

  topperType: 'puff',
  topperScale: 1,

  armScale: 1,
  footScale: 1,

  primaryColor: PALETTE.blush,
  secondaryColor: PALETTE.cream,
  accentColor: PALETTE.punch,

  pattern: 'none',

  seed: 20260820,
};

/** Guard rails: absurd is allowed, unrenderable is not. */
const LIMITS: Record<string, { min: number; max: number }> = {
  bodyScale: { min: 0.4, max: 2.2 },
  eyeScale: { min: 0.3, max: 2.6 },
  eyeSpacing: { min: 0.05, max: 0.36 },
  mouthScale: { min: 0.3, max: 2.4 },
  topperScale: { min: 0, max: 3 },
  armScale: { min: 0, max: 2.6 },
  footScale: { min: 0, max: 2.6 },
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
    eyeScale: clampField('eyeScale', merged.eyeScale),
    eyeSpacing: clampField('eyeSpacing', merged.eyeSpacing),
    mouthScale: clampField('mouthScale', merged.mouthScale),
    topperScale: clampField('topperScale', merged.topperScale),
    armScale: clampField('armScale', merged.armScale),
    footScale: clampField('footScale', merged.footScale),
  };
}
