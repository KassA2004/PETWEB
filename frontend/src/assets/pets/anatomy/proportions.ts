/**
 * Proportions — the single source of truth for every measurement on the pet.
 *
 * Parts and the rig both read from here, which is what guarantees that changing
 * `bodyScale` (or any other appearance value) moves the anchors and the artwork
 * together instead of pulling the creature apart.
 *
 * Coordinate system:
 *   The pet root sits on the floor, between the paws. +x is forward (the pet
 *   faces right), -y is up. So the body centre has a negative y, and every paw
 *   lands on y = 0.
 */

import type { Vec2 } from '../../shared/shapes';
import { getBodyShape } from '../customization/BodyTypes';
import { getEarShape } from '../customization/EarTypes';
import { getEyeShape } from '../customization/EyeTypes';
import { getHeadShape } from '../customization/HeadTypes';
import { getTailShape } from '../customization/TailTypes';
import type { PetAppearance } from '../customization/PetAppearance';

/** Base measurements in pixels, before any appearance scaling. */
const BASE = {
  bodyWidth: 200,
  bodyHeight: 124,
  headWidth: 128,
  headHeight: 116,
  legLength: 46,
  legWidth: 26,
  tailLength: 155,
  tailThickness: 24,
  earWidth: 46,
  earHeight: 82,
  eyeWidth: 30,
  eyeHeight: 32,
} as const;

export interface PetProportions {
  /** Body, in pet-root space. */
  bodyWidth: number;
  bodyHeight: number;
  bodyCenter: Vec2;

  /** Legs. `drawLength` runs from the hip anchor down to the floor. */
  legWidth: number;
  legClearance: number;
  legDrawLength: number;
  legDrawLengthFar: number;
  pawWidth: number;
  pawHeight: number;

  /** Leg anchors, in body space. */
  frontLegLeftAnchor: Vec2;
  frontLegRightAnchor: Vec2;
  backLegLeftAnchor: Vec2;
  backLegRightAnchor: Vec2;

  /** Neck anchor in body space, head anchor in neck space. */
  neckAnchor: Vec2;
  neckLength: number;
  neckWidth: number;
  headAnchor: Vec2;

  /** Head, in head space (centred on the head origin). */
  headWidth: number;
  headHeight: number;
  muzzleWidth: number;
  muzzleHeight: number;

  /** Ear anchors, in head space. */
  earWidth: number;
  earHeight: number;
  earLeftAnchor: Vec2;
  earRightAnchor: Vec2;

  /** Face anchors, in head space. */
  eyeWidth: number;
  eyeHeight: number;
  eyeLeftAnchor: Vec2;
  eyeRightAnchor: Vec2;
  mouthAnchor: Vec2;

  /** Tail anchor in body space. */
  tailAnchor: Vec2;
  tailLength: number;
  tailThickness: number;
  tailSegments: number;

  /** Overall silhouette, useful for framing and shadows. */
  totalHeight: number;
  shadowWidth: number;
}

export function computeProportions(appearance: PetAppearance): PetProportions {
  const body = getBodyShape(appearance.bodyType);
  const head = getHeadShape(appearance.headType);
  const ear = getEarShape(appearance.earType);
  const eye = getEyeShape(appearance.eyeType);
  const tail = getTailShape(appearance.tailType);

  const bodyWidth = BASE.bodyWidth * appearance.bodyScale * body.widthMul;
  const bodyHeight = BASE.bodyHeight * appearance.bodyScale * body.heightMul;

  const legClearance = BASE.legLength * appearance.legLength;
  const legWidth = BASE.legWidth * appearance.legWidth;

  // The body floats exactly one leg-clearance above the floor.
  const bodyCenterY = -(legClearance + bodyHeight / 2);
  const bodyCenter: Vec2 = { x: 0, y: bodyCenterY };

  // Hips sit inside the lower body so legs emerge from the form, not below it.
  const hipY = bodyHeight * 0.22;
  const legDrawLength = -(bodyCenterY + hipY);

  const headWidth = BASE.headWidth * appearance.headScale * head.widthMul;
  const headHeight = BASE.headHeight * appearance.headScale * head.heightMul;

  const neckLength = 14 * appearance.bodyScale;
  const neckWidth = headWidth * 0.42;

  const earWidth = BASE.earWidth * appearance.earScale * ear.widthMul;
  const earHeight = BASE.earHeight * appearance.earScale * ear.heightMul;

  const eyeWidth = BASE.eyeWidth * appearance.eyeScale * eye.widthMul;
  const eyeHeight = BASE.eyeHeight * appearance.eyeScale * eye.heightMul;

  const tailLength = BASE.tailLength * appearance.tailScale * tail.lengthMul;
  const tailThickness = BASE.tailThickness * appearance.tailScale * tail.thicknessMul;

  const headAnchor: Vec2 = {
    x: headWidth * 0.12,
    y: -(neckLength + headHeight * 0.46),
  };

  const neckAnchor: Vec2 = {
    x: bodyWidth * 0.3,
    y: -bodyHeight * (0.3 + body.backArch * 0.3),
  };

  const totalHeight =
    -(bodyCenterY + neckAnchor.y + headAnchor.y - headHeight / 2 - earHeight * 0.6);

  return {
    bodyWidth,
    bodyHeight,
    bodyCenter,

    legWidth,
    legClearance,
    legDrawLength,
    // The far pair is fractionally shorter, which reads as depth.
    legDrawLengthFar: legDrawLength * 0.97,
    pawWidth: legWidth * 1.24,
    pawHeight: legWidth * 0.72,

    // Near legs (+x side of the pair) are drawn in front of the body.
    frontLegRightAnchor: { x: bodyWidth * 0.28, y: hipY },
    frontLegLeftAnchor: { x: bodyWidth * 0.19, y: hipY - bodyHeight * 0.02 },
    backLegRightAnchor: { x: -bodyWidth * 0.27, y: hipY },
    backLegLeftAnchor: { x: -bodyWidth * 0.35, y: hipY - bodyHeight * 0.02 },

    neckAnchor,
    neckLength,
    neckWidth,
    headAnchor,

    headWidth,
    headHeight,
    muzzleWidth: headWidth * 0.42 * head.muzzle,
    muzzleHeight: headHeight * 0.26 * head.muzzle,

    earWidth,
    earHeight,
    earLeftAnchor: { x: -headWidth * 0.29, y: -headHeight * 0.33 },
    // Slight asymmetry — designed imperfection (theme doc section 14).
    earRightAnchor: { x: headWidth * 0.26, y: -headHeight * 0.37 },

    eyeWidth,
    eyeHeight,
    eyeLeftAnchor: { x: -headWidth * 0.21, y: headHeight * 0.02 },
    eyeRightAnchor: { x: headWidth * 0.22, y: headHeight * 0.03 },
    mouthAnchor: { x: headWidth * 0.02, y: headHeight * 0.26 },

    tailAnchor: { x: -bodyWidth * 0.44, y: -bodyHeight * 0.1 },
    tailLength,
    tailThickness,
    tailSegments: tail.segments,

    totalHeight,
    shadowWidth: bodyWidth * 1.02,
  };
}
