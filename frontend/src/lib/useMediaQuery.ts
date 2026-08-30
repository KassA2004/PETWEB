import { useEffect, useState } from 'react';

/**
 * Whether a media query currently matches.
 *
 * Used for the one thing CSS genuinely cannot do: decide that mobile gets a
 * *different interface*, not a narrower one. Hiding the desktop layout with
 * `lg:hidden` still mounts it — the PixiJS scene still builds, the wall-decor
 * drag handlers still exist, and a phone still pays for both. Asking here means
 * the components that do not belong on a small screen are never created.
 *
 * Everything that is only a matter of size stays in Tailwind, where it belongs.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;

    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);

    // Read once on subscribe: the query may have changed between the initial
    // state and this effect running, which is exactly what happens when a
    // phone is rotated during load.
    update();

    // Both, and the second one is not belt and braces. A `MediaQueryList`
    // change event is the right signal and it is not always delivered: device
    // emulation in developer tools changes the viewport metrics without firing
    // one, and some mobile browsers move the boundary during a URL-bar
    // transition the same way. The symptom is a layout that is correct on load
    // and then never changes again, which is very hard to see because it is
    // right the first time you look. `resize` costs a comparison and closes it.
    list.addEventListener('change', update);
    window.addEventListener('resize', update);

    return () => {
      list.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [query]);

  return matches;
}

/*
 * The breakpoints themselves live in `useViewport.ts`.
 *
 * There used to be a `useIsCompact` here, and one breakpoint was enough right up
 * until a phone was turned on its side: it is compact by width and has no height
 * to give, which is a third shape rather than a narrower second one. Keeping the
 * three together with the viewport measuring — `useLayoutMode` — is what stops
 * them drifting apart. This file is now just the primitive they are built on.
 */
