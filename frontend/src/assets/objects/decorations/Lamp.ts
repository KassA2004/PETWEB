/**
 * Lamp — a foot, a stem, a shade, and the light switch for the whole room.
 *
 * Clicking it is how the lights go out, which makes it the one object with a
 * job outside its own artwork. The glow is a stack of flat translucent circles
 * rather than a blur: in this style a light source is a shape with a soft edge
 * painted on, not a filter (§9).
 *
 * The shade is wider than the lamp's footprint on purpose, and the catalog
 * knows it — the collider is the *stem*, because a creature walking past a
 * floor lamp brushes the stem, not the light.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, tones } from '../../shared/color';
import { attachLife } from '../ObjectLife';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  glowBall,
  groundShadow,
  post,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createLamp(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;

  const root = new Container();
  root.label = 'lamp';

  // The shade, not the stem, is what casts. A lamp whose shadow matched its
  // collider would look like it was standing on a pin.
  const shadeWidth = width * 2.1;
  const shadeHeight = height * 0.3;

  root.addChild(groundShadow(shadeWidth * 0.62, depth * 2, 0.22));

  // --- Foot ----------------------------------------------------------------
  const footTones = tones(ctx.secondaryColor);
  const foot = new Graphics();
  // The skirt of the base, as one closed shape: an ellipse would start its own
  // subpath and leave the sides unfilled.
  const footHalf = width * 0.62;
  const footRise = height * 0.05;
  foot.moveTo(-footHalf, 0);
  foot.lineTo(-footHalf * 0.86, -footRise);
  foot.lineTo(footHalf * 0.86, -footRise);
  foot.lineTo(footHalf, 0);
  foot.quadraticCurveTo(0, depth * 0.62 * FLOOR_SQUASH, -footHalf, 0);
  foot.closePath();
  foot.fill(formFill(footTones, 0.4));
  root.addChild(foot);

  const footTop = new Graphics();
  floorOval(footTop, 0, -footRise, footHalf * 1.72, depth * 1.1);
  footTop.fill({ color: footTones.light });
  root.addChild(footTop);

  // --- Stem ----------------------------------------------------------------
  root.addChild(
    post({
      x: 0,
      top: -height,
      length: height * 0.96,
      width: width * 0.24,
      color: darken(ctx.secondaryColor, 0.16),
      taper: -0.25,
    }),
  );

  // --- Glow ----------------------------------------------------------------
  // Labelled because the room switches it off when the lights go out — the
  // lamp *is* the light switch.
  const glow = glowBall(shadeWidth * 1.25, ctx.color, 0.26, 4);
  glow.label = 'lamp-glow';
  glow.position.set(0, -height + shadeHeight * 0.2);
  root.addChild(glow);

  // --- Shade ---------------------------------------------------------------
  // A trapezoid with a rounded crown, drawn with the ramp so its two sides are
  // lit differently — a flat cone reads as a paper cut-out.
  const shadeTones = tones(ctx.color);
  const shade = new Graphics();
  shade.moveTo(-shadeWidth * 0.3, -height - shadeHeight);
  shade.quadraticCurveTo(0, -height - shadeHeight * 1.25, shadeWidth * 0.3, -height - shadeHeight);
  shade.lineTo(shadeWidth * 0.5, -height);
  shade.lineTo(-shadeWidth * 0.5, -height);
  shade.closePath();
  shade.fill(formFill(shadeTones, 0.7));
  edge(shade, ctx.color, 3, 0.45);
  root.addChild(shade);

  // The lit underside of the shade, and the rim it hangs from.
  const lip = new Graphics();
  lip.ellipse(0, -height, shadeWidth * 0.5, shadeHeight * 0.16);
  lip.fill({ color: PALETTE.cream, alpha: 0.85 });
  lip.ellipse(0, -height, shadeWidth * 0.5, shadeHeight * 0.16);
  lip.stroke({ color: darken(ctx.color, 0.3), width: 2, alpha: 0.4 });
  root.addChild(lip);

  // One seam down the near side of the shade, upper left as always.
  const seam = new Graphics();
  seam.moveTo(-shadeWidth * 0.2, -height - shadeHeight * 0.94);
  seam.lineTo(-shadeWidth * 0.32, -height - shadeHeight * 0.06);
  seam.stroke({ color: lighten(shadeTones.light, 0.3), width: 2.5, alpha: 0.4 });
  root.addChild(seam);

  // A pool of light on the floor around the foot, so the lamp is visibly
  // lighting something. Under the shade, above the boards.
  const pool = new Graphics();
  pool.label = 'lamp-glow';
  floorOval(pool, 0, 0, shadeWidth * 1.4, depth * 5 * FLOOR_SQUASH);
  pool.fill({ color: ctx.color, alpha: 0.05 });
  root.addChildAt(pool, 1);

  // --- Life ----------------------------------------------------------------
  // A bulb is never perfectly steady: a slow breath, and once in a while a
  // flicker that is over before you are sure you saw it.
  let time = ctx.seed % 7;
  let flicker = 0;
  let nextFlicker = 6 + (ctx.seed % 5);

  attachLife(root, {
    update(dt) {
      time += dt;

      if (flicker > 0) {
        flicker = Math.max(0, flicker - dt);
      } else {
        nextFlicker -= dt;
        if (nextFlicker <= 0) {
          flicker = 0.18;
          nextFlicker = 9 + Math.random() * 14;
        }
      }

      const breath = 0.94 + Math.sin(time * 1.6) * 0.05 + Math.sin(time * 0.7) * 0.03;
      const dip = flicker > 0 ? 1 - Math.sin((flicker / 0.18) * Math.PI) * 0.35 : 1;

      glow.alpha = breath * dip;
      glow.scale.set(1 + (breath - 0.94) * 0.35);
      pool.alpha = breath * dip;
      lip.alpha = 0.85 * dip;
    },
  });

  return root;
}
