/**
 * Moss Terrarium — a garden under a bell jar.
 *
 * The quiet counterpart to the Fish Bowl. Both are a glass dome on a base with
 * something living inside, and that rhyme is deliberate — a set reads as a set
 * when two objects share a construction — but the tank is *motion* and this is
 * *stillness*: nothing in it moves at all, and that is the whole of what it is
 * for. A room needs somewhere the eye can rest.
 *
 * Everything under the glass is drawn inside the dome's own outline by mask
 * rather than trimmed by hand, so a mound of moss can never spill out onto the
 * table it stands on.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawOrganicOval, drawSquircle, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createTerrarium(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 823);

  const root = new Container();
  root.label = 'terrarium';

  root.addChild(groundShadow(width * 0.98, depth * 0.98, 0.26));

  const half = width / 2;
  const baseH = height * 0.15;
  const domeBottom = -baseH;
  const domeTop = -height + height * 0.05;
  const domeHalf = half * 0.86;

  /* --- The dish it stands on ---------------------------------------------- */
  const dishTones = tones(ctx.secondaryColor);
  const dish = new Graphics();
  dish.moveTo(-half, -baseH);
  dish.lineTo(half, -baseH);
  dish.lineTo(half * 0.92, 0);
  dish.quadraticCurveTo(0, depth * FLOOR_SQUASH * 0.4, -half * 0.92, 0);
  dish.closePath();
  dish.fill(formFill(dishTones, 0.5));
  edge(dish, ctx.secondaryColor, 2.5, 0.34);
  root.addChild(dish);

  const dishTop = new Graphics();
  floorOval(dishTop, 0, -baseH, width * 0.98, depth * 0.98);
  dishTop.fill({ color: lighten(dishTones.light, 0.12) });
  root.addChild(dishTop);

  /* --- The dome's outline, used three times ------------------------------- */
  // Once as the mask for the contents, once as the tinted glass, once as the
  // rim. One function, so the three can never disagree by a pixel.
  const dome = (g: Graphics): Graphics => {
    g.moveTo(-domeHalf, domeBottom);
    g.lineTo(-domeHalf, domeBottom - (domeBottom - domeTop) * 0.42);
    g.quadraticCurveTo(-domeHalf, domeTop, 0, domeTop);
    g.quadraticCurveTo(domeHalf, domeTop, domeHalf, domeBottom - (domeBottom - domeTop) * 0.42);
    g.lineTo(domeHalf, domeBottom);
    g.quadraticCurveTo(0, domeBottom + depth * FLOOR_SQUASH * 0.42, -domeHalf, domeBottom);
    g.closePath();
    return g;
  };

  const inside = new Container();
  const clip = new Graphics();
  dome(clip);
  clip.fill({ color: 0xffffff });
  root.addChild(clip);
  inside.mask = clip;
  root.addChild(inside);

  /* --- Soil, moss, and one mushroom --------------------------------------- */
  // A fifth of the jar was soil and it read as a plant pot with a lid on.
  const soilTop = domeBottom - (domeBottom - domeTop) * 0.12;

  /*
   * A mound, not a slab.
   *
   * Soil in a jar heaps toward the middle. The flat-topped version read as a
   * layer of chocolate with a green plate resting on it, which is what happens
   * whenever two horizontal bands of colour meet along a straight line.
   */
  const mound = (x: number) => soilTop - Math.cos((x / domeHalf) * 1.2) * height * 0.045;

  const soil = new Graphics();
  soil.moveTo(-domeHalf, mound(-domeHalf));
  soil.quadraticCurveTo(0, mound(0) - height * 0.02, domeHalf, mound(domeHalf));
  soil.lineTo(domeHalf, domeBottom + height * 0.06);
  soil.lineTo(-domeHalf, domeBottom + height * 0.06);
  soil.closePath();
  soil.fill(formFill(tones(mix(darken(PALETTE.sand, 0.6), PALETTE.ink, 0.25)), 0.4));
  inside.addChild(soil);

  /*
   * Moss: small clumps following the mound, in three greens.
   *
   * The first pass drew three layers of ovals nearly as wide as the jar at
   * nearly the same height, so they merged into one flat green disc — the
   * opposite of moss, which has no edges and no horizon. Small, round, and
   * scattered along the curve instead.
   */
  const mossColor = ctx.color;
  for (const [shade, count, lift] of [
    [darken(mossColor, 0.2), 7, 0.0],
    [mossColor, 6, 0.022],
    [lighten(mossColor, 0.16), 4, 0.038],
  ] as const) {
    const layer = new Graphics();
    for (let i = 0; i < count; i++) {
      const x = rngRange(rng, -domeHalf * 0.86, domeHalf * 0.86);
      const r = domeHalf * rngRange(rng, 0.13, 0.22);
      drawOrganicOval(
        layer,
        x,
        mound(x) - height * lift,
        r,
        r * rngRange(rng, 0.62, 0.86),
        20,
        0.12,
        i * 2.3,
      );
    }
    layer.fill({ color: shade });
    inside.addChild(layer);
  }

  // One mushroom, and one fern frond. Two is a garden; more is a jungle.
  const mush = new Graphics();
  const mx = rngRange(rng, -domeHalf * 0.4, domeHalf * 0.45);
  const stemTop = mound(mx) - height * 0.13;
  mush.moveTo(mx - width * 0.024, mound(mx) - height * 0.01);
  mush.quadraticCurveTo(mx - width * 0.02, stemTop, mx - width * 0.016, stemTop);
  mush.lineTo(mx + width * 0.016, stemTop);
  mush.quadraticCurveTo(mx + width * 0.02, stemTop, mx + width * 0.024, mound(mx) - height * 0.01);
  mush.closePath();
  mush.fill({ color: PALETTE.cream });
  inside.addChild(mush);

  const cap = new Graphics();
  drawSquircle(cap, mx, stemTop, width * 0.075, height * 0.042, { roundness: 0.85 });
  cap.fill(formFill(tones(ctx.accentColor), 0.75));
  drawSquircle(cap, mx, stemTop, width * 0.075, height * 0.042, { roundness: 0.85 });
  edge(cap, ctx.accentColor, 1.6, 0.34);
  cap.circle(mx - width * 0.028, stemTop - height * 0.006, width * 0.014);
  cap.circle(mx + width * 0.026, stemTop + height * 0.004, width * 0.011);
  cap.fill({ color: PALETTE.cream, alpha: 0.85 });
  inside.addChild(cap);

  const frond = new Graphics();
  const fx = -domeHalf * 0.55;
  frond.moveTo(fx, mound(fx));
  frond.quadraticCurveTo(fx - width * 0.06, mound(fx) - height * 0.16, fx + width * 0.02, mound(fx) - height * 0.26);
  frond.stroke({ color: darken(mossColor, 0.3), width: Math.max(1.6, width * 0.018) });
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    drawOrganicOval(
      frond,
      fx - width * 0.045 * (1 - t) + width * 0.02 * t,
      mound(fx) - height * 0.26 * t,
      width * 0.03,
      height * 0.014,
      14,
      0.08,
      i,
    );
  }
  frond.fill({ color: lighten(mossColor, 0.1) });
  inside.addChild(frond);

  /* --- Glass -------------------------------------------------------------- */
  const glass = new Graphics();
  dome(glass);
  glass.fill({ color: lighten(mix(ctx.color, 0xffffff, 0.7), 0.1), alpha: 0.16 });
  root.addChild(glass);

  const rim = new Graphics();
  dome(rim);
  edge(rim, ctx.color, 3, 0.34);
  root.addChild(rim);

  const shine = new Container();
  shine.position.set(-domeHalf * 0.46, domeTop + (domeBottom - domeTop) * 0.24);
  shine.rotation = -0.36;
  const streak = new Graphics();
  drawSquircle(streak, 0, 0, width * 0.035, height * 0.11, { roundness: 1 });
  streak.fill({ color: 0xffffff, alpha: 0.38 });
  shine.addChild(streak);
  root.addChild(shine);

  // The little knob on top, which is what makes it a bell jar rather than a
  // tumbler somebody turned upside down.
  const knob = new Graphics();
  drawSquircle(knob, 0, domeTop - height * 0.035, width * 0.07, height * 0.04, {
    roundness: 0.8,
  });
  knob.fill(formFill(dishTones, 0.7));
  drawSquircle(knob, 0, domeTop - height * 0.035, width * 0.07, height * 0.04, {
    roundness: 0.8,
  });
  edge(knob, ctx.secondaryColor, 2, 0.34);
  root.addChild(knob);

  const knobLight = new Graphics();
  gloss(
    knobLight,
    -width * 0.02,
    domeTop - height * 0.045,
    width * 0.025,
    height * 0.012,
    lighten(dishTones.light, 0.4),
    0.5,
  );
  root.addChild(knobLight);

  return root;
}
