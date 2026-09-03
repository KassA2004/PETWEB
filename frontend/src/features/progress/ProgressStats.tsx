import { BookHeart, Target, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { METRIC_COPY, PROGRESS_METRICS, formatMetric } from '../../lib/progress';
import type { ProgressMetric, UserProgress } from '../../lib/progress';
import { cn } from '../../lib/utils';

/**
 * Three numbers: what somebody has actually done.
 *
 * One component for both places it appears — the owner's own room panel, and
 * the stats tab a visitor gets — because they are the same three facts and
 * anything that made them look different would be inviting the two to drift.
 * The only thing that changes between them is the sentence above, which is the
 * caller's.
 *
 * ## It is a definition list, not a table
 *
 * Each tile is a term and its value, which is exactly what `<dl>` is for, and
 * it is what makes the block read correctly to a screen reader in the one order
 * that matters: "Focused, 3 hours 20 minutes", not three numbers followed by
 * three words. A grid of `<div>`s would look identical and say nothing.
 *
 * ## Mobile
 *
 * Three across at every width. They are the shortest possible strings — a
 * duration and two small integers — so there is no width at which stacking them
 * buys anything, and a three-column block that never reflows is one less thing
 * that can shift the panel around under a thumb.
 */

const ICONS: Record<ProgressMetric, LucideIcon> = {
  focusMinutes: Timer,
  goalsCompleted: Target,
  memoriesShared: BookHeart,
};

interface ProgressStatsProps {
  progress: UserProgress;
  /** Dimmed while the first read is still in flight, so zeroes do not read as facts. */
  loading?: boolean;
  className?: string;
}

export function ProgressStats({ progress, loading = false, className }: ProgressStatsProps) {
  return (
    <dl
      className={cn('grid grid-cols-3 gap-2', loading && 'animate-pulse', className)}
      aria-busy={loading || undefined}
    >
      {PROGRESS_METRICS.map((metric) => {
        const Icon = ICONS[metric];

        return (
          <div
            key={metric}
            className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card/60 px-1 py-2.5 text-center"
          >
            {/*
              The term comes before its value in the DOM, because that is what
              a `<dl>` group means and it is the order the block is read out in
              — "Focused, 3h 20m". The number is *shown* above the word by
              `order`, which is a paint concern and stays in the stylesheet.
            */}
            <Icon
              aria-hidden
              className="order-1 size-4 shrink-0 text-primary"
              strokeWidth={2}
            />
            <dt className="order-3 w-full truncate text-[0.6rem] leading-tight text-muted-foreground">
              {METRIC_COPY[metric].label}
            </dt>
            <dd className="order-2 text-sm font-semibold tabular-nums">
              {formatMetric(metric, progress[metric])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
