/**
 * Walls — the three faces of the box, what they are made of, and what is
 * hanging on them.
 *
 * A back wall square to the camera and two side walls raking away from it.
 * The side walls are what make the room a room: they give the frame two strong
 * converging edges, and they put something solid at the left and right of the
 * floor so a body clamped against the grid's edge visibly stops at a wall
 * rather than at nothing.
 *
 * They are shaded differently on purpose. The window is on the back wall to
 * the left, so the left wall turns away from it and the right wall catches it.
 * Two flat tones, no gradients — light here is a shape, like everything else
 * (/Docs/theme-and-design.md §4).
 *
 * What this file assembles, in order:
 *
 *   shell        the three flat faces
 *   texture      what they are made of (./walls/WallTextures.ts)
 *   creases      the two corners, so the box is unmistakably a box
 *   window       the hole and everything in it (./window/Window.ts)
 *   decor        whatever the user has hung up (./walls/WallDecor.ts), on the
 *                wall grid, which shares its columns with the floor
 *   baseboard    the skirting, following the perspective all the way round
 *
 * None of it decides *what* is on the walls. That is the room's style
 * (world/RoomStyle.ts), which is a saved document rather than a decision this
 * file gets to make.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../shared/color';
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  WALL_HEIGHT,
  backWallQuad,
  project,
  scaleAt,
  wallQuad,
} from '../../world/Projection';
import { wallBox, wallCenter } from '../../world/WallGrid';
import type { WallFootprint } from '../../world/WallGrid';
import type { SkySpec } from '../../world/Ambience';
import type { WallDecorPlacement } from '../../world/RoomStyle';
import type { ScreenPoint } from '../../world/Projection';
import { createWallFade, createWallTexture } from './walls/WallTextures';
import type { WallTexture } from './walls/WallTextures';
import { getWallDecor } from './walls/WallDecor';
import { createWindow } from './window/Window';
import type { WindowViewId } from './window/WindowViews';

/**
 * The window's own footprint on the wall grid, and the half-extents that
 * follow from it.
 *
 * Two cells wide and three tall, so the window lines up with the columns the
 * furniture stands in and with anything else hung beside it. It used to be a
 * fraction of the room's width and a magic number, which is why nothing on the
 * back wall ever quite agreed with anything else on it.
 */
export const WINDOW_FOOTPRINT: WallFootprint = { cols: 2, rows: 3 };

const WINDOW_BOX = wallBox(WINDOW_FOOTPRINT, 0.9);

/** Half-extents of the window opening, in world units. */
export const WINDOW_HALF = { w: WINDOW_BOX.width / 2, h: WINDOW_BOX.height / 2 };

export interface WallsOptions {
  color: number;
  /** What the walls are made of. */
  texture: WallTexture;
  /** What is on the other side of the glass. */
  view: WindowViewId;
  /** The hour's sky, handed through to the window. */
  sky: SkySpec;
  /** Centre of the window, in world coordinates on the back wall. */
  windowX: number;
  windowY: number;
  /** What the user has hung on the back wall. */
  decor?: WallDecorPlacement[];
  /** The room's chosen tint, for decorations that want to match it. */
  tint: number;
  /** The project accent, for decorations that want to sing. */
  accent: number;
  seed?: number;
}

function fillQuad(graphics: Graphics, quad: ScreenPoint[], color: number, alpha = 1) {
  graphics.poly(quad.flatMap((point) => [point.x, point.y]));
  graphics.fill({ color, alpha });
}

export function createWalls(options: WallsOptions): Container {
  const { color, sky, tint, accent } = options;
  const seed = options.seed ?? 5;

  const root = new Container();
  root.label = 'walls';

  // --- The three faces -----------------------------------------------------
  const shell = new Graphics();
  fillQuad(shell, wallQuad('left'), darken(color, 0.18));
  fillQuad(shell, wallQuad('right'), lighten(color, 0.07));
  fillQuad(shell, backWallQuad(), color);
  root.addChild(shell);

  // --- What they are made of ----------------------------------------------
  root.addChild(createWallTexture(options.texture, color, seed));
  root.addChild(createWallFade(color));

  // The corner where wall meets floor is never as bright as the wall above
  // it — one darker band along the whole back, and the box gains a floor it
  // is standing on rather than a colour it changes to.
  const crease = new Graphics();
  fillQuad(
    crease,
    [
      project(0, 0, 0),
      project(ROOM_WIDTH, 0, 0),
      project(ROOM_WIDTH, 120, 0),
      project(0, 120, 0),
    ],
    darken(color, 0.2),
    0.5,
  );
  root.addChild(crease);

  // The creases where the side walls meet the back wall. Two lines, and the
  // box is unmistakably a box.
  const creases = new Graphics();
  for (const x of [0, ROOM_WIDTH]) {
    const bottom = project(x, 0, 0);
    const top = project(x, WALL_HEIGHT, 0);
    creases.moveTo(bottom.x, bottom.y);
    creases.lineTo(top.x, top.y);
  }
  creases.stroke({ color: outline(color, 0.35), width: 3, alpha: 0.4 });
  root.addChild(creases);

  // --- Window --------------------------------------------------------------
  root.addChild(
    createWindow({
      x: options.windowX,
      y: options.windowY,
      halfW: WINDOW_HALF.w,
      halfH: WINDOW_HALF.h,
      wallColor: color,
      sky,
      view: options.view,
      seed,
    }),
  );

  // --- Decor ---------------------------------------------------------------
  // Everything on the back wall is at one uniform scale, because the back wall
  // is at one depth. So a piece is drawn in its own units and then scaled once,
  // which is why the decor library never has to think about perspective.
  const wallScale = scaleAt(0);
  const palette = { wall: color, tint, accent };

  for (const placement of options.decor ?? []) {
    const spec = getWallDecor(placement.kind);
    const box = wallBox(spec.footprint, spec.fill ?? 0.86);
    const centre = wallCenter(placement, spec.footprint);
    const at = project(centre.x, centre.y, 0);

    const piece = spec.draw(
      (box.width / 2) * wallScale,
      (box.height / 2) * wallScale,
      palette,
      seed + placement.col * 31 + placement.row * 7,
    );
    piece.position.set(at.x, at.y);
    piece.label = `decor-${placement.kind}`;
    root.addChild(piece);
  }

  // --- Baseboard -----------------------------------------------------------
  // It follows the floor line all the way round, which means it also follows
  // the perspective — the one detail that would look most wrong if it did not.
  const skirting = 26;
  const baseboard = new Graphics();

  fillQuad(
    baseboard,
    [
      project(0, 0, 0),
      project(ROOM_WIDTH, 0, 0),
      project(ROOM_WIDTH, skirting, 0),
      project(0, skirting, 0),
    ],
    lighten(color, 0.16),
  );

  for (const x of [0, ROOM_WIDTH]) {
    fillQuad(
      baseboard,
      [
        project(x, 0, 0),
        project(x, 0, ROOM_DEPTH),
        project(x, skirting, ROOM_DEPTH),
        project(x, skirting, 0),
      ],
      lighten(color, x === 0 ? 0.02 : 0.22),
    );
  }

  root.addChild(baseboard);

  return root;
}
