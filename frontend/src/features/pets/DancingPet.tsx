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
 * **One WebGL context, shared.** An `Application` per mount hits the browser's
 * context limit at about sixteen, at which point it starts silently dropping
 * the oldest — and the oldest is the *room*, which goes blank. So there is
 * exactly one Application here and every dancer borrows it.
 *
 * **Borrowed by moving its canvas, not by copying its pixels.** The obvious way
 * to share one renderer is to keep it offscreen and `drawImage` it into a
 * visible 2D canvas each frame. That works, and it costs a full GPU→CPU→GPU
 * round trip every frame plus `preserveDrawingBuffer`, which switches off the
 * driver's normal back-buffer handling: measured at 1.52ms/frame against
 * 0.74ms for drawing straight to the canvas. It is the wrong trade at any time
 * and a bad one during a page load, which is when `WorldLoader` mounts one of
 * these. Adopting the canvas into the DOM gets the single context *and* the
 * direct draw.
 *
 * **One dancer at a time**, enforced by `owner`. Two mounts cannot share one
 * stage — each frame clears it — so the newest mount takes the canvas and any
 * older one stops driving it rather than the two fighting frame by frame.
 */

interface DancingPetProps {
  appearance: PetAppearance;
  size?: number;
  className?: string;
}

let sharedAppPromise: Promise<Application> | null = null;

/** Which mount currently owns the shared canvas. */
let owner: symbol | null = null;

function getSharedApp(): Promise<Application> {
  if (!sharedAppPromise) {
    sharedAppPromise = (async () => {
      const app = new Application();
      await app.init({
        width: 160,
        height: 160,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        // The canvas is displayed, so it gets CSS dimensions to match its
        // backing store — without this it renders at 2× and is drawn at 1×.
        autoDensity: true,
        // Driven by this component's own frame loop, not Pixi's global ticker:
        // the shared app outlives every mount and must not animate between them.
        autoStart: false,
      });
      app.ticker.stop();
      return app;
    })();
  }

  return sharedAppPromise;
}

export function DancingPet({ appearance, size = 160, className }: DancingPetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Only the value it is built with; the dialog is keyed, so it never changes. */
  const initial = useRef(appearance);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const token = Symbol('dancer');
    owner = token;

    let disposed = false;
    let frameId: number | null = null;
    let pet: PetRenderer | null = null;

    const start = async () => {
      const app = await getSharedApp();
      // React 19 StrictMode mounts effects twice, and a second dancer may have
      // claimed the canvas while this one was awaiting.
      if (disposed || owner !== token) return;

      app.renderer.resize(size, size);
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
        if (disposed || owner !== token) return;

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

      if (owner === token) {
        owner = null;
        // Leave the shared stage empty rather than holding a destroyed rig.
        void sharedAppPromise?.then((app) => {
          if (owner === null) app.stage.removeChildren();
        });
      }

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
