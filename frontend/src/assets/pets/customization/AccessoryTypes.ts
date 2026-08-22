/**
 * Accessories — the things a creature wears.
 *
 * Accessories are the widest customization surface in the project: every one of
 * them takes a free color and a free size, so "a hat" is really "any hat in any
 * color at any size". That is deliberate — the brief asks for creatures that
 * range from cute to completely ridiculous (/Docs/project-overview.md §4.3),
 * and a giant lime top hat is the cheapest route there.
 *
 * Each accessory occupies exactly one slot. A slot holds at most one item, so
 * the wearer can never end up with two hats fighting for the same anchor.
 */

import { PALETTE } from '../../shared/color';

export const ACCESSORY_SLOTS = ['head', 'face', 'neck'] as const;

export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

export const ACCESSORY_SLOT_LABELS: Record<AccessorySlot, string> = {
  head: 'Head',
  face: 'Face',
  neck: 'Neck',
};

export const ACCESSORY_TYPES = {
  // --- Head ---------------------------------------------------------------
  beanie: {
    label: 'Beanie',
    slot: 'head',
    defaultColor: PALETTE.punch,
    /** Base size relative to the slot's own reference width. */
    sizeMul: 1,
  },
  topHat: {
    label: 'Top Hat',
    slot: 'head',
    defaultColor: PALETTE.ink,
    sizeMul: 1,
  },
  crown: {
    label: 'Crown',
    slot: 'head',
    defaultColor: 0xf2c94c,
    sizeMul: 0.92,
  },
  cap: {
    label: 'Cap',
    slot: 'head',
    defaultColor: PALETTE.sky,
    sizeMul: 1,
  },
  flower: {
    label: 'Flower',
    slot: 'head',
    defaultColor: PALETTE.cream,
    sizeMul: 0.6,
  },
  hairBow: {
    label: 'Hair Bow',
    slot: 'head',
    defaultColor: PALETTE.punch,
    sizeMul: 0.72,
  },

  // --- Face ---------------------------------------------------------------
  glasses: {
    label: 'Glasses',
    slot: 'face',
    defaultColor: PALETTE.ink,
    sizeMul: 1,
  },
  shades: {
    label: 'Shades',
    slot: 'face',
    defaultColor: PALETTE.ink,
    sizeMul: 1,
  },
  eyepatch: {
    label: 'Eyepatch',
    slot: 'face',
    defaultColor: PALETTE.ink,
    sizeMul: 1,
  },

  // --- Neck ---------------------------------------------------------------
  bowtie: {
    label: 'Bow Tie',
    slot: 'neck',
    defaultColor: PALETTE.punch,
    sizeMul: 1,
  },
  necktie: {
    label: 'Necktie',
    slot: 'neck',
    defaultColor: PALETTE.sky,
    sizeMul: 1,
  },
  scarf: {
    label: 'Scarf',
    slot: 'neck',
    defaultColor: PALETTE.mint,
    sizeMul: 1,
  },
  collar: {
    label: 'Collar',
    slot: 'neck',
    defaultColor: PALETTE.grape,
    sizeMul: 1,
  },
  bandana: {
    label: 'Bandana',
    slot: 'neck',
    defaultColor: PALETTE.ember,
    sizeMul: 1.05,
  },
} as const;

export type AccessoryType = keyof typeof ACCESSORY_TYPES;

export interface AccessoryShape {
  label: string;
  slot: AccessorySlot;
  defaultColor: number;
  sizeMul: number;
}

export function getAccessoryShape(type: AccessoryType): AccessoryShape {
  return ACCESSORY_TYPES[type] as AccessoryShape;
}

export const ACCESSORY_TYPE_KEYS = Object.keys(ACCESSORY_TYPES) as AccessoryType[];

/** The catalog for one slot — what a picker in the customizer offers. */
export function accessoriesForSlot(slot: AccessorySlot): AccessoryType[] {
  return ACCESSORY_TYPE_KEYS.filter((key) => ACCESSORY_TYPES[key].slot === slot);
}

/** One worn item. Plain serializable data: this is what the database stores. */
export interface AccessoryConfig {
  type: AccessoryType;
  /** 0xRRGGBB. Every accessory takes any color. */
  color: number;
  /** Size multiplier. Clamped by `createPetAppearance`, not here. */
  scale: number;
}

export function createAccessoryConfig(
  type: AccessoryType,
  overrides: Partial<Omit<AccessoryConfig, 'type'>> = {},
): AccessoryConfig {
  const shape = getAccessoryShape(type);
  return {
    type,
    color: overrides.color ?? shape.defaultColor,
    scale: overrides.scale ?? 1,
  };
}
