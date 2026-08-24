/**
 * Pillow — light, floppy, and extremely throwable.
 *
 * Low mass and a soft bounce, so it is the object that most obviously carries
 * the physics: it flies far, lands quietly and shoves things without hurting
 * anyone. It is also low enough that the creature simply steps onto it, which
 * is how a pillow ends up being used as a step onto the bed.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { lighten, tones } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { edge, formFill, gloss, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createPillow(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'pillow';

  const width = ctx.width;
  // Puffier than the collider is tall: what the creature stands on is the
  // squashed middle, and a cushion drawn only that thick looks like a mat.
  const height = ctx.height * 1.25;
  const ramp = tones(ctx.color);

  root.addChild(groundShadow(width * 0.95, ctx.depth, 0.22));

  const body = new Container();
  body.position.set(0, -height * 0.46);

  const art = new Graphics();
  drawSquircle(art, 0, 0, width / 2, height / 2, {
    roundness: 0.9,
    wobble: 0.03,
    phase: ctx.seed % 5,
  });
  art.fill(formFill(ramp, 0.66));
  drawSquircle(art, 0, 0, width / 2, height / 2, { roundness: 0.9 });
  edge(art, ctx.color, 3, 0.4);
  body.addChild(art);

  // Seam, inset from the edge — the one detail that says "cushion".
  const seam = new Graphics();
  drawSquircle(seam, 0, 0, width * 0.38, height * 0.32, { roundness: 0.9 });
  seam.stroke({ color: ctx.secondaryColor, width: 3, alpha: 0.7 });
  body.addChild(seam);

  // Corner tufts, so the stuffing has somewhere to gather.
  const tufts = new Graphics();
  for (const side of [-1, 1]) {
    tufts.circle(side * width * 0.38, height * 0.02, width * 0.022);
  }
  tufts.fill({ color: ramp.deep, alpha: 0.4 });
  body.addChild(tufts);

  const shine = new Graphics();
  gloss(
    shine,
    -width * 0.18,
    -height * 0.22,
    width * 0.15,
    height * 0.12,
    lighten(ramp.light, 0.4),
    0.45,
  );
  body.addChild(shine);

  root.addChild(body);
  return root;
}
