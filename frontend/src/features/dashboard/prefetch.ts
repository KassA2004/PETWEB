import { EDITOR_TABS, jobsForTab } from '../customization/catalogue';
import type { EditorTab } from '../customization/catalogue';
import { loadCustomizerPanel } from '../customization/customizerModule';
import { PREVIEW_BASE, prewarmOptionPreviews } from '../customization/previews';
import { ROOM_PREVIEW_SECTIONS } from '../habitat/objectPreviews';

/**
 * Work the dashboard does when nobody is waiting for it.
 *
 * The thing this file exists to prevent, measured before it did:
 *
 * ```text
 *   click Face  ─→   246ms  the panel is on screen, sixty-nine empty tiles
 *               ─→  1663ms  the first picture
 *               ─→  2638ms  the last one
 * ```
 *
 * None of that is network. Every tile in the product is *drawn*, procedurally,
 * by the same code the room runs on, and read back off the GPU as a PNG
 * (`lib/preview`) — about 25ms of main thread each, and a tab has up to
 * sixty-nine of them. Prefetching URLs cannot help with work that has no URL.
 * The only thing that helps is doing the drawing earlier, while nobody is
 * waiting on it.
 *
 * ```text
 *   the room is up  ─→  chunks       the code behind the two lazy tabs
 *                   ─→  first grids  Body and Objects — what a panel opens on
 *                   ─→  the rest     a tile per idle callback, tab by tab
 * ```
 *
 * A warmed tile is only worth anything if the grid later asks for it under the
 * *same* name: `lib/preview` caches by key and shares work already in flight,
 * so a hit means the picture is drawn exactly once and a miss means it is drawn
 * twice. That is why the panel and this file read their categories out of the
 * same `customization/catalogue`, and why the room's sections are built from
 * the live paint rather than a remembered one.
 *
 * **Nothing here blocks anything.** It starts only once the room the user is
 * actually looking at has drawn; the eager stage is thirty-two tiles; and
 * everything after it runs one tile per idle callback, so a busy machine simply
 * makes the queue slower. If it never ran at all, every tile would be drawn on
 * demand exactly as it was before.
 */

/** Which panel a piece of background work belongs to. */
export type PrefetchTag = 'pet' | 'room';

/**
 * How eagerly a pass runs.
 *
 * ```text
 *   eager   back to back, yielding a macrotask between tiles. For the small,
 *           near-certain stages: the grid each panel opens on, and anything the
 *           user has just shown they want by opening its panel
 *   idle    one tile per idle callback. For the long tail — a hundred and sixty
 *           tiles behind tabs nobody has pressed. It costs the room nothing
 *           when the machine is busy and drains in seconds when it is not
 * ```
 */
type Cadence = 'eager' | 'idle';

/** One unit of background work: a tile, or a small group of them. */
type Step = () => Promise<unknown>;

interface Pass {
  readonly tag: PrefetchTag;
  cadence: Cadence;
  /**
   * The work, built only once the pass is reached.
   *
   * A thunk of thunks, so a user who signs out ten seconds in has not spent
   * anything describing tiles that were never going to be drawn.
   */
  readonly steps: () => readonly Step[];
}

export interface PrefetchHandle {
  /** Stop, and drop whatever is left. */
  cancel: () => void;
  /**
   * The user just opened a panel.
   *
   * Its remaining passes go to the front of the queue and switch to the eager
   * cadence: they are no longer speculative, and the tab strip inside that
   * panel is about to be pressed. Whatever was mid-pass for the *other* panel
   * keeps its place in the queue rather than being thrown away — it goes back
   * on the front of the tail, unfinished, and resumes when this panel is warm.
   */
  promote: (tag: PrefetchTag) => void;
}

/** Run `task` when the browser is idle, or after `timeout` if it never is. */
function whenIdle(task: () => void, timeout: number): () => void {
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  if (typeof ric === 'function') {
    const handle = ric(task, { timeout });
    return () =>
      (
        window as unknown as { cancelIdleCallback?: (h: number) => void }
      ).cancelIdleCallback?.(handle);
  }

  // Safari, historically. A short timer is not idle time, but it is at least
  // after the first paint, which is the part that matters.
  const timer = window.setTimeout(task, Math.min(timeout, 600));
  return () => window.clearTimeout(timer);
}

/** One turn of the event loop, so a long eager run cannot hold a frame hostage. */
function yieldToEvents(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * One editor tab's tiles, one step each.
 *
 * A step per tile rather than per tab, because the idle cadence gives back the
 * thread between steps: a tab as a single step would be sixty-nine tiles with
 * no way out of it, which is the two-second stall moved rather than removed.
 *
 * Drawn sequentially for the same reason `prewarmOptionPreviews` is sequential
 * — they share one offscreen WebGL context, so firing them in parallel does not
 * make the GPU faster, it only makes the main thread unresponsive.
 */
function petTabSteps(tab: EditorTab): () => Step[] {
  return () => jobsForTab(tab).map((job) => () => prewarmOptionPreviews(PREVIEW_BASE, [job]));
}

/**
 * Everything worth drawing early, in the order it is worth drawing it.
 *
 * The order is a claim about what somebody does next: the grid each panel opens
 * on first, then the editor's tabs left to right, then the room's chips left to
 * right.
 *
 * @param tint reads the room's paint at the moment a room pass starts.
 */
function buildQueue(tint: () => number): Pass[] {
  // The first section is what the Room tab opens on — the object catalogue and
  // the wall pieces beside it. See `ROOM_PREVIEW_SECTIONS`.
  const [things, ...rest] = ROOM_PREVIEW_SECTIONS;

  return [
    { tag: 'pet', cadence: 'eager', steps: petTabSteps('body') },
    { tag: 'room', cadence: 'eager', steps: () => things(tint()) },

    ...EDITOR_TABS.filter((tab) => tab !== 'body').map(
      (tab): Pass => ({ tag: 'pet', cadence: 'idle', steps: petTabSteps(tab) }),
    ),
    ...rest.map(
      (section): Pass => ({ tag: 'room', cadence: 'idle', steps: () => section(tint()) }),
    ),
  ];
}

/**
 * How long to wait for idle time before going anyway.
 *
 * Long enough that a busy machine is genuinely left alone, short enough that a
 * page which never quite goes idle — a room animating at sixty frames a second
 * is close to that — still drains its queue.
 */
const IDLE_TIMEOUT = 500;

/**
 * Warm the panels.
 *
 * @param tint the room's current paint, read fresh whenever a room pass starts.
 *   Floors, walls and hours are previewed in it and cached under it.
 *
 * Returns a handle so a teardown can stop it: a user who signs out mid-warm
 * should not still be drawing pictures of hats.
 */
export function prefetchPanels(tint: () => number): PrefetchHandle {
  let cancelled = false;
  let queue: Pass[] = [];
  /** How many tiles have been drawn, for the dev handle at the bottom. */
  let drawn = 0;
  /** The pass being drained, and how far into it we are. */
  let current: { pass: Pass; steps: readonly Step[]; at: number } | null = null;
  /** Guards against two drain loops — a promotion can arrive mid-flight. */
  let draining = false;
  let stopIdle: (() => void) | null = null;

  /** The next tile to draw, opening passes as it runs out of them. */
  const nextStep = (): { run: Step; cadence: Cadence } | null => {
    for (;;) {
      if (current && current.at < current.steps.length) {
        return { run: current.steps[current.at++], cadence: current.pass.cadence };
      }

      const pass = queue.shift();
      if (!pass) {
        current = null;
        return null;
      }

      current = { pass, steps: pass.steps(), at: 0 };
    }
  };

  const scheduleIdle = (): void => {
    stopIdle = whenIdle(() => {
      stopIdle = null;
      void drain();
    }, IDLE_TIMEOUT);
  };

  const drain = async (): Promise<void> => {
    if (draining || cancelled) return;
    draining = true;

    try {
      while (!cancelled) {
        const step = nextStep();
        if (!step) return;

        try {
          await step.run();
          drawn += 1;
        } catch {
          // A failed warm-up is a tile that draws on demand later, exactly as
          // it did before this file existed. Never surface it.
        }

        if (cancelled) return;

        // Read after the await, not before: a promotion during the draw may
        // have changed what cadence this work is running at, and taking effect
        // immediately is the entire point of promoting.
        if (step.cadence === 'idle' && current?.pass.cadence === 'idle') {
          scheduleIdle();
          return;
        }

        await yieldToEvents();
      }
    } finally {
      draining = false;
    }
  };

  stopIdle = whenIdle(() => {
    stopIdle = null;
    if (cancelled) return;

    void (async () => {
      try {
        /*
         * The chunks first: small, network-bound, and the one part of this that
         * a slow connection rather than a slow CPU makes expensive. `import()`
         * is idempotent and the module registry is shared, so the click later
         * resolves from cache instantly.
         *
         * The editor's goes through `customizerModule` rather than being
         * imported directly, and the difference is a second of the user's time:
         * a chunk in the registry does not stop `lazy` suspending on its first
         * render, but a component the dashboard can render outright does.
         *
         * Ordered, never parallel: they share a main thread with a running
         * PixiJS scene, and two chunks parsing at once is a dropped frame.
         */
        await loadCustomizerPanel();
        if (cancelled) return;
        await import('../memories/MemoriesPanel');
      } catch {
        // The lazy boundary will fetch it for real when the tab is opened.
      }

      if (cancelled) return;
      queue = buildQueue(tint);
      await drain();
    })();
  }, 2000);

  if (import.meta.env.DEV) {
    /*
     * A window onto the queue, for measuring it.
     *
     * The whole point of this file is a wait that no longer happens, which is
     * exactly the kind of improvement that cannot be seen by looking. This
     * reports how far the warm-up has got, so "is the Face tab ready yet" is a
     * question with an answer rather than an impression.
     */
    (window as unknown as Record<string, unknown>).__prefetch = {
      get drawn() {
        return drawn;
      },
      get remaining() {
        return (
          queue.length + (current ? current.steps.length - current.at : 0)
        );
      },
      get passes() {
        return queue.map((pass) => `${pass.tag}:${pass.cadence}`);
      },
    };
  }

  return {
    cancel: () => {
      cancelled = true;
      queue = [];
      current = null;
      stopIdle?.();
      stopIdle = null;
    },

    promote: (tag) => {
      if (cancelled) return;

      // Put the unfinished remainder of the other panel's pass back on the
      // queue rather than dropping it — it is still work worth doing, just not
      // ahead of the panel somebody is looking at.
      if (current && current.pass.tag !== tag && current.at < current.steps.length) {
        const remaining = current.steps.slice(current.at);
        queue.unshift({
          tag: current.pass.tag,
          cadence: current.pass.cadence,
          steps: () => remaining,
        });
        current = null;
      }

      if (current?.pass.tag === tag) current.pass.cadence = 'eager';

      const mine = queue.filter((pass) => pass.tag === tag);
      for (const pass of mine) pass.cadence = 'eager';
      queue = [...mine, ...queue.filter((pass) => pass.tag !== tag)];

      // Parked in an idle callback with work that is no longer speculative:
      // stop waiting for a quiet moment and go.
      if (!draining && (current || queue.length > 0)) {
        stopIdle?.();
        stopIdle = null;
        void drain();
      }
    },
  };
}
