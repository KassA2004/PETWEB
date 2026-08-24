/**
 * What the room has to say, as data.
 *
 * The scene does not own a speaker. It reports that a thing happened, where in
 * the room it happened and how hard, and something else decides what that
 * sounds like — the same direction of dependency the affordance system uses
 * (`simulation/Affordances.ts`): what can be heard is a fact about the room,
 * what it sounds like is a fact about the mixer.
 *
 * Keeping it this way buys three things that a `playSound()` call inside
 * `update()` would have cost:
 *
 *   the scene stays testable and silent — `room-preview.html` renders the room
 *   in a background tab with no audio context and does not have to care
 *
 *   the mixer can throttle. Fourteen collisions in a third of a second is a
 *   perfectly ordinary thing for a bouncing ball to do and a terrible thing to
 *   hear; the decision about how many of those become sound belongs where the
 *   voice count is known, not where the physics is
 *
 *   the volume hierarchy lives in one file rather than at every call site
 */

import type { ObjectType } from '../../assets/objects/ObjectRenderer';

export type RoomSoundKind =
  /** Something came down onto the floor, or onto something else. */
  | 'prop-land'
  /** Two things hit each other. */
  | 'prop-bump'
  /** Something hit the side of the room. */
  | 'prop-wall'
  /** Something was set down deliberately, on a cell. */
  | 'prop-place'
  /** Something was picked up. */
  | 'prop-lift'
  /** A placement the room refused. */
  | 'prop-refused'
  /** The creature made a small noise to itself. */
  | 'pet-idle'
  /** Something good happened. */
  | 'pet-happy'
  /** Something arrived at speed. */
  | 'pet-startled'
  /** It was poked. */
  | 'pet-poked'
  /** Settling down: the lights went out and it is giving up on the day. */
  | 'pet-sleepy'
  /** The small noise of a creature that would rather you had not left again. */
  | 'pet-glum'
  /** The clock struck, the music box started. */
  | 'chime'
  /** A light went on or off. */
  | 'lights';

export interface RoomSound {
  kind: RoomSoundKind;
  /** How hard it was, 0..1. Drives level and brightness, never pitch alone. */
  strength: number;
  /** Where across the room, -1 left .. +1 right. */
  pan: number;
  /** How far back, 0 at the front of the room .. 1 at the wall. */
  distance: number;
  /** Which kind of thing made it, when a thing made it. */
  type?: ObjectType;
}
