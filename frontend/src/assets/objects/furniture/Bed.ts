/**
 * Bed — a soft mattress with a pillow and a folded blanket.
 *
 * Four flat shapes. The silhouette does the work: a squircle mattress with a
 * pillow bulging out of one end reads as a bed at a glance, which is the whole
 * requirement (/Docs/theme-and-design.md section 10).
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBed(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'bed';

  const width = 240 * ctx.scale;
  const height = 74 * ctx.scale;

  root.addChild(createContactShadow({ width: width * 1.02, strength: 0.26 }));

  // Mattress.
  const mattress = new Graphics();
  drawSquircle(mattress, 0, -height / 2, width / 2, height / 2, {
    roundness: 0.75,
  });
  mattress.fill({ color: ctx.color });
  mattress.stroke({ color: outline(ctx.color), width: 3, alpha: 0.45 });
  root.addChild(mattress);

  // Blanket folded over the near end.
  const blanket = new Graphics();
  drawSquircle(
    blanket,
    width * 0.16,
    -height * 0.42,
    width * 0.3,
    height * 0.42,
    { roundness: 0.8 },
  );
  blanket.fill({ color: ctx.accentColor });
  root.addChild(blanket);

  // Pillow.
  const pillow = new Graphics();
  drawSquircle(
    pillow,
    -width * 0.28,
    -height * 0.78,
    width * 0.19,
    height * 0.34,
    { roundness: 0.85 },
  );
  pillow.fill({ color: ctx.secondaryColor });
  pillow.stroke({ color: outline(ctx.secondaryColor), width: 3, alpha: 0.35 });
  root.addChild(pillow);

  // One highlight band along the top edge of the mattress.
  const shine = new Graphics();
  shine.ellipse(-width * 0.05, -height * 0.86, width * 0.24, height * 0.08);
  shine.fill({ color: lighten(ctx.color, 0.4), alpha: 0.5 });
  root.addChild(shine);

  // Base shade so it does not float.
  const base = new Graphics();
  base.ellipse(0, -height * 0.06, width * 0.44, height * 0.1);
  base.fill({ color: darken(ctx.color, 0.3), alpha: 0.35 });
  root.addChild(base);

  return root;
}
