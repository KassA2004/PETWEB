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
import { FLOOR_SQUASH } from '../../assets/objects/shared/Surface';
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
  // Ground decals — a spill, a patch of a different floor, anything with no
  // height at all — are the floor as far as the eye is concerned and belong
  // under everything. A general rule about the *shape*, not about any one
  // object: nothing in the catalog currently has a zero-height collider (the
  // rug was the one that did), and the branch stays for whatever next does.
  if (body.collider.height <= 0) return -8000 + body.position.z;

  // Wall-mounted decor is part of the wall. It kept a floor-plane collider so
  // that the wall grid could reuse the floor's columns, and sorting it by that
  // collider made it compete for depth with whatever stood on the cell beneath
  // it — which is how a plant on the clock's column could be drawn on the
  // wrong side of the clock. It is background; it sorts as background.
  if (body.anchored) return -4000 + body.position.z;

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

/**
 * The rectangle a body's artwork occupies on screen.
 *
 * Two extents, unioned, because an object is drawn in two planes. Upright form
 * runs from the contact point to the crown, and for almost everything that is
 * the whole picture. But every object also covers some *floor* — at minimum a
 * contact shadow, and for a few things rather more than that — and the camera
 * squashes that footprint to `FLOOR_SQUASH` of its depth either side of the
 * contact point.
 *
 * For anything standing up the skirt is hidden under the form and costs
 * nothing. For something lying flat it is the entire object: a rug is two
 * cells of floor and five units of elevation, so measured as a form alone its
 * rectangle is the eight-pixel minimum through its middle — a target nobody
 * can hit, which is precisely why the rug could not be picked up.
 *
 * The extra reach only ever goes toward the viewer, over floor that belongs to
 * things `pickAt` has already asked (it works front to back), so a bigger
 * rectangle here cannot steal a click from anything standing in front.
 */
export function screenRectOf(body: PhysicsBody, headroom = 1): ScreenRect {
  const scale = scaleAt(body.position.z);
  const base = project(body.position.x, body.position.y, body.position.z);
  const crown = project(body.position.x, topOf(body) * headroom, body.position.z);
  const width = halfX(body.collider) * 2 * scale;

  const skirt = halfZ(body.collider) * FLOOR_SQUASH * scale;
  const top = Math.min(crown.y, base.y - skirt);
  const bottom = base.y + skirt;

  return {
    x: base.x - width / 2,
    y: top,
    width,
    height: Math.max(8, bottom - top),
  };
}

/** Whether two screen rectangles cover any of the same pixels. */
export function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * How far outside its own artwork a body can still be picked up, in pixels.
 *
 * Small, because with everything in the room competing for the same click a
 * generous target is a target that steals. `PetRoom`'s `TOY_REACH` is the one
 * exception the room makes, for a toy nobody is trying to arrange — see
 * `pickAt` and §7c of `Docs/room-and-objects.md`.
 */
export const PICK_PAD = 6;

/**
 * The topmost body under a screen point, or null.
 *
 * Searched from the front of the room backwards, so clicking where two things
 * overlap picks up the one you can actually see. Generous by a few pixels in
 * every direction: these are finger-sized targets on a small canvas.
 *
 * @param padOf how far past its artwork each body may be grabbed from. A
 *   function rather than a number because the answer is not the same for every
 *   body: a wedged toy wants a forgiving target and a piece of furniture being
 *   positioned to the pixel wants none. Defaults to `PICK_PAD` for everything,
 *   which is the behaviour edit mode keeps.
 */
export function pickAt(
  bodies: PhysicsBody[],
  screenX: number,
  screenY: number,
  accepts: (body: PhysicsBody) => boolean,
  padOf: (body: PhysicsBody) => number = () => PICK_PAD,
): PhysicsBody | null {
  const candidates = bodies
    .filter(accepts)
    .sort((a, b) => sortKeyOf(b, null) - sortKeyOf(a, null));

  for (const body of candidates) {
    // The artwork usually reaches a little above the collider — ears, a lamp
    // shade, the back of a chair — so the target is padded upward.
    const rect = screenRectOf(body, 1.18);
    const pad = padOf(body);

    /*
     * Extra reach goes sideways and toward the viewer, never up.
     *
     * Above a thing standing on the floor is somebody else's business: the
     * wall. A toy at the back of the room sits just under the bottom row of the
     * wall grid on screen, and thirty units of halo over it would quietly start
     * intercepting clicks meant for the painting hanging there — which is
     * `pickWallDecorAt`'s, and is asked only after this says no. The default
     * `PICK_PAD` is unaffected: with no `padOf` the two are the same number.
     */
    const top = Math.min(pad, PICK_PAD);

    if (
      screenX >= rect.x - pad &&
      screenX <= rect.x + rect.width + pad &&
      screenY >= rect.y - top &&
      screenY <= rect.y + rect.height + pad
    ) {
      return body;
    }
  }

  return null;
}
