/**
 * Face.ts
 *
 * Face — cheeks, eyes, brows, snout and mouth, grouped so they move as one.
 *
 * Updated to use flat, solid circular blush patches to match the 2D
 * cubic character design language.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, mix } from '../../shared/color';
import { createBrow } from './Brow';
import { createEye } from './Eye';
import type { EyeView } from './Eye';
import { createMouth } from './Mouth';
import type { MouthView } from './Mouth';
import { createSnout } from './Snout';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export interface FaceView {
  root: Container;
  eyeLeft: EyeView;
  eyeRight: EyeView;
  browLeft: Container;
  browRight: Container;
  mouth: MouthView;
  cheeks: Graphics;
  snout: Container;
}

export function createFace(
  proportions: PetProportions,
  appearance: PetAppearance,
): FaceView {
  const root = new Container();
  root.label = 'face';
  root.position.set(proportions.faceAnchor.x, proportions.faceAnchor.y);

  // --- Cheeks --------------------------------------------------------------
  // Flat, perfect circles for the 2D blush vector style
  const cheeks = new Graphics();
  cheeks.circle(
    proportions.cheekLeftAnchor.x,
    proportions.cheekLeftAnchor.y,
    proportions.cheekRadius
  );
  cheeks.circle(
    proportions.cheekRightAnchor.x,
    proportions.cheekRightAnchor.y,
    proportions.cheekRadius
  );
  cheeks.fill({ color: appearance.accentColor });
  cheeks.alpha = Math.max(0.6, appearance.blush); // Keep opacity high for solid read
  root.addChild(cheeks);

  // --- Snout ---------------------------------------------------------------
  const snout = createSnout(proportions, appearance);
  snout.position.set(proportions.snoutAnchor.x, proportions.snoutAnchor.y);
  root.addChild(snout);

  // --- Eyes ----------------------------------------------------------------
  const eyeLeft = createEye('left', proportions, appearance);
  eyeLeft.root.position.set(proportions.eyeLeftAnchor.x, proportions.eyeLeftAnchor.y);
  root.addChild(eyeLeft.root);

  const eyeRight = createEye('right', proportions, appearance);
  eyeRight.root.position.set(proportions.eyeRightAnchor.x, proportions.eyeRightAnchor.y);
  root.addChild(eyeRight.root);

  // --- Brows ---------------------------------------------------------------
  const browLeft = createBrow('left', proportions, appearance);
  browLeft.position.set(proportions.browLeftAnchor.x, proportions.browLeftAnchor.y);
  root.addChild(browLeft);

  const browRight = createBrow('right', proportions, appearance);
  browRight.position.set(proportions.browRightAnchor.x, proportions.browRightAnchor.y);
  root.addChild(browRight);

  // --- Mouth ---------------------------------------------------------------
  const mouth = createMouth();
  mouth.root.position.set(proportions.mouthAnchor.x, proportions.mouthAnchor.y);

  mouth.apply({
    curve: appearance.restingMood * 0.8,
    open: 0,
    width: proportions.mouthWidth,
    weight: proportions.mouthWeight,
    fangs: appearance.fangs,
    color: darken(appearance.primaryColor, 0.62),
    tongue: mix(appearance.accentColor, 0xff6b8a, 0.4),
  });

  root.addChild(mouth.root);

  return { root, eyeLeft, eyeRight, browLeft, browRight, mouth, cheeks, snout };
}