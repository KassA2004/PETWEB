/**
 * Talking to the environment endpoints.
 *
 * The room's appearance is a document, exactly like the creature's appearance
 * (`features/pets/api.ts`): the server stores it and validates that it is a
 * *storable* document; this side decides what it *means*
 * (`world/RoomStyle.ts`). Neither half has to know the other's catalog of wall
 * textures, which is why adding a wallpaper is a frontend change.
 */

import { apiRequest } from '../../lib/api';
import type { RoomStyle } from '../../world/RoomStyle';

export interface EnvironmentView {
  id: string;
  ownerId: string;
  name: string;
  /** The saved style, unvalidated. Pass it through `normalizeRoomStyle`. */
  sceneData: unknown;
  objectCount: number;
  updatedAt: string;
}

/** The room the creature is living in. The MVP ships one per user. */
export function fetchCurrentEnvironment(signal?: AbortSignal): Promise<EnvironmentView> {
  return apiRequest<EnvironmentView>('/environments/current', { signal });
}

/**
 * Save what the room looks like.
 *
 * PUT rather than PATCH: the room editor always knows the room's complete
 * appearance, so a partial write would only ever be a chance to lose a setting.
 */
export function saveRoomStyle(
  environmentId: string,
  style: RoomStyle,
  signal?: AbortSignal,
): Promise<EnvironmentView> {
  return apiRequest<EnvironmentView>(`/environments/${environmentId}/style`, {
    method: 'PUT',
    body: { sceneData: style },
    signal,
  });
}

/* -------------------------------------------------------------------------- */
/* What is standing in the room                                               */
/* -------------------------------------------------------------------------- */

/**
 * One object in the room, as the server stores it.
 *
 * Cells rather than coordinates, and no scale — an object's size is its grid
 * footprint and there is no per-instance version of it (`Docs/room-and-objects.md`
 * §4). A saved room is therefore a list of "what, and which cell", which is
 * exactly what the user decided and nothing else.
 */
export interface PlacedObject {
  key: string;
  type: string;
  col: number;
  row: number;
  /** `{ seed, color, secondaryColor, accentColor }`, or `{}`. */
  definition: unknown;
}

export function fetchRoomObjects(
  environmentId: string,
  signal?: AbortSignal,
): Promise<PlacedObject[]> {
  return apiRequest<PlacedObject[]>(`/environments/${environmentId}/objects`, { signal });
}

/**
 * Save the arrangement.
 *
 * PUT and whole-list, for the same reason the style is: the scene always holds
 * a complete, settled arrangement, and asking it to work out which objects are
 * dirty would invent a synchronisation problem across a simulation that moves
 * things nobody asked it to move.
 */
export function saveRoomObjects(
  environmentId: string,
  objects: PlacedObject[],
  signal?: AbortSignal,
): Promise<PlacedObject[]> {
  return apiRequest<PlacedObject[]>(`/environments/${environmentId}/objects`, {
    method: 'PUT',
    body: { objects },
    signal,
  });
}
