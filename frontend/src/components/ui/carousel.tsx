import * as React from 'react';
import Splide from '@splidejs/splide';
// Structural CSS only — the track, the list and the slide widths. The arrows
// and the pagination are themed in `index.css` so they look like this product
// rather than like a Splide demo.
import '@splidejs/splide/dist/css/splide-core.min.css';
import { cn } from '../../lib/utils';

/**
 * A pageable strip, driven by Splide.
 *
 * Used where a category has more options than fit a grid the panel can afford
 * to be tall for. The alternative — one grid that grows without limit — is what
 * turns a customizer into a wall, and it is the specific failure this component
 * exists to make impossible: a page is a fixed number of tiles, so ten options
 * and a hundred produce the same shaped control.
 *
 * **Vanilla Splide, not the React wrapper.** `@splidejs/react-splide` is built
 * against React 18 and is a class component around the same library; forty
 * lines here avoids the compatibility question entirely and lets the pages be
 * ordinary React children.
 *
 * **`type: 'slide'`, never `'loop'`.** Loop mode clones slides into the DOM,
 * and cloned React-rendered nodes are nodes React does not know it has — they
 * do not update, and their click handlers are the ones from whenever the clone
 * was taken. A non-looping track leaves React's DOM authoritative.
 *
 * Rebuilt when the page count changes, because Splide measures its track once
 * and a page appearing under it would otherwise be unreachable.
 */

interface CarouselProps {
  /** One element per page. */
  children: React.ReactNode[];
  /** Read out as the control's name. */
  label: string;
  className?: string;
}

export function Carousel({ children, label, className }: CarouselProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const pages = children.length;

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || pages <= 1) return;

    const splide = new Splide(host, {
      type: 'slide',
      perPage: 1,
      arrows: true,
      pagination: true,
      // Matches the interface's own motion budget: long enough to show which
      // way the pages went, short enough to stay out of the way
      // (`Docs/audio-and-feedback.md` §7).
      speed: 260,
      easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
      // The panel is a scrolling column; a horizontal drag that also scrolls it
      // vertically is how a carousel makes a page feel broken on a phone.
      drag: true,
      snap: true,
      keyboard: 'focused',
      label,
      // Tiles are a grid inside each slide; Splide only moves whole pages.
      autoHeight: true,
      reducedMotion: { speed: 0, autoplay: 'pause' },
    });

    splide.mount();

    // Braces matter: `destroy` returns the instance, and an effect cleanup that
    // returns anything but a function is a type error and, worse, a promise
    // React would try to treat as one.
    return () => {
      splide.destroy(true);
    };
  }, [pages, label]);

  // One page needs no machinery at all — and mounting Splide for it would add
  // arrows and a dot for a control that cannot move.
  if (pages <= 1) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={hostRef} className={cn('petweb-carousel splide', className)}>
      <div className="splide__track">
        <ul className="splide__list">
          {children.map((page, index) => (
            // Pages are positional and never reordered, so the index is the
            // identity — there is nothing else about a page to key on.
            <li className="splide__slide" key={index}>
              {page}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
