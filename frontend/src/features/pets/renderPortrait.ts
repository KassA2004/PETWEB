/**
 * A picture of a creature, for places that are not the room.
 *
 * The save dialog needs to show the pet being saved, the preset list needs a
 * thumbnail per entry, and every row in the social layer *is* somebody's
 * creature. None of them wants a live world: no physics, no animation, no
 * ticker — just the creature, standing still, as an image.
 *
 * ## One renderer for the whole product, not two
 *
 * This used to own a second offscreen `Application` of its own, beside the one
 * in `lib/preview.ts`, with its own cache and no de-duplication of work in
 * flight. Three things followed from that, and all three were visible:
 *
 * ```text
 *   a WebGL context per module   two of the browser's ~16, created lazily — so
 *                                the People and Messages tabs paid a context
 *                                init (~190 ms, measured) on the first row
 *                                they ever drew, which is exactly the delay
 *                                before an avatar appeared
 *   no in-flight map             a list where two rows show the same creature —
 *                                a conversation and a friend row, the same
 *                                person twice — built the rig twice
 *   its own cache, its own cap   64 entries, evicted independently of the 400
 *                                the rest of the interface shares
 * ```
 *
 * Delegating to `renderPreview` fixes all three at once and deletes the
 * duplicate infrastructure rather than tuning it. By the time anybody opens
 * People, the shared renderer has already been warmed by the room's own panels
 * (`features/dashboard/prefetch.ts`), so a portrait is a rig build and a
 * readback — never a context init.
 *
 * ## The key
 *
 * `renderPreview` is keyed by string, and what identifies a portrait is the
 * whole appearance. Serialising it is not free and the same object is asked
 * about repeatedly — a list re-rendering on a socket event, a slider being
 * dragged — so the string is computed once per appearance *object* and kept in
 * a `WeakMap`. Callers that build a fresh object every render get no benefit
 * from that and never did; the ones that matter (`PersonRow`, `usePetLibrary`)
 * already memoise theirs.
 */

import { Container } from 'pixi.js';
import { PetRenderer } from '../../assets/pets/PetRenderer';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { peekPreview, renderPreview } from '../../lib/preview';

/** How much of the frame the creature fills, leaving a margin around it. */
const FILL = 0.86;

/** One serialisation per appearance object, however often it is asked about. */
const keys = new WeakMap<PetAppearance, string>();

function cacheKey(appearance: PetAppearance): string {
  const known = keys.get(appearance);
  if (known !== undefined) return known;

  const key = JSON.stringify(appearance);
  keys.set(appearance, key);
  return key;
}

/**
 * Draw a creature and hand back a PNG data URL.
 *
 * The creature is scaled and centred from its own bounds rather than from its
 * proportions, so a pet with enormous ears is framed by what it actually
 * occupies instead of by how tall the rig thinks it is — which is what
 * `renderPreview` does by default, so there is nothing to say about it here.
 */
export function renderPetPortrait(
  appearance: PetAppearance,
  size = 220,
): Promise<string> {
  return renderPreview(
    `portrait:${cacheKey(appearance)}`,
    () => {
      const stage = new Container();
      const pet = new PetRenderer(appearance);
      stage.addChild(pet.root);
      return stage;
    },
    { size, fill: FILL },
  );
}

/**
 * The portrait, if it has already been drawn.
 *
 * Read during render by `PetPortrait`, so a creature the warm-up has already
 * finished appears in the first frame rather than after a skeleton. See
 * `peekPreview`.
 */
export function peekPetPortrait(
  appearance: PetAppearance,
  size = 220,
): string | null {
  return peekPreview(`portrait:${cacheKey(appearance)}`, { size, fill: FILL });
}

/**
 * Warm the renderer, and the creature somebody is about to see a lot of.
 *
 * Called when the social layer opens. The expensive parts of a portrait are the
 * WebGL context and the rig build, and both are cacheable — so the honest way
 * to make an avatar appear "immediately" is to have drawn it already, rather
 * than to put a nicer spinner in front of the moment it is drawn.
 *
 * Deliberately fire-and-forget and deliberately not awaited by anything: a
 * warm-up that a screen waits for is not a warm-up, it is a load.
 */
export function warmPetPortrait(appearance: PetAppearance, size: number): void {
  void renderPetPortrait(appearance, size).catch(() => {
    // A preview that fails to draw is a tile that stays a skeleton for a
    // moment longer. It is not worth a report and there is nothing to retry.
  });
}
