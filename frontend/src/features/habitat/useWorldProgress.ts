import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type LoadPhase = 'session' | 'data' | 'world' | 'settled';

const WEIGHTS: Record<LoadPhase, number> = {
  session: 15,
  data: 20,
  world: 45,
  settled: 20,
};

const TOTAL = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0);

export interface WorldProgress {
  /** 0..1, monotonic. */
  value: number;
  /** True until every phase has reported. */
  loading: boolean;
  /** Mark a phase done. Safe to call more than once. */
  complete: (phase: LoadPhase) => void;
}

/**
 * How far along the room is.
 *
 * Weighted phases rather than a timer, because a timer that guesses is a
 * progress bar that lies — and this one is on screen while the product's first
 * impression is forming.
 *
 * Monotonic by construction: `done` is a Set, so a phase reporting twice
 * cannot move the bar backwards, and a failed phase still counts. The loader
 * exists to get out of the way; the panels report real errors themselves.
 */
export function useWorldProgress(): WorldProgress {
  const [done, setDone] = useState<ReadonlySet<LoadPhase>>(() => new Set());
  const settled = useRef(false);
  const settledFrame = useRef<number | null>(null);

  const complete = useCallback((phase: LoadPhase) => {
    setDone((current) => {
      if (current.has(phase)) return current;
      const next = new Set(current);
      next.add(phase);
      return next;
    });
  }, []);

  // `settled` is one frame after the world, so the first drawn frame is on
  // screen before the overlay starts leaving.
  //
  // The scheduled frame is cancelled only on unmount, not on every re-run of
  // this effect: `done` also changes when `data` (or any other phase)
  // completes, which would otherwise cancel the already-scheduled frame via
  // this effect's own cleanup and re-check `settled.current` (already true)
  // without rescheduling it — leaving `settled` permanently unfired and the
  // loader stuck just short of 100%.
  //
  // A background tab is the other way this frame can go quiet: browsers
  // throttle or suspend `requestAnimationFrame` for a hidden document, so a
  // page loaded (or left) in a background tab can sit here indefinitely.
  // `Dashboard`'s own hard timeout is the backstop for that — see its
  // `complete('settled')` alongside `world`/`data`.
  useEffect(() => {
    if (!done.has('world') || settled.current) return;
    settled.current = true;
    settledFrame.current = requestAnimationFrame(() => complete('settled'));
  }, [done, complete]);

  useEffect(
    () => () => {
      if (settledFrame.current !== null) cancelAnimationFrame(settledFrame.current);
    },
    [],
  );

  const value = useMemo(() => {
    let earned = 0;
    for (const phase of Object.keys(WEIGHTS) as LoadPhase[]) {
      if (done.has(phase)) earned += WEIGHTS[phase];
    }
    return earned / TOTAL;
  }, [done]);

  return { value, loading: value < 1, complete };
}
