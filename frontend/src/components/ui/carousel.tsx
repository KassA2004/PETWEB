import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A pageable strip.
 *
 * Used where a category has more options than fit a grid the panel can afford
 * to be tall for. The alternative — one grid that grows without limit — is what
 * turns a customizer into a wall, and it is the specific failure this component
 * exists to make impossible: a page is a fixed number of tiles, so ten options
 * and a hundred produce the same shaped control.
 *
 * ## Why this is CSS and not a carousel library
 *
 * It used to be vanilla Splide, and the mount cost was the single largest
 * source of interface lag in the product. Measured in the running app, warm,
 * with every preview already cached:
 *
 * ```text
 *   open the Room panel    6 carousels × ~26 ms  = 157 ms  → 105-137 ms long task
 *   open the Face tab      8 carousels × ~27 ms  = 215 ms  → 250 ms long task
 * ```
 *
 * That is a quarter of a second of frozen main thread on a press, every press,
 * for ever — because `mount()` measures the track and every slide, writes their
 * widths back, and binds its listeners, all synchronously, and React runs it
 * inside the commit that is also mounting fifty tiles. Nothing about it is
 * amortised: leaving a tab and coming back pays it again.
 *
 * A scroll container with `scroll-snap-type: x mandatory` is the same control
 * with no mount at all. The browser does the paging, natively and off the main
 * thread; the only JavaScript left runs when somebody actually presses an arrow
 * or scrolls. It also gets touch fling, trackpad swipe and momentum for free —
 * all things the library was re-implementing.
 *
 * ## What the JavaScript still does
 *
 * Reports which page is showing, so the dots can say. That is one passive
 * `scroll` listener, rate-limited to one read per frame, and it reads
 * `scrollLeft` — a property that does not force layout the way measuring a
 * slide does.
 *
 * Arrows and dots scroll to a page; `scroll-behavior` in the stylesheet decides
 * whether that is animated, so `prefers-reduced-motion` is honoured by CSS
 * rather than by a branch here.
 */

interface CarouselProps {
  /** One element per page. */
  children: React.ReactNode[];
  /** Read out as the control's name. */
  label: string;
  className?: string;
}

export function Carousel({ children, label, className }: CarouselProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const pages = children.length;
  const [page, setPage] = React.useState(0);

  /**
   * How far apart two pages are, in scroll units.
   *
   * The **page's** width, not the track's, and the difference is real: the
   * track carries `padding: 0.25rem` so the tiles' hover-lift is not clipped,
   * which makes its `clientWidth` eight pixels wider than the pages inside it.
   * Measured: pages 343 wide starting every 343, a track reporting 351. Paging
   * by the track's number puts every page eight pixels further out than the one
   * before — `scroll-snap` quietly corrects the landing, so it looks right and
   * the arithmetic behind it drifts anyway, which is the kind of thing that is
   * fine until a category has nine pages.
   */
  const stride = (track: HTMLDivElement): number => {
    const first = track.firstElementChild;
    const width = first instanceof HTMLElement ? first.clientWidth : 0;
    return width > 0 ? width : track.clientWidth;
  };

  /*
   * Which page is under the viewport, from the scroll offset alone.
   *
   * Coalesced into one animation frame, because a fling on a phone delivers
   * scroll events faster than frames and each one would otherwise be a state
   * update.
   */
  const queued = React.useRef(0);

  const onScroll = React.useCallback(() => {
    if (queued.current) return;

    queued.current = requestAnimationFrame(() => {
      queued.current = 0;
      const track = trackRef.current;
      if (!track) return;

      const step = stride(track);
      if (step <= 0) return;

      const index = Math.round(track.scrollLeft / step);
      setPage((current) => (current === index ? current : index));
    });
  }, []);

  React.useEffect(
    () => () => {
      if (queued.current) cancelAnimationFrame(queued.current);
    },
    [],
  );

  /*
   * A page count that shrank under a scrolled track leaves it showing nothing.
   *
   * The grids are rebuilt when their options change — a category that goes from
   * three pages to one while the user is on page three would otherwise leave
   * the dots pointing at a page that no longer exists.
   *
   * Adjusted **during render**, which is React's own answer for state that has
   * to follow a prop: doing it in an effect paints one frame of the wrong
   * answer first, and cascades a second render to fix it.
   */
  const [seenPages, setSeenPages] = React.useState(pages);

  if (seenPages !== pages) {
    setSeenPages(pages);
    if (page >= pages) setPage(0);
  }

  /*
   * And the DOM half of the same thing, which is what an effect is for: the
   * scroller keeps its offset across a re-render, so a track that was on page
   * three is still scrolled there even though page three has gone.
   */
  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const last = stride(track) * (pages - 1);
    if (track.scrollLeft <= last + 1) return;

    track.scrollTo({ left: 0, behavior: 'auto' });
  }, [pages]);

  const go = (index: number) => {
    const track = trackRef.current;
    if (!track) return;

    const next = Math.max(0, Math.min(pages - 1, index));
    track.scrollTo({ left: next * stride(track), behavior: 'smooth' });
    // Set immediately rather than waiting for the scroll to report: the dots
    // should answer the press, not the animation the press started.
    setPage(next);
  };

  // One page needs no machinery at all — and drawing arrows and a dot for a
  // control that cannot move is worse than drawing nothing.
  if (pages <= 1) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn('petweb-carousel', className)}>
      <div className="petweb-carousel__chrome">
        <ul className="petweb-carousel__dots">
          {pages > 1 &&
            children.map((_, index) => (
              // Pages are positional and never reordered, so the index is the
              // identity — there is nothing else about a page to key on.
              <li key={index}>
                <button
                  type="button"
                  aria-label={`${label}: page ${index + 1} of ${pages}`}
                  aria-current={index === page}
                  data-active={index === page || undefined}
                  onClick={() => go(index)}
                />
              </li>
            ))}
        </ul>

        <div className="petweb-carousel__arrows">
          <button
            type="button"
            aria-label={`${label}: previous page`}
            disabled={page === 0}
            onClick={() => go(page - 1)}
          >
            <svg viewBox="0 0 10 16" aria-hidden>
              <path d="M8.2 0 10 1.8 3.8 8l6.2 6.2L8.2 16 0 8z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={`${label}: next page`}
            disabled={page === pages - 1}
            onClick={() => go(page + 1)}
          >
            <svg viewBox="0 0 10 16" aria-hidden>
              <path d="M1.8 0 0 1.8 6.2 8 0 14.2 1.8 16 10 8z" />
            </svg>
          </button>
        </div>
      </div>

      {/*
        The track.

        `overflow-x: auto` with snapping, so this is a real scroller: a thumb
        can fling it, a trackpad can swipe it, and the arrows above are a second
        way in rather than the only one. `tabIndex` is not set — the pages'
        own tiles are the focusable things, and a scroller that takes focus
        itself would add a tab stop in front of every grid in the product.
      */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        role="group"
        aria-label={label}
        className="petweb-carousel__track"
      >
        {children.map((child, index) => (
          <div key={index} className="petweb-carousel__page">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
