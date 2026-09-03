/**
 * Canvas Teepee — a den, and the room's only tall soft shape.
 *
 * It replaces the Fabric Tunnel, which was a horizontal striped cylinder with a
 * dark hole at each end and read, unmistakably, as a slice of sausage. The
 * affordance it carried was worth keeping — `hide` is the one thing a
 * frightened creature can do that is not running away — so the den survived and
 * the drawing did not.
 *
 * Why a teepee, specifically:
 *
 * ```text
 *   silhouette   everything else on this floor is a horizontal box. One tall
 *                triangle gives the room a second shape to read, and reads as
 *                itself at 76 pixels where a tube does not
 *   material     canvas, twine and three sticks. The room is already made of
 *                wood, wicker and cloth; nothing new had to be invented for it
 *   the doorway  a hole you can see a cushion through is an invitation. The
 *                tunnel's dark ends were just dark
 * ```
 *
 * Built as **two panels meeting at a centre seam** rather than as one triangle.
 * That is the whole of why it looks like a cone: the left panel takes the lit
 * end of the tone ramp and the right takes the shaded end, so the form turns
 * away from the window without a single extra shape.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
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

export function createTeepee(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 733);

  const root = new Container();
  root.label = 'teepee';

  root.addChild(groundShadow(width * 1.04, depth * 1.04, 0.28));

  const canvas = tones(ctx.color);
  const half = width / 2;
  // How far the front of the base bulges below the contact point — the near
  // edge of the floor ellipse the cone stands on.
  const frontY = (depth / 2) * FLOOR_SQUASH;
  const apexY = -height;
  /*
   * Where the sticks are lashed together, just inside the canvas.
   *
   * The first pass ran full-length poles down the *front* of the tent, which
   * put two wooden bars straight through the doorway — the one part of the
   * object that has to stay open. A teepee's frame is inside the cloth. Only
   * the tips show, above the apex, which is also the detail that says the
   * thing is built out of sticks at all.
   */
  const crossY = apexY + height * 0.03;
  const woodColor = ctx.secondaryColor;

  /* --- Canvas ------------------------------------------------------------- */
  /*
   * Two panels, one seam.
   *
   * Each is a triangle whose outer edge bows slightly — canvas stretched over
   * three sticks sags between them, and a dead-straight edge is what made the
   * first sketch of this read as a paper party hat.
   */
  const panel = (side: -1 | 1, ramp: ReturnType<typeof tones>): Graphics => {
    const g = new Graphics();
    g.moveTo(0, apexY);
    g.quadraticCurveTo(side * half * 0.62, -height * 0.44, side * half, -height * 0.02);
    g.quadraticCurveTo(side * half * 0.6, frontY * 0.86, 0, frontY);
    g.closePath();
    g.fill(formFill(ramp, side < 0 ? 0.72 : 0.34));
    return g;
  };

  root.addChild(panel(-1, tones(lighten(ctx.color, 0.05))));
  root.addChild(panel(1, tones(darken(ctx.color, 0.12))));

  // The silhouette, stroked once over both panels so the seam does not get an
  // outline of its own.
  const outline = new Graphics();
  outline.moveTo(0, apexY);
  outline.quadraticCurveTo(half * 0.62, -height * 0.44, half, -height * 0.02);
  outline.quadraticCurveTo(half * 0.6, frontY * 0.86, 0, frontY);
  outline.quadraticCurveTo(-half * 0.6, frontY * 0.86, -half, -height * 0.02);
  outline.quadraticCurveTo(-half * 0.62, -height * 0.44, 0, apexY);
  outline.closePath();
  edge(outline, ctx.color, 3, 0.36);
  root.addChild(outline);

  /* --- A stripe near the hem ---------------------------------------------- */
  /*
   * One band, following the cone rather than crossing it flat.
   *
   * Two curves with a real gap between them, not one curve traced back over
   * itself a few pixels lower — that version enclosed almost no area and the
   * trim was invisible at any size. Two bands would be a pattern; one is a trim.
   */
  const hemY = -height * 0.155;
  const hemHalf = half * 0.9;
  const bandDrop = height * 0.055;
  const sag = frontY * 0.8;

  const stripe = new Graphics();
  stripe.moveTo(-hemHalf, hemY);
  stripe.quadraticCurveTo(0, hemY + sag, hemHalf, hemY);
  stripe.lineTo(hemHalf * 0.94, hemY + bandDrop);
  stripe.quadraticCurveTo(0, hemY + bandDrop + sag, -hemHalf * 0.94, hemY + bandDrop);
  stripe.closePath();
  stripe.fill({ color: mix(ctx.accentColor, ctx.color, 0.4), alpha: 0.92 });
  root.addChild(stripe);

  /* --- Doorway ------------------------------------------------------------ */
  /*
   * A pointed arch that reaches the ground, not a rounded rectangle floating
   * in the middle of the cloth.
   *
   * The first pass used a squircle a third of the tent wide and got a big
   * brown box for its trouble — which read as a television rather than as a
   * way in, and cut the hem trim into two orange stubs on the way. This one is
   * narrow, tall, and follows the shape the cloth would actually fall into:
   * two curves meeting at a point, with the base of the cone closing it.
   */
  const doorHalf = width * 0.19;
  const doorTop = -height * 0.4;
  const doorBase = frontY * 0.34;

  const doorPath = (g: Graphics, k: number): Graphics => {
    g.moveTo(-doorHalf * k, doorBase);
    g.quadraticCurveTo(-doorHalf * k, doorTop * 0.82, 0, doorTop * k);
    g.quadraticCurveTo(doorHalf * k, doorTop * 0.82, doorHalf * k, doorBase);
    g.quadraticCurveTo(0, doorBase + frontY * 0.34, -doorHalf * k, doorBase);
    g.closePath();
    return g;
  };

  const dark = new Graphics();
  doorPath(dark, 1);
  dark.fill({ color: mix(darken(ctx.color, 0.7), ctx.secondaryColor, 0.34) });
  root.addChild(dark);

  // The lip of cloth turned in around the opening. One shape, and it is what
  // gives the hole a thickness — without it the doorway is a decal.
  const lip = new Graphics();
  doorPath(lip, 1);
  // A stroke, not two nested fills. Pixi winds both subpaths the same way, so
  // the "ring" was a union and it filled the whole opening pale — burying the
  // dark the doorway exists to show.
  lip.stroke({ color: lighten(canvas.light, 0.1), width: Math.max(3, width * 0.035), alpha: 0.9 });
  root.addChild(lip);

  // A cushion inside, just visible. The reason the doorway is an invitation
  // rather than a hole: you can see that it is nice in there.
  const inner = new Graphics();
  drawSquircle(inner, 0, doorBase - height * 0.028, doorHalf * 0.74, height * 0.03, {
    roundness: 0.9,
  });
  // Pulled most of the way to the canvas colour. At full accent strength it was
  // a hot orange lozenge sitting in the dark, which read as a light left on
  // rather than as a cushion.
  inner.fill(formFill(tones(mix(ctx.accentColor, ctx.color, 0.58)), 0.7));
  root.addChild(inner);

  // The shadow the cloth casts just inside the opening, over the cushion.
  const inset = new Graphics();
  inset.moveTo(-doorHalf * 0.78, doorTop * 0.52);
  inset.quadraticCurveTo(0, doorTop * 0.94, doorHalf * 0.78, doorTop * 0.52);
  inset.quadraticCurveTo(0, doorTop * 0.6, -doorHalf * 0.78, doorTop * 0.52);
  inset.closePath();
  inset.fill({ color: darken(ctx.color, 0.8), alpha: 0.3 });
  root.addChild(inset);

  /* --- The tips of the frame, and the tie --------------------------------- */
  /*
   * Three short sticks fanning out of the top, and nothing else of the frame.
   *
   * Each is rotated about the lashing point, so they read as one bundle rather
   * than three separate posts that happen to be near each other. The middle one
   * is tallest and carries the pennant.
   */
  const tipLength = height * 0.2;
  for (const lean of [-0.3, -0.04, 0.26]) {
    const tip = post({
      x: 0,
      top: crossY - tipLength * (lean === -0.04 ? 1.2 : 1),
      length: tipLength * (lean === -0.04 ? 1.2 : 1),
      width: width * 0.055,
      color: lean > 0 ? darken(woodColor, 0.14) : woodColor,
      taper: 0.35,
    });
    tip.pivot.set(0, crossY);
    tip.position.set(0, crossY);
    tip.rotation = lean;
    root.addChild(tip);
  }

  const twine = new Graphics();
  for (let i = 0; i < 3; i++) {
    const y = crossY - height * 0.026 + height * 0.013 * i;
    twine.moveTo(-width * 0.09, y);
    twine.quadraticCurveTo(0, y + height * 0.012, width * 0.09, y);
  }
  twine.stroke({
    color: mix(ctx.accentColor, darken(woodColor, 0.2), 0.62),
    width: Math.max(2, width * 0.024),
    alpha: 0.9,
  });
  root.addChild(twine);

  /* --- Pennant ------------------------------------------------------------ */
  // The one thing that makes it somebody's den rather than a shape. It lifts
  // in the room's draught, which is the object's whole share of the motion
  // budget — the canvas itself never moves, because a tent that breathes reads
  // as a lung.
  const flag = new Container();
  flag.position.set(-width * 0.008, crossY - tipLength * 1.12);

  const cloth = new Graphics();
  cloth.moveTo(0, 0);
  cloth.quadraticCurveTo(width * 0.2, -height * 0.014, width * 0.34, height * 0.012);
  cloth.quadraticCurveTo(width * 0.2, height * 0.042, 0, height * 0.058);
  cloth.closePath();
  cloth.fill(formFill(tones(ctx.accentColor), 0.72));
  edge(cloth, ctx.accentColor, 2, 0.34);
  flag.addChild(cloth);
  root.addChild(flag);

  /* --- Light -------------------------------------------------------------- */
  const light = new Graphics();
  gloss(
    light,
    -half * 0.3,
    -height * 0.56,
    half * 0.12,
    height * 0.2,
    lighten(canvas.light, 0.3),
    0.2,
  );
  // Tilted to lie along the cone rather than standing upright on it. An
  // upright highlight on a sloping face is the one thing that makes a form
  // read as a flat cut-out.
  light.rotation = 0.18;
  root.addChild(light);

  // The base, so the cone sits on the floor rather than ending at it.
  const foot = new Graphics();
  floorOval(foot, 0, 0, width * 0.98, depth * 0.98);
  foot.fill({ color: darken(ctx.color, 0.2), alpha: 0.28 });
  root.addChildAt(foot, 1);

  let time = rngRange(rng, 0, 8);
  attachLife(root, {
    update(dt) {
      time += dt;
      flag.rotation = Math.sin(time * 1.6) * 0.07 + Math.sin(time * 0.7) * 0.035;
    },
  });

  return root;
}
