import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { PetRenderer } from '../../assets/pets/PetRenderer';
import { PetAnimationController } from '../../animation/PetAnimationController';
import { createDanceClip } from '../../animation/clips/Interactions';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { cn } from '../../lib/utils';

/**
 * The creature, dancing.
 *
 * A real one: its own small `Application`, a `PetRenderer` and the same
 * `PetAnimationController` the room runs, playing `createDanceClip()` — the
 * clip that already existed for the music box. Nothing here is a new animation,
 * and nothing here is a sprite sheet.
 *
 * ```text
 *   PetRenderer  ──→  PetAnimationController  ──→  play(danceClip)
 *                                  ↑
 *                      state 'play', emotion 'joy'
 * ```
 *
 * **A separate Application, not the room's.** The room is a persistent world
 * with physics and a creature that has opinions; borrowing it would mean
 * interrupting whatever the creature was doing and putting it back afterwards.
 * This is a picture that dances for two seconds and is then thrown away, and it
 * is cheaper to own than to borrow.
 *
 * **Torn down on unmount, unconditionally.** A WebGL context left running
 * behind a closed dialog is the leak that only shows up after the eleventh
 * goal, when the browser starts dropping the oldest contexts and the *room*
 * goes blank.
 */

interface DancingPetProps {
  appearance: PetAppearance;
  size?: number;
  className?: string;
}

export function DancingPet({ appearance, size = 160, className }: DancingPetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Only the value it is built with; the dialog is keyed, so it never changes. */
  const initial = useRef(appearance);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;

    const start = async () => {
      const instance = new Application();
      await instance.init({
        width: size,
        height: size,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });

      // React 19 StrictMode mounts effects twice; bail if we lost the race.
      if (disposed) {
        instance.destroy(true);
        return;
      }

      app = instance;
      host.appendChild(instance.canvas);

      const pet = new PetRenderer(initial.current);
      const animation = new PetAnimationController(pet.rig);

      // Fitted from what it occupies rather than from its proportions, so a
      // creature with enormous ears is framed by its silhouette.
      const bounds = pet.root.getLocalBounds();
      const scale = Math.min(
        (size * 0.72) / Math.max(1, bounds.width),
        (size * 0.72) / Math.max(1, bounds.height),
      );

      pet.root.scale.set(scale);
      pet.root.position.set(
        size / 2 - (bounds.x + bounds.width / 2) * scale,
        // Low in the frame: it bounces upward, and a creature centred here
        // would spend the dance leaving the top of the picture.
        size * 0.62 - (bounds.y + bounds.height / 2) * scale,
      );

      instance.stage.addChild(pet.root);

      animation.setState('play');
      animation.setEmotion('joy', 1);
      animation.play(createDanceClip());

      instance.ticker.add((ticker) => {
        animation.update(ticker.deltaMS);
      });
    };

    void start();

    return () => {
      disposed = true;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, [size]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      style={{ width: size, height: size }}
      className={cn('mx-auto', className)}
    />
  );
}
