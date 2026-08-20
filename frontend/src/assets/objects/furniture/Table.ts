/**
 * Table — a top and two legs.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { drawCapsule, drawSquircle } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createTable(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'table';

  const width = 168 * ctx.scale;
  const topY = -92 * ctx.scale;
  const legWidth = 16 * ctx.scale;

  root.addChild(createContactShadow({ width: width * 0.95, strength: 0.24 }));

  const legs = new Graphics();
  drawCapsule(legs, -width * 0.34, topY, legWidth, -topY);
  drawCapsule(legs, width * 0.34, topY, legWidth, -topY);
  legs.fill({ color: darken(ctx.color, 0.3) });
  root.addChild(legs);

  const top = new Graphics();
  drawSquircle(top, 0, topY, width / 2, width * 0.075, { roundness: 0.7 });
  top.fill({ color: ctx.color });
  top.stroke({ color: outline(ctx.color), width: 3, alpha: 0.4 });
  root.addChild(top);

  // A single lighter band along the top face.
  const shine = new Graphics();
  shine.ellipse(-width * 0.08, topY - width * 0.035, width * 0.2, width * 0.02);
  shine.fill({ color: lighten(ctx.color, 0.4), alpha: 0.5 });
  root.addChild(shine);

  return root;
}
