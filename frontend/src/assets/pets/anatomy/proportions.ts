/**
 * Proportions — the single source of truth for every measurement on the pet.
 *
 * Parts and the rig both read from here, which is what guarantees that changing
 * `bodyScale` (or any other appearance value) moves the anchors and the artwork
 * together instead of pulling the creature apart.
 *
 * Coordinate system:
 *   The pet root sits on the floor, between the feet. -y is up, and the blob
 *   faces the viewer. So the body centre has a negative y, and the feet land
 *   on y = 0.
 */

import type { Vec2 } from '../../shared/shapes';
import { getBodyShape } from '../customization/BodyTypes';
import { getEyeShape } from '../customization/EyeTypes';
import { getMouthShape } from '../customization/MouthTypes';
import { getTopperShape } from '../customization/TopperTypes';
import type { PetAppearance } from '../customization/PetAppearance';

/** Base measurements in pixels, before any appearance scaling. */
const BASE = {
  bodyWidth: 210,
  bodyHeight: 196,
  eyeSize: 30,
  mouthWidth: 62,
  mouthHeight: 26,
  armWidth: 42,
  armLength: 66,
  footWidth: 58,
  footHeight: 30,
  topperSize: 96,
} as const;

export interface PetProportions {
  /** The blob mass, in pet-root space. */
  bodyWidth: number;
  bodyHeight: number;
  bodyCenter: Vec2;
  /** Squircle roundness and outline wobble for the body silhouette. */
  bodyRoundness: number;
  bodyWobble: number;
  /** Radius of the lighter belly patch. */
  bellyRadius: number;

  /** Face group anchor, in body space. */
  faceAnchor: Vec2;
  /** Extent of the face group — animation scales its motion against this. */
  faceWidth: number;
  faceHeight: number;

  /** Eyes, in face space. */
  eyeWidth: number;
  eyeHeight: number;
  eyeLeftAnchor: Vec2;
  eyeRightAnchor: Vec2;

  /** Mouth, in face space. */
  mouthWidth: number;
  mouthHeight: number;
  mouthAnchor: Vec2;

  /** Cheeks, in face space. */
  cheekRadius: number;
  cheekLeftAnchor: Vec2;
  cheekRightAnchor: Vec2;

  /** Side nubs, in body space. */
  armWidth: number;
  armLength: number;
  armLeftAnchor: Vec2;
  armRightAnchor: Vec2;

  /** Feet, in body space. */
  footWidth: number;
  footHeight: number;
  footLeftAnchor: Vec2;
  footRightAnchor: Vec2;
  /** How far the body floats above the floor, on its feet. */
  groundClearance: number;

  /** Topper, in body space. */
  topperWidth: number;
  topperHeight: number;
  topperAnchor: Vec2;

  /** Overall silhouette, useful for framing and shadows. */
  totalHeight: number;
  shadowWidth: number;
}

export function computeProportions(appearance: PetAppearance): PetProportions {
  const body = getBodyShape(appearance.bodyType);
  const eye = getEyeShape(appearance.eyeType);
  const mouth = getMouthShape(appearance.mouthType);
  const topper = getTopperShape(appearance.topperType);

  const scale = appearance.bodyScale;

  const bodyWidth = BASE.bodyWidth * scale * body.widthMul;
  const bodyHeight = BASE.bodyHeight * scale * body.heightMul;

  const footWidth = BASE.footWidth * scale * appearance.footScale;
  const footHeight = BASE.footHeight * scale * appearance.footScale;

  // The blob rests on its feet, which barely peek out from under the mass.
  const groundClearance = footHeight * 0.42;
  const bodyCenter: Vec2 = { x: 0, y: -(bodyHeight / 2 + groundClearance) };

  const eyeWidth = BASE.eyeSize * scale * appearance.eyeScale * eye.widthMul;
  const eyeHeight = BASE.eyeSize * scale * appearance.eyeScale * eye.heightMul;

  const mouthWidth =
    BASE.mouthWidth * scale * appearance.mouthScale * mouth.widthMul;
  const mouthHeight =
    BASE.mouthHeight * scale * appearance.mouthScale * mouth.heightMul;

  const armWidth = BASE.armWidth * scale * appearance.armScale;
  const armLength = BASE.armLength * scale * appearance.armScale;

  const topperWidth =
    BASE.topperSize * scale * appearance.topperScale * topper.widthMul;
  const topperHeight =
    BASE.topperSize * scale * appearance.topperScale * topper.heightMul;

  const eyeGap = bodyWidth * appearance.eyeSpacing;

  // The face sits a little above the body's middle: eyes high on the mass is
  // most of what makes a blob read as a creature rather than as a bag.
  const faceAnchor: Vec2 = { x: 0, y: -bodyHeight * 0.12 };

  return {
    bodyWidth,
    bodyHeight,
    bodyCenter,
    bodyRoundness: body.roundness,
    bodyWobble: body.wobble,
    bellyRadius: (bodyWidth / 2) * body.belly,

    faceAnchor,
    faceWidth: eyeGap * 2 + eyeWidth * 2,
    faceHeight: eyeHeight * 2 + mouthHeight * 2,

    eyeWidth,
    eyeHeight,
    eyeLeftAnchor: { x: -eyeGap, y: 0 },
    // A hair of asymmetry — designed imperfection (theme doc section 14).
    eyeRightAnchor: { x: eyeGap, y: -eyeHeight * 0.03 },

    mouthWidth,
    mouthHeight,
    mouthAnchor: { x: 0, y: eyeHeight + bodyHeight * 0.07 },

    cheekRadius: eyeWidth * 0.62,
    cheekLeftAnchor: { x: -eyeGap - eyeWidth * 1.15, y: eyeHeight * 0.9 },
    cheekRightAnchor: { x: eyeGap + eyeWidth * 1.15, y: eyeHeight * 0.9 },

    armWidth,
    armLength,
    armLeftAnchor: { x: -bodyWidth * 0.5, y: bodyHeight * 0.06 },
    armRightAnchor: { x: bodyWidth * 0.5, y: bodyHeight * 0.04 },

    footWidth,
    footHeight,
    footLeftAnchor: { x: -bodyWidth * 0.24, y: bodyHeight * 0.5 },
    footRightAnchor: { x: bodyWidth * 0.24, y: bodyHeight * 0.5 },
    groundClearance,

    topperWidth,
    topperHeight,
    topperAnchor: { x: bodyWidth * 0.03, y: -bodyHeight * 0.46 },

    totalHeight: groundClearance + bodyHeight + topperHeight * 0.8,
    shadowWidth: bodyWidth * 1.02,
  };
}
