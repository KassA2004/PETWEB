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
import type {
  BodyType,
  Collider,
  Solidity,
  SurfaceSpec,
} from '../../simulation/physics';
import type { DepthBand } from '../../world/FloorGrid';
import { createBasket } from './furniture/Basket';
import { createBed } from './furniture/Bed';
import { createChair } from './furniture/Chair';
import { createTable } from './furniture/Table';
import { createClock } from './decorations/Clock';
import { createLamp } from './decorations/Lamp';
import { createPlant } from './decorations/Plant';
import { createRug } from './decorations/Rug';
import { createBall } from './toys/Ball';
import { createCube } from './toys/Cube';
import { createPillow } from './toys/Pillow';
import { createPlush } from './toys/Plush';

export const OBJECT_TYPES = [
  'bed',
  'basket',
  'chair',
  'table',
  'plant',
  'lamp',
  'clock',
  'rug',
  'ball',
  'plush',
  'cube',
  'pillow',
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
  clock: {
    color: PALETTE.cream,
    secondaryColor: darken(PALETTE.sand, 0.3),
    accentColor: PALETTE.ink,
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
  cube: {
    color: 0xf2c94c,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.ember,
  },
  pillow: {
    color: PALETTE.grape,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.blush,
  },
};

/**
 * Object categories.
 *
 * The inventory groups by these, and the simulation reads them: the creature
 * treats a toy rolling past very differently from a chair sliding past
 * (/Docs/animation-approach.md §24).
 */
export const OBJECT_CATEGORIES = ['toy', 'furniture', 'decor'] as const;

export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export const OBJECT_CATEGORY_LABELS: Record<ObjectCategory, string> = {
  toy: 'Toys',
  furniture: 'Furniture',
  decor: 'Decor',
};

/**
 * Physical traits — how an object behaves once it exists in the room.
 *
 * Objects used to be ragdolls: every one of them, from the rug to the bed, a
 * little assembly of circles held together by constraints. It gave a chair
 * three collision points and a personality, and it also gave the room twelve
 * soft bodies arguing with each other in a space the size of a rug. Nothing in
 * a living room needs to be a soft body.
 *
 * So each object now says plainly what kind of thing it is:
 *
 *   static     furniture. Immovable while it stands there; the pointer can
 *              still pick it up and put it somewhere else, but it will never
 *              be shoved across the floor by a creature walking into it.
 *   dynamic    toys. They fall, roll, bounce, get batted about, and settle.
 *
 * `collider` is the real, three-dimensional space it takes up: a footprint in
 * the floor plane — a circle or a rectangle — extruded upward by `height`.
 * Authored at scale 1 alongside the artwork, because a table whose top is 94px
 * up is a table whose collider is 94 tall, and when one moves the other has to.
 *
 * `surface`'s job has shrunk, and that is the point. A tabletop is the top of
 * a box and needs no help being landed on. What is left is the semantics: how
 * comfortable it is, and whether it is a container — a basket you can only get
 * into from above and cannot roll out of sideways.
 *
 * `friction` is a Coulomb coefficient now rather than a decay rate: 0 is ice,
 * 1 is rubber on carpet. Toys are deliberately slippery. A ball that stops
 * dead two feet from your hand is no fun to throw, and the creature never gets
 * to chase it.
 *
 * `solidity` is the newest of them and the one that most changes how the room
 * feels to live in. Not everything drawn in a room is something you have to
 * walk around: the plant, the lamp, the clock and the table are *scenery*, and
 * the creature goes straight through them. Only the things it actually
 * interacts with — the bed it sleeps on, the chair it climbs, the basket it
 * gets into, and every toy — are solid to it.
 *
 * The alternative was tried and it is worse in both directions at once. A room
 * furnished densely enough to look lived in is a room with a dozen collision
 * volumes in it, and a creature the size of the gaps between them spends its
 * afternoon wedged behind the pot plant; furnish it thinly enough to roam and
 * it stops looking like anywhere. Scenery is how the room gets to be full and
 * the floor gets to be open, and the cost is a creature that occasionally
 * overlaps a table leg — which nobody watching has ever once minded.
 */
export interface ObjectTraits {
  label: string;
  category: ObjectCategory;
  /** How the room treats it: furniture stays put, toys do not. */
  body: BodyType;
  /** The space it occupies, authored at scale 1. */
  collider: Collider;
  mass: number;
  restitution: number;
  /** Coulomb friction, 0 ice .. 1 carpet. */
  friction: number;
  /**
   * Whether the creature has to walk around it. Defaults to solid.
   *
   * Scenery still collides with everything that is not the creature, so toys
   * bounce off it and things can be set down on it.
   */
  solidity?: Solidity;
  /** Air drag while it is off the ground, per second. */
  drag?: number;
  /** Round enough to roll rather than to slide. Visual. */
  rolls?: boolean;
  /** What other objects can rest on or inside, and how nice that is. */
  surface?: SurfaceSpec;
  /** Decor that hangs on the wall, at this height above the floor. */
  mount?: number;
  /**
   * Roughly where in the room a *new* one appears.
   *
   * A starting preference, not a constraint: once it is in the room it can be
   * put on any tile of the floor grid.
   */
  home?: DepthBand;
}

export const OBJECT_TRAITS: Record<ObjectType, ObjectTraits> = {
  bed: {
    label: 'Cloud Bed',
    category: 'furniture',
    body: 'static',
    // Wide, deep and low: the mattress top is the surface, the headboard is
    // artwork and has no business being collision geometry.
    collider: { shape: 'box', halfX: 104, halfZ: 62, height: 70 },
    mass: 22,
    restitution: 0.18,
    friction: 0.9,
    surface: { kind: 'bed', give: 10, comfort: 1 },
    home: 'middle',
  },
  basket: {
    label: 'Wicker Basket',
    category: 'furniture',
    body: 'static',
    // The collider is the *inside* floor. The rim is what you have to clear to
    // get in, and what holds you once you are.
    collider: { shape: 'box', halfX: 74, halfZ: 50, height: 18 },
    mass: 12,
    restitution: 0.28,
    friction: 0.9,
    surface: { kind: 'container', rim: 62, inset: 18, comfort: 0.85 },
    home: 'front',
  },
  chair: {
    label: 'Little Chair',
    category: 'furniture',
    body: 'static',
    collider: { shape: 'box', halfX: 34, halfZ: 32, height: 82 },
    mass: 9,
    restitution: 0.3,
    friction: 0.8,
    surface: { kind: 'seat', give: 4, comfort: 0.45 },
    home: 'middle',
  },
  table: {
    label: 'Round Table',
    category: 'furniture',
    body: 'static',
    collider: { shape: 'cylinder', radius: 68, height: 94 },
    mass: 15,
    restitution: 0.22,
    friction: 0.85,
    // Legs, mostly air, and a top the creature can be put on. Nothing it needs
    // to walk around.
    solidity: 'scenery',
    // Climbable, and a fine place to stand. Nobody sleeps on a table.
    surface: { kind: 'tabletop', comfort: 0.05 },
    home: 'middle',
  },
  lamp: {
    label: 'Floor Lamp',
    category: 'furniture',
    body: 'static',
    // Slim: the shade is wide but it is two hundred pixels up, and a creature
    // walking past a floor lamp brushes the stem, not the light.
    collider: { shape: 'cylinder', radius: 24, height: 196 },
    mass: 8,
    restitution: 0.24,
    friction: 0.8,
    solidity: 'scenery',
    home: 'back',
  },
  plant: {
    label: 'Potted Plant',
    category: 'decor',
    body: 'static',
    collider: { shape: 'cylinder', radius: 34, height: 152 },
    mass: 8,
    restitution: 0.26,
    friction: 0.8,
    solidity: 'scenery',
    home: 'back',
  },
  clock: {
    label: 'Wall Clock',
    category: 'decor',
    body: 'static',
    collider: { shape: 'box', halfX: 44, halfZ: 6, height: 88 },
    mass: 4,
    restitution: 0.1,
    friction: 0.9,
    solidity: 'scenery',
    mount: 250,
    home: 'back',
  },
  rug: {
    label: 'Round Rug',
    category: 'decor',
    body: 'static',
    // Zero height, which in this solver means no collision at all — nothing
    // can overlap it, nothing can stand on it, and it never becomes anybody's
    // support. That last part is the one that matters: a rug three pixels tall
    // is something the creature *steps onto*, which makes the rug its floor,
    // which sorts the creature against a two-hundred-pixel-deep footprint and
    // draws it in front of the entire room. A rug is a decal.
    collider: { shape: 'cylinder', radius: 132, height: 0 },
    mass: 8,
    restitution: 0.1,
    friction: 0.95,
    solidity: 'scenery',
    home: 'front',
  },
  ball: {
    label: 'Bouncy Ball',
    category: 'toy',
    body: 'dynamic',
    collider: { shape: 'cylinder', radius: 28, height: 56 },
    mass: 0.5,
    restitution: 0.62,
    friction: 0.12,
    drag: 0.15,
    rolls: true,
    home: 'front',
  },
  plush: {
    label: 'Blob Plush',
    category: 'toy',
    body: 'dynamic',
    collider: { shape: 'cylinder', radius: 34, height: 58 },
    mass: 0.8,
    restitution: 0.3,
    friction: 0.42,
    home: 'front',
  },
  cube: {
    label: 'Toy Block',
    category: 'toy',
    body: 'dynamic',
    collider: { shape: 'box', halfX: 28, halfZ: 28, height: 56 },
    mass: 0.9,
    restitution: 0.22,
    friction: 0.5,
    home: 'front',
  },
  pillow: {
    label: 'Soft Pillow',
    category: 'toy',
    body: 'dynamic',
    // Low and broad — low enough that the creature simply steps onto it, which
    // is how a pillow ends up being used as a step onto the bed.
    collider: { shape: 'box', halfX: 44, halfZ: 32, height: 24 },
    mass: 1.6,
    restitution: 0.34,
    friction: 0.6,
    surface: { kind: 'shelf', give: 6, comfort: 0.55 },
    home: 'front',
  },
};

export function getObjectTraits(type: ObjectType): ObjectTraits {
  return OBJECT_TRAITS[type];
}

type ObjectFactory = (ctx: ObjectRenderContext) => Container;

const RENDERERS: Record<ObjectType, ObjectFactory> = {
  bed: createBed,
  basket: createBasket,
  chair: createChair,
  table: createTable,
  plant: createPlant,
  lamp: createLamp,
  clock: createClock,
  rug: createRug,
  ball: createBall,
  plush: createPlush,
  cube: createCube,
  pillow: createPillow,
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
