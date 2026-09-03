import { useEffect, useState } from 'react';

/**
 * The part of the screen the page can actually use, on a phone.
 *
 * ## Why `100svh` is not enough
 *
 * The shell is one viewport tall and nothing inside it scrolls except the tools
 * column. That is right on a desktop and it has a hole in it on a phone: when
 * the on-screen keyboard opens, the **layout** viewport does not change. Only
 * the *visual* viewport shrinks. So `100svh` keeps describing the whole screen,
 * the shell keeps being 812px tall, and the bottom of it — which is where every
 * message composer in this product lives — is underneath the keyboard.
 *
 * The reported symptom was exactly that: a phone showing three stacked things,
 * the room, a chat you cannot see the bottom of, and a keyboard the page does
 * not know exists.
 *
 * ## What this does about it
 *
 * Publishes two custom properties on `<html>`, updated from `visualViewport`:
 *
 * ```text
 *   --app-height       the height the page may use, keyboard excluded
 *   --keyboard-inset   how much of the screen the keyboard is taking, in px
 * ```
 *
 * A CSS variable rather than React state for the height, deliberately: the
 * shell reads it in a stylesheet and re-renders nothing, so dragging a keyboard
 * open does not re-render the dashboard sixty times. The one thing that *is*
 * state is `keyboardOpen`, because the layout genuinely changes shape when it is
 * true — the room stands down and gives the conversation the screen.
 *
 * ## Two platforms, two symptoms, one formula
 *
 * ```text
 *   Android, with `interactive-widget=resizes-content` (index.html)
 *     the LAYOUT viewport shrinks. Both measures agree, and the keyboard is
 *     found by noticing the screen lost a third of itself without changing
 *     width — see `baseline`
 *
 *   iOS, which honours no such thing
 *     the layout viewport is unchanged and is *scrolled up* behind the
 *     keyboard, so the visual viewport is what shrank and `offsetTop` is how
 *     far the page was pushed
 * ```
 *
 * `Math.min` of the two, against a remembered tallest, covers both without a
 * platform test — and keeps covering them if a browser changes its mind.
 */

/**
 * Below this, a shrunken viewport is a keyboard rather than a rotation.
 *
 * A keyboard takes at least a third of a phone screen. Address bars and toolbars
 * come and go by forty or fifty pixels while scrolling, and mistaking one of
 * those for a keyboard would make the room flinch every time somebody scrolled
 * the goal list.
 */
const KEYBOARD_MIN_PX = 140;

/** Under this, a compact screen has no room for two stacked things. */
const SHORT_PX = 560;

/** At or above this, the interface is the desktop one. */
const WIDE_PX = 1024;

/**
 * Which of the three shapes the interface is in.
 *
 * ```text
 *   desktop     ≥1024px wide             the world beside the tools
 *   portrait    a phone upright          the world above the tools
 *   landscape   short AND wider than tall the world beside the tools, phone scale
 * ```
 */
export type LayoutMode = 'desktop' | 'portrait' | 'landscape';

export interface Viewport {
  layout: LayoutMode;
  /** True while an on-screen keyboard is taking part of the screen. */
  keyboardOpen: boolean;
}

/**
 * One hook, because the two questions share one measurement — and because
 * asking them separately is what let them disagree.
 *
 * **The layout is decided from the screen's `baseline` height, never from the
 * height it happens to have right now.** That is the entire lesson of two
 * rounds of this bug. A keyboard on a 369×800 phone leaves a viewport of about
 * 369×300, which is:
 *
 * ```text
 *   shorter than 560px                → matches every "is this short" test
 *   wider than it is tall             → matches `(orientation: landscape)` too
 * ```
 *
 * …so the interface decided the phone had been turned on its side and put the
 * room in a strip down the left. Orientation looked like the fix for the first
 * round and is not one, because CSS orientation is a property of the *viewport*
 * and the keyboard changes the viewport. There is no media query that gets this
 * right, which is why it is not a media query any more: the baseline is the
 * tallest this screen has been since it was last this width, so a keyboard
 * cannot move it and a rotation resets it.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(() => ({
    layout: measure(window.innerWidth || 1024, window.innerHeight || 800),
    keyboardOpen: false,
  }));

  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;

    /**
     * The tallest this screen has been since it was last this wide.
     *
     * Two jobs, and they are the same measurement. It is what the layout is
     * decided from, above; and it is how a keyboard is *detected* on Android,
     * where `interactive-widget=resizes-content` shrinks the layout viewport so
     * that the two viewports agree and there is no difference to subtract. The
     * screen losing a third of itself without changing width is a keyboard,
     * because nothing else does that.
     *
     * The width is the guard: a rotation changes it, and a rotation must reset
     * the baseline rather than be read as a very large keyboard.
     */
    let baseline = 0;
    let baselineWidth = 0;

    /*
     * The last values actually written to `<html>`, and the frame a write is
     * already queued for.
     *
     * Both exist for the same measured reason. **Setting a custom property on
     * the root element invalidates style for the whole document** — every
     * element, whether or not it mentions the property. Benchmarked in this app
     * against a forced layout: nothing dirty, 0 ms; one leaf attribute, 0 ms;
     * *any* custom property on `<html>`, 3.3 ms. On a mid-range phone that is
     * several frames.
     *
     * And this runs on every `visualViewport` resize **and scroll**, of which
     * iOS sends a stream while a keyboard is animating — which is precisely the
     * moment the interface is also collapsing the room, dropping the header and
     * re-rendering the dashboard. So:
     *
     * ```text
     *   coalesced   many events in one frame become one write
     *   deduped     a stream of events reporting the same geometry — which is
     *               what the end of a keyboard animation looks like — writes
     *               nothing at all
     * ```
     *
     * The measuring still happens per event; it is only the *writing* that is
     * rationed, so `keyboardOpen` is never late.
     */
    let writtenHeight = -1;
    let writtenInset = -1;
    let queued = 0;

    const measureAndApply = () => {
      /*
       * `documentElement.clientHeight`, not `window.innerHeight`.
       *
       * They are usually the same and they disagree exactly where it matters.
       * `innerHeight` is the window; `clientHeight` is the initial containing
       * block — the box CSS lengths actually resolve against. Measured on a
       * rotation from 375×812 to 812×375: `clientHeight` said 375 while
       * `innerHeight` was still reporting 812, so the shell kept a portrait
       * height inside a landscape screen and overflowed a viewport it is not
       * allowed to overflow.
       */
      const width = root.clientWidth;
      const layoutHeight = root.clientHeight || window.innerHeight;

      /*
       * Whichever of the two is smaller is what the page may actually use.
       *
       * On Android the layout viewport is the one that shrank; on iOS it is the
       * visual one, and the layout viewport has instead been *scrolled* up
       * behind the keyboard, which is what `offsetTop` adds back. Taking the
       * minimum is one line that is right on both rather than a platform test
       * that is right on the ones it was written for.
       */
      const visual = visualViewport
        ? Math.round(visualViewport.height + visualViewport.offsetTop)
        : layoutHeight;
      const visible = Math.min(layoutHeight, visual);

      // A different width is a different screen. Start the history again.
      if (width !== baselineWidth) {
        baselineWidth = width;
        baseline = visible;
      }

      baseline = Math.max(baseline, visible);

      const inset = Math.max(0, baseline - visible);
      const keyboardOpen = inset >= KEYBOARD_MIN_PX;

      const shownInset = keyboardOpen ? inset : 0;

      // Only when it has actually moved. The two properties are set together so
      // a frame that changes both still costs one style invalidation.
      if (visible !== writtenHeight || shownInset !== writtenInset) {
        writtenHeight = visible;
        writtenInset = shownInset;
        root.style.setProperty('--app-height', `${visible}px`);
        root.style.setProperty('--keyboard-inset', `${shownInset}px`);
      }

      const layout = measure(width, baseline);

      // Only when something actually changed: this runs on every scroll event
      // iOS sends while a keyboard is animating, and re-rendering the dashboard
      // for each of them would be a stutter at the worst possible moment.
      setViewport((current) =>
        current.layout === layout && current.keyboardOpen === keyboardOpen
          ? current
          : { layout, keyboardOpen },
      );
    };

    /**
     * One update per frame, however many events arrive.
     *
     * `requestAnimationFrame` rather than a timer because the thing being kept
     * in step is the paint: there is no value in computing a height twice
     * between two frames, and every extra computation lands in the middle of an
     * animation somebody is watching.
     */
    const apply = () => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        measureAndApply();
      });
    };

    // The first measurement is synchronous: the shell reads `--app-height` in a
    // stylesheet, and waiting a frame for it is a frame of the wrong height.
    measureAndApply();

    // `resize` is the one that fires for the keyboard; `scroll` is what iOS
    // gives instead when it pushes the page up behind one.
    visualViewport?.addEventListener('resize', apply);
    visualViewport?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      if (queued) cancelAnimationFrame(queued);
      visualViewport?.removeEventListener('resize', apply);
      visualViewport?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);

  return viewport;
}

/**
 * The shape, from a width and the screen's un-shrunken height.
 *
 * Landscape needs both halves. Short alone is a keyboard as often as it is a
 * rotation; wider-than-tall alone is every desktop window. Together they are
 * only ever a small screen turned on its side — and because the height handed
 * in is the baseline, a keyboard cannot fake either.
 */
function measure(width: number, height: number): LayoutMode {
  if (width >= WIDE_PX) return 'desktop';
  return height < SHORT_PX && width > height ? 'landscape' : 'portrait';
}
