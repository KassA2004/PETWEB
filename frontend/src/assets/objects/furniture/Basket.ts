/**
 * Basket — a wicker bowl, and the creature's favourite place to sit.
 *
 * The one object whose artwork is taller than its collider, and deliberately:
 * the collider is the *inside floor* the creature settles onto, while the rim
 * it has to climb over is `surface.rim` in the catalog. The renderer reads that
 * rim rather than inventing a height, so the thing you can see and the thing
 * you have to clear are the same number.
 *
 * Drawn as an open bowl with the rim in front, so a creature sitting in it is
 * sorted behind the near lip and reads as *inside* rather than *behind*.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  groundShadow,
  weave,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBasket(ctx: ObjectRenderContext): Container {
  const { width, depth } = ctx;
  const rim = ctx.traits.surface?.rim ?? 58;
  const rng = createRng(ctx.seed + 91);

  const root = new Container();
  root.label = 'basket';

  root.addChild(groundShadow(width, depth, 0.28));

  const ramp = tones(ctx.color);
  const half = width / 2;
  const rimDepth = (depth / 2) * FLOOR_SQUASH;

  // --- Bowl ----------------------------------------------------------------
  // Wider at the rim than at the base, which is what a basket does and what
  // stops it reading as a bucket.
  const bowl = new Graphics();
  bowl.moveTo(-half, -rim);
  bowl.lineTo(half, -rim);
  bowl.quadraticCurveTo(half * 0.94, -rim * 0.28, half * 0.62, 0);
  bowl.quadraticCurveTo(0, rimDepth * 0.7, -half * 0.62, 0);
  bowl.quadraticCurveTo(-half * 0.94, -rim * 0.28, -half, -rim);
  bowl.closePath();
  bowl.fill(formFill(ramp, 0.5));
  root.addChild(bowl);

  const texture = weave(width * 0.92, rim * 0.9, ctx.color, 4);
  texture.y = -rim * 0.52;
  root.addChild(texture);

  // --- Rim -----------------------------------------------------------------
  // Outer lip first, then the hole cut into it by drawing the inside on top.
  // Two filled ovals rather than a boolean path op: the same picture, and it
  // survives a Graphics API that has no opinion about holes.
  const lip = new Graphics();
  floorOval(lip, 0, -rim, width, depth);
  lip.fill({ color: lighten(ramp.base, 0.2) });
  floorOval(lip, 0, -rim, width, depth);
  edge(lip, ctx.color, 3, 0.42);
  root.addChild(lip);

  const inside = new Graphics();
  floorOval(inside, 0, -rim, width * 0.84, depth * 0.84);
  inside.fill({ color: ramp.deep });
  floorOval(inside, 0, -rim + rimDepth * 0.3, width * 0.68, depth * 0.68);
  inside.fill({ color: darken(ctx.secondaryColor, 0.12), alpha: 0.55 });
  root.addChild(inside);

  // A handful of ends poking out of the weave. Three, never more — this is
  // designed imperfection, not fraying (§14).
  const strays = new Graphics();
  for (let i = 0; i < 3; i++) {
    const x = rngRange(rng, -half * 0.8, half * 0.8);
    const y = -rim + rngRange(rng, -2, 3);
    strays.moveTo(x, y);
    strays.quadraticCurveTo(x + rngRange(rng, -6, 6), y - 7, x + rngRange(rng, -10, 10), y - 12);
  }
  strays.stroke({ color: ramp.line, width: 2, alpha: 0.5 });
  root.addChild(strays);

  return root;
}
