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

  // Glow behind the shade.
  const glow = new Graphics();
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

  return root;
}
