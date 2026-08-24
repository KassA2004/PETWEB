/**
 * Ball — the simplest object in the set, and the one the room is really about.
 *
 * A sphere, one painted band, one glint. It is the toy the creature chases, so
 * it has to read at a glance from anywhere in the room and it has to have an
 * orientation, or rolling would be invisible.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { lighten, tones } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { edge, formFill, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBall(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'ball';

  const radius = Math.min(ctx.width, ctx.height) / 2;
  const ramp = tones(ctx.color);

  root.addChild(groundShadow(radius * 2, ctx.depth, 0.26));

  const body = new Container();
  body.position.set(0, -radius);

  const art = new Graphics();
  art.circle(0, 0, radius);
  // A sphere is the one shape a flat gradient genuinely helps: light at the
  // crown, base through the middle, the underside in shade.
  art.fill(formFill(ramp, 0.8));
  art.circle(0, 0, radius);
  edge(art, ctx.color, 3, 0.45);
  body.addChild(art);

  // The painted band, clipped to the ball so it cannot leave the silhouette
  // however the toy tumbles.
  const clip = new Graphics();
  clip.circle(0, 0, radius);
  clip.fill({ color: 0xffffff });
  body.addChild(clip);

  const stripe = new Graphics();
  stripe.moveTo(-radius * 1.1, -radius * 0.2);
  stripe.quadraticCurveTo(0, radius * 0.46, radius * 1.1, -radius * 0.2);
  stripe.quadraticCurveTo(0, radius * 0.1, -radius * 1.1, -radius * 0.2);
  stripe.closePath();
  stripe.fill({ color: ctx.accentColor });
  stripe.mask = clip;
  body.addChild(stripe);

  const glint = new Graphics();
  drawSquircle(glint, -radius * 0.36, -radius * 0.42, radius * 0.24, radius * 0.16, {
    roundness: 0.9,
  });
  glint.fill({ color: lighten(ramp.light, 0.55), alpha: 0.7 });
  body.addChild(glint);

  root.addChild(body);
  return root;
}
