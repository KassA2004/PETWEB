/**
 * Talking to `/users/me`.
 *
 * Thin, like every other client in this project, and it lives here rather than
 * beside the social calls for one reason: the *progress* half of this response
 * is needed by the dashboard on load, and the dashboard must not reach into the
 * lazily-loaded social chunk to get it. `features/social/api.ts` re-exports
 * these three so nothing that already imported them had to change, and there is
 * still exactly one description of the endpoint.
 */

import { apiRequest } from '../../lib/api';
import type { UserProgress } from '../../lib/progress';

/** The signed-in user, as they see themselves. */
export interface Me {
  id: string;
  username: string;
  email: string;
  /**
   * What they have done, and therefore what the object catalog will give them.
   *
   * The server's numbers. Nothing the client sends can move them — they are
   * written by the code that seals a focus session, completes a goal and
   * publishes a memory — so the client's only job is to hold the latest copy
   * and ask again after something that would have changed it.
   */
  progress: UserProgress;
}

export function fetchMe(signal?: AbortSignal): Promise<Me> {
  return apiRequest<Me>('/users/me', { signal });
}

export function setUsername(username: string, signal?: AbortSignal): Promise<Me> {
  return apiRequest<Me>('/users/me', { method: 'PATCH', body: { username }, signal });
}
