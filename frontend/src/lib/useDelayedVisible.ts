import { useEffect, useRef, useState } from 'react';

/**
 * Whether a loading indicator should be on screen right now.
 *
 * Two thresholds, and both exist because of how loading UI actually fails:
 *
 * ```text
 *   appearing too eagerly   work that finishes in 90ms flashes a skeleton for
 *                           three frames, which reads as a glitch rather than
 *                           as progress
 *   disappearing too fast   a skeleton shown for 40ms before the content lands
 *                           is a flicker in the other direction
 * ```
 *
 * So: nothing is shown until the work has been pending for `delay`, and once
 * shown it stays for at least `minVisible` however fast the work finishes.
 *
 * @param pending whether the work is still in flight
 */
export function useDelayedVisible(
  pending: boolean,
  { delay = 150, minVisible = 400 }: { delay?: number; minVisible?: number } = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;

    if (pending) {
      if (visible) return;
      timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
    } else if (visible) {
      const elapsed = Date.now() - (shownAt.current ?? 0);
      const remaining = Math.max(0, minVisible - elapsed);
      timer = window.setTimeout(() => {
        shownAt.current = null;
        setVisible(false);
      }, remaining);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pending, visible, delay, minVisible]);

  return visible;
}
