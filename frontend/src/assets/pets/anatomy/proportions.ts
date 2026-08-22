/**
 * Proportions — the single source of truth for every measurement on a creature.
 *
 * Parts and the rig both read from here, which is what guarantees that changing
 * `bodyWidth` moves the ear anchors, the wing shoulders and the tail base
 * together instead of pulling the creature apart.
 *
 * Coordinate system:
 *   The pet root sits on the floor. -y is up, and the creature faces the
 *   viewer. So the body centre has a negative y, and the feet land on y = 0.
 */

import { clamp, lerp } from '../../shared/shapes';
import type { Vec2 } from '../../shared/shapes';
import { getEarShape, getTailShape, getWingShape } from '../customization/AppendageTypes';
import { getBodyShape, getFootShape } from '../customization/BodyTypes';
import { getBrowShape, getEyeShape, getSnoutShape } from '../customization/FaceTypes';
import { getTopperShape } from '../customization/TopperTypes';
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

export interface PetProportions {
  /** The mass. */
  bodyWidth: number;
  bodyHeight: number;
  bodyCenter: Vec2;
  bodyRoundness: number;
  bodyTopTaper: number;
  bodyBottomBias: number;
  bodyWobble: number;

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

  const scale = appearance.bodyScale;

  const bodyWidth = BASE.bodyWidth * scale * body.widthMul * appearance.bodyWidth;
  const bodyHeight = BASE.bodyHeight * scale * body.heightMul * appearance.bodyHeight;

  const footWidth = BASE.footWidth * scale * foot.widthMul * appearance.footScale;
  const footHeight = BASE.footHeight * scale * foot.heightMul * appearance.footScale;

  // The creature rests on its feet, which barely peek out from under the mass.
  const groundClearance = footHeight * 0.34;
  const bodyCenter: Vec2 = { x: 0, y: -(bodyHeight / 2 + groundClearance) };

  // --- Face ----------------------------------------------------------------
  const eyeWidth = BASE.eyeSize * scale * appearance.eyeScale * eye.widthMul;
  const eyeHeight = BASE.eyeSize * scale * appearance.eyeScale * eye.heightMul;
  const eyeGap = bodyWidth * appearance.eyeSpacing;

  // eyeHeight 0 puts the eyes high on the forehead, 1 puts them low. Low, big
  // and wide-set is the whole recipe for "baby"; high, small and close is not.
  const faceY = lerp(-bodyHeight * 0.26, bodyHeight * 0.1, appearance.eyeHeight);
  const faceAnchor: Vec2 = { x: 0, y: faceY };

  const snoutWidth = BASE.snoutSize * scale * appearance.snoutScale * snout.widthMul;
  const snoutHeight = BASE.snoutSize * scale * appearance.snoutScale * snout.heightMul;
  const hasSnout = snoutWidth > 0 && snoutHeight > 0;

  // The mouth sits below the eyes, and below the snout when there is one.
  const snoutY = eyeHeight * 0.5 + bodyHeight * 0.075;
  const mouthY = hasSnout
    ? snoutY + snoutHeight * (snout.muzzle > 0 ? 0.42 : 0.66)
    : eyeHeight * 0.5 + bodyHeight * 0.13;

  const browWidth = BASE.browWidth * scale * appearance.browScale * brow.widthMul;
  const browY = -eyeHeight * 0.72 - browWidth * 0.16;

  // --- Ears ----------------------------------------------------------------
  const earWidth = BASE.earSize * scale * appearance.earScale * ear.widthMul;
  const earHeight = BASE.earSize * scale * appearance.earScale * ear.heightMul;
  const earX = bodyWidth * appearance.earSpread;
  // Ears set wider sit lower, following the curve of the head.
  const earY = -bodyHeight * (0.47 - appearance.earSpread * 0.3);

  // --- Wings ---------------------------------------------------------------
  const wingWidth = BASE.wingSize * scale * appearance.wingScale * wing.widthMul;
  const wingHeight = BASE.wingSize * scale * appearance.wingScale * wing.heightMul;

  // --- Tail ----------------------------------------------------------------
  const tailWidth = BASE.tailSize * scale * appearance.tailScale * tail.widthMul;
  const tailHeight = BASE.tailSize * scale * appearance.tailScale * tail.heightMul;

  const topperWidth = BASE.topperSize * scale * appearance.topperScale * topper.widthMul;
  const topperHeight = BASE.topperSize * scale * appearance.topperScale * topper.heightMul;

  return {
    bodyWidth,
    bodyHeight,
    bodyCenter,
    bodyRoundness: body.roundness,
    bodyTopTaper: body.topTaper,
    bodyBottomBias: body.bottomBias,
    bodyWobble: body.wobble,

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
    eyeRightAnchor: { x: eyeGap, y: -eyeHeight * 0.02 },

    browWidth,
    browLeftAnchor: { x: -eyeGap, y: browY },
    browRightAnchor: { x: eyeGap, y: browY },

    mouthAnchor: { x: 0, y: mouthY },
    mouthWidth: BASE.mouthWidth * scale * appearance.mouthWidth,
    mouthWeight: Math.max(2, BASE.mouthWidth * 0.075 * scale * appearance.mouthWeight),

    snoutAnchor: { x: 0, y: snoutY },
    snoutWidth,
    snoutHeight,

    cheekRadius: clamp(eyeWidth * 0.62, bodyWidth * 0.05, bodyWidth * 0.16),
    cheekLeftAnchor: { x: -eyeGap - eyeWidth * 1.1, y: eyeHeight * 0.75 },
    cheekRightAnchor: { x: eyeGap + eyeWidth * 1.1, y: eyeHeight * 0.75 },

    earWidth,
    earHeight,
    earLeftAnchor: { x: -earX, y: earY },
    earRightAnchor: { x: earX, y: earY },
    earRestTilt: ear.tilt + appearance.earTilt,
    earBehind: ear.behind,

    wingWidth,
    wingHeight,
    wingLeftAnchor: { x: -bodyWidth * 0.4, y: -bodyHeight * 0.12 },
    wingRightAnchor: { x: bodyWidth * 0.4, y: -bodyHeight * 0.12 },
    wingRestTilt: wing.tilt,

    tailWidth,
    tailHeight,
    tailAnchor: { x: -bodyWidth * 0.44, y: bodyHeight * 0.2 },

    topperWidth,
    topperHeight,
    topperAnchor: { x: bodyWidth * 0.03, y: -bodyHeight * 0.46 },

    // Hats sit slightly inside the crown, so they read as worn rather than
    // balanced on top.
    headAccessoryAnchor: { x: 0, y: -bodyHeight * 0.42 },
    headAccessoryWidth: bodyWidth * 0.66,
    faceAccessoryAnchor: { x: 0, y: 0 },
    faceAccessoryWidth: (eyeGap * 2 + eyeWidth * 2) * 1.1,
    neckAccessoryAnchor: { x: 0, y: bodyHeight * 0.34 },
    neckAccessoryWidth: bodyWidth * 0.52,

    totalHeight:
      groundClearance +
      bodyHeight +
      Math.max(earHeight * 0.8, topperHeight * 0.8, 0),
    shadowWidth: bodyWidth * 1.02,
  };
}
