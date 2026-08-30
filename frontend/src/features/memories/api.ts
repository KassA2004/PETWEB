/**
 * Talking to the memory endpoints.
 *
 * There is no create route for a goal completion here on purpose: those are
 * written inside the completion transaction (`POST /goals/:id/complete`), so a
 * memory of finishing something cannot exist without the finishing having
 * happened. This is the book, and the entries the user writes by hand.
 */

import { apiRequest } from '../../lib/api';

/** Who else may see a memory. */
export type MemoryVisibility = 'private' | 'public';

export interface Memory {
  id: string;
  /** `goal_completed` | `snapshot` | `note`. */
  type: string;
  title: string;
  description: string;
  /** A media path, or null for a memory kept without a picture. */
  imageUrl: string | null;
  goalId: string | null;
  /**
   * Whether anybody who looks the owner up can see this one.
   *
   * Present on the owner's own list, where it is a thing they decided and can
   * change; and on a visitor's, where it is always `public` by construction
   * because the server never fetched anything else.
   */
  visibility: MemoryVisibility;
  createdAt: string;
}

export function fetchMemories(signal?: AbortSignal): Promise<Memory[]> {
  return apiRequest<Memory[]>('/memories', { signal });
}

export function deleteMemory(memoryId: string, signal?: AbortSignal): Promise<void> {
  return apiRequest<void>(`/memories/${memoryId}`, { method: 'DELETE', signal });
}

/**
 * Show a memory to visitors, or take it back.
 *
 * Changing your mind later has to be as easy as deciding at the time, or the
 * decision at the time becomes one people are afraid of. The server is the only
 * thing that enforces it either way — the memory book shows a private entry
 * exactly as it always did.
 */
export function setMemoryVisibility(
  memoryId: string,
  visibility: MemoryVisibility,
  signal?: AbortSignal,
): Promise<Memory> {
  return apiRequest<Memory>(`/memories/${memoryId}`, {
    method: 'PATCH',
    body: { visibility },
    signal,
  });
}
