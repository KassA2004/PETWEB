/**
 * Chair — one cell of floor, four legs, a seat and a back.
 *
 * The smallest piece of real furniture, and the reference for how the rest are
 * built: back legs first at a smaller scale and lifted up the screen, then the
 * seat as a slab with a visible top face, then the front legs and the back
 * rest. Drawing the back pair is what turns a chair from a side-on pictogram
 * into an object standing in a room.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  cushion,
  edge,
  formFill,
  grain,
  groundShadow,
  post,
  slab,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createChair(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;

  const root = new Container();
  root.label = 'chair';

  root.addChild(groundShadow(width, depth, 0.26));

  const seatY = -height * 0.52;
  const legWidth = width * 0.11;
  const legInset = width * 0.34;
  const depthLift = depth * FLOOR_SQUASH * 0.5;

  // --- Back legs and the back rest, behind the seat ------------------------
  const behind = new Container();
  behind.y = -depthLift;

  for (const side of [-1, 1]) {
    behind.addChild(
      post({
        x: side * legInset * 0.88,
        top: seatY,
        length: -seatY - depthLift * 0.4,
        width: legWidth * 0.86,
        color: darken(ctx.accentColor, 0.3),
      }),
    );
  }

  // The back: two uprights and a rounded splat between them.
  const backTones = tones(ctx.color);
  const backTop = seatY - height * 0.46;

  const splat = new Graphics();
  drawSquircle(splat, 0, (seatY + backTop) / 2, width * 0.3, (seatY - backTop) / 2, {
    roundness: 0.5,
  });
  splat.fill(formFill(backTones, 0.6));
  drawSquircle(splat, 0, (seatY + backTop) / 2, width * 0.3, (seatY - backTop) / 2, {
    roundness: 0.5,
  });
  edge(splat, ctx.color, 3, 0.4);
  behind.addChild(splat);

  const splatGrain = grain(width * 0.5, (seatY - backTop) * 0.7, ctx.color, ctx.seed, 3);
  splatGrain.y = (seatY + backTop) / 2;
  behind.addChild(splatGrain);

  for (const side of [-1, 1]) {
    behind.addChild(
      post({
        x: side * width * 0.3,
        top: backTop,
        length: seatY - backTop + height * 0.05,
        width: legWidth * 0.8,
        color: darken(ctx.color, 0.14),
        taper: 0.05,
      }),
    );
  }

  root.addChild(behind);

  // --- Seat ----------------------------------------------------------------
  root.addChild(
    slab({
      y: seatY,
      width,
      depth,
      thickness: height * 0.1,
      color: ctx.accentColor,
      roundness: 0.55,
    }),
  );

  root.addChild(
    cushion({
      y: seatY - height * 0.02,
      width: width * 0.72,
      height: depth * FLOOR_SQUASH * 0.62,
      color: lighten(ctx.secondaryColor, 0.06),
      roundness: 0.85,
      seed: ctx.seed + 5,
    }),
  );

  // --- Front legs ----------------------------------------------------------
  for (const side of [-1, 1]) {
    root.addChild(
      post({
        x: side * legInset,
        top: seatY + height * 0.06,
        length: -seatY - height * 0.06,
        width: legWidth,
        color: ctx.accentColor,
      }),
    );
  }

  return root;
}
