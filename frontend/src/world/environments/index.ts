/**
 * The environments the creature can live in.
 *
 * Two of them now, and the second one is the seam paying for itself: the park
 * was one file, and the scene, the grid, the physics, the drag and the depth
 * sorting all got it for nothing. That was the bet `./types.ts` made.
 *
 * **The park is deliberately not in the list below**, and the reason is the
 * bundle rather than the design. This module is imported by `PetRoom`, which is
 * on the load path of the first screen; a static import of `./Park` here would
 * put a sky, a treeline, a fence and a lawn into the chunk every signed-in
 * visitor downloads, to draw a place most of them will never stand in
 * (AGENTS.md, Performance Rules: *"code that the first screen does not need is
 * lazy-loaded"*). It costs about 17 kB, measured.
 *
 * So the park is imported directly by the one screen that shows it
 * (`features/social/ParkStage.tsx`, which is itself behind a `lazy()`
 * boundary) and handed to the habitat as an object. `getEnvironment` keeps
 * answering for the rooms a creature can *live* in, which is what it is for —
 * a park is somewhere you go, not somewhere you are from.
 */

import { farmhouse } from './Farmhouse';
import type { EnvironmentDefinition } from './types';

export type { EnvironmentDefinition, PlacedProp, SceneryLayers } from './types';
export { farmhouse };

/** The rooms a creature can live in. A park is not one; see above. */
export const ENVIRONMENTS: EnvironmentDefinition[] = [farmhouse];

export const DEFAULT_ENVIRONMENT = farmhouse;

export function getEnvironment(id: string): EnvironmentDefinition {
  return ENVIRONMENTS.find((environment) => environment.id === id) ?? DEFAULT_ENVIRONMENT;
}
