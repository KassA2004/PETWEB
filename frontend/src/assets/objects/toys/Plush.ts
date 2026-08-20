/**
 * Plush — a tiny stuffed blob.
 *
 * Deliberately the same squircle-plus-dots recipe as the pet itself: a toy
 * that looks like a small, dumber version of the creature is funnier than a
 * generic teddy, and it costs four shapes.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, outline } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createPlush(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'plush';

  const width = 76 * ctx.scale;
  const height = 70 * ctx.scale;

  root.addChild(createContactShadow({ width: width * 1.05, strength: 0.24 }));

  const body = new Container();
  body.position.set(0, -height / 2);

  const art = new Graphics();
  drawSquircle(art, 0, 0, width / 2, height / 2, {
    roundness: 0.5,
    wobble: 0.03,
    phase: ctx.seed % 5,
  });
  art.fill({ color: ctx.color });
  art.stroke({ color: outline(ctx.color), width: 3, alpha: 0.45 });
  body.addChild(art);

  // Two ear nubs peeking over the top.
  const ears = new Graphics();
  ears.circle(-width * 0.26, -height * 0.44, width * 0.13);
  ears.circle(width * 0.26, -height * 0.44, width * 0.13);
  ears.fill({ color: ctx.accentColor });
  body.addChildAt(ears, 0);

  // Face: two dots and a stitch of a smile.
  const face = new Graphics();
  face.circle(-width * 0.16, -height * 0.04, width * 0.055);
  face.circle(width * 0.16, -height * 0.04, width * 0.055);
  face.fill({ color: PALETTE.ink });
  face.moveTo(-width * 0.1, height * 0.14);
  face.quadraticCurveTo(0, height * 0.24, width * 0.1, height * 0.14);
  face.stroke({ color: PALETTE.ink, width: 3, cap: 'round' });
  body.addChild(face);

  root.addChild(body);
  return root;
}
