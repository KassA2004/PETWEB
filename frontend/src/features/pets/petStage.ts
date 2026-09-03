import { Application } from 'pixi.js';

/**
 * The one canvas a living creature outside the room is drawn on.
 *
 * Two places in the product show a creature that *moves* without being the
 * room: the loading screen's dancer (`DancingPet`) and the home page's hero
 * (`features/home/CreatureStage`). Both need a WebGL context, and a context per
 * component is not an option — the browser caps them at about sixteen and then
 * silently drops the oldest, and the oldest is the room, which goes blank. So
 * there is exactly one `Application` here and every live creature borrows it.
 *
 * **Borrowed by moving its canvas, not by copying its pixels.** The obvious way
 * to share one renderer is to keep it offscreen and `drawImage` it into a
 * visible 2D canvas each frame. That works, and it costs a full GPU→CPU→GPU
 * round trip every frame plus `preserveDrawingBuffer`, which switches off the
 * driver's normal back-buffer handling: measured at 1.52 ms/frame against
 * 0.74 ms for drawing straight to the canvas. Adopting the canvas into the DOM
 * gets the single context *and* the direct draw.
 *
 * **One creature at a time**, enforced by the token. Two mounts cannot share
 * one stage — each frame clears it — so the newest mount takes the canvas and
 * any older one stops driving it rather than the two fighting frame by frame.
 * A token is compared by identity, so a component that was superseded while it
 * was `await`ing knows to stand down.
 *
 * ```text
 *   claim()  ──→  token  ──→  stageFor(token, size)  ──→  Application | null
 *                                                            ↑ null: superseded
 *   release(token)  puts the canvas back and empties the stage
 * ```
 */

let appPromise: Promise<Application> | null = null;

/** Which mount currently owns the shared canvas. */
let owner: symbol | null = null;

function getSharedApp(): Promise<Application> {
  if (!appPromise) {
    appPromise = (async () => {
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
        // Driven by each borrower's own frame loop, not Pixi's global ticker:
        // the shared app outlives every mount and must not animate between them.
        autoStart: false,
      });
      app.ticker.stop();
      return app;
    })();
  }

  return appPromise;
}

/** Take the stage. Whoever had it stops drawing on their next frame. */
export function claimPetStage(): symbol {
  const token = Symbol('pet-stage');
  owner = token;
  return token;
}

/** Whether this token is still the owner — checked once per frame. */
export function ownsPetStage(token: symbol): boolean {
  return owner === token;
}

/**
 * The renderer, sized, if this token still owns it.
 *
 * Returns null when a later mount claimed the stage while this one was waiting
 * for `init` — which React 19's StrictMode makes routine rather than rare.
 */
export async function stageFor(token: symbol, size: number): Promise<Application | null> {
  const app = await getSharedApp();
  if (owner !== token) return null;

  app.renderer.resize(size, size);
  return app;
}

/** Give the stage back, and leave it empty rather than holding a destroyed rig. */
export function releasePetStage(token: symbol): void {
  if (owner !== token) return;

  owner = null;
  void appPromise?.then((app) => {
    if (owner === null) app.stage.removeChildren();
  });
}
