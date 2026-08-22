/**
 * Where a body appears, how big, in what order, and whether you just clicked
 * it.
 *
 * Everything here is the projection applied to a physics body. It is kept out
 * of both the physics (which must never know about screens) and the scene
 * (which is long enough already), and it is the only place that decides how a
 * three-dimensional room turns into a stack of two-dimensional pictures.
 */

import { halfX, halfZ, topOf } from '../../simulation/physics';
import type { PhysicsBody } from '../../simulation/physics';
import { farness, project, scaleAt } from '../../world/Projection';
import { PALETTE, mix } from '../../assets/shared/color';

/** A body's footprint on screen, as a rectangle around its artwork. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draw order.
 *
 * The near edge of the footprint, not the centre — two objects at the same
 * depth but different sizes should sort by which one sticks out further
 * toward the viewer, which is what the eye is actually reading.
 *
 * Standing on something is the exception, and it has to be: a ball on a table
 * shares the table's depth, so sorting on depth alone puts it behind the
 * tabletop it is visibly on top of. Riders sort against their holder, in front
 * of it normally and behind it for a container, which is the whole difference
 * between sitting on a basket and sitting in one.
 */
export function sortKeyOf(body: PhysicsBody, holder: PhysicsBody | null): number {
  // Ground decals — rugs, spills, anything with no height at all — are the
  // floor as far as the eye is concerned and belong under everything.
  if (body.collider.height <= 0) return -8000 + body.position.z;

  if (holder && holder.collider.height > 0) {
    const base = holder.position.z + halfZ(holder.collider);
    return base + (holder.surface?.kind === 'container' ? -0.5 : 0.5);
  }

  return body.position.z + halfZ(body.collider);
}

/**
 * Aerial perspective.
 *
 * Contrast falls off with distance, and in a room this small that is the cue
 * that keeps the back wall feeling like a back wall even where nothing
 * overlaps. Applied as a tint rather than an overlay so it costs nothing.
 */
export function depthTintOf(z: number): number {
  return mix(0xffffff, mix(PALETTE.sand, PALETTE.grape, 0.35), farness(z) * 0.3);
}

/** The rectangle a body's artwork occupies on screen. */
export function screenRectOf(body: PhysicsBody, headroom = 1): ScreenRect {
  const scale = scaleAt(body.position.z);
  const base = project(body.position.x, body.position.y, body.position.z);
  const crown = project(body.position.x, topOf(body) * headroom, body.position.z);
  const width = halfX(body.collider) * 2 * scale;

  return {
    x: base.x - width / 2,
    y: crown.y,
    width,
    height: Math.max(8, base.y - crown.y),
  };
}

/**
 * The topmost body under a screen point, or null.
 *
 * Searched from the front of the room backwards, so clicking where two things
 * overlap picks up the one you can actually see. Generous by a few pixels in
 * every direction: these are finger-sized targets on a small canvas.
 */
export function pickAt(
  bodies: PhysicsBody[],
  screenX: number,
  screenY: number,
  accepts: (body: PhysicsBody) => boolean,
): PhysicsBody | null {
  const candidates = bodies
    .filter(accepts)
    .sort((a, b) => sortKeyOf(b, null) - sortKeyOf(a, null));

  for (const body of candidates) {
    // The artwork usually reaches a little above the collider — ears, a lamp
    // shade, the back of a chair — so the target is padded upward.
    const rect = screenRectOf(body, 1.18);
    const pad = 6;

    if (
      screenX >= rect.x - pad &&
      screenX <= rect.x + rect.width + pad &&
      screenY >= rect.y - pad &&
      screenY <= rect.y + rect.height + pad
    ) {
      return body;
    }
  }

  return null;
}
