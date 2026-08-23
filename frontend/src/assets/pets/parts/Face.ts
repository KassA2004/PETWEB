/**
 * Face — cheeks, snout, eyes, brows and mouth, grouped so they move as one.
 *
 * This file assembles and orders; every feature is designed in its own module.
 * The order below is the face's draw order, and it is deliberate: cheeks sit
 * under everything, the snout under the eyes, brows over the eyes, and the
 * mouth last so a tooth is never buried by a muzzle.
 *
 * The mouth is given its resting pose here — the creature's design plus its
 * resting mood — and the expression system takes over from the next frame.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, mix } from '../../shared/color';
import { createBrow } from './Brow';
import { createCheeks } from './Cheek';
import { getCheekShape } from '../customization/CheekTypes';
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
  /** The cheek design's own opacity weight, so the driver can scale from it. */
  cheekStrength: number;
  snout: Container;
}

/** The mouth colours a creature's coat implies. Shared with the face driver. */
export function mouthColors(appearance: PetAppearance): {
  color: number;
  tongue: number;
} {
  return {
    color: darken(appearance.primaryColor, 0.62),
    tongue: mix(appearance.accentColor, 0xff6b8a, 0.4),
  };
}

export function createFace(
  proportions: PetProportions,
  appearance: PetAppearance,
): FaceView {
  const root = new Container();
  root.label = 'face';
  root.position.set(proportions.faceAnchor.x, proportions.faceAnchor.y);

  // --- Cheeks --------------------------------------------------------------
  const cheeks = createCheeks(proportions, appearance);
  root.addChild(cheeks);

  // --- Snout ---------------------------------------------------------------
  const snout = createSnout(proportions, appearance);
  snout.position.set(proportions.snoutAnchor.x, proportions.snoutAnchor.y);
  root.addChild(snout);

  // --- Eyes ----------------------------------------------------------------
  const eyeLeft = createEye('left', proportions, appearance);
  eyeLeft.root.position.set(proportions.eyeLeftAnchor.x, proportions.eyeLeftAnchor.y);
  eyeLeft.root.rotation -= proportions.eyeTilt;
  eyeLeft.pupil.scale.set(proportions.pupilScale);
  root.addChild(eyeLeft.root);

  const eyeRight = createEye('right', proportions, appearance);
  eyeRight.root.position.set(proportions.eyeRightAnchor.x, proportions.eyeRightAnchor.y);
  eyeRight.root.rotation += proportions.eyeTilt;
  eyeRight.pupil.scale.set(proportions.pupilScale);
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

  const colors = mouthColors(appearance);

  mouth.apply({
    type: appearance.mouthType,
    teeth: appearance.teethType,
    curve: appearance.restingMood * 0.8,
    open: 0,
    twist: 0,
    width: proportions.mouthWidth,
    weight: proportions.mouthWeight,
    fangs: appearance.fangs,
    color: colors.color,
    tongue: colors.tongue,
    seed: appearance.seed,
  });

  root.addChild(mouth.root);

  return {
    root,
    eyeLeft,
    eyeRight,
    browLeft,
    browRight,
    mouth,
    cheeks,
    cheekStrength: getCheekShape(appearance.cheekType).strength,
    snout,
  };
}
