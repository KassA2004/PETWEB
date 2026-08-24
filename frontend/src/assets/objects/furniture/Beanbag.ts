/**
 * Bean bag — a soft heap with a dent in the top.
 *
 * Nothing else in the room has *no* structure, and that is the whole point of
 * it: every other piece of furniture is built from slabs and posts, so one
 * object whose silhouette is entirely sag reads immediately as the soft one.
 *
 * The dent matters more than the shape does. A bean bag drawn as a plain blob
 * is a boulder; a bean bag with a hollow in the top is furniture, because the
 * hollow says somebody has been sitting in it.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { FLOOR_SQUASH, edge, floorOval, formFill, gloss, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBeanbag(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 47);

  const root = new Container();
  root.label = 'beanbag';

  root.addChild(groundShadow(width * 1.02, depth, 0.3));

  const ramp = tones(ctx.color);

  // --- The heap ------------------------------------------------------------
  // Wider at the floor than at the top and slightly lopsided, because a
  // symmetrical bean bag is a pumpkin.
  const lean = rngRange(rng, -0.06, 0.06);

  const bag = new Graphics();
  drawSquircle(bag, width * lean * 0.4, -height * 0.5, width / 2, height * 0.55, {
    roundness: 0.86,
    wobble: 0.035,
    phase: rngRange(rng, 0, 6),
  });
  bag.fill(formFill(ramp, 0.62));
  drawSquircle(bag, width * lean * 0.4, -height * 0.5, width / 2, height * 0.55, {
    roundness: 0.86,
  });
  edge(bag, ctx.color, 3, 0.36);
  root.addChild(bag);

  // --- The dent ------------------------------------------------------------
  const dent = new Graphics();
  floorOval(dent, width * lean, -height * 0.9, width * 0.62, depth * 0.62);
  dent.fill({ color: ramp.shade });
  floorOval(dent, width * lean, -height * 0.88, width * 0.5, depth * 0.5);
  dent.fill({ color: ramp.deep, alpha: 0.55 });
  root.addChild(dent);

  // --- Seams ---------------------------------------------------------------
  // Four, running from the dent down over the belly. They are what make the
  // heap read as sewn rather than moulded.
  const seams = new Graphics();
  for (let i = 0; i < 4; i++) {
    const t = -0.75 + i * 0.5;
    const topX = width * lean + t * width * 0.28;
    seams.moveTo(topX, -height * 0.86 + Math.abs(t) * height * 0.06);
    seams.quadraticCurveTo(
      t * width * 0.52,
      -height * 0.42,
      t * width * 0.42,
      -height * 0.06,
    );
  }
  seams.stroke({ color: ramp.line, width: 2, alpha: 0.34 });
  root.addChild(seams);

  // --- The one light shape -------------------------------------------------
  const light = new Graphics();
  gloss(
    light,
    -width * 0.16,
    -height * 0.66,
    width * 0.19,
    height * 0.2,
    lighten(ramp.light, 0.28),
    0.34,
  );
  root.addChild(light);

  // A patch in the accent colour, sewn onto one side. Two bean bags in a room
  // should never be the same bean bag.
  if (rng() < 0.7) {
    const patch = new Graphics();
    drawSquircle(
      patch,
      width * rngRange(rng, 0.12, 0.26),
      -height * rngRange(rng, 0.3, 0.5),
      width * 0.13,
      height * 0.14,
      { roundness: 0.6 },
    );
    patch.fill({ color: darken(ctx.secondaryColor, 0.05), alpha: 0.9 });
    patch.stroke({ color: ramp.line, width: 1.6, alpha: 0.4 });
    root.addChild(patch);
  }

  // A shallow shadow pooling where the bag meets the floor — a soft object
  // spreads under its own weight, and this is the cheapest way to say so.
  const spread = new Graphics();
  floorOval(spread, 0, -height * 0.04, width * 0.92, depth * FLOOR_SQUASH * 1.6);
  spread.fill({ color: ramp.deep, alpha: 0.3 });
  root.addChild(spread);

  return root;
}
