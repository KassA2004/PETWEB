import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  completeGoal,
  createGoal,
  deleteGoal,
  fetchGoals,
  reopenGoal,
} from './api';
import type { CompletionMemory, Goal, GoalCompletion } from './api';

/**
 * The user's goals, and keeping them.
 *
 * The opposite persistence shape to the room next door (`useRoomStyle`), and
 * deliberately: a room is edited continuously and saved on a debounce, while a
 * goal is a discrete act — added, finished, removed — and each one is a request
 * whose result the user is entitled to see. So nothing here is debounced, and
 * nothing is fire-and-forget.
 *
 * Three failure rules, from the top:
 *
 * **A create that fails keeps the user's text.** The panel owns the draft and
 * only clears it once the goal exists, so a network blip does not eat the
 * sentence somebody just wrote.
 *
 * **A create that is in flight cannot be started again.** `busy` is what stops
 * a double-clicked Add button from making two identical goals, and the six-goal
 * cap means the second one might even succeed.
 *
 * **A completion is never assumed.** It is the one action with a side effect
 * the user cares about — a memory — so the list is only updated from what the
 * server actually returned. An optimistic tick that has to be taken back is
 * worse than a spinner.
 */

export interface GoalsState {
  goals: Goal[];
  open: Goal[];
  completed: Goal[];
  /** How many more may be added. From the server's cap, not a constant here. */
  maxOpen: number;
  atLimit: boolean;

  loading: boolean;
  /** Set while any write is in flight, so buttons can refuse to double-fire. */
  busy: boolean;
  /** A failure the user should see. Cleared by the next successful write. */
  error: string | null;
  /** True when the last failure was the six-goal cap, which reads differently. */
  limitReached: boolean;
  clearError: () => void;

  add: (title: string) => Promise<boolean>;
  complete: (goalId: string, memory?: CompletionMemory) => Promise<GoalCompletion | null>;
  reopen: (goalId: string) => Promise<boolean>;
  remove: (goalId: string) => Promise<boolean>;
  reload: () => void;
}

/** Until the first load answers, assume the documented cap. */
const ASSUMED_MAX_OPEN = 6;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isUnauthorized) return 'Sign in again to keep your goals.';
    // The server writes the six-goal message; it is the product speaking, not
    // an error, and rewriting it here would put the wording in two places.
    if (error.code === 'GOAL_LIMIT_REACHED') return error.message;
    return error.message;
  }
  if (error instanceof TypeError) return 'Cannot reach the server.';
  return 'Something went wrong.';
}

export function useGoals(): GoalsState {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [maxOpen, setMaxOpen] = useState(ASSUMED_MAX_OPEN);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  /** Guards against a second write starting before the first finished. */
  const inFlight = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // --- Load ----------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const list = await fetchGoals(controller.signal);
        if (controller.signal.aborted) return;
        setGoals(list.items);
        setMaxOpen(list.maxOpen);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        // Signed out is not a failure; it is a visitor who has no goals.
        if (!(cause instanceof ApiError && cause.isUnauthorized)) {
          setError(messageFor(cause));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const clearError = useCallback(() => {
    setError(null);
    setLimitReached(false);
  }, []);

  /**
   * Run one write at a time, and turn whatever it throws into a message.
   *
   * Every mutation goes through here, which is how `busy` stays honest and how
   * no call site ever has to remember to reset it.
   */
  const run = useCallback(async <T>(work: () => Promise<T>): Promise<T | null> => {
    if (inFlight.current) return null;

    inFlight.current = true;
    setBusy(true);

    try {
      const result = await work();
      if (alive.current) {
        setError(null);
        setLimitReached(false);
      }
      return result;
    } catch (cause) {
      if (alive.current) {
        setError(messageFor(cause));
        setLimitReached(cause instanceof ApiError && cause.code === 'GOAL_LIMIT_REACHED');
      }
      return null;
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);

  const add = useCallback(
    async (title: string): Promise<boolean> => {
      const trimmed = title.trim();
      if (!trimmed) return false;

      const created = await run(() => createGoal({ title: trimmed }));
      if (!created) return false;

      setGoals((current) => [created, ...current]);
      return true;
    },
    [run],
  );

  const complete = useCallback(
    async (goalId: string, memory?: CompletionMemory): Promise<GoalCompletion | null> => {
      const done = await run(() => completeGoal(goalId, memory));
      if (!done) return null;

      setGoals((current) => current.map((goal) => (goal.id === goalId ? done : goal)));
      return done;
    },
    [run],
  );

  const reopen = useCallback(
    async (goalId: string): Promise<boolean> => {
      const open = await run(() => reopenGoal(goalId));
      if (!open) return false;

      setGoals((current) => current.map((goal) => (goal.id === goalId ? open : goal)));
      return true;
    },
    [run],
  );

  const remove = useCallback(
    async (goalId: string): Promise<boolean> => {
      const result = await run(async () => {
        await deleteGoal(goalId);
        return true as const;
      });
      if (!result) return false;

      setGoals((current) => current.filter((goal) => goal.id !== goalId));
      return true;
    },
    [run],
  );

  const open = goals.filter((goal) => goal.status === 'open');
  const completed = goals.filter((goal) => goal.status === 'completed');

  return {
    goals,
    open,
    completed,
    maxOpen,
    atLimit: open.length >= maxOpen,
    loading,
    busy,
    error,
    limitReached,
    clearError,
    add,
    complete,
    reopen,
    remove,
    reload,
  };
}
