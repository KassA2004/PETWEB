/**
 * Rug — three cells by two, flat on the floor, and the only object in the room
 * with no height at all.
 *
 * A rug is a decal. It gets no contact shadow (there is nothing under it to
 * shadow) and no collision (see the catalog's note: a rug three units tall is
 * something the creature *steps onto*, which makes the rug its floor, which
 * sorts the creature in front of the entire room).
 *
 * Its whole job is to break up the boards and give the room a centre, so it is
 * drawn as a floor-plane ellipse in perspective rather than as an oval that
 * happens to be squashed — the same `FLOOR_SQUASH` every other horizontal
 * surface uses, so the rug lies in the same plane the furniture stands on.
 *
 * Anchored at its centre, which is also its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawOrganicOval, rngRange } from '../../shared/shapes';
import { FLOOR_SQUASH, edge } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createRug(ctx: ObjectRenderContext): Container {
  const { width, depth } = ctx;
  const rng = createRng(ctx.seed + 73);

  const root = new Container();
  root.label = 'rug';

  // The rug's own half-extents on screen: full width across, foreshortened
  // depth into the room.
  const rx = width / 2;
  const ry = (depth / 2) * FLOOR_SQUASH;

  const ramp = tones(ctx.color);

  // --- Body ----------------------------------------------------------------
  const outer = new Graphics();
  drawOrganicOval(outer, 0, 0, rx, ry, 44, 0.018, ctx.seed % 6);
  outer.fill({ color: ramp.base });
  drawOrganicOval(outer, 0, 0, rx, ry, 44, 0.018, ctx.seed % 6);
  edge(outer, ctx.color, 3, 0.4);
  root.addChild(outer);

  // A darker crescent along the far edge. Nothing lies perfectly flat, and a
  // rug with no shading at all reads as a hole in the floor.
  const far = new Graphics();
  drawOrganicOval(far, 0, -ry * 0.06, rx * 0.99, ry * 0.99, 40, 0.018, ctx.seed % 6);
  far.fill({ color: ramp.shade, alpha: 0.5 });
  root.addChild(far);

  // --- Bands ---------------------------------------------------------------
  const middle = new Graphics();
  drawOrganicOval(middle, 0, 0, rx * 0.74, ry * 0.72, 40, 0.02, 2);
  middle.fill({ color: ctx.secondaryColor });
  root.addChild(middle);

  const inner = new Graphics();
  drawOrganicOval(inner, 0, 0, rx * 0.44, ry * 0.42, 34, 0.02, 4);
  inner.fill({ color: ctx.accentColor });
  root.addChild(inner);

  const heart = new Graphics();
  drawOrganicOval(heart, 0, 0, rx * 0.18, ry * 0.17, 28, 0.03, 1);
  heart.fill({ color: lighten(ctx.secondaryColor, 0.2) });
  root.addChild(heart);

  // --- Weave marks ---------------------------------------------------------
  // Short radial dashes around the second band, which is what turns three
  // concentric ovals into something woven.
  const marks = new Graphics();
  const spokes = 26;
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + rngRange(rng, -0.03, 0.03);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    marks.moveTo(cos * rx * 0.78, sin * ry * 0.76);
    marks.lineTo(cos * rx * 0.9, sin * ry * 0.88);
  }
  marks.stroke({ color: mix(ramp.deep, ctx.secondaryColor, 0.35), width: 2, alpha: 0.4 });
  root.addChild(marks);

  // --- Fringe --------------------------------------------------------------
  // Only along the near edge, where it would actually be visible.
  const fringe = new Graphics();
  for (let i = 0; i < 22; i++) {
    const t = (i / 21) * 1.4 - 0.7;
    const angle = Math.PI / 2 + t;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    fringe.moveTo(x, y);
    fringe.lineTo(x + rngRange(rng, -2, 2), y + rngRange(rng, ry * 0.08, ry * 0.16));
  }
  fringe.stroke({ color: darken(ctx.secondaryColor, 0.12), width: 2, alpha: 0.65 });
  root.addChild(fringe);

  return root;
}
