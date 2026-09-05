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
import { AMBIENCE_LIST, floorColor, getAmbience, graded } from '../../world/Ambience';
import type { Ambience, AmbienceId } from '../../world/Ambience';
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  backWallQuad,
  floorLine,
  project,
  wallQuad,
} from '../../world/Projection';
import { Container, Graphics } from 'pixi.js';
import { darken, lighten } from '../../assets/shared/color';
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

/* -------------------------------------------------------------------------- */
/* The room's own surfaces                                                    */
/* -------------------------------------------------------------------------- */

/*
 * These three used to draw the *material* and nothing else, and it was the
 * single biggest visual fault in the product.
 *
 * `createWallTexture` returns the overlay a wall wears — mottling, a dado rail,
 * mortar lines — and says so in its own comment: "Nothing here fills the wall
 * itself, that is `createWalls`'s job." Handed straight to the preview
 * renderer, with no wall under it, `plaster` was five patches at twelve per
 * cent alpha over transparency, `brick` was a grid of pale lines on nothing,
 * and the Hour tiles — which are *made of* `plaster` in the hour's own colour —
 * were five near-identical white smudges. The one thing an Hour tile exists to
 * show, the colour of the light, was the exact thing that was never painted.
 *
 * The floor had the same fault in a subtler form: it was previewed in
 * `style.tint`, the colour of the *paint*, so an ember room drew four
 * indistinguishable orange squares for four floors that are actually wood. The
 * room has always known better — `floorColor()` mixes the boards with a fifth
 * of the wall colour and grades the result by the hour — and the panel simply
 * was not asking it.
 *
 * So every tile below now builds the same small piece of room the scene does: a
 * surface, in its real colour, under the light it will actually be seen in.
 */

/**
 * The room's three walls, filled — the shell `createWalls` lays its material
 * over.
 *
 * All three, not just the one being cropped, because the back wall is the *far*
 * one and is therefore narrower on screen than the floor in front of it: a crop
 * wide enough to show a pattern repeating runs off both its edges, and what
 * showed through was the tile's own background. Two pale bars down the sides of
 * every wall and hour tile, which read as the picture having failed to load.
 *
 * The two side faces carry the same shifts the room gives them, so the corner
 * is a corner rather than a flat field.
 */
function wallShell(color: number): Graphics {
  const shell = new Graphics();
  fillQuad(shell, wallQuad('left'), darken(color, 0.18));
  fillQuad(shell, wallQuad('right'), lighten(color, 0.07));
  fillQuad(shell, backWallQuad(), color);
  return shell;
}

/** Fill a screen-space quad. */
function fillQuad(
  graphics: Graphics,
  quad: readonly { x: number; y: number }[],
  color: number,
  alpha = 1,
): void {
  graphics.poly(quad.flatMap((point) => [point.x, point.y]));
  graphics.fill({ color, alpha });
}

/**
 * One flat sheet of the hour's own light, over whatever is under it.
 *
 * The same `wash` the room lays over its whole frame (`world/Ambience.ts`), at
 * the same alpha. Without it a preview shows the graded surface colours but not
 * the *light*, and evening and night end up differing only by how brown their
 * walls are. Drawn large enough to cover any crop the tiles below ask for.
 */
function washOver(ambience: Ambience): Graphics {
  const sheet = new Graphics();
  sheet.rect(-ROOM_WIDTH, -2000, ROOM_WIDTH * 3, 4000);
  sheet.fill({ color: ambience.wash.color, alpha: ambience.wash.alpha });
  return sheet;
}

/**
 * A patch of floor, in the colour the floor is actually going to be.
 *
 * The floor is drawn as a whole room in perspective, so a preview of one is a
 * *crop* of the near half of it — where the boards are widest and a plank still
 * looks like a plank. The crop is deliberately shallower and wider than it was:
 * at the old "0.55 of the smaller side" it framed a square of the *middle*
 * distance, where every pattern has converged to the same fine hatch.
 *
 * `gridStrength: 0`, still: the placement grid is a tool for arranging a room,
 * not a property of the flooring. Two floors that differ only in their boards
 * should not both be shown wearing a ruler.
 */
export function renderFloorIcon(
  pattern: FloorPattern,
  tint: number,
  ambience: AmbienceId,
  size = 76,
): Promise<string> {
  const mood = getAmbience(ambience);
  const color = floorColor(tint, mood);

  return renderPreview(
    `floor:${pattern}:${tint}:${ambience}`,
    () => {
      const root = new Container();
      root.addChild(createFloor({ pattern, color, gridStrength: 0 }));
      root.addChild(washOver(mood));
      return root;
    },
    {
      size,
      fill: 1,
      focus: (): Rectangle => {
        // The front half of the room, centred: the widest boards, the largest
        // tiles, and enough of them for the pattern to repeat at least once.
        const near = floorLine(ROOM_DEPTH);
        const back = floorLine(ROOM_DEPTH * 0.5);
        const height = near[0].y - back[0].y;
        const centre = (near[0].x + near[1].x) / 2;

        return {
          x: centre - height / 2,
          y: back[0].y,
          width: height,
          height,
        };
      },
    },
  );
}

/**
 * A patch of wall — the wall, and then what it is made of.
 *
 * The shell is filled first, exactly as `createWalls` fills it before laying
 * the same texture over the top, so a brick tile is bricks *on a wall* rather
 * than mortar lines on nothing.
 */
export function renderWallIcon(
  texture: WallTexture,
  tint: number,
  ambience: AmbienceId,
  size = 76,
): Promise<string> {
  const mood = getAmbience(ambience);
  const color = graded(tint, mood);

  return renderPreview(
    `wall:${texture}:${tint}:${ambience}`,
    () => {
      const root = new Container();
      root.addChild(wallShell(color));
      root.addChild(createWallTexture(texture, color, 5));
      root.addChild(washOver(mood));
      return root;
    },
    {
      size,
      fill: 1,
      focus: (): Rectangle => {
        // Low and central on the back wall. Brick courses, panelling and the
        // dado rail all live in the bottom third; a crop of the plaster above
        // them would show six identical rectangles.
        const bottom = project(ROOM_WIDTH / 2, 0, 0);
        const top = project(ROOM_WIDTH / 2, 520, 0);
        const side = (bottom.y - top.y) * 0.9;

        return {
          x: bottom.x - side / 2,
          y: bottom.y - side,
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

/**
 * The hour, as the room at that hour.
 *
 * Not a swatch. An hour changes the wall colour, the floor colour, the light
 * lying across the boards, the sky through the glass and the sheet of colour
 * over all of it — and the only honest picture of "what does Sunset look like"
 * is a corner of the room with Sunset in it. So the tile is a real slice of
 * scene, built from the same numbers the room is built from:
 *
 * ```text
 *   the back wall        graded(tint, hour)
 *   the boards           floorColor(tint, hour)
 *   the light on them    hour.key — warm and long at sunset, barely there at
 *                        night, which is the difference a swatch cannot say
 *   the sky in the pane  hour.sky — the one part of the room that is outdoors,
 *                        and the fastest thing there is to read a time of day
 *   the wash             one flat sheet, the hour's own
 * ```
 *
 * Cropped on the corner where the wall meets the floor with the glass above it,
 * because that is the smallest region that contains all five.
 */
export function renderAmbienceIcon(
  id: AmbienceId,
  tint: number,
  size = 76,
): Promise<string> {
  const ambience = getAmbience(id);

  return renderPreview(
    `ambience:${id}:${tint}`,
    () => {
      const root = new Container();
      const wall = graded(tint, ambience);

      root.addChild(wallShell(wall));
      root.addChild(createWallTexture('plaster', wall, 3));

      root.addChild(createFloor({ color: floorColor(tint, ambience), gridStrength: 0 }));

      /*
       * The sky, as a bare pane rather than a whole window.
       *
       * The frame, the sill and the glazing bars belong to the *View* setting;
       * drawing them here would give five hour tiles that differ by their
       * joinery. What an hour owns is the light coming through.
       */
      const glass = new Graphics();
      const pane = { left: ROOM_WIDTH * 0.56, right: ROOM_WIDTH * 0.94, sill: 200, head: 560 };
      const at = (x: number, y: number) => project(x, y, 0);

      fillQuad(
        glass,
        [
          at(pane.left, pane.head),
          at(pane.right, pane.head),
          at(pane.right, pane.sill),
          at(pane.left, pane.sill),
        ],
        ambience.sky.color,
      );

      // Land along the horizon, so a dark sky reads as night rather than as a
      // dark rectangle, and so the sun at sunset has something to be low over.
      const horizon = pane.sill + (pane.head - pane.sill) * 0.4;
      fillQuad(
        glass,
        [
          at(pane.left, horizon),
          at(pane.right, horizon),
          at(pane.right, pane.sill),
          at(pane.left, pane.sill),
        ],
        ambience.sky.land,
      );

      if (ambience.sky.disc !== null) {
        const y = pane.sill + (pane.head - pane.sill) * ambience.sky.discHeight;
        const centre = at((pane.left + pane.right) / 2, y);
        const edge = at((pane.left + pane.right) / 2 + 30, y);
        glass.circle(centre.x, centre.y, Math.abs(edge.x - centre.x));
        glass.fill({ color: ambience.sky.disc });
      }

      root.addChild(glass);

      /*
       * The light the window throws onto the boards.
       *
       * The room draws a shaped, breathing pool for this; a 76-pixel tile only
       * needs the fact of it — that late light is warm and reaches a long way
       * in, and that at night there is almost none. Scaled by the hour's own
       * `key.strength`, so that fact is the hour's rather than this file's.
       */
      const pool = new Graphics();
      const back = floorLine(ROOM_DEPTH * 0.12);
      const front = floorLine(ROOM_DEPTH * 0.8);
      const across = (line: readonly { x: number; y: number }[], t: number) =>
        line[0].x + (line[1].x - line[0].x) * t;

      pool.poly([
        across(back, 0.52),
        back[0].y,
        across(back, 0.96),
        back[0].y,
        across(front, 0.86),
        front[0].y,
        across(front, 0.2),
        front[0].y,
      ]);
      pool.fill({ color: ambience.key.color, alpha: 0.14 * ambience.key.strength });
      root.addChild(pool);

      root.addChild(washOver(ambience));
      return root;
    },
    {
      size,
      fill: 1,
      focus: (): Rectangle => {
        // The right-hand corner: glass above, the crease across the middle,
        // boards below. Every decision the hour made, in one square — and the
        // boards are the half that has to be *in* it, because the pool of light
        // lying on them is the difference between afternoon and evening once
        // the sky has gone dark in both.
        const head = project(ROOM_WIDTH * 0.76, 620, 0);
        const front = floorLine(ROOM_DEPTH * 0.62);
        const side = front[0].y - head.y;
        const centre = project(ROOM_WIDTH * 0.76, 0, 0).x;

        return { x: centre - side / 2, y: head.y, width: side, height: side };
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
 * Each section is a *function of how the room is dressed*, not a fixed list,
 * and that is the point of the shape: floors, walls and hours are previewed in
 * the room's own colour **at the room's own hour** and cached under both, so a
 * warm-up that used a stale one would fill the cache with entries the panel
 * never asks for — all of the cost of prewarming and none of the benefit.
 *
 * The hour joined the paint here when the surface tiles started drawing the
 * light as well as the material. It is the same argument, applied to the
 * second thing that decides what a wall looks like.
 */
/** How the room is dressed right now — everything a surface tile is drawn in. */
export interface PreviewRoom {
  tint: number;
  ambience: AmbienceId;
}

export const ROOM_PREVIEW_SECTIONS: readonly ((
  room: PreviewRoom,
) => (() => Promise<string>)[])[] = [
  /*
   * Everything on the Furniture tab: what stands on the floor, and what hangs on
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
  ({ tint }) => AMBIENCE_LIST.map((hour) => () => renderAmbienceIcon(hour.id, tint)),
  // Surfaces: one grid of floors above one grid of walls.
  ({ tint, ambience }) => [
    ...FLOOR_PATTERNS.map((pattern) => () => renderFloorIcon(pattern, tint, ambience)),
    ...WALL_TEXTURES.map((texture) => () => renderWallIcon(texture, tint, ambience)),
  ],
  // View.
  () => WINDOW_VIEW_LIST.map((view) => () => renderWindowIcon(view.id)),
];
