import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { NO_PROGRESS } from '../../lib/progress';
import type { UserProgress } from '../../lib/progress';
import { fetchMe } from './api';

/**
 * What the user has done, and therefore what the catalog will give them.
 *
 * One request on load, and then **nothing until something happens that could
 * have changed it**. There is no polling and no interval: the three counters
 * move on exactly three events — a session was served, a goal was finished, a
 * memory was shared or taken back — and every one of those is something this
 * application already knows about the instant it occurs, so the dashboard says
 * so rather than the hook asking repeatedly (AGENTS.md, Performance Rules).
 *
 * ## Why it does not fail loudly
 *
 * A progress read that does not arrive leaves every counter at zero, which
 * locks the locked half of the catalog and changes nothing else. That is the
 * right way round: the failure state of a reward system should be "you have not
 * earned this yet", never "here, have everything". No error is surfaced,
 * because there is nothing the user could do about it and the room works
 * perfectly well without it.
 */
export interface ProgressHandle {
  progress: UserProgress;
  /** False once the first answer has arrived, either way. */
  loading: boolean;
  /**
   * Ask again.
   *
   * Called at the moments a counter can have moved, not on a timer. Stable
   * across renders, so an effect can depend on it without re-firing.
   */
  refresh: () => void;
}

export function useProgress(): ProgressHandle {
  const [progress, setProgress] = useState<UserProgress>(NO_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const me = await fetchMe(controller.signal);
        if (!controller.signal.aborted) setProgress(me.progress);
      } catch (cause) {
        // Signed out is not a failure, and neither is anything else here: the
        // counters simply stay where they were, which for a first load is zero.
        if (cause instanceof ApiError && cause.isUnauthorized) return;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token]);

  const refresh = useCallback(() => setToken((current) => current + 1), []);

  return { progress, loading, refresh };
}
