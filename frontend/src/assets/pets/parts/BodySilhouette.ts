/**
 * BodySilhouette — the one outline the whole creature is built around.
 *
 * Everything else defers to this shape: the face is clipped to it, the ears
 * grow out of its crown, the feet bury themselves in its floor line, and the
 * shading layers are cut to it. So it lives on its own, with no colour and no
 * decoration, and every part that needs to know where the edge is asks here.
 *
 * The shape itself is data — a half-width profile on the body type
 * (../customization/BodyTypes). This file only turns that profile into pixels.
 */

import type { Graphics } from 'pixi.js';
import { drawSmoothClosed, profileOutline, profileWidthAt } from '../../shared/geometry';
import type { Vec2 } from '../../shared/geometry';
import { getBodyShape } from '../customization/BodyTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

/**
 * The asymmetry phase for a creature.
 *
 * Derived from the seed so a creature's lopsidedness is part of its identity
 * and never changes between renders.
 */
function asymmetryPhase(seed: number): number {
  return (seed % 997) * 0.0063;
}

/** The body outline as points, in body-local space, centred on the origin. */
export function bodyOutline(
  proportions: PetProportions,
  appearance: PetAppearance,
): Vec2[] {
  const shape = getBodyShape(appearance.bodyType);

  return profileOutline(shape.profile, {
    rx: proportions.bodyWidth / 2,
    ry: proportions.bodyHeight / 2,
    asymmetry: shape.asymmetry * proportions.bodyAsymmetry,
    phase: asymmetryPhase(appearance.seed),
  });
}

/**
 * Draw the body silhouette into a Graphics, unfilled.
 *
 * Callers fill or stroke it themselves — the same path is used as artwork, as
 * a mask for the face, and as a mask for the shading layers.
 */
export function drawPetSilhouette(
  g: Graphics,
  proportions: PetProportions,
  appearance: PetAppearance,
): Graphics {
  const shape = getBodyShape(appearance.bodyType);
  return drawSmoothClosed(g, bodyOutline(proportions, appearance), shape.tension);
}

/**
 * Half-width of the body at a height, in pixels.
 *
 * `t` runs 0 at the crown to 1 at the floor. Parts use this to stay attached:
 * ears sit where the crown actually is, feet plant inside the actual bottom
 * edge, and neither has to guess from the bounding box.
 */
export function bodyHalfWidthAt(
  proportions: PetProportions,
  appearance: PetAppearance,
  t: number,
): number {
  const shape = getBodyShape(appearance.bodyType);
  return profileWidthAt(shape.profile, t) * (proportions.bodyWidth / 2);
}

/**
 * Where the body's surface is at a height, as a y in body-local space.
 *
 * The inverse of the above, and the reason the topper and ear anchors follow a
 * pear's sloping shoulders instead of floating above them.
 */
export function bodyYAt(proportions: PetProportions, t: number): number {
  return -proportions.bodyHeight / 2 + t * proportions.bodyHeight;
}

/**
 * The y of the *lower* silhouette edge directly above a horizontal position.
 *
 * Feet use this to bury themselves the right amount whatever the body shape is:
 * on a bell the edge at the stance line is almost at the floor, on an egg it is
 * well above it, and a fixed offset would leave a gap on one and swallow the
 * foot on the other.
 */
export function bodyLowerEdgeAt(
  proportions: PetProportions,
  appearance: PetAppearance,
  x: number,
): number {
  const shape = getBodyShape(appearance.bodyType);
  const rx = proportions.bodyWidth / 2;
  const target = Math.abs(x) / (rx || 1);
  const profile = shape.profile;

  // Walk up from the floor until the body is wide enough to cover this x.
  for (let i = profile.length - 1; i > 0; i--) {
    const [t1, w1] = profile[i];
    const [t0, w0] = profile[i - 1];

    if (w1 >= target) return bodyYAt(proportions, t1);

    if (w0 >= target && w0 !== w1) {
      const local = (target - w1) / (w0 - w1);
      return bodyYAt(proportions, t1 + (t0 - t1) * local);
    }
  }

  // The body is never that wide — the widest point is the best we can do.
  let widest = 0;
  let widestT = 0.5;
  for (const [t, w] of profile) {
    if (w > widest) {
      widest = w;
      widestT = t;
    }
  }

  return bodyYAt(proportions, widestT);
}
