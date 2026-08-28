import { Container } from 'pixi.js';
import { PetRenderer } from '../../assets/pets/PetRenderer';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { JointName } from '../../assets/pets/anatomy/joints';
import { renderPreview, unionOf } from '../../lib/preview';
import type { Rectangle } from '../../lib/preview';

/**
 * What each option looks like, worn by the same creature every time.
 *
 * The rule this exists to satisfy: a customization option is shown as the thing
 * it makes, never as the words "Ears Type 2". The implementation follows from
 * one decision — a preview is one fixed creature with a single field swapped,
 * drawn by `PetRenderer`, the same class the room runs on. There is no icon set
 * to keep in sync, because there are no icons.
 *
 * ```text
 *   the default creature  +  { earType: 'floppy' }  ──→  PetRenderer  ──→  crop
 *                                                                      to head
 * ```
 *
 * **The base is fixed, not the user's own pet.** Previewing on the live
 * appearance is the more charming idea and it was the expensive one: the cache
 * key moved on every slider frame, so a drag rebuilt every visible tile's rig,
 * and no tile could ever be shared between two states of the same session. A
 * catalogue tile answers "what is this item", which is the same answer for
 * everybody — so the picture can be drawn once and kept. Where the user's own
 * creature genuinely is the subject, it is still drawn live: the room, and the
 * saved-preset portraits in `PetLibraryPanel`.
 *
 * **Cropping is what makes it legible.** Drawn whole, a creature is mostly
 * body: two ear options differ by a dozen pixels in a 76-pixel tile, which is
 * indistinguishable from a rendering bug. Each category names the joints its
 * choice actually shows up in, and the preview frames on those — so an ear
 * option is a picture of ears, and still unmistakably *this* creature rather
 * than a diagram of an ear.
 *
 * **The base is calmed, not copied wholesale.** Wonk and tilt are pulled toward
 * their middles for the preview only. Otherwise a creature cranked to maximum
 * asymmetry produces twelve tiles that differ more from each other by rotation
 * than by the thing being chosen.
 */

/**
 * The one creature every option tile is drawn on.
 *
 * A module constant on purpose. Because it never changes, every tile's cache
 * key is stable for the whole session no matter what the user does to their own
 * pet, which is what makes prewarming worth doing at all
 * (`features/dashboard/prefetch.ts`).
 */
export const PREVIEW_BASE: PetAppearance = createPetAppearance();

/** Which part of the creature a category's choice actually shows up in. */
export type PreviewFocus =
  | 'whole'
  | 'head'
  | 'ears'
  | 'face'
  | 'feet'
  | 'tail'
  | 'topper'
  | 'wings';

/**
 * The joints each focus frames on.
 *
 * Several of them include `face` on purpose: two ears with nothing between them
 * float in the tile, and a mouth shown without the eyes above it is an anatomy
 * plate rather than a creature.
 */
const FOCUS_JOINTS: Record<Exclude<PreviewFocus, 'whole' | 'feet'>, readonly JointName[]> =
  {
    head: ['face', 'earLeft', 'earRight', 'topper'],
    ears: ['earLeft', 'earRight', 'face'],
    face: ['face'],
    tail: ['tail', 'body'],
    topper: ['topper', 'face'],
    wings: ['wingLeft', 'wingRight', 'body'],
  };

/**
 * How much room to leave around the part, as a multiple of its own size.
 *
 * Expressed as padding rather than as "how much of the tile the subject fills",
 * and the difference is not cosmetic — it is the bug this replaced. `fill` runs
 * backwards from intuition: a *smaller* fill makes the visible window *bigger*,
 * so dialling the face down to 0.64 to "give it air" opened the window to 294
 * creature-units against a creature 268 tall, and every face option rendered as
 * an uncropped whole creature. The tiles looked plausible, which is why it took
 * a contact sheet to see.
 *
 * Padding cannot invert like that: 1.15 means "the face, plus fifteen per cent
 * around it", and that is true whatever the creature's proportions are.
 */
const FOCUS_PAD: Record<PreviewFocus, number> = {
  // Already the whole creature; the padding is just the margin in the tile.
  whole: 1.1,
  head: 1.12,
  ears: 1.1,
  face: 1.16,
  feet: 1.14,
  tail: 1.05,
  topper: 1.08,
  wings: 1.04,
};

/**
 * How much of the tile the framed region fills.
 *
 * One number for every category now, because the framing decision has moved
 * into the padding above. Keeping it constant is what makes the tiles read as a
 * set: the same subject at the same scale in every grid in the panel.
 */
const TILE_FILL = 0.94;

function neutralise(appearance: PetAppearance): PetAppearance {
  return createPetAppearance({
    ...appearance,
    asymmetry: Math.min(appearance.asymmetry, 0.25),
    earTilt: 0,
    // A creature squashed to a pancake previews every option as a pancake.
    bodyWidth: (appearance.bodyWidth + 1) / 2,
    bodyHeight: (appearance.bodyHeight + 1) / 2,
  });
}

/**
 * Where to crop, measured rather than reparented.
 *
 * `getBounds` is read-only, which is the whole reason this returns rectangles:
 * an earlier version grouped the joints into a fresh container to measure them
 * together, which removed them from the creature being drawn. The preview came
 * out as an earless creature, framed perfectly on where its ears used to be.
 */
function regionFor(subject: Container, focus: PreviewFocus): Rectangle | null {
  const whole = subject.getLocalBounds();

  if (focus === 'whole') return padded(squared(whole), FOCUS_PAD.whole);

  if (focus === 'feet') {
    // Feet are drawn into the bottom of the silhouette rather than hung off it
    // (`Docs/pet-anatomy.md` §11.5), so there is no joint to frame on. The
    // bottom of the body is where they are — and narrowed as well as shortened,
    // because a band the full width of the creature squares off to the
    // creature's whole height and crops nothing at all.
    return padded(
      squared({
        x: whole.x + whole.width * 0.15,
        y: whole.y + whole.height * 0.58,
        width: whole.width * 0.7,
        height: whole.height * 0.42,
      }),
      FOCUS_PAD.feet,
    );
  }

  const regions: Rectangle[] = [];

  for (const name of FOCUS_JOINTS[focus]) {
    const joint = subject.getChildByLabel(name, true);
    if (!joint) continue;

    // Into the subject's own space, because that is what the framing maths
    // above works in — a joint's local bounds are relative to the joint.
    const box = joint.getBounds();
    const topLeft = subject.toLocal({ x: box.x, y: box.y });
    const bottomRight = subject.toLocal({ x: box.x + box.width, y: box.y + box.height });

    regions.push({
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    });
  }

  // A creature with no wings has no wing bounds worth framing on; showing the
  // whole thing is the honest answer, and it is what "none" should look like.
  const union = unionOf(regions);
  const region = union && union.width > 1 && union.height > 1 ? union : whole;

  return padded(atLeast(squared(region), whole, focus), FOCUS_PAD[focus]);
}

/**
 * The smallest a framed region may be, as a fraction of the whole creature.
 *
 * A floor on the zoom, and it is what makes a grid read as one set. The region
 * is measured from the joints an option touches, so it is sized by *the option*
 * — which means the zoom changes from tile to tile by exactly the amount the
 * choice changes the anatomy. Eyes are the extreme case: the face joint is 51
 * units tall with beady eyes and 114 with saucer eyes, so without a floor the
 * beady tile is framed twice as tight as its neighbour and shows mostly cheek.
 *
 * `face` therefore has a high floor — every eye option is framed on the head at
 * one scale, and the eyes are the thing that differs, which is the entire point
 * of the grid. The rest sit low enough to keep their crops tight, because an
 * ear option framed on the whole creature is the problem cropping exists to
 * solve.
 */
const FOCUS_MIN: Record<PreviewFocus, number> = {
  whole: 0,
  head: 0.5,
  ears: 0.45,
  face: 0.7,
  feet: 0.4,
  tail: 0.4,
  topper: 0.45,
  wings: 0.4,
};

/** Grow a square region about its centre until it is not absurdly zoomed in. */
function atLeast(region: Rectangle, whole: Rectangle, focus: PreviewFocus): Rectangle {
  const floor = Math.max(whole.width, whole.height) * FOCUS_MIN[focus];
  if (region.width >= floor) return region;

  return {
    x: region.x + region.width / 2 - floor / 2,
    y: region.y + region.height / 2 - floor / 2,
    width: floor,
    height: floor,
  };
}

/** Grow a region about its centre. */
function padded(region: Rectangle, factor: number): Rectangle {
  const width = region.width * factor;
  const height = region.height * factor;

  return {
    x: region.x + (region.width - width) / 2,
    y: region.y + (region.height - height) / 2,
    width,
    height,
  };
}

/**
 * Grow the shorter side of a region to match its longer one.
 *
 * The step that makes cropping actually crop, and it is not obvious. A face is
 * wide and short — 188 by 69 on a creature 254 by 268 — so fitting that
 * rectangle inside a square tile fits its *width*, and the height then has so
 * much slack that the whole creature is visible. The tile ends up showing
 * exactly what an uncropped portrait would, with a smaller creature in it.
 *
 * Squaring first means the fit is against a square region in a square frame, so
 * the scale is decided by the part being chosen and everything else is allowed
 * to fall outside the tile. That is what a crop is.
 */
function squared(region: Rectangle): Rectangle {
  const side = Math.max(region.width, region.height);

  return {
    x: region.x + region.width / 2 - side / 2,
    y: region.y + region.height / 2 - side / 2,
    width: side,
    height: side,
  };
}

/**
 * A cheap, stable id for the creature previews are drawn on.
 *
 * Memoised on object identity. With `PREVIEW_BASE` that is one entry for the
 * lifetime of the page, so this serialises once rather than once per tile per
 * render.
 */
const fingerprints = new WeakMap<object, string>();

function baseFingerprint(appearance: PetAppearance): string {
  const hit = fingerprints.get(appearance);
  if (hit !== undefined) return hit;

  const value = JSON.stringify(neutralise(appearance));
  fingerprints.set(appearance, value);
  return value;
}

/**
 * Draw one option.
 *
 * @param appearance the creature the option is being tried on
 * @param patch      the single field this option changes
 * @param focus      which part of the result to frame on
 * @param optionKey  What makes this tile different from its neighbours, when the caller knows.
 *
 * The key used to be the whole resulting appearance, serialised per tile. With
 * a fixed base the base contributes one stable fingerprint and the option
 * contributes the rest, so a grid of forty tiles costs one serialisation
 * instead of forty — and the result stays valid however the user edits their
 * own creature.
 */
export function renderOptionPreview(
  appearance: PetAppearance,
  patch: Partial<PetAppearance>,
  focus: PreviewFocus,
  size = 76,
  optionKey?: string,
): Promise<string> {
  const shown = createPetAppearance({ ...neutralise(appearance), ...patch });

  const key =
    optionKey === undefined
      ? `pet:${focus}:${JSON.stringify(shown)}`
      : `pet:${focus}:${size}:${baseFingerprint(appearance)}:${optionKey}`;

  return renderPreview(key, () => new PetRenderer(shown).root, {
    size,
    fill: TILE_FILL,
    focus: (subject) => regionFor(subject, focus),
  });
}

/**
 * Draw a set of options into the cache, ahead of anybody looking at them.
 *
 * Called from the dashboard's background prefetch after the room is up
 * (`features/dashboard/prefetch.ts`), so that opening the Pet tab finds the
 * tiles already rendered instead of spending ~1.5s drawing them. Measured
 * cold, before this existed: first tile image at 1540ms, all fourteen at
 * 2005ms.
 *
 * Sequential on purpose, and yielding between tiles. These all share one
 * offscreen WebGL context (`lib/preview`); firing them in parallel does not
 * make the GPU faster, it just makes the main thread unresponsive while the
 * user is trying to look at their room.
 *
 * @param signal aborts between tiles. A user who opens the Pet tab mid-prewarm
 *   should not be racing their own background work.
 */
export async function prewarmOptionPreviews(
  appearance: PetAppearance,
  options: readonly { patch: Partial<PetAppearance>; focus: PreviewFocus; key: string }[],
  signal?: AbortSignal,
): Promise<void> {
  for (const option of options) {
    if (signal?.aborted) return;

    try {
      await renderOptionPreview(appearance, option.patch, option.focus, undefined, option.key);
    } catch {
      // A prewarm that fails is a tile that draws on demand later. Never let
      // background work surface an error to somebody who did not ask for it.
    }

    // Yield, so a long prewarm cannot hold a frame hostage.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
