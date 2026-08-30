import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Keep a log scrolled to its newest line — including when the box changes size.
 *
 * Every chat in this product used to do this with one effect on the message
 * list, which is right for the case it was written for (a line arrives, follow
 * it) and silently wrong for the case a phone introduces: **the container can
 * shrink without the messages changing.** A keyboard opening takes half the
 * screen, the log is suddenly half as tall, and the newest message is now above
 * the fold of a scroller that nobody thinks to scroll while they are typing a
 * reply to it. The symptom is a conversation that looks like it stopped.
 *
 * So this watches the element as well as the list.
 *
 * ## It does not fight the reader
 *
 * Following the bottom is only correct while the reader *is* at the bottom.
 * Somebody who has scrolled up to re-read something has said, by scrolling,
 * that they are not interested in the newest line — and yanking them back to it
 * every time one arrives is the behaviour that makes people give up on reading
 * back at all. So the position is checked first, and anything more than
 * `NEAR_BOTTOM_PX` from the end is left exactly where it is.
 *
 * The threshold is not zero because sub-pixel rounding, a fractional device
 * pixel ratio and a mid-flight smooth scroll all leave `scrollTop` a pixel or
 * two short of the arithmetic, and a log that decided it was not at the bottom
 * because of a rounding error would stop following for good.
 */

/** How far from the end still counts as "reading the newest thing". */
const NEAR_BOTTOM_PX = 48;

/**
 * The hook owns the ref rather than taking one, and that is not a style choice:
 * the React Compiler forbids writing through a ref a hook was *handed*, because
 * from its side that is a hook mutating its caller's state. Creating it here and
 * handing it back makes the same effect legal and the call site shorter.
 */
export function useStickToBottom<T extends HTMLElement>(
  /** Whatever, when it changes, means there is something new to follow. */
  contents: unknown,
): RefObject<T | null> {
  const scroller = useRef<T | null>(null);
  /**
   * Whether the reader was at the bottom before whatever just happened.
   *
   * Sampled on scroll rather than read at the moment of the resize, because by
   * then it is too late: a container that has already shrunk reports a
   * `scrollTop` that was correct for its old height, and the answer would be
   * "no" for a reader who had not moved at all.
   */
  const following = useRef(true);

  /**
   * The height the last *deliberate* scroll was measured against.
   *
   * This is the whole subtlety of the hook, and without it the feature does not
   * work at all. When a container shrinks, the browser fires a `scroll` event —
   * the scroll position did not move, but it is now further from the bottom
   * than it was, so the position was effectively changed underneath the reader.
   * That event arrives *before* the `ResizeObserver` callback.
   *
   * ```text
   *   keyboard opens   the log goes from 204px to 120px tall
   *   scroll fires     "you are 84px from the bottom"  → following = false
   *   resize fires     following is false, so nothing is pinned
   * ```
   *
   * Measured, exactly like that: the log stopped following the moment it most
   * needed to. Comparing the height tells the two kinds of scroll event apart —
   * a reader dragging a log does not change its height, and a keyboard does.
   */
  const measuredAt = useRef(0);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const atBottom = () =>
      element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;

    const onScroll = () => {
      // A scroll event from a box that has just changed size is the box moving,
      // not the reader. Ignore it and keep whatever they last chose.
      if (element.clientHeight !== measuredAt.current) return;
      following.current = atBottom();
    };

    /*
     * Pin, then keep pinning until the layout stops moving.
     *
     * One resize notification is not one layout. A large shrink — a full-height
     * keyboard on a small phone — arrives as a first pass the observer reports
     * and one or two more that settle the box lower, especially once the log
     * reaches its own `min-height` and the flex column has to redistribute
     * around it. A scroll position written during the first pass is then
     * clamped against a height that no longer applies, and the log comes to
     * rest short of the newest line. Measured: three of four keyboard sizes
     * pinned exactly and the largest stopped 84 pixels off.
     *
     * So the follow-up frames do not re-ask whether to follow. That question
     * was answered when the resize arrived, and the only thing that could
     * change the answer in between is the involuntary scroll event this whole
     * mechanism exists to ignore — which is also why `measuredAt` is not
     * updated until the position has actually settled.
     *
     * Two frames, not a loop: a bounded number of writes to one property is
     * cheap and stops; a loop that watches for stability is a rendering
     * dependency nobody can reason about later.
     */
    const SETTLE_FRAMES = 2;
    let frame = 0;
    let timer = 0;

    const settle = (remaining: number) => {
      element.scrollTop = element.scrollHeight;

      if (remaining <= 0) {
        measuredAt.current = element.clientHeight;
        return;
      }

      frame = requestAnimationFrame(() => settle(remaining - 1));
    };

    const pin = () => {
      if (!following.current) {
        measuredAt.current = element.clientHeight;
        return;
      }

      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      settle(SETTLE_FRAMES);

      /*
       * And once more after the animation.
       *
       * Two frames covers a resize that happens all at once. It does not cover
       * one that is *animated*: on a phone, opening a keyboard collapses the
       * room band over 300ms (`Dashboard`), which is twenty resize
       * notifications ending at a height none of the earlier ones predicted.
       * This is the one that lands after the last of them.
       *
       * Comfortably longer than the transition it is waiting for, and it is a
       * correction rather than the mechanism — by the time it runs the log is
       * usually already in the right place and this writes the same number.
       */
      timer = window.setTimeout(() => settle(1), 400);
    };

    element.addEventListener('scroll', onScroll, { passive: true });

    // The box changing size is the case the message effect cannot see: a
    // keyboard opening, a phone turning over, the room band collapsing.
    // `ResizeObserver` also fires once on observe, which is what seeds
    // `measuredAt` with the first real height.
    const observer = new ResizeObserver(pin);
    observer.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      element.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, []);

  // And the ordinary case: a line arrived.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !following.current) return;
    element.scrollTop = element.scrollHeight;
  }, [contents]);

  return scroller;
}
