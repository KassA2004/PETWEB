/**
 * Wish Star — a stuffed star, asleep.
 *
 * The set's soft toys are the Blob Plush and the Soft Pillow, and both are
 * round; this is the one with corners. A five-point star is also the only
 * silhouette in the whole room that is neither a box nor a blob, which is why
 * it is worth the extra geometry.
 *
 * Its points are **rounded off**, and that is the difference between a toy and
 * a badge: a sharp star is a symbol, and a star whose arms have been stuffed
 * until they are fat is something somebody sewed. The face is closed-eye arcs
 * rather than dots, so it reads as sleeping rather than staring — the plush
 * next door already does staring.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, lighten, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import { edge, formFill, gloss, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

/** Points, and how far the inner corners sit toward the middle. */
const POINTS = 5;
const WAIST = 0.52;

export function createStar(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 611);

  const root = new Container();
  root.label = 'star';

  root.addChild(groundShadow(width * 0.94, depth, 0.24));

  const body = new Container();
  body.position.set(0, -height * 0.5);
  body.rotation = rngRange(rng, -0.1, 0.1);

  const outer = Math.min(width, height) * 0.5;
  const inner = outer * WAIST;
  const ramp = tones(ctx.color);

  /*
   * The outline.
   *
   * Every corner — the points and the waists alike — is turned with a
   * quadratic whose control sits *at* the corner, so the curve swells through
   * it instead of meeting in a spike. One traversal, so the fill's winding is
   * unambiguous.
   */
  const trace = (g: Graphics): Graphics => {
    const step = Math.PI / POINTS;
    const at = (i: number) => {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + i * step;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.96 };
    };

    // Start on the midpoint of the first edge, so every corner gets a control.
    const first = at(0);
    const last = at(2 * POINTS - 1);
    g.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);

    for (let i = 0; i < 2 * POINTS; i++) {
      const corner = at(i);
      const next = at(i + 1);
      g.quadraticCurveTo(corner.x, corner.y, (corner.x + next.x) / 2, (corner.y + next.y) / 2);
    }

    g.closePath();
    return g;
  };

  const art = new Graphics();
  trace(art);
  art.fill(formFill(ramp, 0.68));
  trace(art);
  edge(art, ctx.color, 3, 0.42);
  body.addChild(art);

  // The seam up the middle, which is what makes it stuffed rather than cut out.
  const seam = new Graphics();
  seam.moveTo(0, -outer * 0.62);
  seam.quadraticCurveTo(outer * 0.06, 0, 0, outer * 0.6);
  seam.stroke({ color: ramp.deep, width: 2, alpha: 0.3 });
  body.addChild(seam);

  const shine = new Graphics();
  gloss(
    shine,
    -outer * 0.24,
    -outer * 0.3,
    outer * 0.2,
    outer * 0.13,
    lighten(ramp.light, 0.4),
    0.42,
  );
  body.addChild(shine);

  /* --- Asleep ------------------------------------------------------------- */
  const face = new Graphics();
  const eyeY = -outer * 0.02;
  const eyeX = outer * 0.24;

  for (const side of [-1, 1]) {
    face.moveTo(side * eyeX - outer * 0.1, eyeY);
    face.quadraticCurveTo(side * eyeX, eyeY + outer * 0.11, side * eyeX + outer * 0.1, eyeY);
  }
  face.stroke({ color: PALETTE.ink, width: Math.max(2.5, outer * 0.06), cap: 'round' });

  const mouth = new Graphics();
  mouth.moveTo(-outer * 0.07, outer * 0.2);
  mouth.quadraticCurveTo(0, outer * 0.29, outer * 0.07, outer * 0.2);
  mouth.stroke({ color: PALETTE.ink, width: Math.max(2, outer * 0.05), cap: 'round' });
  face.addChild(mouth);

  // Two cheeks, the same mark the creature wears.
  const cheeks = new Graphics();
  cheeks.ellipse(-outer * 0.4, outer * 0.14, outer * 0.11, outer * 0.07);
  cheeks.ellipse(outer * 0.4, outer * 0.14, outer * 0.11, outer * 0.07);
  cheeks.fill({ color: ctx.accentColor, alpha: 0.45 });
  body.addChild(cheeks);

  body.addChild(face);

  root.addChild(body);
  return root;
}
