import { Container } from 'pixi.js';
import { farmhouse } from '../../world/environments';
import { DEFAULT_ROOM_STYLE } from '../../world/RoomStyle';
import type { RoomStyle } from '../../world/RoomStyle';
import { SCREEN_HEIGHT, SCREEN_WIDTH, project, scaleAt } from '../../world/Projection';
import { objectArtBox } from '../habitat/objectPreviews';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { renderPreview } from '../../lib/preview';

/**
 * The pictures the home page is made of.
 *
 * Every one of them is drawn by the code that draws the real thing. That is not
 * a nicety — theme-and-design.md §20.1 makes it a rule, and a marketing page is
 * exactly where it would be broken first: a hand-drawn illustration of the room
 * is a second copy of a design that stops matching the first the day somebody
 * changes the floor, and the visitor finds out it was a lie when they sign up.
 *
 * ```text
 *   farmhouse.createScenery(style)  ──→  the room, actually rendered
 *   renderObject({ type: 'lamp' })  ──→  the lamp, actually rendered
 * ```
 *
 * So the home page ships **no image assets at all**. It ships the generators it
 * already had, run once, cached by `lib/preview` (one offscreen WebGL context
 * for the whole product) and handed to the page as `<img>` sources — which
 * means the browser decodes them off the main thread and the page composites
 * them like any other picture.
 */

/**
 * The room, empty, at whatever size it is being shown.
 *
 * The scenery only: walls, floor, window, the light from it, and the pieces
 * hanging on the wall. Nothing that stands on the floor, because the point of
 * the section this belongs to is watching a room *fill up*.
 *
 * 16:9 because the room is 16:9 (`world/Projection.ts`). Squaring it would
 * either band the picture or crop the thing being shown.
 */
export function renderRoomBackdrop(style: RoomStyle, width: number): Promise<string> {
  const height = Math.round((width * SCREEN_HEIGHT) / SCREEN_WIDTH);

  return renderPreview(
    `home:room:${style.ambience}:${style.tint}:${style.floor}:${style.wall}:${style.window}`,
    () => {
      const scenery = farmhouse.createScenery(style);
      const root = new Container();

      // The same order the scene stacks them in: ground, then the haze that
      // makes the back of the room paler, then the pools of light, then the
      // mood wash over everything.
      for (const layer of scenery.ground) root.addChild(layer);
      root.addChild(scenery.haze);
      root.addChild(scenery.ambient);
      root.addChild(scenery.overlay);

      return root;
    },
    {
      size: width,
      height,
      // The room fills its frame exactly. It is a box seen from a fixed camera,
      // not an object with air around it.
      fill: 1,
      focus: () => ({ x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT }),
    },
  );
}

/** The room the home page shows, before anybody has made it theirs. */
export const HOME_ROOM_STYLE: RoomStyle = {
  ...DEFAULT_ROOM_STYLE,
  // Late afternoon: the hour the room looks warmest, and the one the palette
  // was designed around (theme-and-design.md §17).
  ambience: DEFAULT_ROOM_STYLE.ambience,
  decor: DEFAULT_ROOM_STYLE.decor,
};

/* -------------------------------------------------------------------------- */
/* Standing something in the picture                                          */
/* -------------------------------------------------------------------------- */

/** Where a slot's picture goes, as percentages of the room picture. */
export interface SlotPlacement {
  /** Horizontal centre of the tile. */
  left: number;
  /** The tile's bottom edge, from the bottom of the picture. */
  bottom: number;
  /** The tile's width. */
  width: number;
}

/**
 * Put an object on the floor of the room picture, where the room would put it.
 *
 * The home page's room section used to place its furniture with four
 * hand-tuned percentages per object, and they were wrong in a way that is
 * obvious once the numbers are run back through the camera: `left: 9%` on the
 * back row is world x = −353, which is a third of a room *inside the left
 * wall*. The plant and the lamp were drawn standing on the side walls, the
 * bookshelf floated at the wall/floor crease, and the near row was half again
 * as large as the room would ever have drawn it.
 *
 * Nothing about that is fixable by nudging the percentages, because the
 * relationship they were approximating is `world/Projection.ts` — the same
 * one-point camera that draws the picture they sit on. So they are computed
 * from it instead: a slot says only *where the thing stands* (x, z in room
 * coordinates), and the depth then decides both where it lands on screen and
 * how big it is, exactly as it does in the real room.
 *
 * ```text
 *   (x, z) ──project──→ the floor point on screen
 *      └───scaleAt(z)──→ how big the thing is at that depth
 *      └──objectArtBox─→ where inside its square tile its feet are
 * ```
 *
 * The last one is the part that is easy to miss: a tile is a square with the
 * artwork centred in it, so anchoring the *tile's* bottom to the floor leaves a
 * floor lamp hovering a fifth of its own height above the boards.
 */
export function placeInRoom(type: ObjectType, x: number, z: number): SlotPlacement {
  const art = objectArtBox(type);
  const scale = scaleAt(z);
  const foot = project(x, 0, z);

  const tile = art.tile * scale;

  return {
    left: ((foot.x - (art.footX - 0.5) * tile) / SCREEN_WIDTH) * 100,
    bottom: ((SCREEN_HEIGHT - (foot.y + art.footY * tile)) / SCREEN_HEIGHT) * 100,
    width: (tile / SCREEN_WIDTH) * 100,
  };
}
