/**
 * Pillow — light, floppy, and extremely throwable.
 *
 * Low mass and a soft bounce, so it is the object that most obviously carries
 * the physics: it flies far, lands quietly and shoves things without hurting
 * anyone.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { lighten, outline } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createPillow(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'pillow';

  const width = 104 * ctx.scale;
  const height = 62 * ctx.scale;

  root.addChild(createContactShadow({ width: width * 0.95, strength: 0.22 }));

  const body = new Container();
  body.position.set(0, -height / 2);

  const art = new Graphics();
  drawSquircle(art, 0, 0, width / 2, height / 2, { roundness: 0.9, wobble: 0.03 });
  art.fill({ color: ctx.color });
  art.stroke({ color: outline(ctx.color), width: 3, alpha: 0.4 });
  body.addChild(art);

  // Seam, inset from the edge — the one detail that says "cushion".
  const seam = new Graphics();
  drawSquircle(seam, 0, 0, width * 0.38, height * 0.32, { roundness: 0.9 });
  seam.stroke({ color: ctx.secondaryColor, width: 3, alpha: 0.75 });
  body.addChild(seam);

  const shine = new Graphics();
  shine.ellipse(-width * 0.18, -height * 0.22, width * 0.14, height * 0.1);
  shine.fill({ color: lighten(ctx.color, 0.45), alpha: 0.5 });
  body.addChild(shine);

  root.addChild(body);
  return root;
}
