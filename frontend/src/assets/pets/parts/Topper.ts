/**
 * Topper — the one thing growing out of the top of the blob.
 *
 * With no ears and no tail, this is where the creature's silhouette variety
 * lives. Each type is two or three flat shapes, drawn upward from the crown
 * anchor so the rig can swing the whole thing from its base.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, outline } from '../../shared/color';
import { drawCapsule, drawOrganicOval } from '../../shared/shapes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { TopperType } from '../customization/TopperTypes';
import type { PetProportions } from '../anatomy/proportions';

export function createTopper(
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = 'topper';

  const w = proportions.topperWidth;
  const h = proportions.topperHeight;
  if (w <= 0 || h <= 0) return root;

  const color = appearance.secondaryColor;
  const art = new Graphics();

  switch (appearance.topperType as TopperType) {
    case 'none':
      return root;

    case 'puff': {
      // Three overlapping puffs — a small cloud sitting on the head.
      drawOrganicOval(art, -w * 0.28, -h * 0.18, w * 0.34, h * 0.3, 24, 0.08, 1);
      drawOrganicOval(art, w * 0.3, -h * 0.14, w * 0.31, h * 0.27, 24, 0.08, 2);
      drawOrganicOval(art, 0, -h * 0.42, w * 0.4, h * 0.34, 26, 0.07, 3);
      // No outline here on purpose: three overlapping subpaths share one
      // stroke, so the seams between the puffs would draw as crossing arcs.
      art.fill({ color });
      root.addChild(art);

      // One lighter puff on top left, matching the body's shine.
      const shine = new Graphics();
      drawOrganicOval(shine, -w * 0.14, -h * 0.5, w * 0.16, h * 0.11, 18, 0.06);
      shine.fill({ color: lighten(color, 0.45), alpha: 0.7 });
      root.addChild(shine);
      break;
    }

    case 'sprout': {
      drawCapsule(art, 0, -h * 0.7, w * 0.16, h * 0.7);
      art.fill({ color: darken(PALETTE.mint, 0.25) });
      root.addChild(art);

      // A pointed teardrop growing off the tip of the stem, rather than a
      // circle on a stick.
      const leaf = new Graphics();
      leaf.moveTo(0, -h * 0.7);
      leaf.quadraticCurveTo(w * 0.5, -h * 1.02, w * 0.66, -h * 0.6);
      leaf.quadraticCurveTo(w * 0.34, -h * 0.44, 0, -h * 0.7);
      leaf.closePath();
      leaf.fill({ color: PALETTE.mint });
      leaf.stroke({ color: outline(PALETTE.mint, 0.3), width: 3, alpha: 0.5 });
      root.addChild(leaf);
      break;
    }

    case 'antenna': {
      drawCapsule(art, 0, -h * 0.85, w * 0.14, h * 0.85);
      art.fill({ color: darken(color, 0.15) });
      root.addChild(art);

      const ball = new Graphics();
      ball.circle(0, -h * 0.9, w * 0.34);
      ball.fill({ color: appearance.accentColor });
      ball.stroke({
        color: outline(appearance.accentColor, 0.25),
        width: 3,
        alpha: 0.4,
      });
      root.addChild(ball);
      break;
    }

    case 'swirl': {
      // One fat curl, drawn as a stroke so it stays a single readable line.
      art.moveTo(0, 0);
      art.bezierCurveTo(-w * 0.1, -h * 0.6, w * 0.85, -h * 0.75, w * 0.36, -h * 0.24);
      art.stroke({
        color,
        width: Math.max(4, w * 0.24),
        cap: 'round',
        join: 'round',
      });
      root.addChild(art);
      break;
    }
  }

  return root;
}
