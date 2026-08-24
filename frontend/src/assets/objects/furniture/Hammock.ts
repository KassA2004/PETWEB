/**
 * Hammock — two posts, a slung sheet, and the one piece of furniture in the
 * room that moves while you are on it.
 *
 * The most comfortable surface in the catalog, and the reason it is worth
 * building rather than adding a second bed: the resting surface *swings*, so a
 * sleeping creature is visibly being rocked rather than visibly parked. The
 * sway is `ObjectLife` — motion an object has of its own, whether or not
 * anybody is looking at it.
 *
 * Two shapes to get right, and both are about weight:
 *
 *   the sling   drawn as two sagging curves, the upper one shallower than the
 *               lower. A single arc of constant thickness reads as a bent
 *               plank; cloth is thin where it leaves the post and deep in the
 *               middle, and that difference is most of what says "fabric".
 *   the posts   splayed outward. A vertical post holding a sideways load reads
 *               as a mistake even to somebody who could not say why.
 *
 * The height the catalog gives it is the height of the *lie-in surface*, not
 * of the frame: the posts are drawn well above it, but what the physics calls
 * the top of this object is the middle of the sling, which is where a creature
 * actually ends up.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import { FLOOR_SQUASH, edge, formFill, groundShadow, post } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createHammock(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 313);

  const root = new Container();
  root.label = 'hammock';

  root.addChild(groundShadow(width * 0.95, depth, 0.26));

  const half = width / 2;
  const postTop = -height * 2.4;
  /** Where the ropes leave the posts, and what the sling pivots about. */
  const anchorY = -height * 1.95;
  const span = half * 0.88;

  /** Sag of the upper edge and the underside, measured down from the anchor. */
  const sagTop = -height - anchorY;
  const sagBottom = sagTop + height * 0.72;

  // --- Posts ---------------------------------------------------------------
  for (const side of [-1, 1]) {
    const leg = post({
      x: side * half * 0.94,
      top: postTop,
      length: -postTop,
      width: width * 0.05,
      color: ctx.accentColor,
      taper: 0.1,
    });
    leg.rotation = side * 0.05;
    root.addChild(leg);

    const foot = new Graphics();
    foot.ellipse(side * half * 0.94, 0, width * 0.055, depth * FLOOR_SQUASH * 0.28);
    foot.fill({ color: darken(ctx.accentColor, 0.3) });
    root.addChild(foot);
  }

  // --- Sling ---------------------------------------------------------------
  const swing = new Container();
  swing.y = anchorY;

  const ramp = tones(ctx.color);
  const STEPS = 26;

  /** Parabolic sag, flattened slightly at the middle. Close enough to rope. */
  const curve = (t: number, sag: number) => sag * (1 - t * t) * (1 - 0.28 * t * t);

  const sheetPath = (g: Graphics) => {
    g.moveTo(-span, 0);
    for (let i = 0; i <= STEPS; i++) {
      const t = -1 + (i / STEPS) * 2;
      g.lineTo(t * span, curve(t, sagTop));
    }
    for (let i = STEPS; i >= 0; i--) {
      const t = -1 + (i / STEPS) * 2;
      g.lineTo(t * span, curve(t, sagBottom));
    }
    g.closePath();
  };

  const cloth = new Graphics();
  sheetPath(cloth);
  cloth.fill(formFill(ramp, 0.5));
  sheetPath(cloth);
  edge(cloth, ctx.color, 3, 0.38);
  swing.addChild(cloth);

  // Stripes across the weave, following the sag. Spaced unevenly on purpose.
  const stripes = new Graphics();
  for (let i = 1; i < 7; i++) {
    const t = -1 + (i / 7) * 2 + rngRange(rng, -0.03, 0.03);
    stripes.moveTo(t * span, curve(t, sagTop));
    stripes.lineTo(t * span, curve(t, sagBottom));
  }
  stripes.stroke({ color: lighten(ramp.light, 0.2), width: 2.5, alpha: 0.32 });
  swing.addChild(stripes);

  // The ropes gathering into each post.
  const ropes = new Graphics();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const spread = (i / 3) * (sagBottom - sagTop) * 0.7;
      ropes.moveTo(side * half * 0.9, 0);
      ropes.lineTo(side * span, curve(side, sagTop) + spread);
    }
  }
  ropes.stroke({ color: darken(ctx.secondaryColor, 0.15), width: 2, alpha: 0.7 });
  swing.addChild(ropes);

  root.addChild(swing);

  // --- Life ----------------------------------------------------------------
  // A long, shallow sway with a second, slower period laid over it, so it never
  // repeats visibly. Nothing in this room moves on one sine wave (§19).
  let time = rngRange(rng, 0, 10);
  attachLife(root, {
    update(dt) {
      time += dt;
      swing.rotation = Math.sin(time * 0.62) * 0.035 + Math.sin(time * 0.23) * 0.018;
    },
  });

  return root;
}
