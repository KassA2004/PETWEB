/**
 * The object catalog — what every thing in the room *is*, as data.
 *
 * One row per object type, and every other system reads its answer from here:
 * the renderer takes its dimensions from this file, the physics takes its
 * collider from this file, the inventory takes its label and category, and the
 * creature takes its opinion of the thing from its affordances.
 *
 * The rule this file exists to enforce
 * ------------------------------------
 * An object's size is **its grid footprint**, and nothing else.
 *
 *   chair    1 x 1 cell
 *   bed      2 x 1 cells
 *   rug      3 x 2 cells
 *
 * Art dimensions and collider half-extents used to be authored separately and
 * hoped to agree; they did not, which is why a bed could be snapped to a tile
 * and then shoved off it again by a clamp that knew a different width. Now
 * `renderBoxFor` and `colliderFor` both derive from the same two integers, so
 * a thing is drawn exactly as big as the space it claims and lands exactly
 * where the grid says it does.
 *
 * Adding an object is one row here, one renderer file, and one line in the
 * renderer map (ObjectRenderer.ts). If adding one requires editing a
 * conditional anywhere else, this record is missing a field — fix the data
 * model rather than the conditional (/Docs/theme-and-design.md §12.3).
 */

import { PALETTE, darken, mix } from '../shared/color';
import type { BodyType, Collider, Solidity, SurfaceSpec } from '../../simulation/physics';
import { AFFORDANCE_KINDS } from '../../simulation/Affordances';
import type {
  Affordance,
  AffordanceKind,
  FeedableNeed,
} from '../../simulation/Affordances';
import { footprintBox } from '../../world/FloorGrid';
import type { DepthBand, Footprint } from '../../world/FloorGrid';

export const OBJECT_TYPES = [
  // Furniture
  'bed',
  'basket',
  'chair',
  'table',
  'bookshelf',
  'hammock',
  'beanbag',
  // Decor
  'plant',
  'lamp',
  'clock',
  'rug',
  'aquarium',
  // Play and care
  'scratcher',
  'bowl',
  'musicbox',
  'tunnel',
  // Toys
  'ball',
  'plush',
  'cube',
  'pillow',
] as const;

export type ObjectType = (typeof OBJECT_TYPES)[number];

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

/* -------------------------------------------------------------------------- */
/* Affordances                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What an object offers the creature to *do*.
 *
 * The vocabulary lives in the simulation (`simulation/Affordances.ts`), not
 * here, and that direction matters: what a creature is capable of wanting is a
 * fact about the creature. The furniture only gets to say which of those wants
 * it can satisfy.
 */
export type { Affordance, AffordanceKind, FeedableNeed };
export { AFFORDANCE_KINDS };

/* -------------------------------------------------------------------------- */
/* Traits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Physical traits — how an object behaves once it exists in the room.
 *
 * `body` says what kind of thing it is:
 *
 *   static     furniture. Immovable while it stands there; the pointer can
 *              still pick it up and put it somewhere else, but it will never
 *              be shoved across the floor by a creature walking into it.
 *   dynamic    toys. They fall, roll, bounce, get batted about, and settle.
 *
 * `solidity` is the one that most changes how the room feels to live in. Not
 * everything drawn in a room is something you have to walk around: the plant,
 * the lamp, the clock and the table are *scenery*, and the creature goes
 * straight through them. Only the things it actually interacts with are solid
 * to it. A room furnished densely enough to look lived in is a room with a
 * dozen collision volumes in it, and a creature the size of the gaps between
 * them spends its afternoon wedged behind the pot plant.
 *
 * `surface`'s job is semantics only: how comfortable a thing is to be on, and
 * whether it is a container — a basket you can only get into from above and
 * cannot roll out of sideways. A tabletop is the top of a box and needs no
 * help being landed on.
 *
 * `friction` is a Coulomb coefficient: 0 is ice, 1 is rubber on carpet. Toys
 * are deliberately slippery. A ball that stops dead two feet from your hand is
 * no fun to throw, and the creature never gets to chase it.
 */
export interface ObjectTraits {
  label: string;
  category: ObjectCategory;

  /**
   * How many grid cells it takes up. The object's size, and the only place it
   * is stated.
   */
  footprint: Footprint;
  /**
   * How much of those cells the object actually claims, 0..1.
   *
   * Furniture fills its cells; a ball sitting in the middle of one does not.
   * Below about 0.35 an object stops reading as belonging to its tile, which
   * is the floor for toys.
   */
  fill?: number;
  /** How tall it stands, in world units, at its own scale. */
  height: number;
  /** Round on the floor rather than rectangular. Changes the collider shape. */
  round?: boolean;

  /** How the room treats it: furniture stays put, toys do not. */
  body: BodyType;
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
   * put on any cell of the floor grid.
   */
  home?: DepthBand;
  /** What the creature can do with it. */
  affordances?: Affordance[];
}

/**
 * How much of its cells an object claims when it does not say.
 *
 * Furniture wants to fill its footprint so the grid reads as a plan of the
 * room; anything smaller says so.
 */
const DEFAULT_FILL = 0.92;

export const OBJECT_TRAITS: Record<ObjectType, ObjectTraits> = {
  /* --- Furniture ---------------------------------------------------------- */

  bed: {
    label: 'Cloud Bed',
    category: 'furniture',
    // The brief's own example: a bed is two boxes.
    footprint: { cols: 2, rows: 1 },
    height: 78,
    body: 'static',
    mass: 22,
    restitution: 0.18,
    friction: 0.9,
    surface: { kind: 'bed', give: 10, comfort: 1 },
    home: 'middle',
  },

  basket: {
    label: 'Wicker Basket',
    category: 'furniture',
    footprint: { cols: 1, rows: 1 },
    height: 24,
    round: true,
    body: 'static',
    mass: 12,
    restitution: 0.28,
    friction: 0.9,
    // The collider is the *inside* floor. The rim is what you have to clear to
    // get in, and what holds you once you are.
    surface: { kind: 'container', rim: 66, inset: 18, comfort: 0.85 },
    home: 'front',
  },

  chair: {
    label: 'Little Chair',
    category: 'furniture',
    footprint: { cols: 1, rows: 1 },
    fill: 0.78,
    height: 92,
    body: 'static',
    mass: 9,
    restitution: 0.3,
    friction: 0.8,
    surface: { kind: 'seat', give: 4, comfort: 0.45 },
    home: 'middle',
  },

  table: {
    label: 'Low Table',
    category: 'furniture',
    footprint: { cols: 2, rows: 1 },
    height: 96,
    body: 'static',
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

  bookshelf: {
    label: 'Tall Shelf',
    category: 'furniture',
    footprint: { cols: 2, rows: 1 },
    fill: 0.88,
    height: 262,
    body: 'static',
    mass: 30,
    restitution: 0.12,
    friction: 0.9,
    // Deep, tall and against a wall. Walking round it is the whole of its
    // contribution to the floor plan, so unlike the table it stays solid.
    surface: { kind: 'shelf', comfort: 0.1 },
    home: 'back',
  },

  hammock: {
    label: 'Slung Hammock',
    category: 'furniture',
    footprint: { cols: 2, rows: 1 },
    height: 74,
    body: 'static',
    mass: 6,
    restitution: 0.4,
    friction: 0.7,
    // The most comfortable thing in the room, and it moves while you are in
    // it, which is the whole reason to build one.
    surface: { kind: 'bed', give: 16, comfort: 0.95 },
    home: 'middle',
  },

  beanbag: {
    label: 'Bean Bag',
    category: 'furniture',
    footprint: { cols: 1, rows: 1 },
    height: 62,
    round: true,
    body: 'static',
    mass: 5,
    restitution: 0.32,
    friction: 0.88,
    surface: { kind: 'seat', give: 14, comfort: 0.72 },
    home: 'front',
  },

  /* --- Decor -------------------------------------------------------------- */

  plant: {
    label: 'Potted Plant',
    category: 'decor',
    footprint: { cols: 1, rows: 1 },
    fill: 0.66,
    height: 182,
    round: true,
    body: 'static',
    mass: 8,
    restitution: 0.26,
    friction: 0.8,
    solidity: 'scenery',
    home: 'back',
  },

  lamp: {
    label: 'Floor Lamp',
    category: 'decor',
    footprint: { cols: 1, rows: 1 },
    // Slim: the shade is wide but it is two hundred units up, and a creature
    // walking past a floor lamp brushes the stem, not the light.
    fill: 0.5,
    height: 224,
    round: true,
    body: 'static',
    mass: 8,
    restitution: 0.24,
    friction: 0.8,
    solidity: 'scenery',
    home: 'back',
  },

  clock: {
    label: 'Wall Clock',
    category: 'decor',
    footprint: { cols: 1, rows: 1 },
    fill: 0.9,
    height: 200,
    body: 'static',
    mass: 4,
    restitution: 0.1,
    friction: 0.9,
    solidity: 'scenery',
    // Its foot, not its centre: the artwork hangs upward from here. Chosen so
    // the case is centred on wall row 1 (world/WallGrid.ts).
    mount: 248,
    home: 'back',
  },

  rug: {
    label: 'Round Rug',
    category: 'decor',
    // The one object whose footprint is the point of it: a rug is a patch of
    // floor, so it is measured in floor.
    footprint: { cols: 3, rows: 2 },
    // Zero height, which in this solver means no collision at all — nothing
    // can overlap it, nothing can stand on it, and it never becomes anybody's
    // support. That last part is the one that matters: a rug three units tall
    // is something the creature *steps onto*, which makes the rug its floor,
    // which sorts the creature against a two-hundred-unit-deep footprint and
    // draws it in front of the entire room. A rug is a decal.
    height: 0,
    round: true,
    body: 'static',
    mass: 8,
    restitution: 0.1,
    friction: 0.95,
    solidity: 'scenery',
    home: 'front',
  },

  aquarium: {
    label: 'Fish Bowl',
    category: 'decor',
    footprint: { cols: 1, rows: 1 },
    fill: 0.72,
    height: 132,
    body: 'static',
    mass: 14,
    restitution: 0.1,
    friction: 0.9,
    solidity: 'scenery',
    surface: { kind: 'shelf', comfort: 0 },
    home: 'back',
    affordances: [
      {
        kind: 'watch',
        appeal: 0.8,
        duration: 7,
        feeds: { curiosity: -0.09, joy: 0.05 },
        mood: 'watching the fish',
      },
    ],
  },

  /* --- Play and care ------------------------------------------------------ */

  scratcher: {
    label: 'Scratching Post',
    category: 'furniture',
    footprint: { cols: 1, rows: 1 },
    fill: 0.72,
    height: 172,
    body: 'static',
    mass: 11,
    restitution: 0.2,
    friction: 0.92,
    surface: { kind: 'shelf', comfort: 0.2 },
    home: 'middle',
    affordances: [
      {
        kind: 'scratch',
        appeal: 0.85,
        duration: 4.5,
        // Scratching is how a cross creature stops being cross.
        feeds: { anger: -0.3, playfulness: -0.06, joy: 0.08 },
        mood: 'having a good scratch',
      },
    ],
  },

  bowl: {
    label: 'Supper Bowl',
    category: 'furniture',
    footprint: { cols: 1, rows: 1 },
    fill: 0.52,
    height: 34,
    round: true,
    body: 'static',
    mass: 3,
    restitution: 0.15,
    friction: 0.9,
    solidity: 'scenery',
    home: 'front',
    affordances: [
      {
        kind: 'eat',
        appeal: 0.95,
        duration: 5,
        feeds: { energy: 0.14, joy: 0.06 },
        mood: 'having its supper',
      },
    ],
  },

  musicbox: {
    label: 'Music Box',
    category: 'decor',
    footprint: { cols: 1, rows: 1 },
    fill: 0.56,
    height: 58,
    body: 'static',
    mass: 4,
    restitution: 0.2,
    friction: 0.85,
    solidity: 'scenery',
    surface: { kind: 'shelf', comfort: 0 },
    home: 'middle',
    affordances: [
      {
        kind: 'dance',
        appeal: 0.7,
        duration: 6,
        feeds: { playfulness: -0.1, joy: 0.12, energy: -0.03 },
        mood: 'dancing',
      },
    ],
  },

  tunnel: {
    label: 'Fabric Tunnel',
    category: 'furniture',
    footprint: { cols: 2, rows: 1 },
    height: 92,
    body: 'static',
    mass: 5,
    restitution: 0.35,
    friction: 0.7,
    // You go *through* a tunnel. Making it solid would make it a wall with a
    // picture of a hole on it.
    solidity: 'scenery',
    home: 'front',
    affordances: [
      {
        kind: 'hide',
        appeal: 0.75,
        duration: 5.5,
        feeds: { fear: -0.28, curiosity: -0.05, joy: 0.04 },
        mood: 'hiding in the tunnel',
      },
    ],
  },

  /* --- Toys --------------------------------------------------------------- */

  ball: {
    label: 'Bouncy Ball',
    category: 'toy',
    footprint: { cols: 1, rows: 1 },
    fill: 0.5,
    height: 60,
    round: true,
    body: 'dynamic',
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
    footprint: { cols: 1, rows: 1 },
    fill: 0.55,
    height: 66,
    round: true,
    body: 'dynamic',
    mass: 0.8,
    restitution: 0.3,
    friction: 0.42,
    home: 'front',
  },

  cube: {
    label: 'Toy Block',
    category: 'toy',
    footprint: { cols: 1, rows: 1 },
    fill: 0.5,
    height: 60,
    body: 'dynamic',
    mass: 0.9,
    restitution: 0.22,
    friction: 0.5,
    home: 'front',
  },

  pillow: {
    label: 'Soft Pillow',
    category: 'toy',
    footprint: { cols: 1, rows: 1 },
    fill: 0.7,
    // Low and broad — low enough that the creature simply steps onto it, which
    // is how a pillow ends up being used as a step onto the bed.
    height: 34,
    body: 'dynamic',
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

/* -------------------------------------------------------------------------- */
/* Everything derived from the footprint                                      */
/* -------------------------------------------------------------------------- */

/** The world-space box an object is drawn inside. */
export interface RenderBox {
  /** Across the room's x axis. */
  width: number;
  /** Into the room's z axis. */
  depth: number;
  /** Up. */
  height: number;
}

/**
 * How big this object is, in world units.
 *
 * The single conversion from "how many cells" to "how many pixels", used by
 * the renderer and the collider alike so the two can never disagree.
 */
export function renderBoxFor(traits: ObjectTraits): RenderBox {
  const box = footprintBox(traits.footprint, traits.fill ?? DEFAULT_FILL);
  return { width: box.width, depth: box.depth, height: traits.height };
}

/**
 * The space an object occupies, derived from the same box it is drawn in.
 *
 * Round objects get a cylinder whose radius is half the *smaller* horizontal
 * extent, because a cylinder that fitted the larger one would stick out of the
 * cells the grid promised.
 */
/**
 * Whether other objects may be set down on top of this one.
 *
 * Derived from `surface` rather than authored separately: a tabletop or a
 * shelf is a surface *for things*, while a bed or a seat is a surface for the
 * creature and a container is entered rather than stood on. Nothing without
 * an opinion here (a lamp, a clock, a plant) accepts anything on top of it.
 */
export function acceptsPropsOn(traits: ObjectTraits): boolean {
  return traits.surface?.kind === 'tabletop' || traits.surface?.kind === 'shelf';
}

export function colliderFor(traits: ObjectTraits): Collider {
  const { width, depth, height } = renderBoxFor(traits);

  return traits.round
    ? { shape: 'cylinder', radius: Math.min(width, depth) / 2, height }
    : { shape: 'box', halfX: width / 2, halfZ: depth / 2, height };
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                     */
/* -------------------------------------------------------------------------- */

/** Per-type defaults, so a definition can be as small as `{ type: 'lamp' }`. */
export const OBJECT_COLORS: Record<
  ObjectType,
  { color: number; secondaryColor: number; accentColor: number }
> = {
  bed: { color: PALETTE.grape, secondaryColor: PALETTE.cream, accentColor: PALETTE.sky },
  basket: { color: PALETTE.sand, secondaryColor: PALETTE.cream, accentColor: PALETTE.ink },
  chair: { color: PALETTE.mint, secondaryColor: PALETTE.cream, accentColor: PALETTE.sand },
  table: {
    color: darken(PALETTE.sand, 0.22),
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.sand,
  },
  bookshelf: {
    color: darken(PALETTE.sand, 0.3),
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.punch,
  },
  hammock: { color: PALETTE.mint, secondaryColor: PALETTE.cream, accentColor: PALETTE.sand },
  beanbag: { color: PALETTE.punch, secondaryColor: PALETTE.blush, accentColor: PALETTE.cream },
  plant: { color: PALETTE.mint, secondaryColor: PALETTE.sand, accentColor: PALETTE.cream },
  lamp: { color: PALETTE.cream, secondaryColor: PALETTE.grape, accentColor: PALETTE.cream },
  clock: {
    color: PALETTE.cream,
    secondaryColor: darken(PALETTE.sand, 0.3),
    accentColor: PALETTE.ink,
  },
  rug: { color: PALETTE.sky, secondaryColor: PALETTE.cream, accentColor: PALETTE.blush },
  aquarium: {
    color: mix(PALETTE.sky, PALETTE.cream, 0.35),
    secondaryColor: PALETTE.sand,
    accentColor: PALETTE.ember,
  },
  scratcher: {
    color: PALETTE.sand,
    secondaryColor: darken(PALETTE.sand, 0.32),
    accentColor: PALETTE.punch,
  },
  bowl: { color: PALETTE.sky, secondaryColor: PALETTE.cream, accentColor: PALETTE.ember },
  musicbox: {
    color: PALETTE.grape,
    secondaryColor: PALETTE.cream,
    accentColor: 0xf2c94c,
  },
  tunnel: { color: PALETTE.ember, secondaryColor: PALETTE.cream, accentColor: PALETTE.punch },
  ball: { color: PALETTE.sky, secondaryColor: PALETTE.cream, accentColor: PALETTE.cream },
  plush: { color: PALETTE.blush, secondaryColor: PALETTE.cream, accentColor: PALETTE.punch },
  cube: { color: 0xf2c94c, secondaryColor: PALETTE.cream, accentColor: PALETTE.ember },
  pillow: { color: PALETTE.grape, secondaryColor: PALETTE.cream, accentColor: PALETTE.blush },
};
