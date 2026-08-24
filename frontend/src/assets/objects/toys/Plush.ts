/**
 * Plush — a tiny stuffed blob.
 *
 * Deliberately the same squircle-plus-dots recipe as the creature itself: a
 * toy that looks like a small, dumber version of the pet is funnier than a
 * generic teddy, and it costs five shapes.
 *
 * The seed picks its ears, so a room with two plushes in it has two plushes
 * rather than one plush twice (§14).
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, lighten, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { edge, formFill, gloss, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createPlush(ctx: ObjectRenderContext): Container {
  const rng = createRng(ctx.seed + 29);

  const root = new Container();
  root.label = 'plush';

  const width = ctx.width;
  const height = ctx.height;
  const ramp = tones(ctx.color);

  root.addChild(groundShadow(width * 1.05, ctx.depth, 0.24));

  const body = new Container();
  body.position.set(0, -height * 0.5);

  // Ears first, behind the mass, so the join is swallowed by the body — the
  // same rule the creature's own ears follow (§11.4).
  const ears = new Graphics();
  const earR = width * rngRange(rng, 0.11, 0.16);
  const earSpread = width * rngRange(rng, 0.22, 0.3);
  ears.circle(-earSpread, -height * 0.42, earR);
  ears.circle(earSpread, -height * 0.42, earR * rngRange(rng, 0.85, 1.15));
  ears.fill({ color: ctx.accentColor });
  body.addChild(ears);

  const art = new Graphics();
  drawSquircle(art, 0, 0, width / 2, height / 2, {
    roundness: 0.5,
    wobble: 0.03,
    phase: ctx.seed % 5,
  });
  art.fill(formFill(ramp, 0.6));
  drawSquircle(art, 0, 0, width / 2, height / 2, { roundness: 0.5 });
  edge(art, ctx.color, 3, 0.45);
  body.addChild(art);

  const shine = new Graphics();
  gloss(
    shine,
    -width * 0.16,
    -height * 0.26,
    width * 0.14,
    height * 0.12,
    lighten(ramp.light, 0.35),
    0.4,
  );
  body.addChild(shine);

  // Face: two dots and a stitched smile. Slightly crooked, always.
  const tilt = rngRange(rng, -0.06, 0.06);
  const face = new Graphics();
  face.circle(-width * 0.16, -height * 0.04, width * 0.055);
  face.circle(width * 0.16, -height * 0.04 + tilt * height, width * 0.055);
  face.fill({ color: PALETTE.ink });
  face.moveTo(-width * 0.1, height * 0.14);
  face.quadraticCurveTo(0, height * 0.24, width * 0.1, height * 0.14);
  face.stroke({ color: PALETTE.ink, width: 3, cap: 'round' });
  body.addChild(face);

  root.addChild(body);
  return root;
}
