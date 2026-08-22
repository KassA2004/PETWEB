/**
 * The camera: how the room's three dimensions become two.
 *
 * The room used to be a flat elevation, and depth was a lie told twice — once
 * to the renderer as a draw order and once to the solver as a distance gate.
 * Neither lie held. A thing at the back was drawn the same size as a thing at
 * the front, so the only evidence of depth was which one covered the other,
 * and the user could not tell where anything was until it overlapped something.
 *
 * So the room is now a box, seen in honest one-point perspective:
 *
 *        ┌────────────────────────────┐   ← frame
 *        │ ╲      back wall        ╱  │
 *        │  ╲____________________╱    │   ← the wall/floor crease
 *        │  ╱                    ╲    │
 *        │ ╱        floor         ╲   │
 *        └────────────────────────────┘
 *
 * Left and right walls converge toward a vanishing point, the floor widens
 * toward the viewer, and — the part that actually does the work — everything
 * is drawn smaller the further back it stands. Size *is* the depth cue. Draw
 * order stops being a trick and becomes a consequence.
 *
 * The maths
 * ---------
 * A pinhole camera on the room's centre line, with the projection plane
 * parallel to the back wall:
 *
 *   s(z) = CAMERA / (CAMERA + DEPTH - z)      how big things are at depth z
 *   sx   = VP_X + (x - VP_X) * s
 *   sy   = HORIZON + (EYE - y) * s
 *
 * `s` is 1 at the very front of the room and `BACK_SCALE` at the back wall.
 * Because `s` depends only on `z`, the whole thing inverts in closed form,
 * which is the property the pointer depends on: every pixel of visible floor
 * is exactly one place in the room, and `unproject` finds it.
 */

/** Design resolution the room is composed at. */
export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;

/** How deep the room is, in world units. */
export const ROOM_DEPTH = 600;

/** How wide, in world units. World x runs from 0 (left wall) to here. */
export const ROOM_WIDTH = 1280;

/**
 * Wall height, in world units.
 *
 * Tall enough that the top of the side walls is off the top of the frame at
 * every depth, so the room reads as a room you are looking into rather than an
 * open-topped box you are looking down at.
 */
export const WALL_HEIGHT = 780;

/** How much smaller something at the back wall is drawn. */
const BACK_SCALE = 0.52;

/** Screen y of the wall/floor crease, and of the very front of the floor. */
const FLOOR_BACK_Y = 390;
const FLOOR_FRONT_Y = 726;

/** Vanishing point, horizontally: the middle of the frame. */
const VP_X = SCREEN_WIDTH / 2;

/** Camera height above the floor, in world units. */
const EYE = (FLOOR_FRONT_Y - FLOOR_BACK_Y) / (1 - BACK_SCALE);

/** Screen y of the horizon — where the vanishing point sits. */
const HORIZON = FLOOR_FRONT_Y - EYE;

/** Distance from the camera to the front plane of the room. */
const CAMERA = (BACK_SCALE * ROOM_DEPTH) / (1 - BACK_SCALE);

export interface ScreenPoint {
  x: number;
  y: number;
}

/** A point on the floor of the room. */
export interface FloorPoint {
  x: number;
  z: number;
}

/**
 * How big something at this depth is drawn, 0..1.
 *
 * The single most useful number in the file: art scale, shadow scale, walking
 * speed in screen terms, and how much of the floor a footprint covers all come
 * from it.
 */
export function scaleAt(z: number): number {
  return CAMERA / (CAMERA + ROOM_DEPTH - z);
}

/** World point to screen point. */
export function project(x: number, y: number, z: number): ScreenPoint {
  const s = scaleAt(z);
  return {
    x: VP_X + (x - VP_X) * s,
    y: HORIZON + (EYE - y) * s,
  };
}

/**
 * Screen point to the place on the floor underneath it.
 *
 * This is the pointer's entire relationship with the room. Note what it does
 * *not* need: a body, a guess, or a mode. Every pixel below the horizon names
 * one floor position, and moving the cursor up the screen walks that position
 * away from you into the room — which is exactly what the perspective is
 * already telling the eye.
 *
 * Above the wall/floor crease the answer is behind the back wall, and past the
 * bottom of the frame it is in front of the room; both are returned honestly
 * and clamped by the caller.
 */
export function unprojectGround(screenX: number, screenY: number): FloorPoint {
  // Guard the horizon: at and above it the floor plane is at infinity.
  const s = Math.max(0.02, (screenY - HORIZON) / EYE);

  return {
    x: VP_X + (screenX - VP_X) / s,
    z: ROOM_DEPTH - CAMERA * (1 / s - 1),
  };
}

/**
 * How far above the floor a screen point is, for a known depth.
 *
 * The other half of `unprojectGround`, and what makes lifting work. Past the
 * back of the room there is no more floor to walk onto, so the pointer's
 * remaining travel up the screen is read as height instead — measured at the
 * depth the thing has been pinned to, which is the only reading that is
 * continuous across the moment it stops going backward and starts going up.
 */
export function heightAt(screenY: number, z: number): number {
  return EYE - (screenY - HORIZON) / scaleAt(z);
}

/** Where on the room's x axis a screen column falls, at a known depth. */
export function unprojectX(screenX: number, z: number): number {
  return VP_X + (screenX - VP_X) / scaleAt(z);
}

/**
 * How fast something is crossing the screen, given how fast it is moving in
 * the room.
 *
 * Not the same as its x velocity, and the difference matters to the animation:
 * a creature walking straight toward the viewer has no x velocity at all, but
 * it is visibly moving and visibly getting bigger, and a walk cycle driven by
 * `vx` alone would have it gliding forward with its legs still. Depth
 * contributes to screen motion through the scale term, so this is the number
 * the lean and the facing direction should be reading.
 */
export function screenVelocityX(
  x: number,
  z: number,
  vx: number,
  vz: number,
): number {
  const s = scaleAt(z);
  // d/dz of s(z) is s² / CAMERA.
  return vx * s + (x - VP_X) * ((s * s) / CAMERA) * vz;
}

/**
 * How far away this depth reads, 0 at the front of the room and 1 at the back.
 *
 * Drives the aerial-perspective tint: things further off are a little paler
 * and a little bluer, because that is what distance does to contrast, and it
 * separates the back of the room from the front even where nothing overlaps.
 */
export function farness(z: number): number {
  return Math.max(0, Math.min(1, 1 - z / ROOM_DEPTH));
}

/** Screen y of the wall/floor crease at the back of the room. */
export const HORIZON_FLOOR_Y = FLOOR_BACK_Y;

/** The floor as a screen-space quad, back-left first, going clockwise. */
export function floorQuad(): ScreenPoint[] {
  return [
    project(0, 0, 0),
    project(ROOM_WIDTH, 0, 0),
    project(ROOM_WIDTH, 0, ROOM_DEPTH),
    project(0, 0, ROOM_DEPTH),
  ];
}

/** One wall as a screen-space quad: bottom-back, bottom-front, top-front, top-back. */
export function wallQuad(side: 'left' | 'right'): ScreenPoint[] {
  const x = side === 'left' ? 0 : ROOM_WIDTH;
  return [
    project(x, 0, 0),
    project(x, 0, ROOM_DEPTH),
    project(x, WALL_HEIGHT, ROOM_DEPTH),
    project(x, WALL_HEIGHT, 0),
  ];
}

/** The back wall as a screen-space quad, from its bottom-left, clockwise. */
export function backWallQuad(): ScreenPoint[] {
  return [
    project(0, 0, 0),
    project(ROOM_WIDTH, 0, 0),
    project(ROOM_WIDTH, WALL_HEIGHT, 0),
    project(0, WALL_HEIGHT, 0),
  ];
}

/**
 * A line across the floor at a constant depth, as two screen points.
 *
 * The floor's seams, and the lane guides that appear while you are moving
 * something, are both this.
 */
export function floorLine(z: number): [ScreenPoint, ScreenPoint] {
  return [project(0, 0, z), project(ROOM_WIDTH, 0, z)];
}
