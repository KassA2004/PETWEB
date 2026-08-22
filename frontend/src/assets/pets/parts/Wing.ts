/**
 * Wings.
 *
 * Drawn behind the body and anchored at the shoulder, pointing up and out.
 * Each type declares its own idle flutter rate, so a bee buzzes at 7 Hz while a
 * bird's wings barely move — the animation layer reads that number rather than
 * knowing what a bee is.
 *
 * The mirror argument is what keeps a left wing from being a right wing drawn
 * badly: the shape is authored once pointing right and flipped.
 */

import { Container, Graphics } from 'pixi.js';
import { lighten, mix, tones } from '../../shared/color';
import { formShading } from '../../shared/shapes';
import { getWingShape } from '../customization/AppendageTypes';
import type { WingType } from '../customization/AppendageTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export function createWing(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = `wing-${side}`;

  const shape = getWingShape(appearance.wingType);
  const w = proportions.wingWidth;
  const h = proportions.wingHeight;
  if (w <= 0 || h <= 0) return root;

  const mirror = side === 'left' ? -1 : 1;
  const membrane = mix(appearance.secondaryColor, 0xffffff, 0.35);
  const art = new Graphics();

  switch (appearance.wingType as WingType) {
    case 'none':
      return root;

    case 'bee':
    case 'tiny': {
      // One long rounded blade, translucent, with a couple of veins.
      art.moveTo(0, 0);
      art.bezierCurveTo(mirror * w * 0.35, -h * 0.95, mirror * w * 1.05, -h * 0.7, mirror * w, -h * 0.12);
      art.bezierCurveTo(mirror * w * 0.85, h * 0.28, mirror * w * 0.3, h * 0.18, 0, 0);
      art.closePath();
      art.fill({ color: membrane, alpha: shape.alpha });
      art.stroke({ color: mix(membrane, 0x4a6b7a, 0.45), width: 2, alpha: 0.5 });
      root.addChild(art);

      const veins = new Graphics();
      for (let i = 0; i < shape.veins; i++) {
        const t = 0.35 + i * 0.25;
        veins.moveTo(mirror * w * 0.08, 0);
        veins.quadraticCurveTo(mirror * w * 0.5, -h * t, mirror * w * 0.9, -h * (t - 0.2));
      }
      veins.stroke({ color: mix(membrane, 0x4a6b7a, 0.4), width: 1.6, alpha: 0.45 });
      root.addChild(veins);
      break;
    }

    case 'butterfly': {
      // Two panels: a big upper and a smaller lower.
      art.moveTo(0, 0);
      art.bezierCurveTo(mirror * w * 0.2, -h * 1.1, mirror * w * 1.1, -h * 0.9, mirror * w * 0.95, -h * 0.2);
      art.bezierCurveTo(mirror * w * 0.8, h * 0.05, mirror * w * 0.3, h * 0.02, 0, 0);
      art.closePath();
      art.moveTo(0, h * 0.02);
      art.bezierCurveTo(mirror * w * 0.4, h * 0.2, mirror * w * 0.75, h * 0.55, mirror * w * 0.45, h * 0.7);
      art.bezierCurveTo(mirror * w * 0.2, h * 0.78, mirror * w * 0.02, h * 0.3, 0, h * 0.02);
      art.closePath();
      art.fill(formShading(tones(appearance.accentColor), 0.6));
      art.stroke({ color: tones(appearance.accentColor).line, width: 2.5, alpha: 0.35 });
      root.addChild(art);

      const spots = new Graphics();
      spots.circle(mirror * w * 0.6, -h * 0.55, w * 0.14);
      spots.circle(mirror * w * 0.38, h * 0.44, w * 0.08);
      spots.fill({ color: membrane, alpha: 0.85 });
      root.addChild(spots);
      break;
    }

    case 'bird': {
      art.moveTo(0, 0);
      art.quadraticCurveTo(mirror * w * 0.55, -h * 0.85, mirror * w * 1.05, -h * 0.45);
      art.quadraticCurveTo(mirror * w * 0.7, h * 0.05, 0, h * 0.12);
      art.closePath();
      art.fill(formShading(tones(mix(appearance.primaryColor, appearance.secondaryColor, 0.3)), 0.6));
      art.stroke({ color: tones(appearance.primaryColor).line, width: 2.5, alpha: 0.3 });
      root.addChild(art);

      // Feather divisions, drawn as arcs rather than separate shapes.
      const feathers = new Graphics();
      for (let i = 0; i < shape.veins; i++) {
        const t = 0.3 + i * 0.24;
        feathers.moveTo(mirror * w * 0.12, h * 0.02);
        feathers.quadraticCurveTo(mirror * w * 0.6, -h * t * 0.7, mirror * w * (0.95 - i * 0.05), -h * (t - 0.12));
      }
      feathers.stroke({ color: tones(appearance.primaryColor).line, width: 2, alpha: 0.3 });
      root.addChild(feathers);
      break;
    }

    case 'bat': {
      // Scalloped trailing edge — three arcs back to the shoulder.
      art.moveTo(0, 0);
      art.quadraticCurveTo(mirror * w * 0.5, -h * 0.95, mirror * w, -h * 0.5);
      art.quadraticCurveTo(mirror * w * 0.78, -h * 0.16, mirror * w * 0.66, -h * 0.3);
      art.quadraticCurveTo(mirror * w * 0.52, h * 0.06, mirror * w * 0.4, -h * 0.14);
      art.quadraticCurveTo(mirror * w * 0.24, h * 0.2, mirror * w * 0.14, -h * 0.02);
      art.quadraticCurveTo(mirror * w * 0.06, h * 0.06, 0, 0);
      art.closePath();
      art.fill(formShading(tones(mix(appearance.primaryColor, 0x3a2a3f, 0.35)), 0.5));
      art.stroke({ color: tones(appearance.primaryColor).line, width: 2.5, alpha: 0.35 });
      root.addChild(art);

      const bones = new Graphics();
      for (const t of [0.3, 0.55, 0.8]) {
        bones.moveTo(mirror * w * 0.06, 0);
        bones.lineTo(mirror * w * t, -h * (0.62 - t * 0.35));
      }
      bones.stroke({ color: tones(appearance.primaryColor).line, width: 2, alpha: 0.4 });
      root.addChild(bones);
      break;
    }
  }

  // Shared sheen, so wings catch the same light as everything else.
  const sheen = new Graphics();
  sheen.ellipse(mirror * w * 0.45, -h * 0.42, w * 0.2, h * 0.12);
  sheen.fill({ color: lighten(0xffffff, 0), alpha: 0.22 });
  root.addChild(sheen);

  return root;
}
