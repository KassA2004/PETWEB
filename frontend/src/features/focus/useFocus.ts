import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { abortFocus, completeFocus, fetchFocus, startFocus } from './api';
import type { Affection, FocusSession } from './api';

/**
 * The one session, and the clock that is not a clock.
 *
 * **Nothing here counts time.** The server owns `startedAt + durationMinutes`
 * and answers every request with how many seconds are left; this hook records
 * that number, records the instant it arrived, and derives the display from the
 * difference. Three things fall out of that, and all three were the point:
 *
 * ```text
 *   a wrong system clock      never consulted. The browser measures an
 *                             interval, which it is good at, instead of
 *                             comparing timestamps, which it is not
 *   a sleeping tab            timers are throttled to nothing in a background
 *                             tab; an anchored countdown does not care, because
 *                             it recomputes rather than decrements
 *   a refresh mid-session     is just another fetch. There is no state to
 *                             restore because there was never any state
 * ```
 *
 * And when the countdown reaches zero the server is *asked*, not told: a client
 * that is early gets `FOCUS_NOT_FINISHED` and quietly resynchronises, which is
 * the only honest way to end a timer somebody could otherwise skip by changing
 * their system clock.
 */

export type FocusOutcome = 'completed' | 'aborted';

export interface FocusHandle {
  session: FocusSession | null;
  /** True while a session is running: the room is dark and locked. */
  active: boolean;
  /** Whole seconds left. Zero when nothing is running. */
  remaining: number;
  affection: Affection;

  /** The durations the interface offers, and the floor under them. */
  presets: number[];
  minMinutes: number;

  loading: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;

  /**
   * How the last session ended, with a token that changes each time.
   *
   * The room watches this rather than `active`, because *why* it stopped is
   * what decides whether the creature bounds over or turns its back — and
   * because a boolean going false cannot tell those apart.
   */
  outcome: { kind: FocusOutcome; token: number } | null;

  start: (goalId: string, minutes: number) => Promise<boolean>;
  stop: () => Promise<boolean>;
  /** Re-read everything from the server. Used on reconnect and tab return. */
  refresh: () => void;
}

const DEFAULT_AFFECTION: Affection = { value: 0.5, level: 'neutral' };
const DEFAULT_PRESETS = [25, 45, 60, 90];

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isUnauthorized) return 'Sign in again to start a session.';
    return error.message;
  }
  if (error instanceof TypeError) return 'Cannot reach the server.';
  return 'Something went wrong.';
}

export function useFocus(): FocusHandle {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [affection, setAffection] = useState<Affection>(DEFAULT_AFFECTION);
  const [presets, setPresets] = useState<number[]>(DEFAULT_PRESETS);
  const [minMinutes, setMinMinutes] = useState(10);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ kind: FocusOutcome; token: number } | null>(
    null,
  );
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * What the server said, and when it said it.
   *
   * The whole timer. `at` is a local measurement point, never compared against
   * anything the server sent — only against a later reading of the same clock.
   */
  const anchor = useRef<{ seconds: number; at: number } | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  /** Stops the "time is up" request firing on every tick while it is in flight. */
  const sealing = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const adopt = useCallback((next: FocusSession | null) => {
    setSession(next);

    if (next && next.status === 'active') {
      anchor.current = { seconds: next.remainingSeconds, at: Date.now() };
      setRemaining(next.remainingSeconds);
    } else {
      anchor.current = null;
      setRemaining(0);
    }
  }, []);

  const finish = useCallback((kind: FocusOutcome) => {
    setOutcome((current) => ({ kind, token: (current?.token ?? 0) + 1 }));
  }, []);

  // --- Load, and re-load ---------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const state = await fetchFocus(controller.signal);
        if (controller.signal.aborted) return;

        adopt(state.active);
        setAffection(state.affection);
        setPresets(state.presets.length > 0 ? state.presets : DEFAULT_PRESETS);
        setMinMinutes(state.minMinutes);

        // Its time ran out while the app was closed. Reported once, and only
        // when present — a second fetch (React's double mount, a tab coming
        // back) must not erase the fact that it happened.
        if (state.justFinished) finish('completed');

        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        // Signed out is not a failure; it is a visitor with nothing running.
        if (!(cause instanceof ApiError && cause.isUnauthorized)) {
          setError(messageFor(cause));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [adopt, finish, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);
  const clearError = useCallback(() => setError(null), []);

  /**
   * A tab that has been in the background is a tab whose timers stopped.
   *
   * Re-reading on the way back is cheaper than being wrong: everything the
   * countdown needs comes from one request, including a session that finished
   * an hour ago while the laptop was shut.
   */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // --- The countdown -------------------------------------------------------
  useEffect(() => {
    if (!session || session.status !== 'active') return;

    const tick = () => {
      const at = anchor.current;
      if (!at) return;
      // Recomputed, never decremented: a tick that arrives late (a throttled
      // tab, a busy frame) must not make the timer run slow.
      setRemaining(Math.max(0, Math.round(at.seconds - (Date.now() - at.at) / 1000)));
    };

    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [session]);

  // --- Reaching zero -------------------------------------------------------
  useEffect(() => {
    if (!session || session.status !== 'active' || remaining > 0) return;
    if (sealing.current) return;

    sealing.current = true;

    void (async () => {
      try {
        const done = await completeFocus(session.id);
        if (!alive.current) return;
        adopt(null);
        setAffection(done.affection);
        finish('completed');
      } catch (cause) {
        if (!alive.current) return;

        // The browser was early. Not an error anybody should see: take the
        // server's remaining time and carry on waiting.
        if (cause instanceof ApiError && cause.code === 'FOCUS_NOT_FINISHED') {
          refresh();
          return;
        }

        // Anything else — offline, a 500 — leaves the session up. The time is
        // already served as far as the server is concerned, so the next
        // `refresh` resolves it; saying so would only be alarming.
        refresh();
      } finally {
        sealing.current = false;
      }
    })();
  }, [session, remaining, adopt, finish, refresh]);

  // --- Writes --------------------------------------------------------------
  const start = useCallback(
    async (goalId: string, minutes: number): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);

      try {
        const result = await startFocus({ goalId, durationMinutes: minutes });
        if (!alive.current) return true;
        adopt(result.session);
        setAffection(result.affection);
        setError(null);
        return true;
      } catch (cause) {
        if (alive.current) setError(messageFor(cause));
        return false;
      } finally {
        inFlight.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [adopt],
  );

  const stop = useCallback(async (): Promise<boolean> => {
    if (!session || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);

    try {
      const result = await abortFocus(session.id);
      if (!alive.current) return true;
      adopt(null);
      setAffection(result.affection);
      setError(null);
      finish('aborted');
      return true;
    } catch (cause) {
      if (alive.current) setError(messageFor(cause));
      return false;
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }, [session, adopt, finish]);

  return {
    session,
    active: session?.status === 'active',
    remaining,
    affection,
    presets,
    minMinutes,
    loading,
    busy,
    error,
    clearError,
    outcome,
    start,
    stop,
    refresh,
  };
}

/** `1:04:00`, or `24:30`. Hours only appear when there are some. */
export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}
