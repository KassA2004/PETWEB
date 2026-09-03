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
        /*
          `overflow-clip`, and it is not decoration — it is the fix for a
          horizontal scrollbar that ran the length of the whole tools column.
 
          The rail below is `absolute inset-0` pushed along by `translateX`, so
          at 50% affection a full-width invisible box hangs 200 points off the
          right-hand edge of the track. Nothing between it and the tools
          scroller clipped, so the scroller grew to fit it: measured on this
          panel, `scrollWidth` 604 against a `clientWidth` of 405, and a
          scrollbar under every panel in the column as a result.
 
          `clip` rather than `hidden` because `hidden` would make this a scroll
          container of its own, and rather than `contain: paint` because the
          marker is *supposed* to overhang — it is 16px across on a 10px track
          and sits centred on both ends of the scale. `overflow-clip-margin`
          keeps that overhang and throws away everything past it.
        */
        className="relative h-2.5 w-full overflow-clip rounded-full bg-muted [overflow-clip-margin:0.625rem]"
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

        {/*
          The marker rides a full-width rail rather than being positioned by
          `left`, and the indirection is the whole point.

          `left: 74%` is a layout property: animating it relayouts the bar and
          everything beside it on every frame of the seven hundred milliseconds
          it takes. A percentage `translateX` resolves against the *element's
          own* width, so a rail stretched across the whole track can be pushed
          along by exactly that fraction of the track — the same arithmetic,
          done by the compositor.

          Long, because affection moves in hundredths and a marker that snapped
          would make a gradual change look like a glitch.
        */}
        <span
          aria-hidden
          style={{ transform: `translateX(${percent}%)` }}
          className="pointer-events-none absolute inset-0 transition-transform duration-700 ease-out motion-reduce:transition-none"
        >
          <span className="absolute top-1/2 left-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow" />
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {affectionLine(petName, affection.level)}
      </p>
    </div>
  );
}
