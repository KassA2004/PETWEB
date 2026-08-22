/**
 * PetAppearance — the configuration the whole creature is built from.
 *
 * This is the "definition" half of the definition/renderer split: plain
 * serializable data that can live in the database (Pet.appearanceData), while
 * every drawing decision stays in frontend code.
 *
 * The design goal is combinatorial: parts are independent, so a body shape that
 * was authored for a chubby pig also has to survive bunny ears, bee wings and
 * saucer eyes. Nothing here describes a species — species are what emerge when
 * the parts happen to line up (see ./Archetypes).
 *
 * Appearance never changes the anatomy. It changes shapes, proportions and
 * colors of a rig that is always identical (/Docs/pet-anatomy.md §8).
 */

import { PALETTE } from '../../shared/color';
import { ACCESSORY_SLOTS } from './AccessoryTypes';
import type { AccessoryConfig, AccessorySlot } from './AccessoryTypes';
import type { EarType, TailType, WingType } from './AppendageTypes';
import type { BodyType, FootType } from './BodyTypes';
import type { BrowType, EyeType, SnoutType } from './FaceTypes';
import type { PatternType } from './Patterns';
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

  // --- Face ----------------------------------------------------------------
  eyeType: EyeType;
  eyeScale: number;
  /** Horizontal gap between the eyes, as a share of body width. */
  eyeSpacing: number;
  /**
   * Where the eyes sit on the mass, 0 = high on the forehead, 1 = low.
   * Low, wide-set, large eyes read as a baby; high, close, small eyes do not.
   */
  eyeHeight: number;

  browType: BrowType;
  browScale: number;

  snoutType: SnoutType;
  snoutScale: number;

  /** Cosmetics only — the mouth's *shape* comes from the expression system. */
  mouthWidth: number;
  mouthWeight: number;
  /**
   * The creature's resting expression, -1 (permanently unimpressed) to +1
   * (permanently delighted). A personality bias the expression system blends
   * from, not a fixed mouth shape.
   */
  restingMood: number;
  /** Visible teeth, 0..1. The fastest route from cute to alarming. */
  fangs: number;

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

/** The default creature: a pink blob with a puff, ears and a small nose. */
export const DEFAULT_PET_APPEARANCE: PetAppearance = {
  bodyType: 'blob',
  bodyScale: 1,
  bodyWidth: 1,
  bodyHeight: 1,
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

  browType: 'none',
  browScale: 1,

  snoutType: 'nose',
  snoutScale: 1,

  mouthWidth: 1,
  mouthWeight: 1,
  restingMood: 0.35,
  fangs: 0,

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

/**
 * Guard rails.
 *
 * These exist to keep the rig assemblable, not to enforce good taste. The brief
 * explicitly wants creatures that range into the ridiculous, so the ranges are
 * wide and the ugly combinations are allowed.
 */
const LIMITS: Record<string, { min: number; max: number }> = {
  bodyScale: { min: 0.8, max: 1.25 },   // Keeps overall size within a safe 20-25% variance
  bodyWidth: { min: 0.75, max: 1.3 },   // Prevents paper-thin or overly stretched bodies
  bodyHeight: { min: 0.8, max: 1.25 },  // Prevents squashed or string-bean characters
  footScale: { min: 0.6, max: 1.4 },    // 0 meant no feet (unless intended as a toggle). 1.4 is safely large.
  earScale: { min: 0.6, max: 1.5 },     // Kept a bit more flexible for stylized ears
  earSpread: { min: 0.15, max: 0.4 },   // Tighter range prevents ears clipping into the head or floating off
  earTilt: { min: -0.4, max: 0.6 },     // Reduced rotation angles to prevent unnatural snapping
  wingScale: { min: 0.5, max: 1.5 },    // (Note: if 0 was used to hide wings completely, change min back to 0)
  tailScale: { min: 0.5, max: 1.5 },    // Same as wings.
  topperScale: { min: 0.7, max: 1.4 },  // Prevents giant hats/hair from clipping through bounds
  eyeScale: { min: 0.7, max: 1.4 },     // Prevents tiny dots or giant overlapping eyes
  eyeSpacing: { min: 0.15, max: 0.3 },  // Prevents cyclops (overlapping) or eyes sliding off the face
  eyeHeight: { min: 0.3, max: 0.7 },    // Keeps eyes generally in the middle 40% of the face
  browScale: { min: 0.7, max: 1.3 },    // Prevents unibrows or microscopic eyebrows
  snoutScale: { min: 0.7, max: 1.4 },   // Prevents the muzzle from stretching out of the face bounds
  mouthWidth: { min: 0.6, max: 1.4 },   // Prevents the mouth from extending past the cheeks
  mouthWeight: { min: 0.7, max: 1.3 },  // Keeps lip/mouth thickness natural
  restingMood: { min: -1, max: 1 },     // Left as-is (standard -1 to 1 blendshape/slider value)
  fangs: { min: 0, max: 1 },            // Left as-is (assuming it's a 0-100% visibility/scale blendshape)
  blush: { min: 0, max: 1 },            // Left as-is (opacity mapping)
};

const ACCESSORY_SCALE = { min: 0.35, max: 2.5 };

function clampField(key: string, value: number): number {
  const limit = LIMITS[key];
  if (!limit) return value;
  return Math.max(limit.min, Math.min(limit.max, value));
}

function clampAccessories(accessories: PetAccessories): PetAccessories {
  const result: PetAccessories = {};

  for (const slot of ACCESSORY_SLOTS) {
    const item = accessories[slot];
    if (!item) continue;

    result[slot] = {
      ...item,
      scale: Math.max(
        ACCESSORY_SCALE.min,
        Math.min(ACCESSORY_SCALE.max, item.scale),
      ),
    };
  }

  return result;
}

/** Resolve a partial appearance into a complete, clamped one. */
export function createPetAppearance(input: PetAppearanceInput = {}): PetAppearance {
  const merged: PetAppearance = { ...DEFAULT_PET_APPEARANCE, ...input };
  const result = { ...merged } as PetAppearance;

  for (const key of Object.keys(LIMITS)) {
    const field = key as keyof PetAppearance;
    const value = merged[field];
    if (typeof value === 'number') {
      (result[field] as number) = clampField(key, value);
    }
  }

  result.accessories = clampAccessories(merged.accessories ?? {});
  return result;
}
