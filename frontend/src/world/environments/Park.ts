/**
 * The park: an open lawn under a fence and a treeline, where creatures meet.
 *
 * The second environment, and it is the file `./types.ts` promised would be all
 * a second one costs — *"adding a second one is writing a second file rather
 * than picking the first one apart"*. Nothing about the scene, the physics, the
 * grid, the placement rules or the pointer changed to make this exist; the park
 * is an `EnvironmentDefinition` and the room already knew how to run one of
 * those.
 *
 * What it changes:
 *
 * ```text
 *   the scenery   a sky, a treeline, a fence and grass, instead of three walls
 *                 and a window (assets/environment/park/Outdoors.ts)
 *   the light     the sky itself. No window means no shaft and no pool, so the
 *                 key light is flat and comes from everywhere, which is what
 *                 outdoors is
 *   the furniture almost none. A park is somewhere to be, not somewhere to
 *                 arrange — and every object here is one more thing between two
 *                 creatures who came to see each other
 *   the night     shallower. Outdoors at midnight still has a sky in it, and a
 *                 lawn that goes as dark as a room with its lamp off would
 *                 leave six people looking at a black rectangle
 * ```
 *
 * What it deliberately does not change: the camera, the bounds and the grid.
 * Everything standing in the park stands on the same cells a chair stands on
 * indoors, which is what lets the same drag, the same snap and the same depth
 * sorting run here with no conditionals anywhere.
 */

import { Container } from 'pixi.js';
import { createMoodOverlay } from '../../assets/environment/Lighting';
import { createBorder, createLawn, createSky } from '../../assets/environment/park/Outdoors';
import { getObjectTraits } from '../../assets/objects/ObjectRenderer';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { PALETTE, mix } from '../../assets/shared/color';
import { resolveMood } from '../RoomStyle';
import type { RoomStyle } from '../RoomStyle';
import { ROOM_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH } from '../Projection';
import { GRID_BOUNDS, anchorCenter } from '../FloorGrid';
import type { EnvironmentDefinition, PlacedProp } from './types';

/**
 * Where the light is, for the things that need a point to orbit.
 *
 * High, central and far back — the sun, more or less. Moths still circle it at
 * night, which outdoors is if anything more correct than indoors.
 */
const SUN = { x: ROOM_WIDTH * 0.74, y: 620, z: -80 };

/** The same placement helper the farmhouse uses: cells in, world centre out. */
function at(col: number, row: number, type: ObjectType, seed: number): PlacedProp {
  const traits = getObjectTraits(type);
  const centre = anchorCenter({ col, row }, traits.footprint);

  return {
    id: `park-${type}-${col}-${row}`,
    definition: { type, seed },
    x: centre.x,
    z: centre.z,
  };
}

/**
 * What is already on the lawn.
 *
 * Four things, at the edges, and the restraint is the design. The park's whole
 * subject is other people's creatures; a lawn furnished like a living room is a
 * lawn where two pets meeting each other have to be found among the furniture.
 *
 * A ball and a plush because they are toys — the brain will chase them, which
 * is what makes several creatures converge on the same spot and notice one
 * another. A bench-shaped `chair` and a `bowl` because somewhere to sit and
 * something to share are what a park has.
 */
const PROPS: PlacedProp[] = [
  at(1, 0, 'chair', 311),
  at(8, 0, 'plant', 312),
  at(4, 2, 'ball', 313),
  at(6, 3, 'plush', 314),
];

export const park: EnvironmentDefinition = {
  id: 'park',
  label: 'Park',

  // The same rectangle the room uses, and for the same reason: the bounds and
  // the grid must be one authority, or an object can be placed somewhere the
  // grid has no cell for (see `Farmhouse.ts`).
  bounds: GRID_BOUNDS,

  // Toward the front and just off centre, so two creatures arriving do not
  // start inside one another. The park spreads arrivals around this point —
  // see `PetRoom.setEnvironment`'s caller in the park view.
  petStart: { x: ROOM_WIDTH * 0.42, z: 470 },

  light: SUN,

  // Dusk, not darkness. Outdoors keeps its sky.
  night: { color: 0x1d2a4a, alpha: 0.34 },

  // Higher than indoors: there is no ceiling, and the moths may use it.
  ceiling: 560,

  // No wall grid outdoors — there is no wall. An empty list is the honest
  // answer, and it means the wall-decor drag simply never finds anywhere to
  // land here rather than needing a special case anywhere.
  wallReserved: [],

  props: PROPS,

  createScenery(style: RoomStyle) {
    const { ambience, tint } = resolveMood(style);

    // The park's green comes from the user's chosen tint the same way the
    // room's paint does, so somebody who likes their room lavender gets a
    // lavender-tinged lawn rather than a second, unrelated palette.
    const options = { ambience, tint: mix(PALETTE.mint, tint, 0.25), seed: 41 };

    const ground: Container[] = [createSky(options), createLawn(options)];

    // No haze layer: aerial perspective outdoors is the treeline's own colour
    // (`Outdoors.ts` mixes the far line toward the sky), and a band of haze
    // over grass reads as fog rather than as distance.
    const haze = new Container();
    haze.label = 'park-haze';

    // The bushes sit above the ground and below anything standing on it —
    // exactly the slot the room's pools of light use.
    const ambient = createBorder(options);

    // The hour's wash and vignette — the same two the room gets, from the same
    // function (`createMoodOverlay`), because they are what makes an hour read
    // and a park with its own slightly different vignette would be the drift
    // AGENTS.md means by duplicate systems. What the park does *not* get is the
    // shaft and the pool: outdoors has no window to have them through.
    const overlay = createMoodOverlay(ambience, SCREEN_WIDTH, SCREEN_HEIGHT);

    return { ground, haze, ambient, overlay };
  },
};
