/**
 * Walls — the structure on the back plane: a window and the baseboard.
 *
 * The color field itself comes from Background; this layer only adds the few
 * flat shapes that make the plane read as a wall you could stand against. The
 * window matters more than it looks — it is where the light in the room is
 * supposed to come from, so the floor pool and every shine face it.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, outline } from '../shared/color';
import { drawSquircle } from '../shared/shapes';

export interface WallsOptions {
  width: number;
  /** Y coordinate where the wall meets the floor. */
  floorY: number;
  color?: number;
  /** Centre of the window, in room coordinates. */
  windowX?: number;
  windowY?: number;
}

export function createWalls(options: WallsOptions): Container {
  const { width, floorY } = options;
  const color = options.color ?? PALETTE.ember;
  const windowX = options.windowX ?? width * 0.26;
  const windowY = options.windowY ?? floorY * 0.42;

  const root = new Container();
  root.label = 'walls';

  // --- Window --------------------------------------------------------------
  const windowWidth = width * 0.17;
  const windowHeight = floorY * 0.44;

  const frame = new Graphics();
  drawSquircle(
    frame,
    windowX,
    windowY,
    windowWidth / 2 + 12,
    windowHeight / 2 + 12,
    { roundness: 0.6 },
  );
  frame.fill({ color: darken(color, 0.4) });
  root.addChild(frame);

  const pane = new Graphics();
  drawSquircle(pane, windowX, windowY, windowWidth / 2, windowHeight / 2, {
    roundness: 0.6,
  });
  pane.fill({ color: PALETTE.cream });
  root.addChild(pane);

  // Two flat hills outside, in one tone. Anything more turns the window into
  // a second scene competing with the room.
  const outside = new Graphics();
  outside.ellipse(
    windowX - windowWidth * 0.22,
    windowY + windowHeight * 0.52,
    windowWidth * 0.44,
    windowHeight * 0.34,
  );
  outside.ellipse(
    windowX + windowWidth * 0.3,
    windowY + windowHeight * 0.56,
    windowWidth * 0.36,
    windowHeight * 0.26,
  );
  outside.fill({ color: PALETTE.mint, alpha: 0.75 });
  outside.mask = (() => {
    const clip = new Graphics();
    drawSquircle(clip, windowX, windowY, windowWidth / 2, windowHeight / 2, {
      roundness: 0.6,
    });
    clip.fill({ color: 0xffffff });
    root.addChild(clip);
    return clip;
  })();
  root.addChild(outside);

  // Muntin bars.
  const bars = new Graphics();
  bars.moveTo(windowX, windowY - windowHeight / 2);
  bars.lineTo(windowX, windowY + windowHeight / 2);
  bars.moveTo(windowX - windowWidth / 2, windowY);
  bars.lineTo(windowX + windowWidth / 2, windowY);
  bars.stroke({ color: darken(color, 0.4), width: 8 });
  root.addChild(bars);

  // --- Baseboard -----------------------------------------------------------
  const baseboardHeight = 22;
  const baseboard = new Graphics();
  baseboard.rect(0, floorY - baseboardHeight, width, baseboardHeight);
  baseboard.fill({ color: lighten(color, 0.16) });
  baseboard.rect(0, floorY - 4, width, 4);
  baseboard.fill({ color: outline(color, 0.45) });
  root.addChild(baseboard);

  return root;
}
