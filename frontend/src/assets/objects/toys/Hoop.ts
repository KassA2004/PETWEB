/**
 * Rolling Hoop — a bent stave of wood with a painted quarter.
 *
 * The only object in the room with a hole through it, which is most of why it
 * earns a place: every other toy is a solid mass, and one ring gives the floor
 * a shape the eye can see the rug through.
 *
 * Drawn as a **stroked circle** rather than as two filled discs. Pixi winds
 * both subpaths of a fill the same way, so a "ring" built from an outer and an
 * inner circle comes out solid; a thick stroke is the honest way to say ring,
 * and it lets the band and the highlight be the same shape at three widths.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import { groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createHoop(ctx: ObjectRenderContext): Container {
  const rng = createRng(ctx.seed + 313);

  const root = new Container();
  root.label = 'hoop';

  const radius = Math.min(ctx.width, ctx.height) / 2;
  const stave = radius * 0.24;
  const ramp = tones(ctx.color);

  // Narrower than the toy, because a ring standing on edge touches the floor
  // at one point. A shadow as wide as the hoop would make it read as lying flat.
  root.addChild(groundShadow(radius * 1.05, ctx.depth * 0.55, 0.24));

  const body = new Container();
  body.position.set(0, -radius);
  // A hoop at rest never stands perfectly upright.
  body.rotation = rngRange(rng, -0.16, 0.16);

  // The stave, in three passes: the wood, the shaded lower half, the lit crown.
  const wood = new Graphics();
  wood.circle(0, 0, radius - stave / 2);
  wood.stroke({ color: ramp.base, width: stave });
  body.addChild(wood);

  const under = new Graphics();
  under.arc(0, 0, radius - stave / 2, 0.15, Math.PI - 0.15);
  under.stroke({ color: ramp.deep, width: stave * 0.62, alpha: 0.6, cap: 'round' });
  body.addChild(under);

  const crown = new Graphics();
  crown.arc(0, 0, radius - stave / 2, Math.PI + 0.35, -0.35);
  crown.stroke({
    color: lighten(ramp.light, 0.2),
    width: stave * 0.4,
    alpha: 0.75,
    cap: 'round',
  });
  body.addChild(crown);

  // One painted quarter. An orientation mark, so a hoop rolling across the
  // room is visibly rolling rather than sliding.
  const band = new Graphics();
  band.arc(0, 0, radius - stave / 2, -1.15, -0.15);
  band.stroke({ color: ctx.accentColor, width: stave * 0.92, cap: 'butt' });
  body.addChild(band);

  const bandShade = new Graphics();
  bandShade.arc(0, 0, radius - stave / 2, -1.15, -0.15);
  bandShade.stroke({
    color: darken(ctx.accentColor, 0.22),
    width: stave * 0.3,
    alpha: 0.5,
    cap: 'butt',
  });
  bandShade.y = stave * 0.28;
  body.addChild(bandShade);

  root.addChild(body);
  return root;
}
