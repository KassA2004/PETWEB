/**
 * Cheeks — one flat shape per side, and nothing more.
 *
 * The whole set is a single Graphics so the expression system can fade it with
 * one alpha. Over-rendering cheeks is the fastest way to turn a face into a
 * doll, so there are no gradients, no layers and no highlights here.
 */

import { Graphics } from 'pixi.js';
import { getCheekShape } from '../customization/CheekTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export function createCheeks(
  proportions: PetProportions,
  appearance: PetAppearance,
): Graphics {
  const g = new Graphics();
  g.label = 'cheeks';

  const shape = getCheekShape(appearance.cheekType);
  if (shape.kind === 'none') {
    g.alpha = 0;
    return g;
  }

  const r = proportions.cheekRadius;
  const anchors = [proportions.cheekLeftAnchor, proportions.cheekRightAnchor];

  for (const anchor of anchors) {
    const mirror = anchor.x < 0 ? -1 : 1;

    switch (shape.kind) {
      case 'oval':
        g.ellipse(anchor.x, anchor.y, r * 1.15, r * 0.68);
        break;

      case 'dots':
        for (let i = 0; i < 3; i++) {
          const t = (i - 1) * 0.6;
          g.circle(anchor.x + t * r * 0.7, anchor.y + Math.abs(t) * r * 0.35, r * 0.2);
        }
        break;

      case 'streak':
        g.moveTo(anchor.x - mirror * r * 0.7, anchor.y + r * 0.5);
        g.lineTo(anchor.x + mirror * r * 0.7, anchor.y - r * 0.5);
        g.lineTo(anchor.x + mirror * r * 0.95, anchor.y - r * 0.15);
        g.lineTo(anchor.x - mirror * r * 0.45, anchor.y + r * 0.85);
        g.closePath();
        break;

      case 'round':
      default:
        g.circle(anchor.x, anchor.y, r);
        break;
    }
  }

  g.fill({ color: appearance.accentColor });
  g.alpha = appearance.blush * shape.strength * 0.7;

  return g;
}
