/**
 * Round Stool — a padded top on three splayed legs.
 *
 * The Little Chair's smaller sibling, and the difference between them is the
 * one thing that makes both worth having: a chair has a back and therefore a
 * *front*, so it must be turned to face something. A stool faces nowhere, which
 * makes it the piece you put in the gap.
 *
 * Three legs rather than four, and splayed rather than vertical. Both are the
 * same decision: three legs never rock, and a splay gives the object a
 * triangle to sit inside instead of a rectangle, which is what stops a small
 * round thing on sticks reading as a mushroom.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  cushion,
  edge,
  floorOval,
  formFill,
  groundShadow,
  post,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createStool(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 353);

  const root = new Container();
  root.label = 'stool';

  root.addChild(groundShadow(width * 0.94, depth * 0.94, 0.26));

  const seatY = -height * 0.72;
  const legWidth = width * 0.11;
  const woodTones = tones(ctx.secondaryColor);

  /* --- Legs ---------------------------------------------------------------- */
  /*
   * Two at the back and one at the front, so the middle leg is never hidden
   * behind the others. A tripod drawn with two in front and one behind loses a
   * third of its structure to overlap at exactly the angle the room is seen
   * from.
   */
  const legs: { x: number; lift: number; lean: number }[] = [
    { x: -width * 0.3, lift: depth * FLOOR_SQUASH * 0.34, lean: -0.14 },
    { x: width * 0.3, lift: depth * FLOOR_SQUASH * 0.34, lean: 0.14 },
    { x: 0, lift: 0, lean: 0 },
  ];

  for (const leg of legs) {
    const stick = post({
      x: leg.x,
      top: seatY,
      length: -seatY - leg.lift,
      width: legWidth * (leg.lift > 0 ? 0.88 : 1),
      color: leg.lift > 0 ? darken(ctx.secondaryColor, 0.14) : ctx.secondaryColor,
      taper: 0.3,
    });
    stick.pivot.set(leg.x, seatY);
    stick.position.set(leg.x, seatY - leg.lift);
    stick.rotation = leg.lean;
    root.addChild(stick);
  }

  // The stretcher ring that ties them together. One arc, and the tripod stops
  // being three sticks that happen to meet a disc.
  const stretcher = new Graphics();
  stretcher.moveTo(-width * 0.26, seatY * 0.36);
  stretcher.quadraticCurveTo(0, seatY * 0.36 + depth * FLOOR_SQUASH * 0.3, width * 0.26, seatY * 0.36);
  stretcher.stroke({
    color: darken(ctx.secondaryColor, 0.1),
    width: Math.max(2.5, legWidth * 0.6),
    cap: 'round',
  });
  root.addChild(stretcher);

  /* --- Frame under the seat ------------------------------------------------ */
  const apron = new Graphics();
  apron.moveTo(-width * 0.44, seatY);
  apron.lineTo(width * 0.44, seatY);
  apron.lineTo(width * 0.44, seatY + height * 0.08);
  apron.quadraticCurveTo(0, seatY + height * 0.08 + depth * FLOOR_SQUASH * 0.4, -width * 0.44, seatY + height * 0.08);
  apron.closePath();
  apron.fill(formFill(woodTones, 0.4));
  edge(apron, ctx.secondaryColor, 2.5, 0.34);
  root.addChild(apron);

  /* --- The padded top ------------------------------------------------------ */
  const seat = new Graphics();
  floorOval(seat, 0, seatY, width * 0.9, depth * 0.9);
  seat.fill({ color: lighten(woodTones.light, 0.06) });
  root.addChild(seat);

  root.addChild(
    cushion({
      // Flatter and narrower than the frame under it. At its first size the pad
      // overhung the apron on every side and domed above it, which is the exact
      // recipe for a mushroom — a seat has to look sat on, not inflated.
      y: seatY - height * 0.015,
      width: width * 0.76,
      height: depth * FLOOR_SQUASH * 0.58,
      color: ctx.color,
      roundness: 0.95,
      // Four buttons, which is what a round upholstered top has and what makes
      // the pad read as stuffed rather than as a coloured disc.
      tufts: 4,
      seed: ctx.seed + rngRange(rng, 0, 3),
    }),
  );

  return root;
}
