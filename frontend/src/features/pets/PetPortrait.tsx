import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { renderPetPortrait } from './renderPortrait';

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
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void renderPetPortrait(appearance, size).then((url) => {
      if (!cancelled) setSrc(url);
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
