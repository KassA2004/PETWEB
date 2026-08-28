import { DancingPet } from '../pets/DancingPet';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { cn } from '../../lib/utils';

interface WorldLoaderProps {
  appearance: PetAppearance;
  /** 0..1. */
  progress: number;
  /** Drives the fade-out; the element stays mounted through it. */
  leaving: boolean;
  petName: string;
}

/** Ring geometry. One source of truth so the dash maths cannot drift. */
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The room, assembling.
 *
 * Inside the habitat frame only — the tools beside it are usable from the
 * first paint, and covering them would make the product feel slower than it
 * is while claiming to make it feel faster.
 *
 * The creature is the loading animation, which is the one thing this product
 * has that a spinner does not. The ring around it is the progress: an arc
 * closing on itself reads as "this is being built" where a filling bar reads
 * as "this is being downloaded", and the second one is a lie about what is
 * happening (`useWorldProgress` — the phases are render work, not bytes).
 */
export function WorldLoader({ appearance, progress, leaving, petName }: WorldLoaderProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      role="status"
      aria-busy={!leaving}
      aria-label={`Waking ${petName} up`}
      className={cn(
        'absolute inset-0 z-10 grid place-items-center rounded-xl',
        // An opaque-enough veil rather than a backdrop filter. `backdrop-blur`
        // over a live WebGL canvas makes the compositor re-snapshot and blur
        // the canvas every frame, and the only moment this element is on screen
        // is the one moment that canvas is busiest — building the world.
        'bg-card/95',
        'transition-opacity duration-200 ease-out',
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
    >
      <div className="relative grid place-items-center">
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="petweb-loader-ring absolute size-[132px] -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-border"
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-primary transition-[stroke-dashoffset] duration-300 ease-out"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          />
        </svg>

        <div className="petweb-loader-bob">
          <DancingPet appearance={appearance} size={96} />
        </div>
      </div>

      <p className="absolute bottom-6 text-xs text-muted-foreground">
        {clamped < 0.99 ? `Waking ${petName} up…` : 'Almost there…'}
      </p>
    </div>
  );
}
