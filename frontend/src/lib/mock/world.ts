/**
 * Mock world state.
 *
 * Everything here is stand-in data for endpoints that do not exist yet
 * (`/goals`, `/inventory`, `/environments/objects`). It lives behind these
 * types on purpose: when the real API arrives, the panels keep their shapes and
 * only the source of the data changes.
 *
 * Nothing here is persisted — a reload starts the day over.
 */

import type {
  AccessorySlot,
  AccessoryType,
} from '../../assets/pets/customization/AccessoryTypes';
import type {
  ObjectCategory,
  ObjectType,
} from '../../assets/objects/ObjectRenderer';
import { PALETTE } from '../../assets/shared/color';

export interface Goal {
  id: string;
  title: string;
  done: boolean;
  /** What the world gave back for finishing it, if anything. */
  rewardLabel?: string;
}

/**
 * Three kinds of thing can live in the inventory:
 *
 *   object    goes into the room, has mass, can be thrown
 *   wearable  goes onto the creature
 *   dye       repaints the creature
 */
export type ItemKind = 'object' | 'wearable' | 'dye';

export interface InventoryItem {
  id: string;
  label: string;
  kind: ItemKind;
  color: number;

  /** Objects. */
  objectType?: ObjectType;
  category?: ObjectCategory;

  /** Wearables. */
  slot?: AccessorySlot;
  type?: AccessoryType;

  /** Dyes: which color role they paint. */
  role?: 'primary' | 'secondary' | 'accent';

  /** Set when the item arrived as a goal reward. */
  earnedFrom?: string;
}

/** How the inventory groups itself. Order matters — this is the display order. */
export const INVENTORY_GROUPS = [
  { key: 'toy', label: 'Toys' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'decor', label: 'Decor' },
  { key: 'wearable', label: 'Wearables' },
  { key: 'dye', label: 'Dyes' },
] as const;

export type InventoryGroupKey = (typeof INVENTORY_GROUPS)[number]['key'];

export function groupOf(item: InventoryItem): InventoryGroupKey {
  if (item.kind === 'object') return (item.category ?? 'decor') as InventoryGroupKey;
  return item.kind === 'wearable' ? 'wearable' : 'dye';
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export const SEED_GOALS: Goal[] = [
  { id: 'goal-seed-1', title: 'Drink a glass of water', done: false },
  { id: 'goal-seed-2', title: 'Walk for 20 minutes', done: false },
  { id: 'goal-seed-3', title: 'Read ten pages', done: false },
];

/** What the creature already owns on day one. */
export const SEED_INVENTORY: InventoryItem[] = [
  {
    id: 'item-cube',
    label: 'Toy Block',
    kind: 'object',
    objectType: 'cube',
    category: 'toy',
    color: 0xf2c94c,
  },
  {
    id: 'item-pillow',
    label: 'Soft Pillow',
    kind: 'object',
    objectType: 'pillow',
    category: 'toy',
    color: PALETTE.grape,
  },
  {
    id: 'item-ball',
    label: 'Spare Ball',
    kind: 'object',
    objectType: 'ball',
    category: 'toy',
    color: PALETTE.sky,
  },
  {
    id: 'item-chair',
    label: 'Little Chair',
    kind: 'object',
    objectType: 'chair',
    category: 'furniture',
    color: PALETTE.mint,
  },
  {
    id: 'item-plant',
    label: 'Potted Plant',
    kind: 'object',
    objectType: 'plant',
    category: 'decor',
    color: PALETTE.mint,
  },
  {
    id: 'item-bowtie',
    label: 'Bow Tie',
    kind: 'wearable',
    slot: 'neck',
    type: 'bowtie',
    color: PALETTE.punch,
  },
  {
    id: 'item-glasses',
    label: 'Round Glasses',
    kind: 'wearable',
    slot: 'face',
    type: 'glasses',
    color: PALETTE.ink,
  },
  {
    id: 'item-beanie',
    label: 'Beanie',
    kind: 'wearable',
    slot: 'head',
    type: 'beanie',
    color: PALETTE.mint,
  },
  {
    id: 'item-blush-dye',
    label: 'Blush Dye',
    kind: 'dye',
    role: 'primary',
    color: PALETTE.blush,
  },
];

/**
 * The reward pool.
 *
 * Goals hand these out in order, so a session always sees new things rather
 * than the same hat three times. Once it runs dry, goals still complete — they
 * just stop paying out, which is honest about this being a mock.
 */
export const REWARD_POOL: Omit<InventoryItem, 'id' | 'earnedFrom'>[] = [
  { label: 'Tiny Crown', kind: 'wearable', slot: 'head', type: 'crown', color: 0xf2c94c },
  { label: 'Second Block', kind: 'object', objectType: 'cube', category: 'toy', color: PALETTE.ember },
  { label: 'Top Hat', kind: 'wearable', slot: 'head', type: 'topHat', color: PALETTE.ink },
  { label: 'Cool Shades', kind: 'wearable', slot: 'face', type: 'shades', color: PALETTE.ink },
  { label: 'Spare Pillow', kind: 'object', objectType: 'pillow', category: 'toy', color: PALETTE.blush },
  { label: 'Winter Scarf', kind: 'wearable', slot: 'neck', type: 'scarf', color: PALETTE.ember },
  { label: 'Ball Cap', kind: 'wearable', slot: 'head', type: 'cap', color: PALETTE.sky },
  { label: 'Round Table', kind: 'object', objectType: 'table', category: 'furniture', color: PALETTE.sand },
  { label: 'Wall Clock', kind: 'object', objectType: 'clock', category: 'decor', color: PALETTE.cream },
  { label: 'Necktie', kind: 'wearable', slot: 'neck', type: 'necktie', color: PALETTE.grape },
  { label: 'Mint Dye', kind: 'dye', role: 'primary', color: PALETTE.mint },
  { label: 'Daisy', kind: 'wearable', slot: 'head', type: 'flower', color: 0xfff7ec },
  { label: 'Blob Plush', kind: 'object', objectType: 'plush', category: 'toy', color: PALETTE.blush },
  { label: 'Collar & Tag', kind: 'wearable', slot: 'neck', type: 'collar', color: PALETTE.grape },
  { label: 'Hair Bow', kind: 'wearable', slot: 'head', type: 'hairBow', color: PALETTE.punch },
  { label: 'Sky Dye', kind: 'dye', role: 'primary', color: PALETTE.sky },
  { label: 'Cream Dye', kind: 'dye', role: 'secondary', color: 0xfff7ec },
];

/** Pick the next unearned reward, or null once the pool is exhausted. */
export function nextReward(
  owned: InventoryItem[],
): Omit<InventoryItem, 'id' | 'earnedFrom'> | null {
  const has = new Set(owned.map((item) => item.label));
  return REWARD_POOL.find((item) => !has.has(item.label)) ?? null;
}
