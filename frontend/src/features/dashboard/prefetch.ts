import { BODY_TYPE_KEYS } from '../../assets/pets/customization/BodyTypes';
import { PREVIEW_BASE, prewarmOptionPreviews } from '../customization/previews';

/**
 * Work the dashboard does when nobody is waiting for it.
 *
 * The Pet and Memories panels are code-split, which is right — a signed-out
 * visitor should not download the customizer. But a *signed-in* user is going
 * to open the Pet tab, and making them wait for a network round trip at the
 * moment they click is the code splitting leaking into the experience.
 *
 * So the chunks are fetched in the background once the room is up. The split
 * is unchanged; only the timing moves. `import()` is idempotent and the module
 * registry is shared, so the click later resolves from cache instantly.
 *
 * Ordered, never parallel: these share a main thread with a running PixiJS
 * scene, and three chunks parsing at once is a dropped frame in the room.
 */

export interface PrefetchHandle {
  cancel: () => void;
}

/** Run `task` when the browser is idle, or after `timeout` if it never is. */
function whenIdle(task: () => void, timeout = 2000): () => void {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  }).requestIdleCallback;

  if (typeof ric === 'function') {
    const handle = ric(task, { timeout });
    return () => (window as unknown as { cancelIdleCallback?: (h: number) => void })
      .cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(task, Math.min(timeout, 600));
  return () => window.clearTimeout(timer);
}

/**
 * Draw the Body tab's tiles before anybody opens the Pet tab.
 *
 * The measured cost of *not* doing this: first tile image 1540ms after the
 * click, all fourteen at 2005ms. The chunk was only ~60ms of that; the rest is
 * this work, and it can happen while the user is looking at their room.
 *
 * Only the first grid of the first tab. Prewarming every category would be
 * hundreds of rig builds for tabs most people never open — which is the
 * opposite of the point.
 */
export function prewarmFirstCategory(signal: AbortSignal): Promise<void> {
  return prewarmOptionPreviews(
    PREVIEW_BASE,
    BODY_TYPE_KEYS.map((key) => ({
      patch: { bodyType: key },
      focus: 'whole' as const,
      key,
    })),
    signal,
  );
}

/**
 * Warm the lazy panels.
 *
 * Returns a handle so a teardown can stop it — a user who signs out mid-warm
 * should not still be downloading a customizer.
 */
export function prefetchPanels(): PrefetchHandle {
  let cancelled = false;
  const controller = new AbortController();

  const stopIdle = whenIdle(() => {
    if (cancelled) return;

    void (async () => {
      try {
        // The Pet tab first: it is the one with the visible cost, and the one
        // this whole exercise is about.
        await import('../customization/CustomizerPanel');
        if (cancelled) return;
        await import('../memories/MemoriesPanel');
        if (cancelled) return;
        await prewarmFirstCategory(controller.signal);
      } catch {
        // A failed prefetch costs nothing: the lazy boundary will fetch it for
        // real when the tab is opened. Never surface this.
      }
    })();
  });

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
      stopIdle();
    },
  };
}
