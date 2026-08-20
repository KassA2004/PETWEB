/**
 * Basket — a wicker bowl, and the pet's favourite place to sit.
 *
 * Drawn as an open bowl with the rim on top: place it at a slightly larger y
 * than the pet and the depth sort puts it in front, so the creature reads as
 * sitting inside it rather than behind it.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { createRng, curveBetween, rngRange } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBasket(ctx: ObjectRenderContext): Container {
  const rng = createRng(ctx.seed + 91);
  const root = new Container();
  root.label = 'basket';

  const width = 216 * ctx.scale;
  const height = 70 * ctx.scale;
  const w = width / 2;

  root.addChild(createContactShadow({ width: width * 0.95, strength: 0.28 }));

  // --- Bowl ----------------------------------------------------------------
  const bowl = new Graphics();
  bowl.moveTo(-w, -height);
  bowl.lineTo(w, -height);
  bowl.quadraticCurveTo(w * 0.9, -height * 0.12, w * 0.58, 0);
  bowl.quadraticCurveTo(0, height * 0.14, -w * 0.58, 0);
  bowl.quadraticCurveTo(-w * 0.9, -height * 0.12, -w, -height);
  bowl.closePath();
  bowl.fill({ color: ctx.color });
  bowl.stroke({ color: outline(ctx.color), width: 3, alpha: 0.5 });
  root.addChild(bowl);

  // --- Weave ---------------------------------------------------------------
  // Three sagging rows plus short verticals. Enough to read as wicker without
  // turning into texture noise.
  const weave = new Graphics();
  for (const t of [0.72, 0.46, 0.2]) {
    const y = -height * t;
    const spread = w * (0.6 + t * 0.4);
    curveBetween(weave, { x: -spread, y }, { x: spread, y }, height * 0.05);
  }
  weave.stroke({ color: darken(ctx.color, 0.34), width: 4, alpha: 0.55 });

  const ticks = new Graphics();
  for (let i = -3; i <= 3; i++) {
    const x = (i / 3) * w * 0.72 + rngRange(rng, -3, 3);
    ticks.moveTo(x, -height * 0.82);
    ticks.lineTo(x * 0.78, -height * 0.06);
  }
  ticks.stroke({ color: darken(ctx.color, 0.28), width: 3, alpha: 0.35 });
  root.addChild(weave);
  root.addChild(ticks);

  // --- Rim -----------------------------------------------------------------
  const rim = new Graphics();
  rim.ellipse(0, -height, w, height * 0.17);
  rim.fill({ color: lighten(ctx.color, 0.22) });
  rim.stroke({ color: outline(ctx.color), width: 3, alpha: 0.5 });
  root.addChild(rim);

  // Inside of the rim, one shade darker so the bowl reads as open.
  const inner = new Graphics();
  inner.ellipse(0, -height * 0.99, w * 0.86, height * 0.12);
  inner.fill({ color: darken(ctx.color, 0.34) });
  root.addChild(inner);

  return root;
}
