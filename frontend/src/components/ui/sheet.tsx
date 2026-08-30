import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * A screen, on a screen that only has room for one.
 *
 * The panel column is about 300 points tall once a phone keyboard is up, and
 * two of the things this product asks people to do in it — write a message,
 * open a park — are jobs you do with both hands and your whole attention. Doing
 * them inside a panel that is itself inside a page meant a form you could not
 * move around in and a conversation you could not read.
 *
 * So on a small screen those two become *places*: the whole viewport, one title
 * bar with one way back, and nothing else competing. That is the pattern every
 * phone already uses for exactly these two jobs, and it is not a new idea in
 * this product either — it is what the social layer already does with the world
 * column when you walk into a park.
 *
 * ## Nothing behind it is reachable
 *
 * It covers the page completely, so `Tab` must not walk into the page behind
 * it — a focus ring on a control nobody can see is the classic dialog bug, and
 * the Web Interface Guidelines are explicit that an overlay must not leave
 * focus underneath it. Rather than reimplement a focus trap, the app root is
 * marked `inert` for as long as the sheet is open: the browser then removes
 * everything under it from the tab order, from hit testing and from the
 * accessibility tree in one property, which is both less code and more correct
 * than cycling `Tab` by hand.
 *
 * Focus moves to the back arrow on open, so the first thing `Tab` reaches is
 * the way out.
 *
 * Portalled to `document.body` so no ancestor's `overflow: hidden`,
 * `transform` or stacking context can clip it. `position: fixed` inside a
 * transformed ancestor resolves against that ancestor rather than the viewport,
 * which is a bug that only shows up on the one screen somebody animated.
 */

interface SheetProps {
  title: string;
  /** What the back arrow means here — "Close", "Back to the conversations". */
  backLabel: string;
  onBack: () => void;
  /** Buttons for the right of the title bar. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Sheet({ title, backLabel, onBack, actions, children }: SheetProps) {
  const back = useRef<HTMLButtonElement>(null);

  // Escape closes it, which is what every other layer in this product answers
  // to and what a phone with a keyboard case reaches for first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  /*
   * Everything else on the page stops existing, as far as focus is concerned.
   *
   * `inert` rather than a hand-rolled focus trap — see the note above. The
   * sheet is portalled to `body`, so the app root is a sibling and marking it
   * cannot mark the sheet itself.
   */
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    root.inert = true;
    // The back arrow, so the first thing Tab reaches is the way out. Focusing
    // the *button* rather than a field is also what keeps a phone's keyboard
    // shut until the user asks for it.
    back.current?.focus({ preventScroll: true });

    return () => {
      root.inert = false;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cn(
        'animate-rise fixed inset-0 z-50 flex flex-col overscroll-contain bg-background',
        // The sheet is full-bleed, so it is the sheet's job to keep its own
        // content out from under the notch and the home indicator.
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
      )}
      style={{ height: 'var(--app-height)' }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2">
        <button
          ref={back}
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className={cn(
            // Forty points square. It is the only way out of a screen that has
            // replaced the page, so it is the one control here that must not be
            // possible to miss with a thumb.
            'press grid size-10 shrink-0 place-items-center rounded-full text-foreground',
            'transition-colors hover:bg-muted',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>

        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {title}
        </h2>

        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>,
    document.body,
  );
}
