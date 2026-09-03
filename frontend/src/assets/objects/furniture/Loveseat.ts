/**
 * Loveseat — two cushions, two arms, and a back with a dip in it.
 *
 * The softest thing on the floor, and the one that most rewards being built out
 * of `cushion` rather than out of rectangles: every mass here is a squircle with
 * a wobble on it, which is what makes upholstery read as full of something.
 *
 * The dip is the detail worth naming. A back drawn as one even bolster reads as
 * a bench; sagging it slightly in the middle — where two people would have sat —
 * is the whole difference between furniture and a picture of furniture, and it
 * costs one control point (§14).
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  cushion,
  edge,
  formFill,
  groundShadow,
  post,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createLoveseat(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 587);

  const root = new Container();
  root.label = 'loveseat';

  root.addChild(groundShadow(width, depth, 0.3));

  const half = width / 2;
  const seatY = -height * 0.44;
  const backTop = -height;
  const frame = tones(ctx.color);

  /* --- Feet, behind everything -------------------------------------------- */
  for (const side of [-1, 1]) {
    for (const back of [0, 1]) {
      root.addChild(
        post({
          x: side * half * (back ? 0.66 : 0.82),
          top: -height * 0.1,
          length: height * 0.1 - back * depth * FLOOR_SQUASH * 0.3,
          width: width * 0.05,
          color: darken(ctx.secondaryColor, back ? 0.24 : 0.1),
          taper: 0.34,
        }),
      );
    }
  }

  /* --- The back ------------------------------------------------------------ */
  /*
   * One shape with a dipped top edge, drawn before the arms so their rolls lap
   * over its ends.
   */
  const back = new Graphics();
  back.moveTo(-half * 0.94, seatY);
  back.quadraticCurveTo(-half * 0.98, backTop + height * 0.1, -half * 0.8, backTop + height * 0.06);
  back.quadraticCurveTo(0, backTop + height * 0.19, half * 0.8, backTop + height * 0.06);
  back.quadraticCurveTo(half * 0.98, backTop + height * 0.1, half * 0.94, seatY);
  back.closePath();
  back.fill(formFill(frame, 0.62));
  edge(back, ctx.color, 3, 0.34);
  root.addChild(back);

  // Two back pillows, tucked in behind the seat. Split, because a single panel
  // the width of the piece is the one thing that always reads as a bench.
  for (const side of [-1, 1]) {
    root.addChild(
      cushion({
        x: side * half * 0.4,
        y: seatY - height * 0.24,
        width: half * 0.74,
        height: height * 0.34,
        color: lighten(ctx.color, 0.07),
        roundness: 0.62,
        seed: ctx.seed + 11 + side,
      }),
    );
  }

  /* --- Seat cushions ------------------------------------------------------- */
  for (const side of [-1, 1]) {
    root.addChild(
      cushion({
        x: side * half * 0.38,
        y: seatY + height * 0.02,
        width: half * 0.76,
        height: height * 0.2,
        color: mix(ctx.secondaryColor, ctx.color, 0.25),
        roundness: 0.7,
        tufts: 3,
        seed: ctx.seed + 21 + side,
      }),
    );
  }

  // The apron under them, so the cushions sit *in* the frame.
  const apron = new Graphics();
  apron.moveTo(-half * 0.9, seatY + height * 0.11);
  apron.lineTo(half * 0.9, seatY + height * 0.11);
  apron.lineTo(half * 0.86, -height * 0.08);
  apron.quadraticCurveTo(0, -height * 0.08 + depth * FLOOR_SQUASH * 0.4, -half * 0.86, -height * 0.08);
  apron.closePath();
  apron.fill(formFill(tones(darken(ctx.color, 0.08)), 0.4));
  edge(apron, ctx.color, 2.5, 0.32);
  root.addChild(apron);

  /* --- Arms ---------------------------------------------------------------- */
  // Last, over everything, because a rolled arm is the nearest part of the
  // piece to the room.
  for (const side of [-1, 1]) {
    root.addChild(
      cushion({
        x: side * half * 0.86,
        y: seatY - height * 0.1,
        width: width * 0.2,
        height: height * 0.44,
        color: side < 0 ? lighten(ctx.color, 0.05) : darken(ctx.color, 0.06),
        roundness: 0.68,
        seed: ctx.seed + 31 + side,
      }),
    );
  }

  /* --- A throw blanket over one arm ---------------------------------------- */
  // The thing that makes it somebody's sofa. On one arm only, and always the
  // same one for a given seed.
  const throwSide = rng() < 0.5 ? -1 : 1;
  const blanket = new Graphics();
  const bx = throwSide * half * 0.86;

  blanket.moveTo(bx - width * 0.1, seatY - height * 0.26);
  blanket.quadraticCurveTo(bx + throwSide * width * 0.12, seatY - height * 0.3, bx + throwSide * width * 0.11, seatY - height * 0.02);
  blanket.quadraticCurveTo(bx + throwSide * width * 0.1, seatY + height * 0.16, bx + throwSide * width * 0.02, seatY + height * 0.2);
  blanket.quadraticCurveTo(bx - width * 0.02, seatY + height * 0.06, bx - width * 0.1, seatY - height * 0.26);
  blanket.closePath();
  blanket.fill(formFill(tones(ctx.accentColor), 0.7));
  edge(blanket, ctx.accentColor, 2, 0.32);
  root.addChild(blanket);

  const fold = new Graphics();
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    fold.moveTo(bx - width * 0.08 + throwSide * width * 0.02, seatY - height * (0.24 - t * 0.22));
    fold.quadraticCurveTo(
      bx + throwSide * width * 0.04,
      seatY - height * (0.2 - t * 0.22),
      bx + throwSide * width * 0.09,
      seatY - height * (0.24 - t * 0.24),
    );
  }
  fold.stroke({ color: darken(ctx.accentColor, 0.24), width: 2, alpha: 0.4 });
  root.addChild(fold);

  const fringe = new Graphics();
  for (let i = 0; i <= 4; i++) {
    const x = bx - width * 0.02 + throwSide * (i / 4) * width * 0.1;
    fringe.moveTo(x, seatY + height * (0.13 + rngRange(rng, 0, 0.03)));
    fringe.lineTo(x + rngRange(rng, -1.5, 1.5), seatY + height * 0.23);
  }
  fringe.stroke({ color: lighten(ctx.accentColor, 0.24), width: 1.8, alpha: 0.8 });
  root.addChild(fringe);

  return root;
}
