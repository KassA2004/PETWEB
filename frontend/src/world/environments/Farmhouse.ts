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
import { createWalls, WINDOW_HALF } from '../../assets/environment/Walls';
import { darken } from '../../assets/shared/color';
import { floorColor, graded } from '../Ambience';
import type { RoomMood } from '../Ambience';
import { ROOM_DEPTH, ROOM_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH } from '../Projection';
import type { EnvironmentDefinition, PlacedProp } from './types';

/** Centre of the window on the back wall, in room coordinates. */
const WINDOW = { x: ROOM_WIDTH * 0.28, y: 330, z: 0 };

/**
 * The furniture, spread across the room's three depth rows.
 *
 * Composition matters more here than it looks. Everything used to be strung
 * along one line because depth was only a draw order, and the room read as
 * crowded no matter how few things were in it. With real depth the back row
 * can be full without the front row noticing.
 */
const PROPS: PlacedProp[] = [
  // Back row, against the wall.
  { id: 'prop-plant', definition: { type: 'plant', seed: 77, scale: 1.15 }, x: 130, z: 105 },
  { id: 'prop-lamp', definition: { type: 'lamp', seed: 88 }, x: 1140, z: 110 },
  // The clock keeps the user's real time, which is the one thing in the room
  // that is not make-believe. It hangs on the back wall itself.
  { id: 'prop-clock', definition: { type: 'clock', seed: 7, scale: 0.92 }, x: 800, z: 8 },

  // Middle row: the furniture you live around.
  { id: 'prop-table', definition: { type: 'table', seed: 101, scale: 1.05 }, x: 420, z: 295 },
  { id: 'prop-chair', definition: { type: 'chair', seed: 102 }, x: 630, z: 310 },
  { id: 'prop-bed', definition: { type: 'bed', seed: 24, scale: 1.05 }, x: 1000, z: 305 },

  // Front row: the basket, and whatever is lying about near it.
  { id: 'prop-basket', definition: { type: 'basket', seed: 19, scale: 1.05 }, x: 240, z: 505 },
  { id: 'prop-plush', definition: { type: 'plush', seed: 55 }, x: 780, z: 520 },
  { id: 'prop-ball', definition: { type: 'ball', seed: 12 }, x: 520, z: 535 },
];

export const farmhouse: EnvironmentDefinition = {
  id: 'farmhouse',
  label: 'Farmhouse',

  bounds: {
    minX: 40,
    maxX: ROOM_WIDTH - 40,
    minZ: 40,
    maxZ: ROOM_DEPTH - 20,
  },

  // On the floor in the middle of the room, clear of every piece of furniture.
  petStart: { x: ROOM_WIDTH * 0.5, z: 500 },

  light: WINDOW,
  night: { color: 0x241636, alpha: 0.62 },
  ceiling: 430,

  props: PROPS,

  createScenery(mood: RoomMood) {
    const { ambience, tint } = mood;

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
        sky: ambience.sky,
        windowX: WINDOW.x,
        windowY: WINDOW.y,
      }),
      createFloor({ color: boards }),
    ];

    return {
      ground,
      haze: lighting.haze,
      ambient: lighting.ambient,
      overlay: lighting.overlay,
    };
  },
};
