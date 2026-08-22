/**
 * Brows.
 *
 * Two small shapes that decide whether a creature is sweet or a problem. The
 * art is static; the expression system rotates and raises the joints, which is
 * enough for the whole emotional range:
 *
 *   inner ends down  -> angry
 *   inner ends up    -> sad, worried
 *   both raised      -> surprised
 *
 * Drawn centred on the joint origin, pointing along +x for the right brow and
 * mirrored for the left, so a rotation always means the same thing to both.
 */

import { Container, Graphics } from 'pixi.js';
import { darken } from '../../shared/color';
import { getBrowShape } from '../customization/FaceTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export function createBrow(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = `brow-${side}`;

  const shape = getBrowShape(appearance.browType);
  const w = proportions.browWidth;
  if (w <= 0 || appearance.browType === 'none') return root;

  const mirror = side === 'left' ? -1 : 1;
  const thickness = Math.max(2.5, w * shape.weight);
  const color = darken(appearance.primaryColor, 0.55);

  const art = new Graphics();

  if (shape.angular > 0) {
    // A hard wedge: thick at the inner end, tapering outward.
    art.moveTo(-mirror * w * 0.5, -thickness * 0.7);
    art.lineTo(mirror * w * 0.5, thickness * 0.1);
    art.lineTo(mirror * w * 0.5, thickness * 0.6);
    art.lineTo(-mirror * w * 0.5, thickness * 0.9);
    art.closePath();
    art.fill({ color });
  } else {
    // A soft arc.
    art.moveTo(-mirror * w * 0.5, 0);
    art.quadraticCurveTo(0, -w * shape.arch * 0.34, mirror * w * 0.5, 0);
    art.stroke({ color, width: thickness, cap: 'round' });
  }

  root.addChild(art);
  return root;
}
