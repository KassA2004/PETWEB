/**
 * Brow — one small shape that decides whether a creature is sweet or a threat.
 *
 * Drawn centred on the joint origin and pointing along +x for the right brow,
 * mirrored for the left, so a rotation always means the same thing to both:
 * positive drops the inner end, which is anger, and negative lifts it, which is
 * worry. The expression system relies on that convention.
 *
 * The art itself is static. Everything expressive about a brow is the joint.
 */

import { Container, Graphics } from 'pixi.js';
import { darken } from '../../shared/color';
import { drawSmoothOpen, drawPolygon } from '../../shared/geometry';
import { browSideVariation, getBrowShape } from '../customization/BrowTypes';
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
  if (shape.kind === 'none' || w <= 0) return root;

  const variation = browSideVariation(shape, side);
  const mirror = side === 'left' ? -1 : 1;
  const thickness = Math.max(2.5, w * shape.weight);
  const color = darken(appearance.primaryColor, 0.58);

  // The type's own attitude, before the expression system touches the joint.
  // The rotation goes on the root, because that is what the expression system
  // adds to; the lift goes on the artwork, because the root's position is the
  // anchor the face owns.
  root.rotation = mirror * (shape.tilt + variation.tilt);

  const art = new Graphics();
  art.y = -w * (shape.lift + variation.lift);

  switch (shape.kind) {
    case 'wedge': {
      // Thick at the inner end, tapering outward.
      drawPolygon(art, [
        { x: -mirror * w * 0.5, y: -thickness * 0.75 },
        { x: mirror * w * 0.5, y: thickness * 0.05 },
        { x: mirror * w * 0.5, y: thickness * 0.55 },
        { x: -mirror * w * 0.5, y: thickness * 0.95 },
      ]);
      art.fill({ color });
      break;
    }

    case 'bar': {
      art.roundRect(-w * 0.5, -thickness * 0.5, w, thickness, thickness * 0.45);
      art.fill({ color });
      break;
    }

    case 'dot': {
      art.circle(0, 0, thickness * 0.5);
      art.fill({ color });
      break;
    }

    case 'tuft': {
      // Several short strokes following the arc, rather than one line.
      const count = Math.max(2, shape.segments);

      for (let i = 0; i < count; i++) {
        const t = count <= 1 ? 0.5 : i / (count - 1);
        const x = (-0.5 + t) * w;
        const arch = -Math.sin(t * Math.PI) * w * shape.arch * 0.3;
        // Tufts lean outward along the brow, which is what makes them read as
        // hair rather than as dashes.
        const lean = mirror * (t - 0.5) * thickness * 0.8;

        art.moveTo(x - lean * 0.5, arch + thickness * 0.5);
        art.lineTo(x + lean * 0.5, arch - thickness * 0.6);
      }

      art.stroke({ color, width: Math.max(2, thickness * 0.55), cap: 'round' });
      break;
    }

    case 'arc':
    default: {
      drawSmoothOpen(art, [
        { x: -mirror * w * 0.5, y: 0 },
        { x: -mirror * w * 0.18, y: -w * shape.arch * 0.26 },
        { x: mirror * w * 0.2, y: -w * shape.arch * 0.3 },
        { x: mirror * w * 0.5, y: w * shape.arch * 0.06 },
      ]);
      art.stroke({ color, width: thickness, cap: 'round', join: 'round' });
      break;
    }
  }

  root.addChild(art);
  return root;
}
