import { cn } from '../../lib/utils';
import type { Affection } from './api';
import { affectionLine } from './affection-words';

/**
 * How the creature feels about you, as one bar.
 *
 * It sits in the pet panel, among the things that describe the creature, rather
 * than in a dashboard of its own — because that is what it is. The endpoints
 * are written as the creature's two moods rather than as numbers, which keeps
 * the reading qualitative:
 *
 * ```text
 *   Blorb is upset  ├────────────●───────┤  Blorb is proud
 * ```
 *
 * **No percentage, and no delta.** Not squeamishness — a visible score is what
 * turns following through into farming it, and the product has spent a lot of
 * effort making the creature's *behaviour* the real indicator. This is a
 * caption for that behaviour, so somebody who signs in to a creature keeping
 * its distance can tell it is about something.
 *
 * The one place a number does appear is the moment a goal is finished
 * (`CelebrationDialog`), where it is an event rather than a standing readout.
 */

interface AffectionMeterProps {
  petName: string;
  affection: Affection;
  className?: string;
}

export function AffectionMeter({ petName, affection, className }: AffectionMeterProps) {
  const percent = Math.round(Math.max(0, Math.min(1, affection.value)) * 100);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-2 text-[0.65rem]">
        <span className="text-muted-foreground">{petName} is upset</span>
        <span className="text-muted-foreground">{petName} is proud</span>
      </div>

      <div
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        // Read out as words, because words are what is on screen. A screen
        // reader announcing "74 percent" would be showing the number the
        // interface deliberately does not.
        aria-valuetext={affectionLine(petName, affection.level)}
        aria-label={`How ${petName} feels about you`}
        className="relative h-2.5 w-full rounded-full bg-muted"
      >
        {/*
          A gradient across the whole track rather than a fill that changes
          colour, so the bar reads as one continuous scale with two ends — the
          creature moves along it instead of filling it up. A filling bar is a
          progress bar, and this is not progress toward anything.
        */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              'linear-gradient(to right, var(--color-muted-foreground) 0%, var(--color-secondary) 45%, var(--color-primary) 100%)',
          }}
        />

        <span
          aria-hidden
          style={{ left: `${percent}%` }}
          className={cn(
            'absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow',
            // Long, because affection moves in hundredths and a marker that
            // snapped would make a gradual change look like a glitch.
            'transition-[left] duration-700 ease-out',
          )}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {affectionLine(petName, affection.level)}
      </p>
    </div>
  );
}
