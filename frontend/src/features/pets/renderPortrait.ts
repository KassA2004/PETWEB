/**
 * A picture of a creature, for places that are not the room.
 *
 * The save dialog needs to show the pet being saved, and the preset list needs
 * a thumbnail per entry. Neither wants a live world: no physics, no animation,
 * no ticker — just the creature, standing still, as an image.
 *
 * One renderer serves all of them. A WebGL context per thumbnail would hit the
 * browser's context limit at about sixteen presets and start silently losing
 * the oldest, so every portrait is drawn by the same offscreen Application and
 * extracted to a data URL. The URLs are cached by appearance, because the
 * expensive part is building the rig and the same creature is asked for
 * repeatedly while a dialog is open.
 */

import { Application, Container } from 'pixi.js';
import { PetRenderer } from '../../assets/pets/PetRenderer';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';

/** How much of the frame the creature fills, leaving a margin around it. */
const FILL = 0.86;

let appPromise: Promise<Application> | null = null;

const cache = new Map<string, string>();

/**
 * Cap on the cache.
 *
 * Portraits are keyed by the full appearance, so dragging a slider generates a
 * new one per frame. Without a cap an afternoon in the editor would hold on to
 * thousands of base64 images.
 */
const CACHE_LIMIT = 64;

async function getApp(): Promise<Application> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = new Application();
      await app.init({
        width: 256,
        height: 256,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: false,
        // Nothing here animates; rendering happens on demand.
        autoStart: false,
      });
      app.ticker.stop();
      return app;
    })();
  }

  return appPromise;
}

function cacheKey(appearance: PetAppearance, size: number): string {
  return `${size}:${JSON.stringify(appearance)}`;
}

function remember(key: string, url: string): void {
  if (cache.size >= CACHE_LIMIT) {
    // Oldest first — Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, url);
}

/**
 * Draw a creature and hand back a PNG data URL.
 *
 * The creature is scaled and centred from its own bounds rather than from its
 * proportions, so a pet with enormous ears is framed by what it actually
 * occupies instead of by how tall the rig thinks it is.
 */
export async function renderPetPortrait(
  appearance: PetAppearance,
  size = 220,
): Promise<string> {
  const key = cacheKey(appearance, size);
  const hit = cache.get(key);
  if (hit) return hit;

  const app = await getApp();

  // A second caller may have finished while we were awaiting the app.
  const raced = cache.get(key);
  if (raced) return raced;

  app.renderer.resize(size, size);

  const stage = new Container();
  const pet = new PetRenderer(appearance);
  stage.addChild(pet.root);

  const bounds = pet.root.getLocalBounds();
  const scale = Math.min(
    (size * FILL) / Math.max(1, bounds.width),
    (size * FILL) / Math.max(1, bounds.height),
  );

  pet.root.scale.set(scale);
  pet.root.position.set(
    size / 2 - (bounds.x + bounds.width / 2) * scale,
    size / 2 - (bounds.y + bounds.height / 2) * scale,
  );

  app.stage.removeChildren();
  app.stage.addChild(stage);
  app.render();

  const url = await app.renderer.extract.base64(app.stage);

  app.stage.removeChildren();
  stage.destroy({ children: true });

  remember(key, url);
  return url;
}

/** Drop the offscreen renderer. Called when the app tears down. */
export function disposePortraitRenderer(): void {
  const pending = appPromise;
  appPromise = null;
  cache.clear();
  void pending?.then((app) => app.destroy(true, { children: true }));
}
