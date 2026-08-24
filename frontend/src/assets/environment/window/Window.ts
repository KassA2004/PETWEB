/**
 * The window — the hole in the back wall, and everything around it.
 *
 * The old one was a squircle with a sky painted in it and a cross of glazing
 * bars over the top. It read as a sticker, for one specific reason: it had no
 * *reveal*. A window is a hole in something thick, so the wall shows its own
 * cut edge around the opening, and the light lands on the sill in front of it.
 * Without those, a window is a picture of a window.
 *
 * So this one is built as a hole:
 *
 *   reveal        the wall's cut edge, lit on the top and left where the light
 *                 falls into it and shadowed on the right
 *   pane          the view, clipped
 *   glass         one flat diagonal sheen across the glazing, and the light
 *                 spill onto the wall around the frame
 *   bars          glazing bars with their own shadows cast onto the view
 *   frame + sill  the joinery, with a visible board projecting into the room
 *
 * What is *outside* is the view's business entirely (./WindowViews.ts). This
 * file knows how to cut a hole in a wall and what to hang in it; it does not
 * know what a mountain is.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { formFill } from '../../objects/shared/Surface';
import type { SkySpec } from '../../../world/Ambience';
import { project, scaleAt } from '../../../world/Projection';
import { getWindowView } from './WindowViews';
import type { WindowViewId } from './WindowViews';

export interface WindowOptions {
  /** Centre of the opening, in world coordinates on the back wall. */
  x: number;
  y: number;
  /** Half-extents of the opening, in world units. */
  halfW: number;
  halfH: number;
  /** The wall's own colour, so the reveal is made of the wall. */
  wallColor: number;
  /** The hour's sky, handed through to the view. */
  sky: SkySpec;
  view: WindowViewId;
  seed?: number;
}

/** How round the opening is. A little, not a lot: this is joinery. */
const ROUNDNESS = 0.45;

export function createWindow(options: WindowOptions): Container {
  const { wallColor, sky } = options;
  const seed = options.seed ?? 4242;

  const root = new Container();
  root.label = 'window';

  // The back wall is at one depth, so everything about the window is at one
  // uniform scale. That is the whole reason the window can be drawn in screen
  // space here rather than projected shape by shape.
  const scale = scaleAt(0);
  const centre = project(options.x, options.y, 0);
  const halfW = options.halfW * scale;
  const halfH = options.halfH * scale;

  const wall = tones(wallColor);
  const jamb = darken(wallColor, 0.42);

  // --- Light spilling onto the wall around the opening ---------------------
  // Drawn first and widest. This is what ties the window to the wall: a hole
  // letting light in brightens the plaster around itself.
  const spill = new Graphics();
  for (const [scaleUp, alpha] of [[2.4, 0.05], [1.8, 0.06], [1.35, 0.07]] as const) {
    drawSquircle(spill, centre.x, centre.y, halfW * scaleUp, halfH * scaleUp, {
      roundness: 0.8,
    });
    spill.fill({ color: sky.color, alpha });
  }
  root.addChild(spill);

  // --- Frame ---------------------------------------------------------------
  const frameWidth = 14 * scale;

  const frame = new Graphics();
  drawSquircle(frame, centre.x, centre.y, halfW + frameWidth, halfH + frameWidth, {
    roundness: ROUNDNESS,
  });
  frame.fill(formFill(tones(lighten(wallColor, 0.24)), 0.6));
  root.addChild(frame);

  // --- Reveal --------------------------------------------------------------
  // The cut edge of the wall, inside the frame. Two flat tones: lit along the
  // top and left, shadowed along the bottom and right.
  const revealDepth = 7 * scale;

  const reveal = new Graphics();
  drawSquircle(reveal, centre.x, centre.y, halfW + revealDepth, halfH + revealDepth, {
    roundness: ROUNDNESS,
  });
  reveal.fill({ color: jamb });
  drawSquircle(
    reveal,
    centre.x - revealDepth * 0.4,
    centre.y - revealDepth * 0.4,
    halfW + revealDepth * 0.6,
    halfH + revealDepth * 0.6,
    { roundness: ROUNDNESS },
  );
  reveal.fill({ color: lighten(wall.light, 0.1), alpha: 0.55 });
  root.addChild(reveal);

  // --- The view ------------------------------------------------------------
  const opening = new Container();
  opening.position.set(centre.x, centre.y);

  const clip = new Graphics();
  drawSquircle(clip, centre.x, centre.y, halfW, halfH, { roundness: ROUNDNESS });
  clip.fill({ color: 0xffffff });
  root.addChild(clip);
  opening.mask = clip;

  const spec = getWindowView(options.view);
  opening.addChild(spec.draw(halfW, halfH, sky, seed));

  // The glass itself: one flat diagonal sheen, and a cooler tint down the
  // shadowed side. Two shapes, and the pane stops being an open hole.
  const glass = new Graphics();
  glass.moveTo(-halfW, halfH * 0.1);
  glass.lineTo(halfW * 0.2, -halfH);
  glass.lineTo(halfW * 0.62, -halfH);
  glass.lineTo(-halfW, halfH * 0.62);
  glass.closePath();
  glass.fill({ color: PALETTE.cream, alpha: 0.12 });
  opening.addChild(glass);

  root.addChild(opening);

  // --- Glazing bars --------------------------------------------------------
  // Drawn over the opening rather than inside it, with their own cast shadow
  // just below and right, which is what gives them thickness.
  const barWidth = 7 * scale;

  const barShadow = new Graphics();
  barShadow.rect(centre.x - barWidth / 2 + barWidth * 0.5, centre.y - halfH, barWidth, halfH * 2);
  barShadow.rect(centre.x - halfW, centre.y - barWidth / 2 + barWidth * 0.5, halfW * 2, barWidth);
  barShadow.fill({ color: jamb, alpha: 0.35 });
  barShadow.mask = clip;
  root.addChild(barShadow);

  const bars = new Graphics();
  bars.rect(centre.x - barWidth / 2, centre.y - halfH, barWidth, halfH * 2);
  bars.rect(centre.x - halfW, centre.y - barWidth / 2, halfW * 2, barWidth);
  bars.fill(formFill(tones(lighten(wallColor, 0.3)), 0.7));
  bars.mask = clip;
  root.addChild(bars);

  // --- Sill ----------------------------------------------------------------
  // A board projecting into the room, so the window has a thickness the eye can
  // measure. Drawn as a slab with its own top face catching the light.
  const sillW = halfW + frameWidth * 2.4;
  const sillY = centre.y + halfH + frameWidth * 0.6;
  const sillThickness = 11 * scale;
  const sillJut = 9 * scale;

  const sill = new Graphics();
  sill.moveTo(centre.x - sillW, sillY);
  sill.lineTo(centre.x + sillW, sillY);
  sill.lineTo(centre.x + sillW + sillJut, sillY + sillJut);
  sill.lineTo(centre.x + sillW + sillJut, sillY + sillJut + sillThickness);
  sill.lineTo(centre.x - sillW - sillJut, sillY + sillJut + sillThickness);
  sill.lineTo(centre.x - sillW - sillJut, sillY + sillJut);
  sill.closePath();
  sill.fill(formFill(tones(lighten(wallColor, 0.2)), 0.4));
  root.addChild(sill);

  const sillTop = new Graphics();
  sillTop.moveTo(centre.x - sillW, sillY);
  sillTop.lineTo(centre.x + sillW, sillY);
  sillTop.lineTo(centre.x + sillW + sillJut, sillY + sillJut);
  sillTop.lineTo(centre.x - sillW - sillJut, sillY + sillJut);
  sillTop.closePath();
  sillTop.fill({ color: mix(lighten(wallColor, 0.4), sky.color, 0.24) });
  root.addChild(sillTop);

  // The shadow the sill casts on the wall under it.
  const cast = new Graphics();
  cast.moveTo(centre.x - sillW - sillJut, sillY + sillJut + sillThickness);
  cast.lineTo(centre.x + sillW + sillJut, sillY + sillJut + sillThickness);
  cast.lineTo(centre.x + sillW, sillY + sillJut + sillThickness + 14 * scale);
  cast.lineTo(centre.x - sillW, sillY + sillJut + sillThickness + 14 * scale);
  cast.closePath();
  cast.fill({ color: darken(wallColor, 0.4), alpha: 0.28 });
  root.addChild(cast);

  return root;
}
