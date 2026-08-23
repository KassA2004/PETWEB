/**
 * Proportions — the single source of truth for every measurement on a creature.
 *
 * Parts and the rig both read from here, which is what guarantees that changing
 * `bodyWidth` moves the ear anchors, the wing shoulders and the tail base
 * together instead of pulling the creature apart.
 *
 * This is also where **dependent constraints** are applied. The appearance keeps
 * whatever the user chose; this layer decides what that means in pixels on
 * *this* body — eyes that cannot overlap, ears that cannot leave the crown, feet
 * that cannot detach into two objects on either side. Doing it here rather than
 * in the appearance is deliberate: a slider that snaps back while you drag it
 * feels broken, and a creature that falls apart at the end stops is worse
 * (../customization/PetConstraints).
 *
 * Coordinate system:
 *   The pet root sits on the floor. -y is up, and the creature faces the
 *   viewer. So the body centre has a negative y, and the feet land on y = 0.
 */

import { clamp, lerp } from '../../shared/shapes';
import type { Vec2 } from '../../shared/shapes';
import { profileWidthAt } from '../../shared/geometry';
import { getTailShape, getWingShape } from '../customization/AppendageTypes';
import { getBodyShape } from '../customization/BodyTypes';
import { getEarShape } from '../customization/EarTypes';
import { getFootShape } from '../customization/FootTypes';
import { getBrowShape } from '../customization/BrowTypes';
import { getCheekShape } from '../customization/CheekTypes';
import { getEyeShape } from '../customization/EyeTypes';
import { getMouthShape } from '../customization/MouthTypes';
import { getSnoutShape } from '../customization/SnoutTypes';
import { getTopperShape } from '../customization/TopperTypes';
import {
  constrainBodyAspect,
  constrainEarOffset,
  constrainEyeGap,
  constrainFootWidth,
  constrainMouthWidth,
  constrainSnout,
  constrainWing,
} from '../customization/PetConstraints';
import type { PetAppearance } from '../customization/PetAppearance';

/** Base measurements in pixels, before any appearance scaling. */
const BASE = {
  bodyWidth: 210,
  bodyHeight: 196,
  footWidth: 54,
  footHeight: 26,
  eyeSize: 34,
  browWidth: 46,
  mouthWidth: 58,
  snoutSize: 50,
  earSize: 62,
  wingSize: 118,
  tailSize: 76,
  topperSize: 92,
} as const;

/** Where on the body each part attaches, as a fraction from crown to floor. */
const CROWN_T = 0.12;
const ANKLE_T = 0.86;

export interface PetProportions {
  /** The mass. */
  bodyWidth: number;
  bodyHeight: number;
  bodyCenter: Vec2;
  /** How much left/right variation the silhouette may take, 0..1. */
  bodyAsymmetry: number;

  /** Feet, fused into the body silhouette. */
  footWidth: number;
  footHeight: number;
  groundClearance: number;

  /** Face group, in body space. */
  faceAnchor: Vec2;
  faceWidth: number;
  faceHeight: number;

  /** Eyes, in face space. */
  eyeWidth: number;
  eyeHeight: number;
  eyeLeftAnchor: Vec2;
  eyeRightAnchor: Vec2;
  /** Extra rotation on the eye joints, radians, outward positive. */
  eyeTilt: number;
  /** Multiplier on the eye preset's pupil size. */
  pupilScale: number;

  /** Brows, in face space. */
  browWidth: number;
  browLeftAnchor: Vec2;
  browRightAnchor: Vec2;

  /** Mouth, in face space. Width and weight are cosmetics the user picks. */
  mouthAnchor: Vec2;
  mouthWidth: number;
  mouthWeight: number;

  /** Snout, in face space. */
  snoutAnchor: Vec2;
  snoutWidth: number;
  snoutHeight: number;

  /** Cheeks, in face space. */
  cheekRadius: number;
  cheekLeftAnchor: Vec2;
  cheekRightAnchor: Vec2;

  /** Ears, in body space. */
  earWidth: number;
  earHeight: number;
  earLeftAnchor: Vec2;
  earRightAnchor: Vec2;
  /** Outward lean at rest, radians, positive = outward. */
  earRestTilt: number;
  earBehind: boolean;

  /** Wings, in body space. */
  wingWidth: number;
  wingHeight: number;
  wingLeftAnchor: Vec2;
  wingRightAnchor: Vec2;
  wingRestTilt: number;

  /** Tail, in body space. */
  tailWidth: number;
  tailHeight: number;
  tailAnchor: Vec2;

  /** Topper, in body space. */
  topperWidth: number;
  topperHeight: number;
  topperAnchor: Vec2;

  /** Accessory slots. Face is in FACE space; the others are in body space. */
  headAccessoryAnchor: Vec2;
  headAccessoryWidth: number;
  faceAccessoryAnchor: Vec2;
  faceAccessoryWidth: number;
  neckAccessoryAnchor: Vec2;
  neckAccessoryWidth: number;

  /** Overall silhouette, for framing, shadows and physics. */
  totalHeight: number;
  shadowWidth: number;
}

export function computeProportions(appearance: PetAppearance): PetProportions {
  const body = getBodyShape(appearance.bodyType);
  const foot = getFootShape(appearance.footType);
  const ear = getEarShape(appearance.earType);
  const wing = getWingShape(appearance.wingType);
  const tail = getTailShape(appearance.tailType);
  const topper = getTopperShape(appearance.topperType);
  const eye = getEyeShape(appearance.eyeType);
  const brow = getBrowShape(appearance.browType);
  const snout = getSnoutShape(appearance.snoutType);
  const mouth = getMouthShape(appearance.mouthType);
  const cheek = getCheekShape(appearance.cheekType);

  const scale = appearance.bodyScale;

  // --- The mass -------------------------------------------------------------
  const aspect = constrainBodyAspect(
    BASE.bodyWidth * scale * body.widthMul * appearance.bodyWidth,
    BASE.bodyHeight * scale * body.heightMul * appearance.bodyHeight,
  );
  const bodyWidth = aspect.width;
  const bodyHeight = aspect.height;
  const halfWidth = bodyWidth / 2;

  // How wide the body actually is where things attach to it.
  const crownHalfWidth = profileWidthAt(body.profile, CROWN_T) * halfWidth;
  const ankleHalfWidth = profileWidthAt(body.profile, ANKLE_T) * halfWidth;

  // --- Feet -----------------------------------------------------------------
  const footWidth = constrainFootWidth(
    BASE.footWidth * scale * foot.widthMul * appearance.footScale,
    foot.count,
    bodyWidth,
  );
  const footHeight = BASE.footHeight * scale * foot.heightMul * appearance.footScale;

  // The creature rests on its feet, which peek out from under the mass by
  // exactly the part of them the body does not swallow.
  const groundClearance = footHeight * (1 - foot.sink) * 0.9;
  const bodyCenter: Vec2 = { x: 0, y: -(bodyHeight / 2 + groundClearance) };

  // --- Face -----------------------------------------------------------------
  const eyeWidth = BASE.eyeSize * scale * appearance.eyeScale * eye.widthMul;
  const eyeHeight = BASE.eyeSize * scale * appearance.eyeScale * eye.heightMul;

  // eyeHeight 0 puts the eyes high on the forehead, 1 puts them low. Low, big
  // and wide-set is the whole recipe for "baby"; high, small and close is not.
  const faceY = lerp(-bodyHeight * 0.28, bodyHeight * 0.12, appearance.eyeHeight);
  const faceAnchor: Vec2 = { x: 0, y: faceY };

  // How wide the creature is *where the face actually sits*, not at its widest.
  // A pear is narrow up top and an egg is narrow down low; measuring at the
  // bounding box would let the eyes drift off either one.
  const faceHalfWidth =
    profileWidthAt(body.profile, clamp(0.5 + faceY / bodyHeight, 0, 1)) * halfWidth;

  const eyeGap = constrainEyeGap(
    bodyWidth * appearance.eyeSpacing,
    eyeWidth,
    faceHalfWidth,
  );

  const snoutSize = constrainSnout(
    BASE.snoutSize * scale * appearance.snoutScale * snout.widthMul,
    BASE.snoutSize * scale * appearance.snoutScale * snout.heightMul,
    halfWidth,
  );
  const snoutWidth = snoutSize.width;
  const snoutHeight = snoutSize.height;
  const hasSnout = snoutWidth > 0 && snoutHeight > 0;

  // The mouth sits below the eyes, and below the snout when there is one.
  const snoutY = eyeHeight * 0.5 + bodyHeight * 0.075;
  const mouthY = hasSnout
    ? snoutY + snoutHeight * (snout.muzzle > 0 ? 0.42 : 0.66)
    : eyeHeight * 0.5 + bodyHeight * 0.13;

  const browWidth = BASE.browWidth * scale * appearance.browScale * brow.widthMul;
  const browY = -eyeHeight * 0.7 - browWidth * 0.18;

  // --- Ears -----------------------------------------------------------------
  const earWidth = BASE.earSize * scale * appearance.earScale * ear.widthMul;
  const earHeight = BASE.earSize * scale * appearance.earScale * ear.heightMul;
  const earX = constrainEarOffset(
    bodyWidth * appearance.earSpread,
    crownHalfWidth,
    earWidth,
  );
  // Ears set wider sit lower, following the curve of the head.
  const earSpreadRatio = crownHalfWidth > 0 ? earX / crownHalfWidth : 0;
  const earY = -bodyHeight * (0.46 - earSpreadRatio * 0.14);

  // --- Wings, tail, topper --------------------------------------------------
  const wingSize = constrainWing(
    BASE.wingSize * scale * appearance.wingScale * wing.widthMul,
    BASE.wingSize * scale * appearance.wingScale * wing.heightMul,
    bodyWidth,
    bodyHeight,
  );
  const wingWidth = wingSize.width;
  const wingHeight = wingSize.height;

  const tailWidth = BASE.tailSize * scale * appearance.tailScale * tail.widthMul;
  const tailHeight = BASE.tailSize * scale * appearance.tailScale * tail.heightMul;

  const topperWidth = BASE.topperSize * scale * appearance.topperScale * topper.widthMul;
  const topperHeight = BASE.topperSize * scale * appearance.topperScale * topper.heightMul;

  // --- Cheeks ---------------------------------------------------------------
  const cheekRadius = clamp(
    eyeWidth * cheek.scale,
    bodyWidth * 0.04,
    bodyWidth * 0.2,
  );
  // Just outside and just below the eyes: a blush that overlaps the eye reads
  // as a rash rather than as a cheek.
  // A blush half cut off by the silhouette reads as a bruise, so the whole
  // shape has to fit inside the face rather than merely start inside it.
  const cheekX = clamp(
    eyeGap + eyeWidth * 0.6 + cheekRadius * 0.5,
    eyeGap * 0.4,
    Math.max(eyeGap * 0.4, faceHalfWidth * 0.94 - cheekRadius),
  );

  return {
    bodyWidth,
    bodyHeight,
    bodyCenter,
    bodyAsymmetry: appearance.asymmetry,

    footWidth,
    footHeight,
    groundClearance,

    faceAnchor,
    faceWidth: eyeGap * 2 + eyeWidth * 2,
    faceHeight: eyeHeight * 2 + Math.max(snoutHeight, bodyHeight * 0.2),

    eyeWidth,
    eyeHeight,
    eyeLeftAnchor: { x: -eyeGap, y: 0 },
    // A hair of asymmetry — designed imperfection (theme doc §14).
    eyeRightAnchor: { x: eyeGap, y: -eyeHeight * 0.02 * appearance.asymmetry },
    eyeTilt: appearance.eyeTilt,
    pupilScale: appearance.pupilScale,

    browWidth,
    browLeftAnchor: { x: -eyeGap, y: browY },
    browRightAnchor: { x: eyeGap, y: browY },

    mouthAnchor: { x: 0, y: mouthY },
    mouthWidth: constrainMouthWidth(
      BASE.mouthWidth * scale * appearance.mouthWidth * mouth.widthMul,
      halfWidth,
    ) / mouth.widthMul,
    mouthWeight: Math.max(2, BASE.mouthWidth * 0.075 * scale * appearance.mouthWeight),

    snoutAnchor: { x: 0, y: snoutY },
    snoutWidth,
    snoutHeight,

    cheekRadius,
    cheekLeftAnchor: { x: -cheekX, y: eyeHeight * 0.62 + cheekRadius * 0.35 },
    cheekRightAnchor: { x: cheekX, y: eyeHeight * 0.62 + cheekRadius * 0.35 },

    earWidth,
    earHeight,
    earLeftAnchor: { x: -earX, y: earY },
    earRightAnchor: { x: earX, y: earY },
    earRestTilt: ear.tilt + appearance.earTilt,
    earBehind: ear.behind,

    wingWidth,
    wingHeight,
    wingLeftAnchor: { x: -halfWidth * 0.8, y: -bodyHeight * 0.12 },
    wingRightAnchor: { x: halfWidth * 0.8, y: -bodyHeight * 0.12 },
    wingRestTilt: wing.tilt,

    tailWidth,
    tailHeight,
    tailAnchor: { x: -halfWidth * 0.88, y: bodyHeight * 0.2 },

    topperWidth,
    topperHeight,
    topperAnchor: { x: bodyWidth * 0.03, y: -bodyHeight * 0.46 },

    // Hats sit slightly inside the crown, so they read as worn rather than
    // balanced on top.
    headAccessoryAnchor: { x: 0, y: -bodyHeight * 0.42 },
    headAccessoryWidth: Math.max(crownHalfWidth * 1.6, bodyWidth * 0.5),
    faceAccessoryAnchor: { x: 0, y: 0 },
    faceAccessoryWidth: (eyeGap * 2 + eyeWidth * 2) * 1.1,
    neckAccessoryAnchor: { x: 0, y: bodyHeight * 0.34 },
    neckAccessoryWidth: ankleHalfWidth * 1.15,

    totalHeight:
      groundClearance +
      bodyHeight +
      Math.max(earHeight * 0.8, topperHeight * 0.8, 0),
    shadowWidth: bodyWidth * 1.02,
  };
}
