import { useEffect, useRef } from 'react';
import { PetRenderer } from '../../assets/pets/PetRenderer';
import { PetAnimationController } from '../../animation/PetAnimationController';
import { createDanceClip } from '../../animation/clips/Interactions';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { cn } from '../../lib/utils';
import { claimPetStage, ownsPetStage, releasePetStage, stageFor } from './petStage';

/**
 * The creature, dancing.
 *
 * A real one: a `PetRenderer` and the same `PetAnimationController` the room
 * runs, playing `createDanceClip()` — the clip that already existed for the
 * music box. Nothing here is a new animation, and nothing here is a sprite
 * sheet.
 *
 * ```text
 *   PetRenderer  ──→  PetAnimationController  ──→  play(danceClip)
 *                                  ↑
 *                      state 'play', emotion 'joy'
 * ```
 *
 * The single shared WebGL context, and why there is one, lives in
 * `petStage.ts` — the home page's hero borrows the same canvas.
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

    const token = claimPetStage();

    let disposed = false;
    let frameId: number | null = null;
    let pet: PetRenderer | null = null;

    const start = async () => {
      const app = await stageFor(token, size);
      // React 19 StrictMode mounts effects twice, and a second creature may
      // have claimed the canvas while this one was awaiting.
      if (disposed || !app) return;

      host.appendChild(app.canvas);

      pet = new PetRenderer(initial.current);
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

      app.stage.removeChildren();
      app.stage.addChild(pet.root);

      animation.setState('play');
      animation.setEmotion('joy', 1);
      animation.play(createDanceClip());

      let last = performance.now();

      const frame = (now: number) => {
        if (disposed || !ownsPetStage(token)) return;

        // Capped, so a backgrounded tab returning does not advance the clip by
        // however many seconds it was away in a single step.
        animation.update(Math.min(now - last, 100));
        last = now;
        app.render();

        frameId = requestAnimationFrame(frame);
      };

      // Pose and paint one frame immediately, so the creature is never a blank
      // square for the frame before the loop starts.
      animation.update(0);
      app.render();
      frameId = requestAnimationFrame(frame);
    };

    void start();

    return () => {
      disposed = true;

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }

      releasePetStage(token);

      pet?.destroy();
      pet = null;
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
