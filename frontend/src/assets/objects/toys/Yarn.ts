/**
 * Ball of Yarn — wound wool, with one end escaping.
 *
 * A sphere like the Bouncy Ball, and deliberately so: they are the same object
 * to the physics and should be the same object to the eye, differing in what
 * they are *made of* rather than in how they are drawn. The whole difference is
 * the winding — three families of arcs crossing the ball at different angles —
 * and the loose end trailing away onto the floor.
 *
 * The trailing end is the point. It is the one toy in the set that says
 * something about what happened before you looked at it.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { edge, formFill, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createYarn(ctx: ObjectRenderContext): Container {
  const rng = createRng(ctx.seed + 97);

  const root = new Container();
  root.label = 'yarn';

  const radius = Math.min(ctx.width, ctx.height) / 2;
  const ramp = tones(ctx.color);

  root.addChild(groundShadow(radius * 2.1, ctx.depth, 0.26));

  /*
   * The loose end, on the floor and behind the ball.
   *
   * Drawn first so the ball sits on top of where it leaves — otherwise the
   * thread appears to come out of the front of the sphere and lie across it.
   */
  const tail = new Graphics();
  const away = rng() < 0.5 ? -1 : 1;
  tail.moveTo(away * radius * 0.5, -radius * 0.5);
  tail.quadraticCurveTo(
    away * radius * 1.7,
    -radius * 0.1,
    away * radius * 1.5,
    -radius * 0.06,
  );
  tail.quadraticCurveTo(away * radius * 1.2, 0, away * radius * 2.1, -radius * 0.02);
  tail.stroke({
    color: darken(ctx.color, 0.1),
    width: Math.max(2.5, radius * 0.11),
    cap: 'round',
  });
  root.addChild(tail);

  const body = new Container();
  body.position.set(0, -radius);

  const art = new Graphics();
  art.circle(0, 0, radius);
  art.fill(formFill(ramp, 0.8));
  art.circle(0, 0, radius);
  edge(art, ctx.color, 3, 0.45);
  body.addChild(art);

  /*
   * The winding, clipped to the ball.
   *
   * Three passes at rotations that do not divide into each other, so the
   * crossings never line up into a grid — a wound ball read as a beach ball
   * the moment two families of arcs agreed with each other.
   */
  const clip = new Graphics();
  clip.circle(0, 0, radius);
  clip.fill({ color: 0xffffff });
  body.addChild(clip);

  const strands = new Container();
  strands.mask = clip;

  for (const spin of [-0.62, 0.28, 1.05]) {
    const pass = new Graphics();
    // Five per pass, not three, and thinner. Three fat arcs across a sphere is
    // the recipe for a beach ball; wool is many fine turns lying close together.
    const count = 5;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * radius * rngRange(rng, 0.3, 0.4);
      pass.moveTo(-radius * 1.2, offset);
      pass.quadraticCurveTo(0, offset + radius * rngRange(rng, 0.4, 0.7), radius * 1.2, offset);
    }
    pass.stroke({
      color: spin > 0.5 ? lighten(ramp.light, 0.24) : darken(ctx.color, 0.18),
      width: Math.max(1.4, radius * 0.05),
      alpha: 0.45,
    });
    pass.rotation = spin;
    strands.addChild(pass);
  }

  body.addChild(strands);

  const glint = new Graphics();
  drawSquircle(glint, -radius * 0.36, -radius * 0.44, radius * 0.22, radius * 0.14, {
    roundness: 0.9,
  });
  glint.fill({ color: lighten(ramp.light, 0.5), alpha: 0.55 });
  body.addChild(glint);

  root.addChild(body);
  return root;
}
