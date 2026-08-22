/**
 * Lamp — stand, shade, and a flat pool of light.
 *
 * The glow is two flat translucent circles rather than a blur: in this style a
 * light source is a shape with a soft edge painted on, not a filter.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, outline } from '../../shared/color';
import { drawCapsule } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import { attachLife } from '../ObjectLife';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createLamp(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'lamp';

  const height = 210 * ctx.scale;
  const shadeWidth = 96 * ctx.scale;
  const shadeHeight = 62 * ctx.scale;

  root.addChild(createContactShadow({ width: shadeWidth * 0.9, strength: 0.24 }));

  // Base.
  const base = new Graphics();
  base.ellipse(0, -6 * ctx.scale, shadeWidth * 0.32, 11 * ctx.scale);
  base.fill({ color: ctx.secondaryColor });
  root.addChild(base);

  // Stand.
  const stand = new Graphics();
  drawCapsule(stand, 0, -height, 11 * ctx.scale, height - 6 * ctx.scale);
  stand.fill({ color: darken(ctx.secondaryColor, 0.18) });
  root.addChild(stand);

  // Glow behind the shade. Labelled because the room switches it off when the
  // lights go out — the lamp IS the light switch.
  const glow = new Graphics();
  glow.label = 'lamp-glow';
  // Three rings rather than two: more bands, lower alpha each, so the
  // falloff reads as soft instead of as a drawn circle.
  for (const [radius, alpha] of [[1.25, 0.06], [0.95, 0.07], [0.66, 0.08]]) {
    glow.circle(0, -height + shadeHeight * 0.2, shadeWidth * radius);
    glow.fill({ color: ctx.color, alpha });
  }
  root.addChild(glow);

  // Shade: a simple trapezoid with a rounded top.
  const shade = new Graphics();
  shade.moveTo(-shadeWidth * 0.3, -height - shadeHeight);
  shade.quadraticCurveTo(
    0,
    -height - shadeHeight * 1.25,
    shadeWidth * 0.3,
    -height - shadeHeight,
  );
  shade.lineTo(shadeWidth * 0.5, -height);
  shade.lineTo(-shadeWidth * 0.5, -height);
  shade.closePath();
  shade.fill({ color: ctx.color });
  shade.stroke({ color: outline(ctx.color), width: 3, alpha: 0.45 });
  root.addChild(shade);

  // The lit underside of the shade.
  const lip = new Graphics();
  lip.ellipse(0, -height, shadeWidth * 0.5, shadeHeight * 0.13);
  lip.fill({ color: PALETTE.cream, alpha: 0.85 });
  root.addChild(lip);

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
      lip.alpha = 0.85 * dip;
    },
  });

  return root;
}
