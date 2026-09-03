import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How everything on the home page arrives.
 *
 * One `IntersectionObserver` for the whole page, and that is the architectural
 * decision rather than an optimisation. The obvious implementation of "reveal
 * on scroll" is a scroll listener that measures elements, and it is wrong three
 * times over: it runs on the main thread for every scroll event, it reads
 * layout (`getBoundingClientRect`) inside that loop, and it does the reading
 * *after* the last reveal wrote to the DOM — which is a forced reflow per
 * element per frame. On a phone that is the difference between a page that
 * glides and one that stutters exactly while somebody is deciding whether they
 * like the product.
 *
 * The observer does the measuring off the main thread and tells us only when an
 * answer changes. What we do with the answer is set one attribute:
 *
 * ```text
 *   <section data-reveal>        hidden: opacity 0, nudged down
 *        ↓ crosses the line
 *   <section data-reveal="in">   settled: opacity 1, no transform
 * ```
 *
 * The transition itself is CSS (`index.css`, `[data-reveal]`), on `opacity` and
 * `transform` only — both compositor properties, so a reveal costs no layout at
 * all. React is not involved in the animation; it only mounts the element.
 *
 * **Revealed once, then forgotten.** Elements are unobserved as they land, so a
 * long page does not accumulate work, and — more importantly — scrolling back up
 * does not un-reveal content somebody has already read.
 */

/**
 * How far into the viewport an element must come before it counts as arrived.
 *
 * Negative bottom margin, so the line is above the fold rather than at it: an
 * element that starts animating the instant its first pixel appears is still
 * animating when it is fully in view, which reads as lag rather than as
 * arrival. 12% of the viewport is about a third of a section.
 */
const ROOT_MARGIN = '0px 0px -12% 0px';

/**
 * How long to wait for the observer to say *anything* before giving up on it.
 *
 * A dead-man's switch, and not a theoretical one. `[data-reveal]` starts at
 * `opacity: 0`, so an environment that never delivers an intersection would
 * leave the page **blank** rather than merely unanimated — a page restored from
 * the back/forward cache, one opened in a tab that was never composited, a
 * browser with the API stubbed out. Content is what is being protected here,
 * not the choreography.
 *
 * It is armed once and disarmed by the first callback that arrives, so a
 * working observer costs one cancelled timer. Deliberately **not** a per-element
 * timeout: that would reveal the bottom of the page two and a half seconds after
 * it loaded, whether or not anybody had scrolled to it, which is the
 * choreography deleting itself.
 */
const FAILSAFE_MS = 2500;

let observer: IntersectionObserver | null = null;
let failsafe: number | null = null;
/** Set by the first intersection of the session: the observer is alive. */
let heardFromObserver = false;

function armFailsafe(): void {
  if (failsafe !== null || heardFromObserver) return;

  failsafe = window.setTimeout(() => {
    failsafe = null;
    if (heardFromObserver) return;

    // Nothing has ever been reported. Show the page and stop pretending.
    for (const element of document.querySelectorAll<HTMLElement>('[data-reveal=""]')) {
      element.dataset.reveal = 'in';
    }
  }, FAILSAFE_MS);
}

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        heardFromObserver = true;
        if (failsafe !== null) {
          window.clearTimeout(failsafe);
          failsafe = null;
        }

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = 'in';
          observer?.unobserve(entry.target);
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: 0.01 },
    );
  }

  return observer;
}

/**
 * Whether the visitor has asked for less movement.
 *
 * Read live rather than once: somebody can turn it on while the page is open,
 * and a page that keeps animating until it is reloaded has not honoured the
 * request.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return reduced;
}

/**
 * Attach an element to the page's reveal.
 *
 * A callback ref rather than an effect on a `useRef`, so an element that mounts
 * later — a section behind a lazily-loaded visual — is observed the moment it
 * exists rather than on the next render pass.
 *
 * Under `prefers-reduced-motion` the element is marked arrived immediately and
 * never observed at all. The content is *there*; only the choreography goes.
 * That is the difference between honouring the setting and hiding the page from
 * somebody who asked for stillness.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(): (node: T | null) => void {
  const reduced = usePrefersReducedMotion();
  const attached = useRef<T | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      if (attached.current && attached.current !== node) {
        getObserver().unobserve(attached.current);
      }

      attached.current = node;
      if (!node) return;

      if (reduced || node.dataset.reveal === 'in') {
        node.dataset.reveal = 'in';
        return;
      }

      node.dataset.reveal = '';
      getObserver().observe(node);
      armFailsafe();
    },
    [reduced],
  );

  useEffect(
    () => () => {
      if (attached.current) getObserver().unobserve(attached.current);
    },
    [],
  );

  return ref;
}

/**
 * The same signal as a boolean, for the handful of places that need to *know*
 * rather than merely look different — a demonstration that should start
 * playing when it is on screen and not before.
 *
 * Deliberately the exception. Anything that is only a fade and a nudge should
 * use `useReveal`, which never re-renders React at all.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  boolean,
] {
  const reduced = usePrefersReducedMotion();
  const [seen, setSeen] = useState(false);
  const attached = useRef<T | null>(null);
  const local = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      local.current?.disconnect();
      local.current = null;
      attached.current = node;

      if (!node) return;
      if (reduced) {
        setSeen(true);
        return;
      }

      const watcher = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          setSeen(true);
          watcher.disconnect();
        },
        { rootMargin: ROOT_MARGIN, threshold: 0.15 },
      );

      watcher.observe(node);
      local.current = watcher;
    },
    [reduced],
  );

  useEffect(() => () => local.current?.disconnect(), []);

  return [ref, seen];
}
