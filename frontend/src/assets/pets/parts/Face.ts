/**
 * Face — cheeks, two eyes and a mouth, grouped so they move as one.
 *
 * The face is a single group sitting on the front of the blob. Because it is
 * its own joint, the animation layer can slide the whole face a few pixels to
 * suggest the creature turning, without touching the body silhouette — which
 * is the only "head turn" a blob needs (/Docs/pet-anatomy.md §15).
 *
 * Drawn in body space; the group positions itself at the face anchor.
 */

import { Container, Graphics } from 'pixi.js';
import { createEye } from './Eye';
import type { EyeView } from './Eye';
import { createMouth } from './Mouth';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export interface FaceView {
  root: Container;
  eyeLeft: EyeView;
  eyeRight: EyeView;
  mouth: Container;
}

export function createFace(
  proportions: PetProportions,
  appearance: PetAppearance,
): FaceView {
  const root = new Container();
  root.label = 'face';
  root.position.set(proportions.faceAnchor.x, proportions.faceAnchor.y);

  // --- Cheeks --------------------------------------------------------------
  // Behind the eyes, low alpha. Two soft patches are the cheapest warmth the
  // face can have, and they read even when everything else is closed.
  const cheeks = new Graphics();
  cheeks.ellipse(
    proportions.cheekLeftAnchor.x,
    proportions.cheekLeftAnchor.y,
    proportions.cheekRadius,
    proportions.cheekRadius * 0.72,
  );
  cheeks.ellipse(
    proportions.cheekRightAnchor.x,
    proportions.cheekRightAnchor.y,
    proportions.cheekRadius,
    proportions.cheekRadius * 0.72,
  );
  cheeks.fill({ color: appearance.accentColor, alpha: 0.45 });
  root.addChild(cheeks);

  // --- Eyes ----------------------------------------------------------------
  const eyeLeft = createEye('left', proportions, appearance);
  eyeLeft.root.position.set(
    proportions.eyeLeftAnchor.x,
    proportions.eyeLeftAnchor.y,
  );
  root.addChild(eyeLeft.root);

  const eyeRight = createEye('right', proportions, appearance);
  eyeRight.root.position.set(
    proportions.eyeRightAnchor.x,
    proportions.eyeRightAnchor.y,
  );
  root.addChild(eyeRight.root);

  // --- Mouth ---------------------------------------------------------------
  const mouth = createMouth(proportions, appearance);
  mouth.position.set(proportions.mouthAnchor.x, proportions.mouthAnchor.y);
  root.addChild(mouth);

  return { root, eyeLeft, eyeRight, mouth };
}
