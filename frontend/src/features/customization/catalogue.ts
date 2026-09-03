import {
  ACCESSORY_SLOTS,
  ACCESSORY_TYPES,
  accessoriesForSlot,
  createAccessoryConfig,
} from '../../assets/pets/customization/AccessoryTypes';
import type {
  AccessorySlot,
  AccessoryType,
} from '../../assets/pets/customization/AccessoryTypes';
import {
  TAIL_TYPES,
  TAIL_TYPE_KEYS,
  WING_TYPES,
  WING_TYPE_KEYS,
} from '../../assets/pets/customization/AppendageTypes';
import { BODY_TYPES, BODY_TYPE_KEYS } from '../../assets/pets/customization/BodyTypes';
import { EAR_TYPES, EAR_TYPE_KEYS } from '../../assets/pets/customization/EarTypes';
import { FOOT_TYPES, FOOT_TYPE_KEYS } from '../../assets/pets/customization/FootTypes';
import {
  BROW_TYPES,
  BROW_TYPE_KEYS,
  CHEEK_TYPES,
  CHEEK_TYPE_KEYS,
  EYE_TYPES,
  EYE_TYPE_KEYS,
  MOUTH_TYPES,
  MOUTH_TYPE_KEYS,
  SNOUT_TYPES,
  SNOUT_TYPE_KEYS,
  TEETH_TYPES,
  TEETH_TYPE_KEYS,
} from '../../assets/pets/customization/FaceTypes';
import { PATTERN_KEYS, PATTERN_LABELS } from '../../assets/pets/customization/Patterns';
import type { PatternType } from '../../assets/pets/customization/Patterns';
import { TOPPER_TYPES, TOPPER_TYPE_KEYS } from '../../assets/pets/customization/TopperTypes';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { PreviewFocus } from './previews';

/**
 * Every picture grid in the creature editor, described once.
 *
 * This file exists because two places have to agree *exactly* about what a tile
 * is: the panel that draws the grid, and the background prewarm that draws the
 * same tiles before anybody asks (`features/dashboard/prefetch`). A preview is
 * cached under a key made from the category, the option and the framing — so if
 * those two places describe a category even slightly differently, the prewarm
 * renders a hundred and forty pictures nobody will ever look up and the panel
 * renders them all again at the moment of the click. A prewarm that misses is
 * worse than none: the same wait, plus the work.
 *
 * So the description lives here and both sides read it.
 *
 * ```text
 *   PARTS.eye ──┬──→ <PartGrid {...PARTS.eye} …/>   the grid on screen
 *               └──→ jobsFor(PARTS.eye)             the same tiles, early
 * ```
 */

/** Which group of controls a category sits under in the editor. */
export type EditorTab = 'body' | 'ears' | 'face' | 'look' | 'extras';

/** One category of options, shown as a grid of pictures. */
export interface PartCategory<T extends string> {
  /**
   * What this category is, and part of every one of its cache keys.
   *
   * Load-bearing, and it is a bug fix rather than bookkeeping. The key used to
   * be the framing plus the option name, and six categories share
   * `focus: 'face'` — so Brows' "None" and Teeth's "None" were one cache entry,
   * as were Eyes' "Dot" and Mouth's "Dot", Mouth's "Round" and Cheeks' "Round",
   * Mouth's "Beak" and Snout's "Beak", and three more. Whichever drew first won
   * and the others showed its picture. Namespacing by category is what makes a
   * tile's key mean exactly one thing.
   */
  readonly id: string;
  /** The option keys, in display order. */
  readonly keys: readonly T[];
  /** The library they come from, for labels and hover hints. */
  readonly table: Record<T, { label: string; hint?: string }>;
  /** What picking one does. Pure in `value`, so a tile's picture is stable. */
  readonly patch: (value: T) => Partial<PetAppearance>;
  /** Which part of the creature the choice shows up in. */
  readonly focus: PreviewFocus;
}

/** Identity, for inference: it keeps `keys`, `table` and `patch` tied together. */
function part<T extends string>(category: PartCategory<T>): PartCategory<T> {
  return category;
}

const patternTable = Object.fromEntries(
  PATTERN_KEYS.map((key) => [key, { label: PATTERN_LABELS[key] }]),
) as Record<PatternType, { label: string }>;

/**
 * What the *tile* for an accessory option shows.
 *
 * Deliberately not what wearing the item does. That carries the wearer's
 * current colour and size into the result, which is right for applying a choice
 * and wrong for drawing a catalogue: it makes the picture a function of live
 * state, so every nudge of the size dial gives all three accessory grids a new
 * cache key and rebuilds a full creature rig per tile. Measured at 15 rig
 * rebuilds per slider step.
 *
 * A tile answers "what is this item", so it draws the item at its own defaults
 * on the bare preview creature, and the answer is the same every time.
 */
export function accessoryPreviewPatch(
  slot: AccessorySlot,
  value: AccessoryType | 'none',
): Partial<PetAppearance> {
  if (value === 'none') return { accessories: {} };
  return { accessories: { [slot]: createAccessoryConfig(value) } };
}

/**
 * The part categories, one object each.
 *
 * Module constants because `PartGrid` memoises its options on `keys` and
 * `table` *by reference*: built inline at a call site they would be new objects
 * on every render, the memo would never hold, and every tile in the grid would
 * re-request its preview on every keystroke.
 */
export const PARTS = {
  body: part({
    id: 'body',
    keys: BODY_TYPE_KEYS,
    table: BODY_TYPES,
    patch: (bodyType) => ({ bodyType }),
    focus: 'whole',
  }),
  ear: part({
    id: 'ear',
    keys: EAR_TYPE_KEYS,
    table: EAR_TYPES,
    patch: (earType) => ({ earType }),
    focus: 'ears',
  }),
  foot: part({
    id: 'foot',
    keys: FOOT_TYPE_KEYS,
    table: FOOT_TYPES,
    patch: (footType) => ({ footType }),
    focus: 'feet',
  }),
  eye: part({
    id: 'eye',
    keys: EYE_TYPE_KEYS,
    table: EYE_TYPES,
    patch: (eyeType) => ({ eyeType }),
    focus: 'face',
  }),
  brow: part({
    id: 'brow',
    keys: BROW_TYPE_KEYS,
    table: BROW_TYPES,
    patch: (browType) => ({ browType }),
    focus: 'face',
  }),
  mouth: part({
    id: 'mouth',
    keys: MOUTH_TYPE_KEYS,
    table: MOUTH_TYPES,
    patch: (mouthType) => ({ mouthType }),
    focus: 'face',
  }),
  teeth: part({
    id: 'teeth',
    keys: TEETH_TYPE_KEYS,
    table: TEETH_TYPES,
    patch: (teethType) => ({ teethType }),
    focus: 'face',
  }),
  snout: part({
    id: 'snout',
    keys: SNOUT_TYPE_KEYS,
    table: SNOUT_TYPES,
    patch: (snoutType) => ({ snoutType }),
    focus: 'face',
  }),
  cheek: part({
    id: 'cheek',
    keys: CHEEK_TYPE_KEYS,
    table: CHEEK_TYPES,
    patch: (cheekType) => ({ cheekType }),
    focus: 'face',
  }),
  pattern: part({
    id: 'pattern',
    keys: PATTERN_KEYS,
    table: patternTable,
    patch: (pattern) => ({ pattern }),
    focus: 'whole',
  }),
  wing: part({
    id: 'wing',
    keys: WING_TYPE_KEYS,
    table: WING_TYPES,
    patch: (wingType) => ({ wingType }),
    focus: 'wings',
  }),
  tail: part({
    id: 'tail',
    keys: TAIL_TYPE_KEYS,
    table: TAIL_TYPES,
    patch: (tailType) => ({ tailType }),
    focus: 'tail',
  }),
  topper: part({
    id: 'topper',
    keys: TOPPER_TYPE_KEYS,
    table: TOPPER_TYPES,
    patch: (topperType) => ({ topperType }),
    focus: 'topper',
  }),
} as const;

/** An accessory slot's options, including the way back out of one. */
type SlotOption = AccessoryType | 'none';
type SlotTable = Record<SlotOption, { label: string; hint?: string }>;

/**
 * One category per accessory slot.
 *
 * "None" is an option like any other, so it gets a tile like any other — a
 * picture of the creature without one. A bare list that silently omits the way
 * back is a customizer you can put a hat on and not take it off.
 */
export const ACCESSORY_PARTS = Object.fromEntries(
  ACCESSORY_SLOTS.map((slot) => [
    slot,
    part<SlotOption>({
      id: `accessory:${slot}`,
      keys: ['none', ...accessoriesForSlot(slot)],
      table: {
        none: { label: 'None' },
        ...Object.fromEntries(
          accessoriesForSlot(slot).map((type) => [type, ACCESSORY_TYPES[type]]),
        ),
      } as SlotTable,
      patch: (value) => accessoryPreviewPatch(slot, value),
      // A scarf is worn on a body and a hat on a head: framing the neck slot on
      // the head would crop out the thing being chosen.
      focus: slot === 'neck' ? 'whole' : 'head',
    }),
  ]),
) as Record<AccessorySlot, PartCategory<SlotOption>>;

/** How a category and an option combine into the name of one picture. */
export function previewKey(id: string, option: string): string {
  return `${id}:${option}`;
}

/** One tile to draw: exactly what `prewarmOptionPreviews` takes. */
export interface PreviewJob {
  readonly patch: Partial<PetAppearance>;
  readonly focus: PreviewFocus;
  readonly key: string;
}

/**
 * The tiles a category owns.
 *
 * The `key` here is the same string `PartGrid` passes for the same option,
 * which is the entire contract of this file.
 */
export function jobsFor<T extends string>(category: PartCategory<T>): PreviewJob[] {
  return category.keys.map((key) => ({
    patch: category.patch(key),
    focus: category.focus,
    key: previewKey(category.id, key),
  }));
}

/**
 * A category with its option type forgotten.
 *
 * The tab table below holds categories keyed on a dozen different string
 * unions, and a list of those has no useful common type. Rather than cast the
 * differences away, each category is reduced to the one thing a caller that
 * does not know its type can still do: ask for its tiles.
 */
export interface PreviewCategory {
  readonly id: string;
  readonly jobs: () => PreviewJob[];
}

function erase<T extends string>(category: PartCategory<T>): PreviewCategory {
  return { id: category.id, jobs: () => jobsFor(category) };
}

/**
 * Which categories each editor tab shows, in the order it shows them.
 *
 * That order is the order the background prewarm draws in, so the top of a tab
 * is ready fractionally before the bottom — which is the half a user looks at
 * first.
 *
 * The tiles themselves are built on demand rather than here: somebody who never
 * opens the editor should not pay for a hundred and forty patch objects on
 * load, and the room's own panel imports this module.
 */
export const TAB_CATEGORIES: Record<EditorTab, () => PreviewCategory[]> = {
  body: () => [erase(PARTS.body)],
  ears: () => [erase(PARTS.ear), erase(PARTS.foot)],
  face: () => [
    erase(PARTS.eye),
    erase(PARTS.brow),
    erase(PARTS.mouth),
    erase(PARTS.teeth),
    erase(PARTS.snout),
    erase(PARTS.cheek),
  ],
  look: () => [erase(PARTS.pattern)],
  extras: () => [
    erase(PARTS.wing),
    erase(PARTS.tail),
    erase(PARTS.topper),
    ...ACCESSORY_SLOTS.map((slot) => erase(ACCESSORY_PARTS[slot])),
  ],
};

/**
 * The tabs in the order the editor offers them.
 *
 * Which is also the order they are warmed in — Body first because it is the tab
 * the panel opens on, then left to right, because that is the order somebody
 * exploring the editor presses them in.
 */
export const EDITOR_TABS: readonly EditorTab[] = ['body', 'ears', 'face', 'look', 'extras'];

/** Every tile in one tab, in display order. */
export function jobsForTab(tab: EditorTab): PreviewJob[] {
  return TAB_CATEGORIES[tab]().flatMap((category) => category.jobs());
}
