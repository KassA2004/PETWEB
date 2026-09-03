import * as React from 'react';
import { audio, sfx } from '../../lib/audio';
import { navigate, pathFor } from '../../lib/useRoute';
import type { Route } from '../../lib/useRoute';
import { cn } from '../../lib/utils';

/**
 * A link that is a link.
 *
 * The whole component, and it exists because the alternative people reach for
 * — a `<button>` that calls `navigate()` — takes four things away that nobody
 * notices until they want one: middle-click to open a tab, right-click to copy
 * the address, the status bar showing where it goes, and a crawler seeing a
 * destination at all.
 *
 * So it is an `<a>` with a real `href`, and the click handler bows out of every
 * case the browser should keep:
 *
 * ```text
 *   modifier held      ⌘ ⌃ ⇧ ⌥ — the user is asking for a tab or a window
 *   not the left button middle-click is "open in a tab"
 *   already prevented  something upstream has other plans
 * ```
 *
 * Sound matches `button.tsx`, so following a link and pressing a button feel
 * like the same product.
 */

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, className, onClick, ...props }, ref) => (
    <a
      ref={ref}
      href={pathFor(to)}
      className={cn(
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        void audio.unlock();
        sfx.click();
        navigate(to);
      }}
      {...props}
    />
  ),
);
Link.displayName = 'Link';
