/**
 * Talking to the memory endpoints.
 *
 * There is no create route for a goal completion here on purpose: those are
 * written inside the completion transaction (`POST /goals/:id/complete`), so a
 * memory of finishing something cannot exist without the finishing having
 * happened. This is the book, and the entries the user writes by hand.
 */

import { apiRequest } from '../../lib/api';

export interface Memory {
  id: string;
  /** `goal_completed` | `snapshot` | `note`. */
  type: string;
  title: string;
  description: string;
  /** A media path, or null for a memory kept without a picture. */
  imageUrl: string | null;
  goalId: string | null;
  createdAt: string;
}

export function fetchMemories(signal?: AbortSignal): Promise<Memory[]> {
  return apiRequest<Memory[]>('/memories', { signal });
}

export function deleteMemory(memoryId: string, signal?: AbortSignal): Promise<void> {
  return apiRequest<void>(`/memories/${memoryId}`, { method: 'DELETE', signal });
}
