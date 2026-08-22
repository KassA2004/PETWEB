/**
 * Walls — the three faces of the box, and the hole the light comes through.
 *
 * A back wall square to the camera and two side walls raking away from it.
 * The side walls are the change that makes the room a room: they give the
 * frame two strong converging edges, and they put something solid at the left
 * and right of the floor so a body clamped against `x = 0` visibly stops at a
 * wall rather than at nothing.
 *
 * They are shaded differently on purpose. The window is on the back wall to
 * the left, so the left wall turns away from it and the right wall catches it.
 * Two flat tones, no gradients — light here is a shape, like everything else
 * (/Docs/theme-and-design.md §4).
 *
 * What is *outside* the window is the mood's business (see world/Ambience.ts).
 * It is the one place in the room where the time of day can be stated outright
 * instead of implied, which is why it is worth four shapes and no more: a sky,
 * a couple of hills, a disc, and some stars if the sky is dark enough to hold
 * any.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, outline } from '../shared/color';
import { createRng, drawSquircle, rngRange } from '../shared/shapes';
import type { SkySpec } from '../../world/Ambience';
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  WALL_HEIGHT,
  backWallQuad,
  project,
  scaleAt,
  wallQuad,
} from '../../world/Projection';
import type { ScreenPoint } from '../../world/Projection';

/** Half-extents of the window opening, in world units. */
export const WINDOW_HALF = { w: ROOM_WIDTH * 0.085, h: 150 };

export interface WallsOptions {
  color: number;
  /** What is on the other side of the glass. */
  sky: SkySpec;
  /** Centre of the window, in world coordinates on the back wall. */
  windowX?: number;
  windowY?: number;
}

function fillQuad(graphics: Graphics, quad: ScreenPoint[], color: number, alpha = 1) {
  graphics.poly(quad.flatMap((point) => [point.x, point.y]));
  graphics.fill({ color, alpha });
}

export function createWalls(options: WallsOptions): Container {
  const { color, sky } = options;
  const windowX = options.windowX ?? ROOM_WIDTH * 0.3;
  const windowY = options.windowY ?? 330;

  const root = new Container();
  root.label = 'walls';

  // --- The three faces -----------------------------------------------------
  const shell = new Graphics();
  fillQuad(shell, wallQuad('left'), darken(color, 0.18));
  fillQuad(shell, wallQuad('right'), lighten(color, 0.07));
  fillQuad(shell, backWallQuad(), color);
  root.addChild(shell);

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
  // Drawn on the back wall, so everything about it is one uniform scale.
  const wallScale = scaleAt(0);
  const centre = project(windowX, windowY, 0);
  const halfW = WINDOW_HALF.w * wallScale;
  const halfH = WINDOW_HALF.h * wallScale;

  const frame = new Graphics();
  drawSquircle(frame, centre.x, centre.y, halfW + 12 * wallScale, halfH + 12 * wallScale, {
    roundness: 0.6,
  });
  frame.fill({ color: darken(color, 0.4) });
  root.addChild(frame);

  const pane = new Graphics();
  drawSquircle(pane, centre.x, centre.y, halfW, halfH, { roundness: 0.6 });
  pane.fill({ color: sky.color });
  root.addChild(pane);

  // Everything beyond the glass is clipped to the pane, so the outside can be
  // drawn without any of it caring where the window's edges are.
  const outside = new Container();
  outside.label = 'window-outside';

  const clip = new Graphics();
  drawSquircle(clip, centre.x, centre.y, halfW, halfH, { roundness: 0.6 });
  clip.fill({ color: 0xffffff });
  root.addChild(clip);
  outside.mask = clip;

  // Stars first: they belong behind the hills and the disc.
  if (sky.stars > 0) {
    const rng = createRng(4242);
    const stars = new Graphics();
    for (let i = 0; i < sky.stars; i++) {
      stars.circle(
        centre.x + rngRange(rng, -halfW, halfW),
        centre.y + rngRange(rng, -halfH, halfH * 0.35),
        rngRange(rng, 1.2, 2.6) * wallScale,
      );
    }
    stars.fill({ color: 0xffffff, alpha: 0.7 });
    outside.addChild(stars);
  }

  // Sun or moon: one disc, one soft ring around it.
  if (sky.disc !== null) {
    const discY = centre.y + halfH * (0.5 - sky.discHeight);
    const discX = centre.x + halfW * 0.22;
    const radius = halfW * 0.3;

    const disc = new Graphics();
    disc.circle(discX, discY, radius * 2.1);
    disc.fill({ color: sky.disc, alpha: 0.16 });
    disc.circle(discX, discY, radius * 1.45);
    disc.fill({ color: sky.disc, alpha: 0.22 });
    disc.circle(discX, discY, radius);
    disc.fill({ color: sky.disc });
    outside.addChild(disc);
  }

  // Two flat hills. Anything more turns the window into a second scene
  // competing with the room.
  const hills = new Graphics();
  hills.ellipse(centre.x - halfW * 0.44, centre.y + halfH * 0.52, halfW * 0.88, halfH * 0.34);
  hills.ellipse(centre.x + halfW * 0.6, centre.y + halfH * 0.56, halfW * 0.72, halfH * 0.26);
  hills.fill({ color: sky.land, alpha: 0.85 });
  outside.addChild(hills);

  root.addChild(outside);

  const bars = new Graphics();
  bars.moveTo(centre.x, centre.y - halfH);
  bars.lineTo(centre.x, centre.y + halfH);
  bars.moveTo(centre.x - halfW, centre.y);
  bars.lineTo(centre.x + halfW, centre.y);
  bars.stroke({ color: darken(color, 0.4), width: 8 * wallScale });
  root.addChild(bars);

  // The sill catches whatever is outside, which is what ties the window to the
  // wall instead of leaving it stuck on like a poster.
  const sill = new Graphics();
  sill.roundRect(
    centre.x - halfW - 22 * wallScale,
    centre.y + halfH + 8 * wallScale,
    (halfW + 22 * wallScale) * 2,
    14 * wallScale,
    6 * wallScale,
  );
  sill.fill({ color: mix(lighten(color, 0.22), sky.color, 0.18) });
  root.addChild(sill);

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
