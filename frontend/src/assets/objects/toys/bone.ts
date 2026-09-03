/**
 * Bone — the quintessential pet toy.
 *
 * Dense and satisfyingly clunky. Its uneven collision shape makes it tumble
 * unpredictably when thrown. The thick, rubbery ends give the creature something
 * obvious to grab onto.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { lighten, tones } from '../../shared/color';
import { edge, formFill, gloss, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBone(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'bone';

  const length = Math.max(ctx.width, ctx.height);
  const thick = length * 0.35;
  const ramp = tones(ctx.color);

  root.addChild(groundShadow(length * 1.1, ctx.depth, 0.25));

  const body = new Container();
  body.position.set(0, -thick * 0.8);

  const art = new Graphics();
  
  // The central shaft
  art.rect(-length * 0.3, -thick * 0.4, length * 0.6, thick * 0.8);
  
  // The four knuckles
  art.circle(-length * 0.35, -thick * 0.4, thick * 0.6);
  art.circle(-length * 0.35, thick * 0.4, thick * 0.6);
  art.circle(length * 0.35, -thick * 0.4, thick * 0.6);
  art.circle(length * 0.35, thick * 0.4, thick * 0.6);
  
  art.fill(formFill(ramp, 0.7));
  edge(art, ctx.color, 3, 0.4);
  body.addChild(art);

  const shine = new Graphics();
  gloss(shine, -length * 0.1, -thick * 0.2, length * 0.2, thick * 0.15, lighten(ramp.light, 0.4), 0.5);
  body.addChild(shine);

  root.addChild(body);
  return root;
}