/**
 * The environments the creature can live in.
 *
 * One so far. The registry exists anyway, because the point of the seam is
 * that the second one costs a file rather than a refactor: add it here, and
 * the scene, the inventory and eventually the user's own choice all get it for
 * nothing.
 */

import { farmhouse } from './Farmhouse';
import type { EnvironmentDefinition } from './types';

export type { EnvironmentDefinition, PlacedProp, SceneryLayers } from './types';
export { farmhouse };

export const ENVIRONMENTS: EnvironmentDefinition[] = [farmhouse];

export const DEFAULT_ENVIRONMENT = farmhouse;

export function getEnvironment(id: string): EnvironmentDefinition {
  return ENVIRONMENTS.find((environment) => environment.id === id) ?? DEFAULT_ENVIRONMENT;
}
