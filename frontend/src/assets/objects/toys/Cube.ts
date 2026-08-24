/**
 * Cube — a soft toy block.
 *
 * Exists mostly to be thrown: heavier than the ball, barely bounces, and flat
 * enough in silhouette that you can see it tumble. The visible top face is the
 * whole reason it reads as a block rather than as a rounded square — it is the
 * only toy in the set with a face pointing at the light.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, tones } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { edge, floorSlab, formFill, groundShadow, topFill } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createCube(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'cube';

  const size = Math.min(ctx.width, ctx.height);
  const ramp = tones(ctx.color);

  root.addChild(groundShadow(size * 1.05, ctx.depth, 0.24));

  const body = new Container();
  body.position.set(0, -size / 2);

  const art = new Graphics();
  drawSquircle(art, 0, 0, size / 2, size / 2, { roundness: 0.28 });
  art.fill(formFill(ramp, 0.45));
  drawSquircle(art, 0, 0, size / 2, size / 2, { roundness: 0.28 });
  edge(art, ctx.color, 3, 0.4);
  body.addChild(art);

  const top = new Graphics();
  floorSlab(top, 0, -size * 0.42, size * 0.86, ctx.depth * 0.7, 0.4);
  top.fill(topFill(ramp));
  body.addChild(top);

  // One stamped mark on the near face. A letter would need a font; a shape
  // says "toy block" just as well and costs two paths.
  const mark = new Graphics();
  drawSquircle(mark, 0, size * 0.06, size * 0.2, size * 0.2, { roundness: 0.35 });
  mark.fill({ color: ctx.secondaryColor });
  mark.circle(0, size * 0.06, size * 0.075);
  mark.fill({ color: darken(ctx.color, 0.2) });
  body.addChild(mark);

  root.addChild(body);
  return root;
}
