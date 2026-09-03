/**
 * Study Desk — the room's one working surface, and the last thing it unlocks.
 *
 * Ten hours of served focus buys it, which is the longest reach in the
 * catalogue and deliberately so: this is the object that most obviously stands
 * for what the user has actually been doing, and a desk handed out on the first
 * afternoon would say nothing at all.
 *
 * It is the Low Table's opposite number, and the two are drawn to be told apart
 * from across the room: the table is a top on four legs and nothing else, and
 * this has a drawer bank on one side, a taller top, and a lamp and a cup on it.
 * Where the table is a surface, this is a place.
 *
 * The drawer bank is on the **left** always. A desk with drawers on whichever
 * side the seed picked would be two different objects at the same catalogue
 * entry, and the room is easier to plan when a piece has one shape.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  grain,
  groundShadow,
  post,
  slab,
  softGlow,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createDesk(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 863);

  const root = new Container();
  root.label = 'desk';

  root.addChild(groundShadow(width, depth, 0.3));

  const half = width / 2;
  const topY = -height * 0.62;
  const topThickness = height * 0.05;
  const ramp = tones(ctx.color);

  /* --- Legs on the right, drawers on the left ------------------------------ */
  for (const back of [1, 0]) {
    root.addChild(
      post({
        x: half * (back ? 0.66 : 0.86),
        top: topY + topThickness,
        length: -topY - topThickness - back * depth * FLOOR_SQUASH * 0.32,
        width: width * 0.055,
        color: back ? darken(ctx.secondaryColor, 0.2) : ctx.secondaryColor,
        taper: 0.16,
      }),
    );
  }

  const bankLeft = -half * 0.94;
  const bankRight = -half * 0.26;
  const bankTop = topY + topThickness;

  const bank = new Graphics();
  bank.rect(bankLeft, bankTop, bankRight - bankLeft, -bankTop - height * 0.03);
  bank.fill(formFill(ramp, 0.5));
  bank.rect(bankLeft, bankTop, bankRight - bankLeft, -bankTop - height * 0.03);
  edge(bank, ctx.color, 2.5, 0.32);
  root.addChild(bank);

  /* --- Two drawers --------------------------------------------------------- */
  for (let i = 0; i < 2; i++) {
    const dTop = bankTop + height * 0.035 + i * height * 0.14;
    const dHeight = height * 0.11;

    const drawer = new Graphics();
    drawer.roundRect(
      bankLeft + width * 0.02,
      dTop,
      bankRight - bankLeft - width * 0.04,
      dHeight,
      width * 0.01,
    );
    drawer.fill(formFill(tones(lighten(ctx.color, 0.07)), 0.6));
    drawer.roundRect(
      bankLeft + width * 0.02,
      dTop,
      bankRight - bankLeft - width * 0.04,
      dHeight,
      width * 0.01,
    );
    edge(drawer, ctx.color, 1.8, 0.3);
    root.addChild(drawer);

    // A pull, not a knob: a horizontal bar is what says drawer where a circle
    // says door, and the cabinet next door has the circles.
    const pull = new Graphics();
    pull.roundRect(
      (bankLeft + bankRight) / 2 - width * 0.06,
      dTop + dHeight * 0.44,
      width * 0.12,
      dHeight * 0.14,
      dHeight * 0.07,
    );
    pull.fill({ color: ctx.accentColor });
    root.addChild(pull);
  }

  const bankGrain = grain(bankRight - bankLeft, height * 0.4, ctx.color, ctx.seed + 3, 4);
  bankGrain.position.set((bankLeft + bankRight) / 2, -height * 0.16);
  root.addChild(bankGrain);

  /* --- The top ------------------------------------------------------------- */
  root.addChild(
    slab({
      y: topY,
      width,
      depth,
      thickness: topThickness,
      color: mix(ctx.color, PALETTE.ember, 0.05),
      roundness: 0.32,
    }),
  );

  /* --- What is on it ------------------------------------------------------- */
  /*
   * A lamp and a cup, and nothing else.
   *
   * The desk is two grid cells and could carry six props; the reason it carries
   * two is that a working surface reads as *in use* when it is nearly clear and
   * as a junk drawer when it is not. Both sit toward the back edge, where a
   * person would actually push them.
   */
  const propY = topY - depth * FLOOR_SQUASH * 0.16;

  // --- Lamp
  const lampX = half * rngRange(rng, 0.34, 0.5);
  const lamp = new Container();
  lamp.position.set(lampX, propY);

  const lampColor = ctx.accentColor;
  const stem = new Graphics();
  stem.moveTo(-width * 0.012, 0);
  stem.lineTo(width * 0.012, 0);
  stem.lineTo(width * 0.008, -height * 0.2);
  stem.lineTo(-width * 0.008, -height * 0.2);
  stem.closePath();
  stem.fill({ color: darken(ctx.secondaryColor, 0.2) });
  lamp.addChild(stem);

  const foot = new Graphics();
  floorOval(foot, 0, 0, width * 0.09, depth * 0.09);
  foot.fill({ color: tones(ctx.secondaryColor).shade });
  lamp.addChild(foot);

  const glow = softGlow(width * 0.14, lighten(lampColor, 0.5), 0.34);
  glow.position.set(width * 0.02, -height * 0.19);
  lamp.addChild(glow);

  const shade = new Graphics();
  shade.moveTo(-width * 0.03, -height * 0.24);
  shade.lineTo(width * 0.07, -height * 0.21);
  shade.lineTo(width * 0.05, -height * 0.16);
  shade.lineTo(-width * 0.035, -height * 0.185);
  shade.closePath();
  shade.fill(formFill(tones(lampColor), 0.7));
  edge(shade, lampColor, 2, 0.34);
  lamp.addChild(shade);

  root.addChild(lamp);

  // --- Cup
  const cupX = -half * rngRange(rng, 0.1, 0.24);
  const cup = new Container();
  cup.position.set(cupX, propY + depth * FLOOR_SQUASH * 0.08);

  const cupH = height * 0.08;
  const cupTones = tones(PALETTE.cream);

  const cupBody = new Graphics();
  cupBody.moveTo(-width * 0.036, -cupH);
  cupBody.lineTo(width * 0.036, -cupH);
  cupBody.lineTo(width * 0.03, 0);
  cupBody.quadraticCurveTo(0, cupH * 0.22, -width * 0.03, 0);
  cupBody.closePath();
  cupBody.fill(formFill(cupTones, 0.72));
  edge(cupBody, PALETTE.cream, 1.8, 0.34);
  cup.addChild(cupBody);

  const cupRim = new Graphics();
  floorOval(cupRim, 0, -cupH, width * 0.072, depth * 0.072);
  cupRim.fill({ color: lighten(cupTones.light, 0.1) });
  floorOval(cupRim, 0, -cupH, width * 0.055, depth * 0.055);
  cupRim.fill({ color: mix(darken(PALETTE.sand, 0.5), PALETTE.ink, 0.3) });
  cup.addChild(cupRim);

  const cupHandle = new Graphics();
  cupHandle.moveTo(width * 0.034, -cupH * 0.72);
  cupHandle.quadraticCurveTo(width * 0.066, -cupH * 0.5, width * 0.03, -cupH * 0.24);
  cupHandle.stroke({ color: cupTones.shade, width: Math.max(1.8, width * 0.011) });
  cup.addChild(cupHandle);

  root.addChild(cup);

  // --- A page left on the top
  const page = new Graphics();
  const px = -half * 0.5;
  drawSquircle(page, px, propY + depth * FLOOR_SQUASH * 0.2, width * 0.09, depth * FLOOR_SQUASH * 0.16, {
    roundness: 0.18,
  });
  page.fill({ color: lighten(PALETTE.cream, 0.16) });
  page.rotation = rngRange(rng, -0.08, 0.08);
  page.pivot.set(px, propY);
  page.position.set(px, propY);
  root.addChild(page);

  const lines = new Graphics();
  for (let i = 0; i < 3; i++) {
    const y = propY + depth * FLOOR_SQUASH * (0.15 + i * 0.05);
    lines.moveTo(px - width * 0.055, y);
    lines.lineTo(px + width * 0.05, y);
  }
  lines.stroke({ color: darken(PALETTE.sand, 0.3), width: 1.2, alpha: 0.5 });
  lines.rotation = page.rotation;
  lines.pivot.set(px, propY);
  lines.position.set(px, propY);
  root.addChild(lines);

  const topLight = new Graphics();
  gloss(
    topLight,
    -half * 0.1,
    topY - depth * FLOOR_SQUASH * 0.1,
    width * 0.14,
    depth * FLOOR_SQUASH * 0.12,
    lighten(ramp.light, 0.4),
    0.28,
  );
  root.addChild(topLight);

  return root;
}
