/**
 * ObjectRenderer — the definition/renderer boundary for world objects.
 *
 * This is the architectural rule the brief calls out, made concrete:
 *
 *   ObjectDefinition   plain data. Serializable. Belongs in the database.
 *                      { type: 'basket', color: 0xd7a86e, seed: 19 }
 *          |
 *          v
 *   ObjectCatalog      how big it is, what it weighs, what it offers
 *          |
 *          v
 *   renderObject()     lives in the frontend, forever. Decides how it looks.
 *          |
 *          v
 *   PixiJS Container
 *
 * No rendering code and no JavaScript is ever stored in the database. The
 * database only ever holds the configuration on the left.
 *
 * Note what a definition no longer carries: a **scale**. Size is not a
 * property of an instance any more, it is a property of the type, and it comes
 * from the type's grid footprint (ObjectCatalog.ts). A chair the user could
 * scale to 1.4 was a chair that no longer fitted the cell it was standing on,
 * and the room went back to being a pile of things at arbitrary sizes. What an
 * instance *may* vary is colour and seed — which is enough for two baskets to
 * be visibly two baskets.
 *
 * Everything this file re-exports from the catalog is re-exported deliberately:
 * the catalog is the data and this is the door, so a caller only ever needs to
 * know about one of them.
 */

import type { Container } from 'pixi.js';
import { OBJECT_COLORS, colliderFor, getObjectTraits, renderBoxFor } from './ObjectCatalog';
import type { ObjectTraits, ObjectType } from './ObjectCatalog';
import { createBasket } from './furniture/Basket';
import { createBeanbag } from './furniture/Beanbag';
import { createBed } from './furniture/Bed';
import { createBookshelf } from './furniture/Bookshelf';
import { createChair } from './furniture/Chair';
import { createHammock } from './furniture/Hammock';
import { createTable } from './furniture/Table';
import { createTunnel } from './furniture/Tunnel';
import { createAquarium } from './decorations/Aquarium';
import { createClock } from './decorations/Clock';
import { createLamp } from './decorations/Lamp';
import { createMusicBox } from './decorations/MusicBox';
import { createPlant } from './decorations/Plant';
import { createRug } from './decorations/Rug';
import { createBowl } from './play/Bowl';
import { createScratcher } from './play/Scratcher';
import { createBall } from './toys/Ball';
import { createCube } from './toys/Cube';
import { createPillow } from './toys/Pillow';
import { createPlush } from './toys/Plush';

export * from './ObjectCatalog';
export { colliderFor, renderBoxFor };

/** The data half. This is what a row in ObjectDefinition would hold. */
export interface ObjectDefinition {
  type: ObjectType;
  color?: number;
  secondaryColor?: number;
  accentColor?: number;
  /** Varies the handmade imperfection, never the size. */
  seed?: number;
}

/**
 * A definition with every value resolved — what renderers actually receive.
 *
 * `width`, `depth` and `height` are world units and come from the type's grid
 * footprint, so a renderer draws to the space it has been given rather than to
 * numbers it picked. That is the contract that makes "a bed takes two boxes"
 * true in the artwork and not only in the collision volume.
 */
export interface ObjectRenderContext {
  type: ObjectType;
  color: number;
  secondaryColor: number;
  accentColor: number;
  seed: number;

  /** Across the room's x axis, in world units. */
  width: number;
  /** Into the room's z axis, in world units. */
  depth: number;
  /** How tall it stands, in world units. */
  height: number;

  /** The full catalog row, for the handful of renderers that want it. */
  traits: ObjectTraits;
}

export function resolveDefinition(definition: ObjectDefinition): ObjectRenderContext {
  const traits = getObjectTraits(definition.type);
  const defaults = OBJECT_COLORS[definition.type];
  const box = renderBoxFor(traits);

  return {
    type: definition.type,
    color: definition.color ?? defaults.color,
    secondaryColor: definition.secondaryColor ?? defaults.secondaryColor,
    accentColor: definition.accentColor ?? defaults.accentColor,
    seed: definition.seed ?? 1,
    ...box,
    traits,
  };
}

type ObjectFactory = (ctx: ObjectRenderContext) => Container;

const RENDERERS: Record<ObjectType, ObjectFactory> = {
  bed: createBed,
  basket: createBasket,
  chair: createChair,
  table: createTable,
  bookshelf: createBookshelf,
  hammock: createHammock,
  beanbag: createBeanbag,
  plant: createPlant,
  lamp: createLamp,
  clock: createClock,
  rug: createRug,
  aquarium: createAquarium,
  scratcher: createScratcher,
  bowl: createBowl,
  musicbox: createMusicBox,
  tunnel: createTunnel,
  ball: createBall,
  plush: createPlush,
  cube: createCube,
  pillow: createPillow,
};

/**
 * Build the display object for a definition.
 *
 * Every object returned is anchored at its floor contact point, so the scene
 * can position it by its base and sort it by depth.
 */
export function renderObject(definition: ObjectDefinition): Container {
  const ctx = resolveDefinition(definition);
  const container = RENDERERS[ctx.type](ctx);
  container.label = ctx.type;
  return container;
}
