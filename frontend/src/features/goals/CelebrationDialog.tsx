import { useEffect } from 'react';
import { DancingPet } from '../pets/DancingPet';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { audio } from '../../lib/audio';
import { cn } from '../../lib/utils';

/**
 * Finishing something, celebrated.
 *
 * The one moment in the product allowed to interrupt: a goal somebody set
 * themselves a fortnight ago is now done, and the creature has an opinion about
 * it. Centred over the world, with the creature actually dancing rather than a
 * static picture and a confetti burst.
 *
 * ```text
 *   ┌──────────────────────┐
 *   │      (dancing)       │   the real rig, the real dance clip
 *   │  Blorb is proud of   │
 *   │        you           │
 *   │  ─────────────────   │
 *   │    +5 Happiness      │   the actual change, not a made-up number
 *   └──────────────────────┘
 * ```
 *
 * **Short, and it closes itself.** Three seconds, or a click anywhere. A
 * celebration you have to dismiss is a chore attached to a reward, and the
 * second time somebody sees it they are already reaching for the close button.
 *
 * **The number is real.** `+5 Happiness` is the affection the completion
 * actually produced, measured across the request rather than assumed — the
 * server scales gains by how much room is left above the current value, so the
 * same goal is worth less to a creature that already adores you. Printing a
 * constant would be the one number in the product that lies.
 */

interface CelebrationDialogProps {
  open: boolean;
  petName: string;
  appearance: PetAppearance;
  /**
   * Percentage points of affection this completion gained.
   *
   * Null when there is nothing to report — a goal completed twice, or a
   * creature already so fond of you that the gain rounded to nothing. The line
   * is then omitted rather than shown as zero, because "+0 Happiness" reads as
   * a bug and "…" reads as a wait that is never going to end.
   */
  gained: number | null;
  onClose: () => void;
}

/** How long it stays up before letting the user get on with their day. */
const LINGER_MS = 3200;

export function CelebrationDialog({
  open,
  petName,
  appearance,
  gained,
  onClose,
}: CelebrationDialogProps) {
  // The sting belongs to the moment it appears, and `fanfare` is already the
  // product's "you finished something" sound — the one thing on the UI channel
  // allowed to be an event (`Docs/audio-and-feedback.md` §3).
  useEffect(() => {
    if (!open) return;
    audio.ui.celebrate();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div
        role="status"
        aria-live="polite"
        className={cn(
          'animate-pop-in relative w-full max-w-xs overflow-hidden rounded-3xl border border-border',
          'bg-card px-6 pt-4 pb-5 text-center shadow-2xl shadow-black/40',
        )}
      >
        {/*
          One expanding ring behind the creature — the project's existing
          celebration flourish (`.animate-ring`), which is confetti-free on
          purpose: the creature is the thing to look at.
        */}
        <span
          aria-hidden
          className="animate-ring absolute top-1/2 left-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30"
        />

        <DancingPet appearance={appearance} size={150} className="relative" />

        <p className="relative mt-1 text-lg font-semibold tracking-tight">
          {petName} is proud of you
        </p>

        {/*
          The footer is separated by a rule rather than by colour, because the
          number is a footnote to the sentence above it and not a second
          headline. It is the only place a number about affection appears.
        */}
        {gained !== null && gained > 0 && (
          <p className="relative mt-4 border-t border-border pt-3 text-xs font-medium text-accent">
            <span className="animate-rise inline-block">+{gained} Happiness</span>
          </p>
        )}
      </div>
    </div>
  );
}
