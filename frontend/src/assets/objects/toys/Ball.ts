/**
 * Ball — the simplest object in the set.
 *
 * A circle, one painted stripe, one glint. Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { outline } from '../../shared/color';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBall(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'ball';

  const radius = 30 * ctx.scale;

  root.addChild(createContactShadow({ width: radius * 2, strength: 0.26 }));

  const body = new Container();
  body.position.set(0, -radius);

  const art = new Graphics();
  art.circle(0, 0, radius);
  art.fill({ color: ctx.color });
  art.stroke({ color: outline(ctx.color), width: 3, alpha: 0.45 });
  body.addChild(art);

  // A painted stripe, so the ball has an orientation and reads as a toy.
  const stripe = new Graphics();
  stripe.moveTo(-radius * 0.94, -radius * 0.2);
  stripe.quadraticCurveTo(0, radius * 0.42, radius * 0.94, -radius * 0.2);
  stripe.quadraticCurveTo(0, radius * 0.08, -radius * 0.94, -radius * 0.2);
  stripe.closePath();
  stripe.fill({ color: ctx.accentColor });
  stripe.mask = (() => {
    const clip = new Graphics();
    clip.circle(0, 0, radius);
    clip.fill({ color: 0xffffff });
    body.addChild(clip);
    return clip;
  })();
  body.addChild(stripe);

  const glint = new Graphics();
  glint.ellipse(-radius * 0.36, -radius * 0.42, radius * 0.22, radius * 0.15);
  glint.fill({ color: 0xffffff, alpha: 0.7 });
  body.addChild(glint);

  root.addChild(body);
  return root;
}
