/**
 * Plant — a pot and three leaves.
 *
 * The leaf count and angles are seeded, so two plants placed in the same room
 * are recognisably the same object without being identical.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { createRng, drawOrganicOval, rngRange } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createPlant(ctx: ObjectRenderContext): Container {
  const rng = createRng(ctx.seed + 41);
  const root = new Container();
  root.label = 'plant';

  const potWidth = 86 * ctx.scale;
  const potHeight = 68 * ctx.scale;

  root.addChild(createContactShadow({ width: potWidth * 1.15, strength: 0.24 }));

  // --- Leaves --------------------------------------------------------------
  const leaves = new Graphics();
  const stems = new Graphics();
  const count = 3;

  for (let i = 0; i < count; i++) {
    const lean = ((i - (count - 1) / 2) / count) * 2.2 + rngRange(rng, -0.15, 0.15);
    const length = rngRange(rng, 62, 92) * ctx.scale;

    const tipX = Math.sin(lean) * length * 0.7;
    const tipY = -potHeight - Math.cos(lean * 0.5) * length;

    stems.moveTo(0, -potHeight * 0.7);
    stems.quadraticCurveTo(tipX * 0.4, (tipY + -potHeight) * 0.5, tipX, tipY);

    drawOrganicOval(
      leaves,
      tipX,
      tipY,
      rngRange(rng, 24, 34) * ctx.scale,
      rngRange(rng, 34, 46) * ctx.scale,
      22,
      0.08,
      i,
    );
  }

  stems.stroke({ color: darken(ctx.color, 0.35), width: 9 * ctx.scale });
  root.addChild(stems);

  leaves.fill({ color: ctx.color });
  leaves.stroke({ color: outline(ctx.color), width: 3, alpha: 0.45 });
  root.addChild(leaves);

  // --- Pot -----------------------------------------------------------------
  const pot = new Graphics();
  pot.moveTo(-potWidth / 2, -potHeight);
  pot.lineTo(potWidth / 2, -potHeight);
  pot.quadraticCurveTo(potWidth * 0.4, -potHeight * 0.05, potWidth * 0.32, 0);
  pot.lineTo(-potWidth * 0.32, 0);
  pot.quadraticCurveTo(-potWidth * 0.4, -potHeight * 0.05, -potWidth / 2, -potHeight);
  pot.closePath();
  pot.fill({ color: ctx.secondaryColor });
  pot.stroke({ color: outline(ctx.secondaryColor), width: 3, alpha: 0.45 });
  root.addChild(pot);

  // Rim band.
  const rim = new Graphics();
  rim.rect(-potWidth / 2, -potHeight, potWidth, potHeight * 0.22);
  rim.fill({ color: lighten(ctx.secondaryColor, 0.2) });
  root.addChild(rim);

  return root;
}
