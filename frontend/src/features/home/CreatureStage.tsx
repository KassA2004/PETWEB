import { useEffect, useRef } from 'react';
import { PetRenderer } from '../../assets/pets/PetRenderer';
import { PetAnimationController } from '../../animation/PetAnimationController';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { HomeCreature } from './creatures';
import { appearanceFor } from './heroCreatures';
import { usePrefersReducedMotion } from './reveal';
import {
  claimPetStage,
  ownsPetStage,
  releasePetStage,
  stageFor,
} from '../pets/petStage';
import { cn } from '../../lib/utils';

/**
 * The creature on the home page, awake.
 *
 * This is the one thing on the page that has to carry the whole idea before
 * anybody reads a word: something lives here, and it knows you are there. So it
 * is not a picture and not a video — it is the product's own `PetRenderer` and
 * `PetAnimationController`, in the same `idle` state the room runs, doing two
 * things a static image cannot:
 *
 * ```text
 *   you move the pointer   ──→  setLookTarget   the creature watches you
 *   you tap it             ──→  'discover'      it notices, and is pleased
 * ```
 *
 * Both are the real systems. `lookTarget` is the same input the room feeds from
 * the creature's own attention (`PetRoom`'s `intent.lookAt`), and `discover` is
 * a state the animation controller already had. Nothing here is a home-page
 * animation, which is the point: what a visitor sees is what they get.
 *
 * **Its cost is deliberately not on the load path.** PixiJS is about two thirds
 * of this application's bundle and the signed-out page is the one page that is
 * supposed to be small, so this component is behind a `lazy` boundary that the
 * home page only opens once it has painted (`HomeStage.tsx`). Until then the
 * hero holds the exact box this will fill.
 *
 * **Under `prefers-reduced-motion` it stops idling.** The creature is still
 * here, still drawn by the real renderer, still watching the pointer and still
 * pleased to be poked — but it does not breathe on its own, because a small
 * thing moving forever at the top of a page is exactly what somebody who turned
 * that setting on asked not to have. The frame loop is not started at all
 * rather than run and discarded: one pose, one render.
 *
 * The WebGL context is shared with the loading screen's dancer — see
 * `features/pets/petStage.ts` for why there is exactly one.
 */

interface CreatureStageProps {
  /** Which of the home page's creatures to show. Resolved here, not above. */
  creature: HomeCreature;
  /** Square size in CSS pixels. */
  size: number;
  className?: string;
}

/** How long a poke keeps the creature's attention before it settles again. */
const NOTICE_MS = 2600;

export function CreatureStage({ creature, size, className }: CreatureStageProps) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const appearance = appearanceFor(creature);
  const reduced = usePrefersReducedMotion();

  /**
   * Read inside the frame loop rather than closed over, so turning the setting
   * on while the page is open stops the creature on the next frame instead of
   * on the next reload.
   */
  const still = useRef(reduced);

  /**
   * The creature the stage should be showing.
   *
   * Read by `start()` rather than closed over, so a visitor who presses "Bee"
   * while the renderer is still initialising gets a bee rather than the default
   * creature and a swap that arrived before anything could receive it.
   */
  const desired = useRef(appearance);

  /*
   * The appearance, through a ref.
   *
   * The rig is expensive to build and the effect must not rebuild the whole
   * stage when a visitor tries a different creature — so the effect depends on
   * `size` only, and a separate effect swaps the rig in place.
   */
  const swap = useRef<((next: PetAppearance) => void) | null>(null);
  const poke = useRef<(() => void) | null>(null);
  const look = useRef<((x: number, y: number) => void) | null>(null);
  const resume = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const token = claimPetStage();

    let disposed = false;
    let frameId: number | null = null;
    let pet: PetRenderer | null = null;
    let animation: PetAnimationController | null = null;
    let noticeUntil = 0;

    /** Place and scale a freshly built rig into the square. */
    const fit = (rig: PetRenderer) => {
      const bounds = rig.root.getLocalBounds();
      const scale = Math.min(
        (size * 0.78) / Math.max(1, bounds.width),
        (size * 0.78) / Math.max(1, bounds.height),
      );

      rig.root.scale.set(scale);
      rig.root.position.set(
        size / 2 - (bounds.x + bounds.width / 2) * scale,
        // A little low, because it hops: a creature centred here spends its
        // liveliest moments leaving the top of the picture.
        size * 0.58 - (bounds.y + bounds.height / 2) * scale,
      );
    };

    const start = async () => {
      const app = await stageFor(token, size);
      if (disposed || !app) return;

      host.appendChild(app.canvas);

      pet = new PetRenderer(desired.current);
      animation = new PetAnimationController(pet.rig);
      fit(pet);

      app.stage.removeChildren();
      app.stage.addChild(pet.root);

      animation.setState('idle');
      animation.setEmotion('neutral', 0);

      swap.current = (next) => {
        if (!animation || !app) return;

        const replacement = new PetRenderer(next);
        fit(replacement);

        app.stage.removeChildren();
        app.stage.addChild(replacement.root);

        pet?.destroy();
        pet = replacement;

        // A new rig needs a new controller: the old one is bound to joints
        // that no longer exist.
        animation = new PetAnimationController(replacement.rig);
        animation.setState('discover');
        animation.setEmotion('excited', 0.8);
        noticeUntil = performance.now() + NOTICE_MS;
      };

      poke.current = () => {
        if (!animation) return;
        animation.setState('discover');
        animation.setEmotion('joy', 1);
        noticeUntil = performance.now() + NOTICE_MS;
        // A reaction the visitor asked for is motion they asked for, so it
        // plays even under reduced motion — and then settles again.
        run();
      };

      look.current = (x, y) => {
        if (!pet || !animation) return;
        // Into the creature's own space, which is what `lookTarget` is measured
        // in — the same conversion the room does with `intent.lookAt`.
        const local = pet.root.toLocal({ x, y });
        animation.setLookTarget({ x: local.x, y: local.y });
        // Following a pointer is a response, not an idle: it may run.
        run();
      };

      let last = performance.now();

      const frame = (now: number) => {
        if (disposed || !ownsPetStage(token)) return;

        if (noticeUntil && now > noticeUntil) {
          noticeUntil = 0;
          animation?.setState('idle');
          animation?.setEmotion('neutral', 0, 0.25);
        }

        // Capped, so a tab returning from the background does not advance the
        // animation by however many seconds it was away in one step.
        animation?.update(Math.min(now - last, 100));
        last = now;
        app.render();

        // Still motion: settle into the pose and stop, rather than running a
        // loop whose output nobody wants to see move.
        if (still.current && !noticeUntil) {
          frameId = null;
          return;
        }

        frameId = requestAnimationFrame(frame);
      };

      const run = () => {
        if (disposed || frameId !== null) return;
        last = performance.now();
        frameId = requestAnimationFrame(frame);
      };

      resume.current = run;

      animation.update(0);
      app.render();
      if (!still.current) run();
    };

    void start();

    return () => {
      disposed = true;
      swap.current = null;
      poke.current = null;
      look.current = null;
      resume.current = null;

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }

      releasePetStage(token);
      pet?.destroy();
      pet = null;
      animation = null;
    };
    // Only `size` — the creature is read from `desired` and swapped in place,
    // so trying a different one does not tear the stage down and rebuild it.
  }, [size]);

  useEffect(() => {
    desired.current = appearance;
    swap.current?.(appearance);
  }, [appearance]);

  useEffect(() => {
    still.current = reduced;
    // Coming *out* of reduced motion has to restart the loop, which stopped
    // itself; a poke does the same thing and is the other way back in.
    if (!reduced) resume.current?.();
  }, [reduced]);

  return (
    /*
     * A real `<button>`, not a div with a role.
     *
     * It does something when you press it, so it is reachable by Tab, answers
     * to Enter and Space, and is announced as a control — none of which needs a
     * keydown handler of its own. The canvas is adopted into it as a child.
     */
    <button
      ref={hostRef}
      type="button"
      aria-label="Say hello to the creature"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        look.current?.(event.clientX - box.left, event.clientY - box.top);
      }}
      onPointerLeave={() => look.current?.(size / 2, size * 0.4)}
      onClick={() => poke.current?.()}
      style={{ width: size, height: size }}
      className={cn(
        'cursor-pointer rounded-full border-0 bg-transparent p-0 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background',
        className,
      )}
    />
  );
}
