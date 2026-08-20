/**
 * Mouth — one or two flat strokes.
 *
 * The mouth is drawn once and then animated purely by scaling its joint: the
 * animation layer opens it by stretching y and widens a grin by stretching x,
 * so no state ever has to redraw a mouth shape (/Docs/pet-anatomy.md §18).
 *
 * Drawn in face space, with the origin at the mouth anchor.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE } from '../../shared/color';
import { getMouthShape } from '../customization/MouthTypes';
import type { MouthType } from '../customization/MouthTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export function createMouth(
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const shape = getMouthShape(appearance.mouthType);

  const root = new Container();
  root.label = 'mouth';

  const w = proportions.mouthWidth;
  const h = proportions.mouthHeight;
  const weight = Math.max(2, w * shape.weight);

  const art = new Graphics();

  switch (appearance.mouthType as MouthType) {
    case 'wave': {
      // Two soft bumps meeting in the middle — the small cat mouth.
      art.moveTo(-w / 2, 0);
      art.quadraticCurveTo(-w / 4, h, 0, 0);
      art.quadraticCurveTo(w / 4, h, w / 2, 0);
      break;
    }

    case 'smile': {
      art.moveTo(-w / 2, 0);
      art.quadraticCurveTo(0, h * 1.9, w / 2, 0);
      break;
    }

    case 'line': {
      art.moveTo(-w / 2, 0);
      art.quadraticCurveTo(0, h * 0.35, w / 2, 0);
      break;
    }

    case 'oh': {
      art.ellipse(0, h * 0.35, w / 2, h * 0.75);
      break;
    }

    case 'grin': {
      art.moveTo(-w / 2, 0);
      art.quadraticCurveTo(0, h * 2.4, w / 2, 0);
      art.closePath();
      break;
    }
  }

  if (shape.filled) {
    art.fill({ color: PALETTE.ink });
  } else {
    art.stroke({
      color: PALETTE.ink,
      width: weight,
      cap: 'round',
      join: 'round',
    });
  }

  root.addChild(art);

  // Filled mouths get a small tongue so an open mouth is not a flat hole.
  if (shape.filled) {
    const tongue = new Graphics();
    tongue.ellipse(0, h * 1.05, w * 0.28, h * 0.42);
    tongue.fill({ color: appearance.accentColor, alpha: 0.9 });
    tongue.mask = (() => {
      const clip = new Graphics();
      if (appearance.mouthType === 'oh') {
        clip.ellipse(0, h * 0.35, w / 2, h * 0.75);
      } else {
        clip.moveTo(-w / 2, 0);
        clip.quadraticCurveTo(0, h * 2.4, w / 2, 0);
        clip.closePath();
      }
      clip.fill({ color: 0xffffff });
      root.addChild(clip);
      return clip;
    })();
    root.addChild(tongue);
  }

  return root;
}
