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
import type { UnlockRequirement } from '../../lib/progress';
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
  'rug',
  'stool',
  'cabinet',
  'loveseat',
  'desk',
  // Decor
  'plant',
  'lamp',
  'aquarium',
  'candles',
  'hourglass',
  'terrarium',
  'crystal',
  'mushrooms',
  // Play and care
  'scratcher',
  'bowl',
  'musicbox',
  'teepee',
  // Toys
  'ball',
  'plush',
  'cube',
  'pillow',
  'bone',
  'yarn',
  'hoop',
  'top',
  'rattle',
  'star',
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
 *
 * **The toy end of that range was halved in Sept 2026, and the reason is a
 * measurement.** `applyGroundFriction` decelerates at `friction * gravity`, so
 * with gravity at 2600 px/s² a coefficient of 0.42 is 1092 px/s² — enough that
 * a thrown plush was finished before the creature had turned round. Measured in
 * the running room, one clear lane at z = 460, released at 900 px/s, both
 * readings taken the same way in the same room:
 *
 * ```text
 *                     travel        rolling for
 *   ball    before    1090 px *     2.31 s
 *           after     1090 px *     3.75 s
 *   plush   before     541 px       0.99 s
 *           after      790 px       1.64 s
 *
 *   * the ball reaches the far wall either way; time is the honest number
 *     for it, and it now bounces off and carries on rather than expiring.
 * ```
 *
 * A throw now crosses the room and rolls long enough to be worth watching,
 * which is the whole point of throwing something, and long enough for the
 * creature to notice and give chase. Nothing else changed: `drag` came down
 * with it so the airborne half of an arc is not scrubbed either, and
 * `STATIC_FRICTION_SPEED` still stops a crawl dead — everything still comes to
 * rest, and still gets to sleep.
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
  /**
   * How tall the object's **bulk** is, in world units.
   *
   * Read that as *where its top is*, because for anything with a top that is
   * exactly what this number is: the tabletop, the desk's worktop, the chair's
   * seat, the cabinet's lid, the shelf's top shelf. `colliderFor` extrudes the
   * footprint to it, so it is simultaneously the height of the collision box,
   * the plane the creature stands on, and the plane a candle set down on the
   * thing rests at — one number, and those three can therefore never disagree.
   *
   * **It is not the tallest pixel.** A renderer may draw above it, and several
   * do: the desk's lamp, the chair's back, the bookshelf's trailing plant, the
   * cabinet's jug, the music box's dancer. None of those is a surface and none
   * of them is solid; they are decoration standing on the bulk. `PetRoom`
   * measures the artwork itself for the one thing that does care how tall the
   * *picture* is — the click target (`Entity.crown`).
   *
   * Getting this backwards is the "everything floats" bug: a table whose
   * `height` was its silhouette put every candle six units above its own top,
   * and a desk whose worktop is at 62% of its drawing put them forty-nine units
   * up, in mid-air beside the lamp.
   */
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
  /**
   * Decor that hangs on the wall, at this height above the floor.
   *
   * A general capability of the physics side of a prop, not tied to any one
   * type of object — the clock was its only user, and the clock hangs on the
   * wall-decor grid now (`WallDecor.ts`) rather than as a physics prop, so
   * nothing in this catalog currently sets it. Left in place for whatever
   * next wants a floor-plane collider anchored at a fixed height rather than
   * standing on the ground.
   */
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
  /**
   * What the user has to have done before this may be put in the room.
   *
   * Absent means free, and most things are free: a room you cannot furnish on
   * day one is not a home, it is a shop. What is locked is the second half of
   * the catalog — the pieces that make a room look like somebody has lived in
   * it for a while — because that is the only kind of thing worth earning.
   *
   * **This field is the only place a threshold is written down**, exactly as
   * `footprint` is the only place a size is. There is no unlock table beside
   * the catalog to keep in step with it, so a locked object cannot end up
   * costing one thing in the grid and another in the modal. The vocabulary it
   * is stated in (`lib/progress.ts`) is the user's, not the object's — what a
   * person can have measured about them is a fact about the person — which is
   * the same direction `Affordance` points, and for the same reason.
   *
   * The gate is the interface's. The *numbers* are the server's and cannot be
   * moved by anything a client sends, which is the half that matters: this
   * decides which tile opens a modal instead of dropping a chair, and an
   * object already standing in a room is never taken away by it.
   */
  unlock?: UnlockRequirement;
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
    // The seat. The back rises another forty units above it and is drawn, lit
    // and clickable — it is simply not a plane anything rests on.
    height: 48,
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
    // The tabletop, not the tallest pixel — see the note on `height`.
    height: 90,
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
    // Three hours. The first substantial unlock, and deliberately the one that
    // reads as furniture rather than as a toy: the room grows up with the user.
    unlock: { metric: 'focusMinutes', amount: 180 },
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
    // Ten hours, and the most comfortable thing in the room. The top of the
    // focus ladder, so there is somewhere for a long-running account to still
    // be going.
    unlock: { metric: 'focusMinutes', amount: 600 },
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
    unlock: { metric: 'goalsCompleted', amount: 15 },
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

  rug: {
    label: 'Woven Rug',
    category: 'furniture',
    // The only four-cell object in the catalogue, and the only one with
    // effectively no height. It is a piece of the floor.
    footprint: { cols: 2, rows: 2 },
    fill: 0.98,
    height: 5,
    body: 'static',
    mass: 2,
    restitution: 0.02,
    friction: 0.95,
    // Nothing walks around a rug, and nothing bounces off one either.
    solidity: 'scenery',
    surface: { kind: 'shelf', give: 3, comfort: 0.35 },
    home: 'middle',
  },

  stool: {
    label: 'Round Stool',
    category: 'furniture',
    footprint: { cols: 1, rows: 1 },
    fill: 0.74,
    height: 78,
    round: true,
    body: 'static',
    mass: 7,
    restitution: 0.3,
    friction: 0.82,
    surface: { kind: 'seat', give: 6, comfort: 0.5 },
    home: 'middle',
  },

  cabinet: {
    label: 'Little Cabinet',
    category: 'furniture',
    unlock: { metric: 'focusMinutes', amount: 240 },
    footprint: { cols: 2, rows: 1 },
    height: 148,
    body: 'static',
    mass: 26,
    restitution: 0.14,
    friction: 0.9,
    // Deep and against a wall, like the shelf: walking round it is its whole
    // contribution to the floor plan, so it stays solid.
    surface: { kind: 'tabletop', comfort: 0.08 },
    home: 'back',
  },

  loveseat: {
    label: 'Loveseat',
    category: 'furniture',
    unlock: { metric: 'goalsCompleted', amount: 25 },
    footprint: { cols: 2, rows: 1 },
    // The seat cushions, not the top of the back pillows.
    height: 51,
    body: 'static',
    mass: 24,
    restitution: 0.2,
    friction: 0.9,
    // The most comfortable seat in the room, short of the hammock — and unlike
    // the hammock it does not move while you are in it.
    surface: { kind: 'bed', give: 12, comfort: 0.88 },
    home: 'middle',
  },

  desk: {
    label: 'Study Desk',
    category: 'furniture',
    // The longest reach in the catalogue. It is the object that stands for what
    // the user has actually been doing.
    unlock: { metric: 'focusMinutes', amount: 900 },
    footprint: { cols: 2, rows: 1 },
    // The worktop. The lamp standing on it reaches half as high again.
    height: 79,
    body: 'static',
    mass: 20,
    restitution: 0.18,
    friction: 0.88,
    // Legs on one side and a drawer bank on the other: mostly air at floor
    // level, like the table, so the creature goes under it.
    solidity: 'scenery',
    surface: { kind: 'tabletop', comfort: 0.05 },
    home: 'back',
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
    // An hour. The first lock anybody meets, and it is meant to be met - a
    // gate nobody ever gets through teaches the user that the locked half of
    // the catalog is decoration.
    unlock: { metric: 'focusMinutes', amount: 60 },
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

  aquarium: {
    label: 'Fish Bowl',
    category: 'decor',
    // Something to watch, for somebody who has let other people watch them.
    unlock: { metric: 'memoriesShared', amount: 4 },
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

  candles: {
    label: 'Candle Cluster',
    category: 'decor',
    footprint: { cols: 1, rows: 1 },
    fill: 0.58,
    height: 86,
    round: true,
    body: 'static',
    mass: 3,
    restitution: 0.18,
    friction: 0.88,
    solidity: 'scenery',
    home: 'middle',
  },

  hourglass: {
    label: 'Sand Timer',
    category: 'decor',
    // The one object that is about the product rather than about the room, so
    // it is earned with the metric it depicts.
    unlock: { metric: 'focusMinutes', amount: 120 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.46,
    height: 104,
    body: 'static',
    mass: 5,
    restitution: 0.16,
    friction: 0.9,
    solidity: 'scenery',
    surface: { kind: 'shelf', comfort: 0 },
    home: 'middle',
  },

  terrarium: {
    label: 'Moss Terrarium',
    category: 'decor',
    unlock: { metric: 'focusMinutes', amount: 420 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.68,
    height: 124,
    round: true,
    body: 'static',
    mass: 12,
    restitution: 0.1,
    friction: 0.9,
    solidity: 'scenery',
    surface: { kind: 'shelf', comfort: 0 },
    home: 'back',
    affordances: [
      {
        // The still counterpart to the fish bowl: something to look at that is
        // not doing anything, which is a different kind of rest.
        kind: 'watch',
        appeal: 0.62,
        duration: 6,
        feeds: { curiosity: -0.07, joy: 0.04 },
        mood: 'peering into the terrarium',
      },
    ],
  },

  crystal: {
    label: 'Memory Crystal',
    category: 'decor',
    unlock: { metric: 'memoriesShared', amount: 20 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.6,
    height: 138,
    body: 'static',
    mass: 16,
    restitution: 0.08,
    friction: 0.92,
    solidity: 'scenery',
    home: 'back',
    affordances: [
      {
        kind: 'watch',
        appeal: 0.7,
        duration: 5.5,
        feeds: { curiosity: -0.08, joy: 0.06 },
        mood: 'watching the light in the crystal',
      },
    ],
  },

  mushrooms: {
    label: 'Glow Mushrooms',
    category: 'decor',
    unlock: { metric: 'goalsCompleted', amount: 40 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.72,
    height: 96,
    body: 'static',
    mass: 2,
    restitution: 0.2,
    friction: 0.9,
    solidity: 'scenery',
    home: 'front',
  },

  /* --- Play and care ------------------------------------------------------ */

  scratcher: {
    label: 'Scratching Post',
    category: 'furniture',
    unlock: { metric: 'goalsCompleted', amount: 8 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.72,
    // The platform on top of the post, which is the point of the object.
    height: 158,
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
    unlock: { metric: 'memoriesShared', amount: 10 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.56,
    // The lid. The dancer turning on top of it is drawn above.
    height: 32,
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

  teepee: {
    label: 'Canvas Teepee',
    category: 'furniture',
    unlock: { metric: 'focusMinutes', amount: 300 },
    // One cell, and tall. It replaced the Fabric Tunnel, which was two cells
    // wide and lay down — the room already had nothing but horizontal boxes on
    // it, and the den is the piece best placed to give it a vertical.
    footprint: { cols: 1, rows: 1 },
    height: 176,
    round: true,
    body: 'static',
    mass: 6,
    restitution: 0.3,
    friction: 0.75,
    // You go *inside* a den. Making it solid would make it a cone with a
    // picture of a doorway on it.
    solidity: 'scenery',
    home: 'front',
    affordances: [
      {
        kind: 'hide',
        appeal: 0.78,
        duration: 6,
        feeds: { fear: -0.3, curiosity: -0.05, joy: 0.05 },
        mood: 'curled up in the teepee',
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
    friction: 0.06,
    drag: 0.08,
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
    friction: 0.2,
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
    friction: 0.24,
    home: 'front',
  },

  bone: {
    label: 'Bone',
    category: 'toy',
    // Three goals: the cheapest lock in the catalog, and the one that exists to
    // show a new user that tiles with a padlock on them do come off.
    unlock: { metric: 'goalsCompleted', amount: 3 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.6,
    height: 60,
    body: 'dynamic',
    mass: 0.5,
    restitution: 0.62,
    friction: 0.06,
    drag: 0.08,
    rolls: true,
    home: 'front',
  },

  yarn: {
    label: 'Ball of Yarn',
    category: 'toy',
    footprint: { cols: 1, rows: 1 },
    fill: 0.52,
    height: 58,
    round: true,
    body: 'dynamic',
    mass: 0.6,
    // Wool, not rubber. It rolls because it is round, and stops because it is
    // soft — the opposite end of the friction range from the Bouncy Ball, which
    // is the whole reason both are worth having.
    restitution: 0.24,
    friction: 0.19,
    rolls: true,
    home: 'front',
  },

  hoop: {
    label: 'Rolling Hoop',
    category: 'toy',
    footprint: { cols: 1, rows: 1 },
    fill: 0.6,
    height: 72,
    round: true,
    body: 'dynamic',
    mass: 0.45,
    restitution: 0.38,
    friction: 0.08,
    drag: 0.07,
    rolls: true,
    home: 'front',
  },

  top: {
    label: 'Spinning Top',
    category: 'toy',
    unlock: { metric: 'goalsCompleted', amount: 6 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.46,
    height: 64,
    round: true,
    body: 'dynamic',
    mass: 0.7,
    restitution: 0.26,
    friction: 0.17,
    home: 'front',
  },

  rattle: {
    label: 'Rattle Drum',
    category: 'toy',
    unlock: { metric: 'focusMinutes', amount: 90 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.5,
    height: 68,
    body: 'dynamic',
    mass: 0.55,
    restitution: 0.34,
    friction: 0.2,
    home: 'front',
  },

  star: {
    label: 'Wish Star',
    category: 'toy',
    unlock: { metric: 'memoriesShared', amount: 2 },
    footprint: { cols: 1, rows: 1 },
    fill: 0.6,
    height: 64,
    body: 'dynamic',
    mass: 0.7,
    restitution: 0.3,
    friction: 0.25,
    // Stuffed, and broad enough to flop onto — the same reasoning as the
    // pillow, and `bed` rather than `shelf` for the same reason: a stuffed star
    // is somewhere to *be*, not a plane to set a lamp down on. `shelf` made
    // `acceptsPropsOn` true and let a candle be balanced on one of its points.
    surface: { kind: 'bed', give: 5, comfort: 0.5 },
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
    friction: 0.32,
    // A pillow is somewhere to flop, not a shelf. See the Wish Star.
    surface: { kind: 'bed', give: 6, comfort: 0.55 },
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
    // The trailing plant on top, and its pot. Cream foliage on cream-flecked
    // wood was invisible, and a hot-pink pot fought the dusty spines that are
    // the whole point of the redesign.
    secondaryColor: PALETTE.mint,
    accentColor: mix(PALETTE.ember, PALETTE.sand, 0.34),
  },
  hammock: { color: PALETTE.mint, secondaryColor: PALETTE.cream, accentColor: PALETTE.sand },
  beanbag: { color: PALETTE.punch, secondaryColor: PALETTE.blush, accentColor: PALETTE.cream },
  rug: {
    color: mix(PALETTE.grape, PALETTE.sand, 0.42),
    secondaryColor: PALETTE.cream,
    accentColor: mix(PALETTE.ember, PALETTE.sand, 0.3),
  },
  stool: {
    color: mix(PALETTE.mint, PALETTE.cream, 0.22),
    secondaryColor: darken(PALETTE.sand, 0.24),
    accentColor: PALETTE.cream,
  },
  cabinet: {
    color: darken(PALETTE.sand, 0.22),
    secondaryColor: PALETTE.cream,
    accentColor: mix(PALETTE.sky, PALETTE.cream, 0.25),
  },
  loveseat: {
    color: mix(PALETTE.sky, PALETTE.cream, 0.34),
    secondaryColor: PALETTE.cream,
    accentColor: mix(PALETTE.punch, PALETTE.cream, 0.3),
  },
  desk: {
    color: darken(PALETTE.sand, 0.3),
    secondaryColor: darken(PALETTE.sand, 0.44),
    accentColor: mix(PALETTE.ember, PALETTE.sand, 0.2),
  },
  plant: { color: PALETTE.mint, secondaryColor: PALETTE.sand, accentColor: PALETTE.cream },
  lamp: { color: PALETTE.cream, secondaryColor: PALETTE.grape, accentColor: PALETTE.cream },
  aquarium: {
    color: mix(PALETTE.sky, PALETTE.cream, 0.35),
    secondaryColor: PALETTE.sand,
    accentColor: PALETTE.ember,
  },
  candles: {
    color: PALETTE.cream,
    secondaryColor: mix(PALETTE.sky, PALETTE.cream, 0.3),
    accentColor: PALETTE.ember,
  },
  hourglass: {
    color: mix(PALETTE.sky, PALETTE.cream, 0.45),
    secondaryColor: darken(PALETTE.sand, 0.3),
    // The sand. Warmer than the glass it sits in, or the timer reads as empty.
    accentColor: mix(PALETTE.sand, PALETTE.ember, 0.16),
  },
  terrarium: {
    color: PALETTE.mint,
    secondaryColor: darken(PALETTE.sand, 0.22),
    accentColor: PALETTE.punch,
  },
  crystal: {
    color: mix(PALETTE.grape, PALETTE.sky, 0.35),
    secondaryColor: darken(PALETTE.sand, 0.42),
    accentColor: PALETTE.cream,
  },
  mushrooms: {
    color: mix(PALETTE.punch, PALETTE.cream, 0.18),
    secondaryColor: mix(PALETTE.cream, PALETTE.sand, 0.3),
    accentColor: mix(PALETTE.mint, PALETTE.sky, 0.4),
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
  teepee: {
    // Canvas, the poles holding it up, and the trim.
    color: mix(PALETTE.cream, PALETTE.sand, 0.34),
    secondaryColor: darken(PALETTE.sand, 0.34),
    accentColor: PALETTE.ember,
  },
  ball: { color: PALETTE.sky, secondaryColor: PALETTE.cream, accentColor: PALETTE.cream },
  plush: { color: PALETTE.blush, secondaryColor: PALETTE.cream, accentColor: PALETTE.punch },
  cube: { color: 0xf2c94c, secondaryColor: PALETTE.cream, accentColor: PALETTE.ember },
  pillow: { color: PALETTE.grape, secondaryColor: PALETTE.cream, accentColor: PALETTE.blush },
  bone: { color: PALETTE.sand, secondaryColor: PALETTE.cream, accentColor: PALETTE.ember },
  yarn: {
    color: mix(PALETTE.punch, PALETTE.cream, 0.28),
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.blush,
  },
  hoop: {
    color: PALETTE.sand,
    secondaryColor: PALETTE.cream,
    accentColor: mix(PALETTE.sky, PALETTE.cream, 0.15),
  },
  top: {
    color: mix(PALETTE.grape, PALETTE.cream, 0.2),
    secondaryColor: darken(PALETTE.sand, 0.24),
    accentColor: 0xf2c94c,
  },
  rattle: {
    color: mix(PALETTE.ember, PALETTE.sand, 0.28),
    secondaryColor: darken(PALETTE.sand, 0.28),
    accentColor: PALETTE.cream,
  },
  star: {
    color: 0xf2c94c,
    secondaryColor: PALETTE.cream,
    accentColor: PALETTE.punch,
  },
};
