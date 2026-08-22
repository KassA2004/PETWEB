/**
 * Cube — a soft toy block.
 *
 * Exists mostly to be thrown: it is heavier than the ball, barely bounces, and
 * has a flat enough silhouette that you can see it tumble.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createCube(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'cube';

  const size = 62 * ctx.scale;

  root.addChild(createContactShadow({ width: size * 1.1, strength: 0.24 }));

  const body = new Container();
  body.position.set(0, -size / 2);

  const art = new Graphics();
  drawSquircle(art, 0, 0, size / 2, size / 2, { roundness: 0.28 });
  art.fill({ color: ctx.color });
  art.stroke({ color: outline(ctx.color), width: 3, alpha: 0.4 });
  body.addChild(art);

  // A lighter top face, so the block reads as a solid with a direction.
  const top = new Graphics();
  drawSquircle(top, 0, -size * 0.28, size * 0.42, size * 0.14, { roundness: 0.5 });
  top.fill({ color: lighten(ctx.color, 0.32) });
  body.addChild(top);

  // One stamped mark on the face.
  const mark = new Graphics();
  drawSquircle(mark, 0, size * 0.06, size * 0.2, size * 0.2, { roundness: 0.35 });
  mark.fill({ color: ctx.secondaryColor });
  mark.circle(0, size * 0.06, size * 0.07);
  mark.fill({ color: darken(ctx.color, 0.2) });
  body.addChild(mark);

  root.addChild(body);
  return root;
}
