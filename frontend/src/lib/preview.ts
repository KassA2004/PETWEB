/**
 * Pictures of things, for the interface.
 *
 * The customizer needs to show what an ear *looks like*, not the word "Floppy".
 * The room panel needs to show the lamp. Both are already drawn, procedurally,
 * by code the world runs on — so the honest way to preview them is to draw them
 * with that same code and take a photograph, rather than to commission a set of
 * icons that will drift out of date the first time somebody changes a shape.
 *
 * ```text
 *   the real generator  ──→  a Container  ──→  this  ──→  a PNG data URL
 *   (createFloor, renderObject, PetRenderer, WallDecorSpec.draw …)
 * ```
 *
 * **One WebGL context for all of it.** A canvas per thumbnail hits the
 * browser's context limit at about sixteen and then starts silently losing the
 * oldest ones — which looks exactly like a rendering bug and is not one. Every
 * preview in the product goes through the single offscreen `Application` here.
 *
 * **Everything is cached by key.** Dragging a slider asks for the same forty
 * previews on every frame; without a cache that is forty rig builds per frame.
 * The cache is capped, because an afternoon in the editor would otherwise hold
 * on to thousands of base64 images.
 */

// Aliased: this module exports its own plain-data `Rectangle` (below), which is
// deliberately not Pixi's class — callers describe a region without constructing
// scene-graph types.
import { Application, Container, Rectangle as PixiRectangle } from 'pixi.js';

/** How much of the frame the subject fills, leaving a margin around it. */
const DEFAULT_FILL = 0.86;

/**
 * Pixel density of every extracted preview.
 *
 * Load-bearing, and it is the reason tiles are sharp. `extract` defaults to the
 * renderer's own resolution, which is fine — but the resolution has to be part
 * of the cache key as well, or a display change would serve a tile drawn for
 * the other density forever.
 */
const RESOLUTION = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2);

/**
 * Cap on the cache.
 *
 * Generous, because the customizer legitimately has a few hundred distinct
 * previews across its categories and thrashing them would defeat the point.
 * Each entry is a PNG of `size × RESOLUTION` square — on a 2× display a full
 * cache of 76px tiles is roughly four megabytes.
 */
const CACHE_LIMIT = 400;

let appPromise: Promise<Application> | null = null;
const cache = new Map<string, string>();
/** In-flight renders, so two callers asking at once do the work once. */
const pending = new Map<string, Promise<string>>();

async function getApp(): Promise<Application> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = new Application();
      await app.init({
        width: 256,
        height: 256,
        backgroundAlpha: 0,
        antialias: true,
        resolution: RESOLUTION,
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

function remember(key: string, url: string): void {
  if (cache.size >= CACHE_LIMIT) {
    // Oldest first — Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, url);
}

export interface PreviewOptions {
  /** Square pixel size of the resulting image. */
  size?: number;
  /** How much of it the subject fills. */
  fill?: number;
  /**
   * Frame on this rectangle instead of on the whole subject.
   *
   * The reason previews of ears are legible at all: drawn whole, a creature is
   * mostly body, and the part being chosen is a dozen pixels in the corner.
   * Naming the head's rectangle crops to it — the option is shown in context,
   * at a size where the choice is actually visible.
   *
   * A **rectangle**, deliberately, and not a child container to re-frame on.
   * Handing back a child would tempt a caller into reparenting it to measure a
   * group, which silently removes it from the thing being drawn: the preview
   * then renders a creature with no ears, framed perfectly on where the ears
   * would have been. Bounds are read-only; a rectangle cannot do that.
   *
   * In the subject's own coordinate space. Returning null frames on everything.
   */
  focus?: (subject: Container) => Rectangle | null;
}

/** A region to frame on, in the subject's coordinates. */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The union of several regions, or null if there are none. */
export function unionOf(parts: readonly Rectangle[]): Rectangle | null {
  if (parts.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const part of parts) {
    minX = Math.min(minX, part.x);
    minY = Math.min(minY, part.y);
    maxX = Math.max(maxX, part.x + part.width);
    maxY = Math.max(maxY, part.y + part.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Draw something once and hand back a PNG data URL.
 *
 * @param key   what this picture *is*. Two calls with the same key must produce
 *              the same image, because the second one will not be drawn.
 * @param build makes the thing. Called only on a cache miss, and the container
 *              it returns is destroyed afterwards.
 */
export async function renderPreview(
  key: string,
  build: () => Container,
  options: PreviewOptions = {},
): Promise<string> {
  const size = options.size ?? 96;
  const fill = options.fill ?? DEFAULT_FILL;
  const full = `${size}@${RESOLUTION}:${key}`;

  const hit = cache.get(full);
  if (hit) return hit;

  const already = pending.get(full);
  if (already) return already;

  const work = (async () => {
    const app = await getApp();

    const stage = new Container();
    const subject = build();
    stage.addChild(subject);

    // Framed from what it *occupies*, not from what it is nominally made of, so
    // a creature with enormous ears is fitted by its silhouette rather than by
    // how tall the rig thinks it is.
    const bounds = options.focus?.(subject) ?? subject.getLocalBounds();

    const scale = Math.min(
      (size * fill) / Math.max(1, bounds.width),
      (size * fill) / Math.max(1, bounds.height),
    );

    stage.scale.set(scale);
    stage.position.set(
      size / 2 - (bounds.x + bounds.width / 2) * scale,
      size / 2 - (bounds.y + bounds.height / 2) * scale,
    );

    app.stage.removeChildren();
    app.stage.addChild(stage);

    /*
     * Extracted through an explicit frame, and that is the whole ballgame.
     *
     * `extract.base64(container)` re-renders the container into a *new* texture
     * sized to its own content bounds — it does not read back the framebuffer
     * the lines above so carefully composed. Called that way, the framing
     * rectangle survives only as a scale factor: the crop never happens, the
     * requested `size` is ignored, and the PNG comes out at whatever the
     * subject happens to occupy. Measured, before this: a 100×200 subject asked
     * for at 76px returned 32×65, and a 50×50 focus window on a 400×400 subject
     * returned 522×522 — the whole subject, scaled *up*, with nothing cropped.
     *
     * Naming the frame is what makes the output the square that was asked for,
     * at the density the display needs, with everything outside it cut away.
     */
    const url = await app.renderer.extract.base64({
      target: app.stage,
      frame: new PixiRectangle(0, 0, size, size),
      resolution: RESOLUTION,
    });

    app.stage.removeChildren();
    stage.destroy({ children: true });

    remember(full, url);
    return url;
  })().finally(() => {
    // Cleared however this settled. Left behind on a rejection, the failed
    // promise would be handed to every future caller of this key forever —
    // one transient failure permanently blanking a tile.
    pending.delete(full);
  });

  pending.set(full, work);
  return work;
}

/** Drop the offscreen renderer. Called when the app tears down. */
export function disposePreviewRenderer(): void {
  const app = appPromise;
  appPromise = null;
  cache.clear();
  pending.clear();
  void app?.then((instance) => instance.destroy(true, { children: true }));
}
