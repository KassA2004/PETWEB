/**
 * PetAppearance — the configuration the whole creature is built from.
 *
 * This is the "definition" half of the definition/renderer split: plain
 * serializable data that can live in the database (Pet.appearanceData), while
 * every drawing decision stays in frontend code.
 *
 * Everything here is **character design** — the persistent traits that decide
 * who a creature looks like. What it is *feeling* is nowhere in this file. A
 * mouth type, a set of teeth and a resting mood live here; a curve, an openness
 * and a squint are computed every frame by the expression system
 * (/src/animation/expression). That separation is the load-bearing idea in the
 * whole character system: picking a `:3` mouth chooses a shape language, not a
 * permanent smile.
 *
 * The design goal is combinatorial: parts are independent, so a body shape
 * authored for a chubby pig also has to survive bunny ears, bee wings and
 * saucer eyes. Nothing here describes a species — species are what emerge when
 * the parts happen to line up (see ./Archetypes).
 */

import { PALETTE } from '../../shared/color';
import { ACCESSORY_SLOTS } from './AccessoryTypes';
import type { AccessoryConfig, AccessorySlot } from './AccessoryTypes';
import type { TailType, WingType } from './AppendageTypes';
import type { BodyType } from './BodyTypes';
import type { EarType } from './EarTypes';
import type { FootType } from './FootTypes';
import type { BrowType } from './BrowTypes';
import type { CheekType } from './CheekTypes';
import type { EyeType } from './EyeTypes';
import type { MouthType } from './MouthTypes';
import type { SnoutType } from './SnoutTypes';
import type { TeethType } from './TeethTypes';
import type { PatternType } from './Patterns';
import { APPEARANCE_RANGES, clampField } from './PetConstraints';
import type { RangedField } from './PetConstraints';
import type { TopperType } from './TopperTypes';

/**
 * What the creature is wearing, one item per slot.
 *
 * Keyed by slot rather than stored as a list: a slot physically holds one
 * thing, and a map makes a second hat unrepresentable instead of something the
 * renderer has to defend against.
 */
export type PetAccessories = Partial<Record<AccessorySlot, AccessoryConfig>>;

export interface PetAppearance {
  // --- The mass ------------------------------------------------------------
  bodyType: BodyType;
  /** Overall size of the creature. */
  bodyScale: number;
  /** Extra width on top of the body type. The "how fat" dial. */
  bodyWidth: number;
  /** Extra height on top of the body type. */
  bodyHeight: number;
  /**
   * How lopsided the silhouette is allowed to be, 0..1. At 0 the creature is
   * mirror-symmetric and reads as clip art; at 1 it reads as hand-drawn, or as
   * slightly wrong, depending on the body type.
   */
  asymmetry: number;
  footType: FootType;
  footScale: number;

  // --- Appendages ----------------------------------------------------------
  earType: EarType;
  earScale: number;
  /** How far apart the ears sit, as a share of body width. */
  earSpread: number;
  /** Extra outward lean on top of the ear type's own rest angle, radians. */
  earTilt: number;

  wingType: WingType;
  wingScale: number;

  tailType: TailType;
  tailScale: number;

  topperType: TopperType;
  topperScale: number;

  // --- Face: design, never expression ---------------------------------------
  eyeType: EyeType;
  eyeScale: number;
  /** Horizontal gap between the eyes, as a share of body width. */
  eyeSpacing: number;
  /**
   * Where the eyes sit on the mass, 0 = high on the forehead, 1 = low.
   * Low, wide-set, large eyes read as a baby; high, close, small eyes do not.
   */
  eyeHeight: number;
  /** Multiplier on the eye preset's own pupil size. */
  pupilScale: number;
  /** Extra rotation on top of the preset's rest tilt. Inward reads angry. */
  eyeTilt: number;

  browType: BrowType;
  browScale: number;

  snoutType: SnoutType;
  snoutScale: number;

  /** The mouth's shape language. The expression system bends it, never swaps it. */
  mouthType: MouthType;
  mouthWidth: number;
  mouthWeight: number;
  teethType: TeethType;
  /** Tooth size, 0..1. The fastest route from cute to alarming. */
  fangs: number;

  cheekType: CheekType;

  /**
   * The creature's resting expression, -1 (permanently unimpressed) to +1
   * (permanently delighted). A personality bias the expression system blends
   * from, not a fixed mouth shape.
   */
  restingMood: number;

  // --- Color ---------------------------------------------------------------
  /** The coat. */
  primaryColor: number;
  /** Belly, inner ears, muzzle — the lighter secondary surface. */
  secondaryColor: number;
  /** Cheeks, nose, small details. */
  accentColor: number;
  /** Iris color, on eye types that have one. */
  eyeColor: number;

  pattern: PatternType;
  /**
   * Markings colour.
   *
   * Its own field rather than reusing the belly colour: a bee's stripes and a
   * bee's belly want opposite ends of the palette, and markings that cannot
   * contrast with the coat are just wasted draw calls.
   */
  patternColor: number;
  /** Cheek blush strength, 0..1. */
  blush: number;

  accessories: PetAccessories;

  /**
   * Drives all procedural irregularity. Two creatures with the same seed are
   * pixel-identical; different seeds vary the small imperfections.
   */
  seed: number;
}

/** Everything is optional on the way in; `createPetAppearance` fills the gaps. */
export type PetAppearanceInput = Partial<PetAppearance>;

/** The default creature: a pink blob with round ears and a small nose. */
export const DEFAULT_PET_APPEARANCE: PetAppearance = {
  bodyType: 'blob',
  bodyScale: 1,
  bodyWidth: 1,
  bodyHeight: 1,
  asymmetry: 0.6,
  footType: 'nubs',
  footScale: 1,

  earType: 'round',
  earScale: 1,
  earSpread: 0.3,
  earTilt: 0,

  wingType: 'none',
  wingScale: 1,

  tailType: 'puff',
  tailScale: 1,

  topperType: 'none',
  topperScale: 1,

  eyeType: 'dot',
  eyeScale: 1,
  eyeSpacing: 0.2,
  eyeHeight: 0.5,
  pupilScale: 1,
  eyeTilt: 0,

  browType: 'none',
  browScale: 1,

  snoutType: 'nose',
  snoutScale: 1,

  mouthType: 'smile',
  mouthWidth: 1,
  mouthWeight: 1,
  teethType: 'none',
  fangs: 0.5,

  cheekType: 'round',

  restingMood: 0.35,

  primaryColor: PALETTE.blush,
  secondaryColor: PALETTE.cream,
  accentColor: PALETTE.punch,
  eyeColor: 0x5b3a2e,

  pattern: 'none',
  patternColor: PALETTE.cream,
  blush: 0.55,

  accessories: {},

  seed: 20260820,
};

const RANGED_FIELDS = Object.keys(APPEARANCE_RANGES) as RangedField[];

function clampAccessories(accessories: PetAccessories): PetAccessories {
  const result: PetAccessories = {};

  for (const slot of ACCESSORY_SLOTS) {
    const item = accessories[slot];
    if (!item) continue;

    result[slot] = { ...item, scale: clampField('accessoryScale', item.scale) };
  }

  return result;
}

/**
 * Resolve a partial appearance into a complete, clamped one.
 *
 * Only the absolute ranges are applied here. Relationships between values —
 * eyes that would overlap, feet wider than the body — are resolved in pixel
 * space by the proportions layer, so the number you chose is the number that
 * stays in the editor (see ./PetConstraints).
 */
export function createPetAppearance(input: PetAppearanceInput = {}): PetAppearance {
  const merged: PetAppearance = { ...DEFAULT_PET_APPEARANCE, ...input };
  const result = { ...merged };

  for (const field of RANGED_FIELDS) {
    const value = merged[field as keyof PetAppearance];
    if (typeof value === 'number') {
      (result[field as keyof PetAppearance] as number) = clampField(field, value);
    }
  }

  result.accessories = clampAccessories(merged.accessories ?? {});
  return result;
}
