/**
 * The farmhouse: a warm, lived-in nook with light coming in from a window on
 * the back wall.
 *
 * This is one environment, not *the* environment. Everything specific to it
 * lives in this file — the composition, the light, the furniture it starts
 * with — so that adding a second one is writing a second file rather than
 * picking the first one apart (see ./types.ts).
 *
 * What it is *made of* and what light is on it are not in this file. Both come
 * in as the room's mood (see ../Ambience.ts), because the same farmhouse has
 * to be able to be a morning farmhouse, a sage-green farmhouse, and a
 * farmhouse at midnight without any of that being three environments.
 */

import { Container } from 'pixi.js';
import { createBackground } from '../../assets/environment/Background';
import { createFloor } from '../../assets/environment/Floor';
import { createLighting, poolFor } from '../../assets/environment/Lighting';
import { createWalls, WINDOW_FOOTPRINT, WINDOW_HALF } from '../../assets/environment/Walls';
import { getWindowView } from '../../assets/environment/window/WindowViews';
import { PALETTE, darken } from '../../assets/shared/color';
import { floorColor, graded } from '../Ambience';
import { resolveMood } from '../RoomStyle';
import type { RoomStyle } from '../RoomStyle';
import { ROOM_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH } from '../Projection';
import { GRID_BOUNDS, anchorCenter } from '../FloorGrid';
import { wallCenter } from '../WallGrid';
import { getObjectTraits } from '../../assets/objects/ObjectRenderer';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import type { EnvironmentDefinition, PlacedProp } from './types';

/**
 * Centre of the window on the back wall, taken from the wall grid rather than
 * from a fraction of the room's width.
 *
 * Two cells in from the left, filling the wall's full height of hanging space.
 * Everything else on this wall is placed the same way, which is the whole
 * reason the back wall now reads as one composition instead of three things
 * that happen to be on it.
 */
const WINDOW_CELL = { col: 1, row: 0 };
const WINDOW = { ...wallCenter(WINDOW_CELL, WINDOW_FOOTPRINT), z: 0 };

/**
 * The furniture the room starts with, placed by grid cell rather than by
 * coordinate.
 *
 * `at(col, row, type)` looks the type's footprint up and returns the world
 * centre of the cells it would occupy, so a starting arrangement is written in
 * the same units the user places things in. Typing coordinates by hand is how
 * the old starting room ended up with three pieces of furniture sitting
 * between cells before anybody had touched anything.
 *
 * Composition matters more here than it looks. Everything used to be strung
 * along one line because depth was only a draw order, and the room read as
 * crowded no matter how few things were in it. With real depth the back row
 * can be full without the front row noticing.
 */
function at(col: number, row: number, type: ObjectType, seed: number): PlacedProp {
  const traits = getObjectTraits(type);
  const centre = anchorCenter({ col, row }, traits.footprint);

  return {
    id: `prop-${type}`,
    definition: { type, seed },
    x: centre.x,
    z: centre.z,
  };
}

const PROPS: PlacedProp[] = [
  // Back row, against the wall: the tall things, so the room has a skyline.
  at(0, 0, 'plant', 77),
  at(2, 0, 'bookshelf', 211),
  at(9, 0, 'lamp', 88),

  // Second row: the fish, where the creature can stand and look at them.
  at(8, 1, 'aquarium', 509),

  // Middle: the furniture you live around.
  at(1, 2, 'table', 101),
  at(4, 2, 'chair', 102),
  at(6, 2, 'bed', 24),

  // Front row: the basket, and whatever is lying about near it.
  at(0, 4, 'basket', 19),
  at(4, 4, 'ball', 12),
  at(6, 4, 'plush', 55),
  at(9, 4, 'bowl', 601),
];

export const farmhouse: EnvironmentDefinition = {
  id: 'farmhouse',
  label: 'Farmhouse',

  // The room and the grid are the same rectangle, deliberately. They used to
  // be two, which is exactly how an object could be legally placed somewhere
  // the grid had no cell for it — and then be pulled off its cell by a clamp
  // that knew about the other rectangle. One authority, one answer.
  bounds: GRID_BOUNDS,

  // On the floor in the middle of the room, clear of every piece of furniture.
  petStart: { x: ROOM_WIDTH * 0.5, z: 500 },

  light: WINDOW,
  night: { color: 0x241636, alpha: 0.62 },
  // There is a lamp in the corner, and clicking it works.
  lamps: true,
  ceiling: 430,

  // The window is a hole, not hanging space: the wall guide strikes these
  // cells out and a drop over them is refused, so a painting can never end up
  // hung across the glass.
  wallReserved: [{ ...WINDOW_CELL, footprint: WINDOW_FOOTPRINT }],

  // The clock used to be the one entry here that did not stand on the floor
  // (a physics prop with an anchored collider, floating at a fixed wall
  // height). It is ordinary wall decor now — `DEFAULT_ROOM_STYLE.decor` places
  // it, the same as the painting and the shelf.
  props: PROPS,

  createScenery(style: RoomStyle) {
    const { ambience, tint } = resolveMood(style);

    const walls = graded(tint, ambience);
    const boards = floorColor(tint, ambience);
    const pool = poolFor(WINDOW);

    const lighting = createLighting({
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      ambience,
      window: WINDOW,
      windowHalf: WINDOW_HALF,
      pool,
      // A window onto a lava dungeon lights the room orange whatever the clock
      // says, so the view gets to override the key light (see WindowViews).
      key: getWindowView(style.window).selfLit ?? undefined,
    });

    const ground: Container[] = [
      // The field behind the box is a deeper version of the walls, so the
      // letterboxing at the edges of the frame reads as the room continuing
      // rather than as the picture stopping.
      createBackground({
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        color: darken(walls, 0.3),
      }),
      createWalls({
        color: walls,
        texture: style.wall,
        view: style.window,
        sky: ambience.sky,
        windowX: WINDOW.x,
        windowY: WINDOW.y,
        decor: style.decor,
        tint,
        accent: PALETTE.punch,
      }),
      createFloor({ color: boards, pattern: style.floor }),
    ];

    return {
      ground,
      haze: lighting.haze,
      ambient: lighting.ambient,
      overlay: lighting.overlay,
    };
  },
};
