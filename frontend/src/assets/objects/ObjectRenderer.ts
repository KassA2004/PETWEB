/**
 * ObjectRenderer — the definition/renderer boundary for world objects.
 *
 * This is the architectural rule the brief calls out, made concrete:
 *
 *   ObjectDefinition   plain data. Serializable. Belongs in the database.
 *                      { type: 'basket', color: 0xd7a86e, scale: 1 }
 *          |
 *          v
 *   renderObject()     lives in the frontend, forever. Decides how it looks.
 *          |
 *          v
 *   PixiJS Container
 *
 * No rendering code and no JavaScript is ever stored in the database. The
 * database only ever holds the configuration on the left.
 */

import type { Container } from 'pixi.js';
import { PALETTE, darken } from '../shared/color';
import { createBasket } from './furniture/Basket';
import { createBed } from './furniture/Bed';
import { createChair } from './furniture/Chair';
import { createTable } from './furniture/Table';
import { createLamp } from './decorations/Lamp';
import { createPlant } from './decorations/Plant';
import { createRug } from './decorations/Rug';
import { createBall } from './toys/Ball';
import { createPlush } from './toys/Plush';

export const OBJECT_TYPES = [
  'bed',
  'basket',
  'chair',
  'table',
  'plant',
  'lamp',
  'rug',
  'ball',
  'plush',
] as const;

export type ObjectType = (typeof OBJECT_TYPES)[number];

/** The data half. This is what a row in ObjectDefinition would hold. */
export interface ObjectDefinition {
  type: ObjectType;
  color?: number;
  secondaryColor?: number;
  accentColor?: number;
  scale?: number;
  seed?: number;
}

/** A definition with every value resolved — what renderers actually receive. */
export interface ObjectRenderContext {
  type: ObjectType;
  color: number;
  secondaryColor: number;
  accentColor: number;
  scale: number;
  seed: number;
}

/** Per-type defaults, so a definition can be as small as `{ type: 'lamp' }`. */
const DEFAULTS: Record<
  ObjectType,
  { color: number; secondaryColor: number; accentColor: number }
> = {
  bed: {
    color: PALETTE.grape,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.sky,
  },
  basket: {
    color: PALETTE.sand,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.ink,
  },
  chair: {
    color: PALETTE.mint,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.sand,
  },
  table: {
    color: darken(PALETTE.sand, 0.22),
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.sand,
  },
  plant: {
    color: PALETTE.mint,
    secondaryColor: PALETTE.sand,
    accentColor: PALETTE.cream,
  },
  lamp: {
    color: PALETTE.cream,
    secondaryColor: PALETTE.grape,
    accentColor: PALETTE.cream,
  },
  rug: {
    color: PALETTE.sky,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.blush,
  },
  ball: {
    color: PALETTE.sky,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.cream,
  },
  plush: {
    color: PALETTE.blush,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.punch,
  },
};

type ObjectFactory = (ctx: ObjectRenderContext) => Container;

const RENDERERS: Record<ObjectType, ObjectFactory> = {
  bed: createBed,
  basket: createBasket,
  chair: createChair,
  table: createTable,
  plant: createPlant,
  lamp: createLamp,
  rug: createRug,
  ball: createBall,
  plush: createPlush,
};

export function resolveDefinition(definition: ObjectDefinition): ObjectRenderContext {
  const defaults = DEFAULTS[definition.type];

  return {
    type: definition.type,
    color: definition.color ?? defaults.color,
    secondaryColor: definition.secondaryColor ?? defaults.secondaryColor,
    accentColor: definition.accentColor ?? defaults.accentColor,
    scale: definition.scale ?? 1,
    seed: definition.seed ?? 1,
  };
}

/**
 * Build the display object for a definition.
 *
 * Every object returned is anchored at its floor contact point, so the scene
 * can position it by its base and sort it by y.
 */
export function renderObject(definition: ObjectDefinition): Container {
  const ctx = resolveDefinition(definition);
  const container = RENDERERS[ctx.type](ctx);
  container.label = ctx.type;
  return container;
}
