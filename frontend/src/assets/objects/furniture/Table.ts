/**
 * Table — two cells of floor, a thick top, four legs and a lower rail.
 *
 * The top is the point of it: the creature can be put on a table, so the table
 * has to look like something with an upper surface rather than a plank on
 * sticks. That is `slab`'s whole job, and the rail between the legs is what
 * stops the underside reading as empty air.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken } from '../../shared/color';
import {
  FLOOR_SQUASH,
  edge,
  grain,
  groundShadow,
  post,
  slab,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createTable(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;

  const root = new Container();
  root.label = 'table';

  root.addChild(groundShadow(width * 0.92, depth * 0.92, 0.24));

  const topY = -height * 0.94;
  const legWidth = width * 0.062;
  const legInset = width * 0.4;
  const depthLift = depth * FLOOR_SQUASH * 0.5;

  // Back legs: smaller, lifted, and a shade darker, which is the whole of the
  // depth cue on a piece of furniture this simple.
  const behind = new Container();
  behind.y = -depthLift;
  behind.scale.set(0.9, 1);
  for (const side of [-1, 1]) {
    behind.addChild(
      post({
        x: side * legInset,
        top: topY,
        length: -topY - depthLift,
        width: legWidth,
        color: darken(ctx.color, 0.3),
      }),
    );
  }
  root.addChild(behind);

  // The rail, tying the four legs together low down.
  const rail = new Graphics();
  rail.roundRect(-legInset, topY * 0.28, legInset * 2, height * 0.045, height * 0.02);
  rail.fill({ color: darken(ctx.color, 0.22) });
  edge(rail, ctx.color, 2, 0.3);
  root.addChild(rail);

  for (const side of [-1, 1]) {
    root.addChild(
      post({
        x: side * legInset,
        top: topY,
        length: -topY,
        width: legWidth * 1.1,
        color: ctx.color,
      }),
    );
  }

  // Roundness well down from the default: a table top is a rectangle with the
  // corners taken off, and at roundness 0.6 it reads as an oval, which is what
  // made this look like an ottoman.
  root.addChild(
    slab({
      y: topY,
      width,
      depth: depth * 0.8,
      thickness: height * 0.06,
      color: ctx.color,
      roundness: 0.28,
    }),
  );

  const topGrain = grain(width * 0.82, depth * FLOOR_SQUASH * 0.55, ctx.color, ctx.seed, 5);
  topGrain.y = topY;
  root.addChild(topGrain);

  return root;
}
