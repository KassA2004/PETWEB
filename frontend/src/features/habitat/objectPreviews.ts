import { OBJECT_TYPES, renderObject } from '../../assets/objects/ObjectRenderer';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { WALL_DECOR_KINDS, getWallDecor } from '../../assets/environment/walls/WallDecor';
import type { WallDecorKind } from '../../assets/environment/walls/WallDecor';
import { FLOOR_PATTERNS, createFloor } from '../../assets/environment/Floor';
import type { FloorPattern } from '../../assets/environment/Floor';
import { WALL_TEXTURES, createWallTexture } from '../../assets/environment/walls/WallTextures';
import type { WallTexture } from '../../assets/environment/walls/WallTextures';
import { WINDOW_VIEW_LIST, getWindowView } from '../../assets/environment/window/WindowViews';
import type { WindowViewId } from '../../assets/environment/window/WindowViews';
import { AMBIENCE_LIST, getAmbience, graded } from '../../world/Ambience';
import type { AmbienceId } from '../../world/Ambience';
import { renderPreview } from '../../lib/preview';
import type { Rectangle } from '../../lib/preview';

/**
 * Pictures of everything the Room panel offers.
 *
 * Same argument as the creature's previews next door: the room is drawn by
 * procedural generators, so the preview is that generator's own output rather
 * than an icon somebody drew once. A lamp in the panel is the lamp, made by the
 * function that makes the lamp in the room.
 *
 * Every entry here is a thin wrapper around `renderPreview` — the shared
 * offscreen renderer, the shared cache, and one WebGL context for all of it.
 */

/**
 * How much of an object tile the object itself fills.
 *
 * Exported because `objectArtBox` below has to do the same arithmetic
 * `renderPreview` does in order to say where inside the tile the object's feet
 * ended up, and two copies of that number is one copy too many.
 */
export const OBJECT_ICON_FILL = 0.82;

/** A thing that goes on the floor. */
export function renderObjectIcon(type: ObjectType, size = 76): Promise<string> {
  return renderPreview(`object:${type}`, () => renderObject({ type }), {
    size,
    fill: OBJECT_ICON_FILL,
  });
}

/** Where an object's artwork sits inside the square tile drawn of it. */
export interface ObjectArtBox {
  /** Side of the square tile, in world units. */
  tile: number;
  /** The object's floor contact point, as a fraction across the tile. */
  footX: number;
  /** …and up from the tile's bottom edge. */
  footY: number;
}

const artBoxes = new Map<ObjectType, ObjectArtBox>();

/**
 * Where the object is, inside the picture of it.
 *
 * A tile of an object is a square with the artwork centred in it and scaled to
 * `OBJECT_ICON_FILL` of the larger side. That is fine for a grid of options and
 * useless for standing one in a room: the object's *feet* are somewhere inside
 * the square, and where depends on the artwork — a lamp is tall and narrow and
 * ends up floating in the middle of its tile, a rug is flat and wide and nearly
 * fills the bottom of it.
 *
 * So this answers the question the catalog cannot. `renderBoxFor` describes the
 * box an object is *drawn to*; what a tile actually contains is the box the
 * artwork *occupies* — which includes the contact shadow beneath it and, for a
 * lamp, a shade twice the width of its collider and a glow around that. Asking
 * the built artwork is the only honest way to know, and the answer never
 * changes, so it is measured once per type and kept.
 *
 * Used by the home page, which stands objects on the floor of a picture of the
 * room; see `features/home/homeArt.ts`.
 */
export function objectArtBox(type: ObjectType): ObjectArtBox {
  const known = artBoxes.get(type);
  if (known) return known;

  const view = renderObject({ type });
  const bounds = view.getLocalBounds();
  view.destroy({ children: true });

  // The artwork is anchored at its floor contact point, so local (0, 0) is
  // where the thing stands. Everything below is that point expressed as a
  // position inside the square the preview renderer will draw.
  const tile = Math.max(bounds.width, bounds.height) / OBJECT_ICON_FILL;
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;

  const box: ObjectArtBox = {
    tile,
    // The tile is centred on the artwork's centre, so the contact point sits
    // that centre's own offset away from the middle of the tile.
    footX: 0.5 - centreX / tile,
    footY: 0.5 + centreY / tile,
  };

  artBoxes.set(type, box);
  return box;
}

/** A thing that hangs on the wall. */
export function renderDecorIcon(kind: WallDecorKind, size = 76): Promise<string> {
  const spec = getWallDecor(kind);

  return renderPreview(
    `decor:${kind}`,
    () =>
      spec.draw(
        60,
        60,
        // The palette a decoration is normally handed by the room. Fixed here,
        // because one that followed the user's paint would make every preview
        // change colour when they repainted — the choice being offered is the
        // *piece*, not the colour it will end up.
        { wall: 0xf0dfcb, tint: 0xe7c9a9, accent: 0xd9552b },
        7,
      ),
    { size, fill: 0.86 },
  );
}

/**
 * A patch of floor.
 *
 * The floor is drawn as a whole room in perspective, so a preview of one is a
 * *crop* of the middle of it — the near edge, where the pattern is biggest and
 * a plank still looks like a plank.
 */
export function renderFloorIcon(
  pattern: FloorPattern,
  color: number,
  size = 76,
): Promise<string> {
  return renderPreview(
    `floor:${pattern}:${color}`,
    () => createFloor({ pattern, color, gridStrength: 0 }),
    {
      size,
      fill: 1,
      focus: (subject): Rectangle => {
        const bounds = subject.getLocalBounds();
        // The front third, centred: the back of a floor is a few pixels tall
        // and every pattern looks identical there.
        const side = Math.min(bounds.width, bounds.height) * 0.55;
        return {
          x: bounds.x + bounds.width / 2 - side / 2,
          y: bounds.y + bounds.height - side * 1.1,
          width: side,
          height: side,
        };
      },
    },
  );
}

/** A patch of wall. */
export function renderWallIcon(
  texture: WallTexture,
  color: number,
  size = 76,
): Promise<string> {
  return renderPreview(
    `wall:${texture}:${color}`,
    () => createWallTexture(texture, color, 5),
    {
      size,
      fill: 1,
      focus: (subject): Rectangle => {
        const bounds = subject.getLocalBounds();
        const side = Math.min(bounds.width, bounds.height) * 0.42;
        return {
          x: bounds.x + bounds.width / 2 - side / 2,
          y: bounds.y + bounds.height / 2 - side / 2,
          width: side,
          height: side,
        };
      },
    },
  );
}

/** What is on the other side of the glass. */
export function renderWindowIcon(view: WindowViewId, size = 76): Promise<string> {
  const spec = getWindowView(view);

  return renderPreview(
    `window:${view}`,
    // The hour's sky is what a view is lit by; noon keeps every view comparable
    // rather than showing six pictures of the same darkness.
    () => spec.draw(70, 70, getAmbience('noon').sky, 4),
    { size, fill: 1 },
  );
}

/** The hour, as the light it makes. */
export function renderAmbienceIcon(id: AmbienceId, tint: number, size = 76): Promise<string> {
  const ambience = getAmbience(id);

  return renderPreview(
    `ambience:${id}:${tint}`,
    () => createWallTexture('plaster', graded(tint, ambience), 3),
    {
      size,
      fill: 1,
      focus: (subject): Rectangle => {
        const bounds = subject.getLocalBounds();
        const side = Math.min(bounds.width, bounds.height) * 0.4;
        return {
          x: bounds.x + bounds.width / 2 - side / 2,
          y: bounds.y + bounds.height / 2 - side / 2,
          width: side,
          height: side,
        };
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/* What the panel will ask for, before it asks                                */
/* -------------------------------------------------------------------------- */

/**
 * The Room panel's sections, as lists of pictures that can be drawn early.
 *
 * The panel is one tab with seven chips above it, and only the first section is
 * on screen when it opens — so the first-click pause the creature editor had
 * lives here too, once per chip. Measured cold, the Objects grid: first tile at
 * 1109ms, all eighteen at 1333ms.
 *
 * In panel order, which is what makes the first entry worth treating specially:
 * `features/dashboard/prefetch` runs it eagerly because it is what the Room tab
 * *opens on*, and everything after it during idle time. A list in some other
 * order would still warm the same tiles, just not the ones that are about to be
 * looked at.
 *
 * Each section is a *function of the paint*, not a fixed list, and that is the
 * point of the shape: floors, walls and hours are previewed in the room's own
 * colour and cached under it, so a warm-up that used a stale tint would fill
 * the cache with entries the panel never asks for — all of the cost of
 * prewarming and none of the benefit.
 */
export const ROOM_PREVIEW_SECTIONS: readonly ((
  tint: number,
) => (() => Promise<string>)[])[] = [
  /*
   * Everything on the Things tab: what stands on the floor, and what hangs on
   * the wall. One section rather than two because they are one screen — wall
   * pieces became the fourth object category when the panel stopped filing them
   * beside the clock (`RoomStylePanel`), and a warm-up that still treated them
   * as a separate late pass would leave nine empty tiles at the bottom of the
   * tab the panel opens on. Neither cares what colour the room is painted.
   */
  () => [
    ...OBJECT_TYPES.map((type) => () => renderObjectIcon(type)),
    ...WALL_DECOR_KINDS.map((kind) => () => renderDecorIcon(kind)),
  ],
  // Hour.
  (tint) => AMBIENCE_LIST.map((hour) => () => renderAmbienceIcon(hour.id, tint)),
  // Surfaces: one grid of floors above one grid of walls.
  (tint) => [
    ...FLOOR_PATTERNS.map((pattern) => () => renderFloorIcon(pattern, tint)),
    ...WALL_TEXTURES.map((texture) => () => renderWallIcon(texture, tint)),
  ],
  // View.
  () => WINDOW_VIEW_LIST.map((view) => () => renderWindowIcon(view.id)),
];
