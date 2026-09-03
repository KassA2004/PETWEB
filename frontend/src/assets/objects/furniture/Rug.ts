/**
 * Woven Rug — four cells of floor, and the only object with no height.
 *
 * Everything else in this room stands *on* the floor. This is a piece of the
 * floor, and that makes it the most useful thing in the catalogue for the one
 * problem a grid-planned room has: without it, a scattered arrangement is a set
 * of unrelated objects on a plain surface, and with it they are a group of
 * things around a rug.
 *
 * It is drawn entirely in the floor plane — one `floorSlab` for the field, one
 * for the border, and a fringe along the near and far edges — so it takes the
 * camera's foreshortening from `FLOOR_SQUASH` exactly as every contact shadow
 * and tabletop does, and never needs a form gradient at all. There is no
 * vertical face to shade.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import { FLOOR_SQUASH, floorSlab, weave } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createRug(ctx: ObjectRenderContext): Container {
  const { width, depth } = ctx;
  const rng = createRng(ctx.seed + 181);

  const root = new Container();
  root.label = 'rug';

  const ramp = tones(ctx.color);
  const halfDepth = (depth / 2) * FLOOR_SQUASH;

  /*
   * No contact shadow.
   *
   * A rug lies flat against the boards; the shadow every other object gets is
   * the gap of air underneath it, and there is none. Adding one made the rug
   * hover, which is the exact failure §5's shadow rule exists to prevent —
   * pointing the other way.
   */

  /* --- Fringe ------------------------------------------------------------- */
  // Drawn first, so the border laps over where the threads are knotted on.
  const fringe = new Graphics();
  const strands = Math.max(8, Math.round(width / 14));
  for (let i = 0; i <= strands; i++) {
    const x = -width / 2 + (i / strands) * width;
    const kink = rngRange(rng, -1.5, 1.5);
    for (const side of [-1, 1]) {
      fringe.moveTo(x, side * halfDepth * 0.94);
      fringe.lineTo(x + kink, side * (halfDepth + depth * 0.045 * FLOOR_SQUASH * 2));
    }
  }
  fringe.stroke({ color: lighten(ctx.secondaryColor, 0.12), width: 2, alpha: 0.75 });
  root.addChild(fringe);

  /* --- Field and border --------------------------------------------------- */
  const border = new Graphics();
  floorSlab(border, 0, 0, width, depth, 0.4);
  border.fill({ color: darken(ctx.color, 0.16) });
  root.addChild(border);

  const field = new Graphics();
  floorSlab(field, 0, 0, width * 0.86, depth * 0.8, 0.4);
  field.fill({ color: ramp.base });
  root.addChild(field);

  /*
   * The pattern: three concentric bands and a centre.
   *
   * Concentric rather than striped, because a rug is seen from every side of
   * the room and stripes have a direction — a pattern with a middle reads the
   * same whichever wall you are standing at.
   */
  const inner = new Graphics();
  floorSlab(inner, 0, 0, width * 0.68, depth * 0.6, 0.42);
  inner.fill({ color: mix(ctx.color, ctx.accentColor, 0.55) });
  floorSlab(inner, 0, 0, width * 0.58, depth * 0.5, 0.44);
  inner.fill({ color: lighten(ramp.light, 0.08) });
  floorSlab(inner, 0, 0, width * 0.3, depth * 0.26, 0.5);
  inner.fill({ color: mix(ctx.color, ctx.accentColor, 0.75) });
  root.addChild(inner);

  /* --- Pile --------------------------------------------------------------- */
  // The same `weave` the basket uses, flattened onto the floor plane. Texture
  // in this style is evidence of a material, not a rendering of one.
  const pile = weave(width * 0.84, depth * 0.74 * FLOOR_SQUASH, ctx.color, 5);
  pile.alpha = 0.5;
  root.addChild(pile);

  return root;
}
