/**
 * Rattle Drum — a little pellet drum on a turned handle.
 *
 * The room already has a Music Box, and the two are deliberately different
 * kinds of sound: the box is a thing you wind and listen to, and this is a
 * thing a creature knocks over and startles itself with. It is the only toy
 * with parts that hang, which is what makes it read at a glance — two beads on
 * cords swing where nothing else in the set does.
 *
 * The beads are drawn at rest and never animated. `ObjectLife` is for things
 * that move because they are alive (a plant swaying, a fish swimming); a toy
 * lying on the floor should be still, and the physics is what makes it move.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
  post,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createRattle(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 149);

  const root = new Container();
  root.label = 'rattle';

  root.addChild(groundShadow(width * 0.66, depth * 0.66, 0.24));

  const body = new Container();
  body.rotation = rngRange(rng, -0.14, 0.14);

  const half = width / 2;
  const drumY = -height * 0.66;
  const drumH = height * 0.3;
  const shell = tones(ctx.color);

  /* --- Handle ------------------------------------------------------------- */
  body.addChild(
    post({
      x: 0,
      top: drumY,
      length: height * 0.68,
      width: width * 0.14,
      color: ctx.secondaryColor,
      taper: 0.28,
    }),
  );

  /* --- Cords and beads, behind the drum ----------------------------------- */
  // Behind, so the cords appear to be knotted at the far side of the shell and
  // swing round the front — the same trick the plush's ears use.
  const cords = new Graphics();
  for (const side of [-1, 1]) {
    cords.moveTo(side * half * 0.18, drumY - drumH * 0.44);
    cords.quadraticCurveTo(
      side * half * 0.92,
      drumY - drumH * 0.3,
      side * half * 0.96,
      drumY + drumH * 0.16,
    );
  }
  cords.stroke({
    color: mix(darken(ctx.secondaryColor, 0.2), ctx.accentColor, 0.3),
    width: Math.max(1.8, width * 0.028),
  });
  body.addChild(cords);

  const beads = new Graphics();
  for (const side of [-1, 1]) {
    beads.circle(side * half * 0.96, drumY + drumH * 0.22, width * 0.1);
  }
  beads.fill(formFill(tones(ctx.accentColor), 0.75));
  for (const side of [-1, 1]) {
    beads.circle(side * half * 0.96, drumY + drumH * 0.22, width * 0.1);
  }
  edge(beads, ctx.accentColor, 2, 0.35);
  body.addChild(beads);

  /* --- The shell ---------------------------------------------------------- */
  /*
   * Waisted, not a straight cylinder.
   *
   * The first pass was a barrel with a pale disc on top and a light band across
   * its middle, which read unmistakably as a burger. A pellet drum pinches in
   * between its two heads; the pinch is what stops the silhouette being a bun,
   * and it costs two control points.
   */
  const shellHalf = half * 0.72;
  const shellG = new Graphics();
  shellG.moveTo(-shellHalf, drumY - drumH * 0.5);
  shellG.quadraticCurveTo(-shellHalf * 0.82, drumY, -shellHalf, drumY + drumH * 0.5);
  shellG.quadraticCurveTo(0, drumY + drumH * 0.5 + depth * FLOOR_SQUASH * 0.42, shellHalf, drumY + drumH * 0.5);
  shellG.quadraticCurveTo(shellHalf * 0.82, drumY, shellHalf, drumY - drumH * 0.5);
  shellG.closePath();
  shellG.fill(formFill(shell, 0.5));
  edge(shellG, ctx.color, 2.5, 0.34);
  body.addChild(shellG);

  // The hoops that hold the heads on: one at each rim, in the accent. A single
  // band across the middle was the other half of the burger.
  const hoops = new Graphics();
  for (const at of [-0.5, 0.5]) {
    hoops.rect(-shellHalf * 1.04, drumY + drumH * at - drumH * 0.06, shellHalf * 2.08, drumH * 0.12);
  }
  hoops.fill({ color: mix(ctx.accentColor, ctx.color, 0.3), alpha: 0.9 });
  body.addChild(hoops);

  // The skin stretched over the near head. Inset inside its hoop, so the rim
  // reads as holding it rather than as a stripe painted beside it.
  const skin = new Graphics();
  floorOval(skin, 0, drumY - drumH * 0.5, shellHalf * 1.78, depth * 0.72);
  skin.fill({ color: lighten(mix(ctx.secondaryColor, ctx.color, 0.3), 0.2) });
  floorOval(skin, 0, drumY - drumH * 0.5, shellHalf * 1.78, depth * 0.72);
  edge(skin, ctx.color, 2, 0.3);
  body.addChild(skin);

  const light = new Graphics();
  gloss(
    light,
    -half * 0.34,
    drumY - drumH * 0.12,
    half * 0.14,
    drumH * 0.24,
    lighten(shell.light, 0.35),
    0.34,
  );
  body.addChild(light);

  root.addChild(body);
  return root;
}
