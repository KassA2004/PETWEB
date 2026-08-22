/**
 * Snouts: whatever sits between the eyes and the mouth.
 *
 * A muzzle patch, a pig disc or a beak changes a creature's species more
 * cheaply than any other single shape, which is why it is its own slot rather
 * than part of the face's fixed furniture.
 *
 * Drawn centred on the snout anchor, in face space.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { drawSquircle, formShading } from '../../shared/shapes';
import { getSnoutShape } from '../customization/FaceTypes';
import type { SnoutType } from '../customization/FaceTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export function createSnout(
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = 'snout';

  const shape = getSnoutShape(appearance.snoutType);
  const w = proportions.snoutWidth;
  const h = proportions.snoutHeight;
  if (w <= 0 || h <= 0) return root;

  switch (appearance.snoutType as SnoutType) {
    case 'none':
      return root;

    case 'nose': {
      // A small rounded triangle, like the rabbit reference.
      const art = new Graphics();
      art.moveTo(-w / 2, -h * 0.3);
      art.quadraticCurveTo(0, -h * 0.62, w / 2, -h * 0.3);
      art.quadraticCurveTo(w * 0.18, h * 0.5, 0, h * 0.5);
      art.quadraticCurveTo(-w * 0.18, h * 0.5, -w / 2, -h * 0.3);
      art.closePath();
      art.fill(formShading(tones(appearance.accentColor), 0.7));
      root.addChild(art);

      const shine = new Graphics();
      shine.ellipse(-w * 0.14, -h * 0.24, w * 0.16, h * 0.12);
      shine.fill({ color: lighten(appearance.accentColor, 0.55), alpha: 0.7 });
      root.addChild(shine);
      break;
    }

    case 'muzzle': {
      // A lighter patch the mouth sits on, with a nose above it.
      const patch = new Graphics();
      drawSquircle(patch, 0, h * 0.2, w * 0.5, h * 0.55, { roundness: 0.95, wobble: 0.02 });
      patch.fill({ color: mix(appearance.secondaryColor, appearance.primaryColor, 0.16), alpha: 0.95 });
      root.addChild(patch);

      const nose = new Graphics();
      nose.moveTo(-w * 0.16, -h * 0.34);
      nose.quadraticCurveTo(0, -h * 0.56, w * 0.16, -h * 0.34);
      nose.quadraticCurveTo(w * 0.06, -h * 0.08, 0, -h * 0.06);
      nose.quadraticCurveTo(-w * 0.06, -h * 0.08, -w * 0.16, -h * 0.34);
      nose.closePath();
      nose.fill({ color: appearance.accentColor });
      root.addChild(nose);
      break;
    }

    case 'snout': {
      const disc = new Graphics();
      drawSquircle(disc, 0, 0, w / 2, h / 2, { roundness: 0.9 });
      disc.fill(formShading(tones(mix(appearance.accentColor, appearance.primaryColor, 0.3)), 0.65));
      disc.stroke({ color: darken(appearance.accentColor, 0.4), width: 2, alpha: 0.3 });
      root.addChild(disc);

      const nostrils = new Graphics();
      for (let i = 0; i < shape.nostrils; i++) {
        const x = (i - (shape.nostrils - 1) / 2) * w * 0.34;
        nostrils.ellipse(x, h * 0.04, w * 0.09, h * 0.16);
      }
      nostrils.fill({ color: darken(appearance.accentColor, 0.62) });
      root.addChild(nostrils);

      const shine = new Graphics();
      shine.ellipse(-w * 0.18, -h * 0.22, w * 0.14, h * 0.1);
      shine.fill({ color: lighten(appearance.accentColor, 0.5), alpha: 0.6 });
      root.addChild(shine);
      break;
    }

    case 'beak': {
      const upper = new Graphics();
      upper.moveTo(-w / 2, -h * 0.15);
      upper.quadraticCurveTo(0, -h * 0.45, w / 2, -h * 0.15);
      upper.quadraticCurveTo(w * 0.1, h * 0.34, 0, h * 0.42);
      upper.quadraticCurveTo(-w * 0.1, h * 0.34, -w / 2, -h * 0.15);
      upper.closePath();
      upper.fill(formShading(tones(0xf2b23c), 0.7));
      upper.stroke({ color: darken(0xf2b23c, 0.45), width: 2, alpha: 0.35 });
      root.addChild(upper);

      const seam = new Graphics();
      seam.moveTo(-w * 0.42, -h * 0.1);
      seam.quadraticCurveTo(0, h * 0.06, w * 0.42, -h * 0.1);
      seam.stroke({ color: darken(0xf2b23c, 0.5), width: 2, alpha: 0.5 });
      root.addChild(seam);
      break;
    }
  }

  return root;
}
