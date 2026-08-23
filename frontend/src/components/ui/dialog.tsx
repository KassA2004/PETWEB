import * as React from 'react';
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
 * Everything else is layout.
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

  // Send focus in on open, and put it back where it came from on close.
  React.useEffect(() => {
    if (!open) return;

    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // The first field, if there is one — a save dialog wants the name box, not
    // the Cancel button.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => opener?.focus?.();
  }, [open]);

  // Nothing behind a modal should scroll under it.
  React.useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      {/* The backdrop is its own element so a click on it closes, while a
          click inside the panel does not bubble out and close it too. */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
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
        className={cn(
          'relative w-full max-w-sm rounded-2xl border border-border bg-card p-6',
          'text-card-foreground shadow-2xl shadow-black/40 outline-none',
          className,
        )}
      >
        <div className="space-y-1 text-center">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <div className="mt-5">{children}</div>

        {footer && <div className="mt-6 flex gap-3">{footer}</div>}
      </div>
    </div>
  );
}
