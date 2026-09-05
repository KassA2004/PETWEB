import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { peekPetPortrait, renderPetPortrait } from './renderPortrait';

interface PetPortraitProps {
  appearance: PetAppearance;
  /** Rendered size in CSS pixels. */
  size?: number;
  alt?: string;
  className?: string;
}

/**
 * A creature as a still image.
 *
 * Drawing is asynchronous (a shared offscreen renderer produces a data URL),
 * so the component holds the *previous* picture while a new one is drawn rather
 * than blanking. Otherwise dragging a slider with the save dialog open makes
 * the pet flicker in and out on every frame.
 */
export function PetPortrait({ appearance, size = 220, alt, className }: PetPortraitProps) {
  /*
   * Start from whatever has already been drawn.
   *
   * `renderPetPortrait` is asynchronous even when it is only reading its own
   * cache, so an effect-only version renders the placeholder first — every
   * time, however warm the cache is. In a friends list that is a column of grey
   * squares that become creatures a beat later, which is precisely the delay
   * the warm-up (`SocialLayer`) exists to have already removed. Reading the
   * cache during render is what lets that work show.
   */
  const cached = peekPetPortrait(appearance, size);

  /*
   * The one drawn *for this component*, kept only so a creature that had to be
   * drawn from scratch does not vanish on the next render. `cached` wins when
   * it exists, which also gives the "hold the previous picture" behaviour for
   * free: a new appearance with nothing in the cache falls through to whatever
   * was last drawn here rather than to a blank square.
   */
  const [drawn, setDrawn] = useState<string | null>(null);
  const src = cached ?? drawn;

  useEffect(() => {
    if (peekPetPortrait(appearance, size) !== null) return;

    let cancelled = false;

    void renderPetPortrait(appearance, size).then((url) => {
      if (!cancelled) setDrawn(url);
    });

    return () => {
      cancelled = true;
    };
  }, [appearance, size]);

  return (
    <div
      className={cn('flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? 'Your creature'}
          width={size}
          height={size}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="h-full w-full animate-pulse rounded-2xl bg-muted/40" aria-hidden />
      )}
    </div>
  );
}
