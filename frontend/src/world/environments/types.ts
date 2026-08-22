/**
 * What an environment *is*.
 *
 * The room the creature lives in is going to be one of several, and the user
 * is going to be able to change it. So none of it belongs to the scene: the
 * scene knows how to run *an* environment, and an environment is this record —
 * a floor to walk on, some scenery to draw, a light to sit under, and the
 * objects it starts with.
 *
 * What an environment deliberately does *not* get to change is the camera.
 * Every room is the same box seen from the same place (`world/Projection.ts`),
 * because the projection is what the pointer, the depth rows and the draw
 * order are all built on, and a room that moved the camera would be a
 * different game rather than a different room. Environments vary in what is in
 * them and what they are made of, which is the axis that matters.
 */

import type { Container } from 'pixi.js';
import type { RoomMood } from '../Ambience';
import type { ObjectDefinition } from '../../assets/objects/ObjectRenderer';
import type { RoomBounds } from '../../simulation/physics';

/** One object an environment starts with, placed in room coordinates. */
export interface PlacedProp {
  id: string;
  definition: ObjectDefinition;
  x: number;
  z: number;
}

/**
 * The scenery an environment draws, in the three places the room stacks it.
 *
 * Everything the environment builds is handed over as containers; the scene
 * owns where they go in the display list and destroys them when the
 * environment is swapped out.
 */
export interface SceneryLayers {
  /** Behind everything: the colour field, the walls, the floor. */
  ground: Container[];
  /**
   * Over the scenery but under its contents: aerial haze, so the back of the
   * room is paler than the front even where nothing overlaps.
   */
  haze: Container;
  /** Above the floor but below anything standing on it — pools of light. */
  ambient: Container;
  /** Above everything, the pet included: the mood wash, the vignette. */
  overlay: Container;
}

export interface EnvironmentDefinition {
  id: string;
  label: string;

  /** The patch of floor anything is allowed to stand on. */
  bounds: RoomBounds;

  /** Where the creature arrives, and roughly where new objects come down. */
  petStart: { x: number; z: number };

  /**
   * The main light: a window, a campfire, a hole in the ceiling.
   *
   * Room coordinates. The floor pool is drawn under it and the moths orbit it.
   */
  light: { x: number; y: number; z: number };

  /**
   * How dark it goes when the lamps are switched off, and in what colour.
   *
   * Separate from the ambience on purpose: the ambience is what time it is,
   * this is whether anybody left a light on. They compose — flicking the
   * switch at midday dims the room, flicking it at night nearly closes it.
   */
  night: { color: number; alpha: number };

  /** Ceiling of the airspace small flying things are willing to use. */
  ceiling: number;

  /** What the environment starts furnished with. */
  props: PlacedProp[];

  /**
   * Build the scenery.
   *
   * Called once each time the environment is activated *or the mood changes*,
   * and the containers it returns are destroyed when it is superseded. A room
   * is cheap enough to rebuild — a few dozen flat shapes — that redressing it
   * for a different hour of the day is a rebuild rather than a pile of
   * per-shape tweening. Nothing is cached between
   * the two, so an environment is free to be seeded differently every time it
   * is entered if it wants to be.
   */
  createScenery(mood: RoomMood): SceneryLayers;
}
