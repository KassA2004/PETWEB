/**
 * Spinning Top — a turned cone under a painted disc.
 *
 * The one toy whose silhouette is a triangle, which is the whole reason it is
 * in the set: a floor of spheres and cubes needs something that comes to a
 * point. It is also the piece that most obviously came off a lathe, so it
 * carries the concentric rings that say so.
 *
 * It leans. A top standing dead upright reads as parked; a top a few degrees
 * off vertical reads as one that was spinning a moment ago.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createTop(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 457);

  const root = new Container();
  root.label = 'top';

  root.addChild(groundShadow(width * 0.7, depth * 0.7, 0.26));

  const body = new Container();
  // Pivoted at the tip, so the lean rotates it about the point it stands on
  // rather than sliding the whole toy sideways.
  body.rotation = rngRange(rng, -0.12, 0.12);

  const half = width / 2;
  const discY = -height * 0.6;
  const ramp = tones(ctx.color);

  /* --- The cone ----------------------------------------------------------- */
  const cone = new Graphics();
  cone.moveTo(-half * 0.92, discY);
  cone.quadraticCurveTo(-half * 0.5, -height * 0.16, 0, 0);
  cone.quadraticCurveTo(half * 0.5, -height * 0.16, half * 0.92, discY);
  cone.quadraticCurveTo(0, discY + depth * FLOOR_SQUASH * 0.5, -half * 0.92, discY);
  cone.closePath();
  cone.fill(formFill(tones(darken(ctx.color, 0.1)), 0.4));
  edge(cone, ctx.color, 2.5, 0.36);
  body.addChild(cone);

  /* --- The disc, and the rings turned into it ----------------------------- */
  const disc = new Graphics();
  floorOval(disc, 0, discY, width * 0.94, depth * 0.94);
  disc.fill(formFill(ramp, 0.75));
  floorOval(disc, 0, discY, width * 0.94, depth * 0.94);
  edge(disc, ctx.color, 2.5, 0.32);
  body.addChild(disc);

  // Two rings, in the accent and in the wood. Concentric on the top face, so
  // they foreshorten with it — rings drawn as circles would flatten the disc.
  const rings = new Graphics();
  floorOval(rings, 0, discY, width * 0.68, depth * 0.68);
  rings.fill({ color: ctx.accentColor, alpha: 0.9 });
  floorOval(rings, 0, discY, width * 0.36, depth * 0.36);
  rings.fill({ color: mix(ctx.secondaryColor, ctx.color, 0.3) });
  body.addChild(rings);

  /* --- The knob ----------------------------------------------------------- */
  const knob = new Graphics();
  drawSquircle(knob, 0, discY - height * 0.16, width * 0.11, height * 0.16, {
    roundness: 0.75,
  });
  knob.fill(formFill(tones(ctx.secondaryColor), 0.7));
  drawSquircle(knob, 0, discY - height * 0.16, width * 0.11, height * 0.16, {
    roundness: 0.75,
  });
  edge(knob, ctx.secondaryColor, 2, 0.34);
  body.addChild(knob);

  const light = new Graphics();
  gloss(
    light,
    -width * 0.22,
    discY - depth * FLOOR_SQUASH * 0.18,
    width * 0.16,
    depth * FLOOR_SQUASH * 0.14,
    lighten(ramp.light, 0.4),
    0.4,
  );
  body.addChild(light);

  root.addChild(body);
  return root;
}
