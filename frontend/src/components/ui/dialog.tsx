import * as React from 'react';
import { sfx } from '../../lib/audio';
import { cn } from '../../lib/utils';

/**
 * A modal, hand-rolled like the tab strip next door.
 *
 * The project has one dialog and no dialog library, and the three things a
 * dialog has to get right are small enough to write down:
 *
 *   escape and the backdrop close it, because a modal you can only leave by
 *   finding the right button is a trap
 *
 *   focus moves into it on open and back to whatever opened it on close, and
 *   Tab cycles inside it, so a keyboard user is not silently tabbing around
 *   the page behind the overlay
 *
 *   the page behind it does not scroll while it is up
 *
 * Everything else is layout — and, now, motion.
 *
 * **The exit has to be real.** An entrance animation with an instant
 * disappearance is worse than neither, because the asymmetry is exactly what
 * makes an interface feel like it is skipping frames. So closing is a state of
 * its own: the panel plays its way out, and only then does it unmount. The
 * `onClose` the caller passed still fires immediately, so nothing about the
 * application's state waits for an animation — the dialog is already logically
 * closed while it is still visibly leaving.
 *
 * **Sound is part of the transition, not an extra.** A soft rising tone on the
 * way in, its mirror on the way out, both on the UI channel and both under a
 * fifth of a second (`lib/audio/voices.ts`).
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Read out as the dialog's name. */
  title: string;
  description?: string;
  children: React.ReactNode;
  /** The row of buttons along the bottom. */
  footer?: React.ReactNode;
  className?: string;
}

/** How long the leaving animation runs. Matches `.animate-pop-in` reversed. */
const EXIT_MS = 140;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  /**
   * Three states, not one boolean.
   *
   * `open` is what the caller means; `phase` is what is on screen. The two
   * differ for exactly one animation's length, and conflating them is what
   * makes a modal blink out of existence instead of leaving.
   *
   * The transitions are made during render rather than in an effect, which is
   * React's own answer for state derived from props: doing it in an effect
   * would paint one frame of the wrong thing first, and that frame is the
   * flicker this whole arrangement exists to remove.
   */
  const [phase, setPhase] = React.useState<'closed' | 'open' | 'leaving'>(
    open ? 'open' : 'closed',
  );

  if (open && phase !== 'open') setPhase('open');
  if (!open && phase === 'open') setPhase('leaving');

  const leaving = phase === 'leaving';
  const present = phase !== 'closed';

  // The sound belongs to the transition, so it follows the phase rather than
  // the prop — a dialog that never actually opened never makes a noise.
  React.useEffect(() => {
    if (phase === 'open') sfx.open();
    else if (phase === 'leaving') sfx.close();
  }, [phase]);

  React.useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('closed'), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Send focus in on open, and put it back where it came from on close.
  React.useEffect(() => {
    if (phase !== 'open') return;

    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // The first field, if there is one — a save dialog wants the name box, not
    // the Cancel button.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => opener?.focus?.();
  }, [phase]);

  // Nothing behind a modal should scroll under it.
  React.useEffect(() => {
    if (!present) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [present]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    // Wrap at both ends, so Tab never escapes into the page behind.
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  };

  if (!present) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      {/* The backdrop is its own element so a click on it closes, while a
          click inside the panel does not bubble out and close it too. */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-150',
          leaving ? 'opacity-0' : 'animate-fade-in',
        )}
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        /*
         * Never taller than the screen, and never taller than what is left of
         * the screen once a keyboard is up.
         *
         * `--app-height` is what `lib/useViewport.ts` publishes: the part of
         * the display the page may actually use, keyboard excluded. A dialog
         * sized by `100svh` is the right height on a desktop and half of it is
         * behind the keyboard on a phone the moment somebody types into the
         * note field — which is exactly what the memory dialog asks people to
         * do. Only the body scrolls, so the title stays legible and the
         * commit buttons stay on screen rather than below the fold.
         */
        style={{ maxHeight: 'calc(var(--app-height, 100svh) - 2rem)' }}
        className={cn(
          'relative flex w-full max-w-sm flex-col rounded-2xl border border-border bg-card p-6',
          'text-card-foreground shadow-2xl shadow-black/40 outline-none',
          leaving
            ? 'scale-97 opacity-0 transition-[transform,opacity] duration-150'
            : 'animate-pop-in',
          className,
        )}
      >
        <div className="shrink-0 space-y-1 text-center">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {/*
          `relative`, because this clips: an absolutely positioned descendant
          without a positioned ancestor lays out against <html> and escapes the
          dialog entirely (AGENTS.md, Layout Rules). `-mr-2 pr-2` keeps the
          scrollbar off the content rather than off the panel's padding.
        */}
        <div className="relative mt-5 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">{children}</div>

        {footer && <div className="mt-6 flex shrink-0 gap-3">{footer}</div>}
      </div>
    </div>
  );
}
