/**
 * Depth lanes: how the room tells you where things are.
 *
 * Physics uses a continuous `z` and always will — a creature walking toward a
 * ball has to be able to be halfway there. But a *user* placing furniture with
 * a mouse does not want continuous depth, they want to know which row of the
 * room a thing is in, and they want the answer to be obvious at a glance.
 *
 * So the room has three rows:
 *
 *   BACK      against the wall — shelves, plants, the lamp
 *   MIDDLE    the middle of the room — the table, the bed
 *   FRONT     nearest the viewer — toys, the basket, the rug
 *
 * They exist for three separate reasons, and it is worth being clear about
 * each. They give the floor its seam lines, so depth is visible with nothing
 * in the room at all. They give a dropped object somewhere definite to land,
 * so two things never end up two pixels apart in depth and permanently in each
 * other's way. And they give the drag affordance something to name, so the
 * room can say *back row* while you are deciding.
 *
 * The creature ignores all of it and walks wherever it likes.
 */

import { ROOM_DEPTH } from './Projection';

export type LaneId = 'back' | 'middle' | 'front';

export interface Lane {
  id: LaneId;
  label: string;
  /** Depth of the middle of the lane, in world units. */
  z: number;
  /** Where the lane starts and ends, for the floor bands and for snapping. */
  from: number;
  to: number;
}

/**
 * Three rows, generously spaced.
 *
 * 150 world units between lane centres is more than the depth of the deepest
 * piece of furniture in the room, which is the property that matters: two
 * things in different lanes physically cannot touch, so the back of the room
 * can be full without the front of the room noticing.
 */
export const LANES: Lane[] = [
  { id: 'back', label: 'Back row', z: 100, from: 0, to: 200 },
  { id: 'middle', label: 'Middle', z: 300, from: 200, to: 420 },
  { id: 'front', label: 'Front row', z: 510, from: 420, to: ROOM_DEPTH },
];

/** Which lane a depth falls in. */
export function laneAt(z: number): Lane {
  for (const lane of LANES) {
    if (z < lane.to) return lane;
  }
  return LANES[LANES.length - 1];
}

/**
 * Pull a depth to the middle of its lane.
 *
 * Applied when something is *placed* — set down deliberately — and never when
 * something is thrown, because a ball that snapped to a row mid-bounce would
 * look broken. Placement wants tidiness; physics wants to be left alone.
 */
export function snapToLane(z: number): number {
  return laneAt(z).z;
}

/** How far through its lane a depth is, 0 at the back edge and 1 at the front. */
export function laneProgress(z: number): number {
  const lane = laneAt(z);
  return (z - lane.from) / (lane.to - lane.from);
}
