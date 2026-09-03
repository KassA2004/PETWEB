import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import {
  METRIC_COPY,
  describeRequirement,
  formatMetric,
  requirementFraction,
} from '../../lib/progress';
import type { UnlockRequirement, UserProgress } from '../../lib/progress';

/**
 * Why you cannot have that yet.
 *
 * The whole of the locked state's explanation, and the reason a locked tile is
 * pressable rather than disabled. A greyed-out tile answers no question: the
 * user learns that the Bean Bag is unavailable and nothing whatsoever about how
 * to get it, which turns the locked half of the catalog from an invitation into
 * a wall.
 *
 * So this says four things, in this order, because that is the order somebody
 * asks them in:
 *
 * ```text
 *   what        the thing itself, drawn by the same generator the room uses
 *   how much    "15 goals" - the requirement, in words
 *   how far     the bar, and "9 of 15". A number with a denominator is the
 *               difference between a rule and a target
 *   how         one sentence on what actually moves that counter
 * ```
 *
 * It is a modal rather than a tooltip or an expanding row for a reason the
 * brief gave: the catalogue is a dense grid of 76-pixel tiles, and anything
 * that grew inline would push every tile after it sideways. A modal costs the
 * grid nothing and is the same control on a phone as on a desktop.
 *
 * The preview is the *object*, never an icon - theme-and-design.md's rule that
 * a picture of the actual thing beats a glyph standing in for it applies most
 * of all here, since wanting the thing is the entire point of the screen.
 */

interface LockedDialogProps {
  open: boolean;
  onClose: () => void;
  /** What is locked. Null while the dialog is playing its exit. */
  item: {
    label: string;
    requirement: UnlockRequirement;
    /** The same preview function the catalogue tile uses, so it is already cached. */
    preview: () => Promise<string>;
  } | null;
  progress: UserProgress;
}

export function LockedDialog({ open, onClose, item, progress }: LockedDialogProps) {
  const [src, setSrc] = useState<string | null>(null);
  const preview = item?.preview;

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;

    void preview().then((url) => {
      if (!cancelled) setSrc(url);
    });

    return () => {
      cancelled = true;
    };
  }, [preview]);

  if (!item) return null;

  const { requirement } = item;
  const copy = METRIC_COPY[requirement.metric];
  const have = progress[requirement.metric];
  const fraction = requirementFraction(progress, requirement);
  const percent = Math.round(fraction * 100);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item.label}
      description={`Locked until ${describeRequirement(requirement)}.`}
      footer={
        <Button className="w-full" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative mx-auto grid aspect-square w-32 place-items-center overflow-hidden rounded-2xl bg-muted/40">
          {src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="animate-fade-in h-full w-full object-contain opacity-40 saturate-50"
            />
          ) : (
            <Skeleton className="size-full rounded-2xl" />
          )}

          <span
            aria-hidden
            className="absolute grid size-10 place-items-center rounded-full bg-card/90 text-muted-foreground shadow-sm ring-1 ring-border"
          >
            <Lock className="size-5" strokeWidth={2.5} />
          </span>
        </div>

        <div className="space-y-1.5">
          {/*
            The bar is decoration; the sentence under it is the fact. Anybody
            who cannot see the bar gets the same information from the text, so
            the track itself is hidden from the accessibility tree rather than
            given a role that would read the number out twice.
          */}
          <div
            aria-hidden
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            {/*
              Filled by a scaled transform rather than by a width, matching the
              affection meter next door: a width transition is a layout on every
              frame of it, and a transform is not. `motion-reduce` turns it off
              for anybody who has asked their system to stop moving things.
            */}
            <div
              className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `scaleX(${fraction})` }}
            />
          </div>

          <p className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium tabular-nums">
              {formatMetric(requirement.metric, have)} of{' '}
              {formatMetric(requirement.metric, requirement.amount)}
            </span>
            <span className="tabular-nums text-muted-foreground">{percent}%</span>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">{copy.how}</p>
      </div>
    </Dialog>
  );
}
