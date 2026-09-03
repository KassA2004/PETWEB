/**
 * Bookshelf — the room's vertical, and somewhere for the small clutter that
 * makes a room look lived in (§15).
 *
 * The tallest thing on the floor, which is its job: a room made entirely of
 * knee-high furniture reads as a doll's house, and one tall silhouette against
 * the back wall gives the eye something to measure the creature against.
 *
 * ## What was wrong with the first one, and the rule that fixes it
 *
 * Every book took a random colour from the full room palette at full
 * saturation, and every one carried two near-white bands. Twenty-odd of those
 * side by side is not a shelf of books — it is a barcode, and at the 76-pixel
 * size the catalogue actually shows it collapsed into confetti. It was the one
 * object in the set that read as *noise* rather than as a thing.
 *
 * Three changes, and they are the whole redesign:
 *
 * ```text
 *   runs, not confetti   books come in RUNS of one hue, two to four at a
 *                        time, varying only in lightness. Real shelves are
 *                        sorted, and a run gives the eye a block to read
 *                        instead of twenty competing edges
 *   dusty, not neon      every spine is pulled a third of the way to sand
 *                        before it is used. These are old cloth bindings in a
 *                        warm room, not highlighter pens
 *   fewer and fatter     three bays rather than four, and thicker spines, so
 *                        a book is still a book at thumbnail size
 * ```
 *
 * The carcass got the same treatment. It was a flat dark rectangle; it is now
 * built from the shared vocabulary like the rest of the furniture — side panels
 * with a form gradient and grain, a top slab with a visible top face, a plinth,
 * and an interior that is *warm* shade rather than near-black, so the books sit
 * inside something rather than in front of a hole.
 *
 * The clutter is what makes it somebody's shelf: one book leaning where its
 * neighbour ran out, one flat stack, and a small trailing plant on top. All
 * seeded, so two shelves in one room are visibly two shelves (§14).
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawOrganicOval, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  edge,
  floorOval,
  formFill,
  gloss,
  grain,
  groundShadow,
  slab,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

/**
 * Spine colours: the room's own palette, pulled toward sand.
 *
 * The mix is the point. At full strength these are the six hues the whole
 * product is built from and they fight each other at this size; a third of the
 * way to `sand` they become cloth, leather and faded paper, still tell each
 * other apart, and stop competing with the creature — which is the thing in
 * the room that is allowed to be the brightest.
 */
const SPINE_HUES = [
  mix(PALETTE.punch, PALETTE.sand, 0.34),
  mix(PALETTE.sky, PALETTE.sand, 0.36),
  mix(PALETTE.mint, PALETTE.sand, 0.32),
  mix(PALETTE.grape, PALETTE.sand, 0.36),
  mix(PALETTE.ember, PALETTE.sand, 0.3),
  mix(PALETTE.cream, PALETTE.sand, 0.3),
];

/** How many bays. Three, so a spine is thick enough to read at 76 pixels. */
const BAYS = 3;

/**
 * One book, standing up.
 *
 * Two marks and no more: a band near the head of the spine, and — only if it
 * is wide enough to carry one — a single short title dash. The old version had
 * two near-white bands on every book, which at a distance is what turned the
 * shelf into a barcode. This one's band is a *darker* tone of the spine, so it
 * reads as a pressed line in cloth rather than as a sticker.
 */
function standingBook(w: number, h: number, color: number): Graphics {
  const ramp = tones(color);
  const g = new Graphics();

  g.roundRect(0, -h, w, h, Math.min(w * 0.22, h * 0.06));
  g.fill(formFill(ramp, 0.62));
  g.roundRect(0, -h, w, h, Math.min(w * 0.22, h * 0.06));
  edge(g, color, 1.6, 0.34);

  const band = new Graphics();
  band.rect(w * 0.14, -h * 0.8, w * 0.72, h * 0.045);
  band.fill({ color: ramp.deep, alpha: 0.45 });
  g.addChild(band);

  if (w > h * 0.14) {
    const title = new Graphics();
    title.rect(w * 0.28, -h * 0.56, w * 0.44, h * 0.02);
    title.fill({ color: lighten(ramp.light, 0.4), alpha: 0.5 });
    g.addChild(title);
  }

  return g;
}

export function createBookshelf(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 211);

  const root = new Container();
  root.label = 'bookshelf';

  root.addChild(groundShadow(width, depth, 0.3));

  const ramp = tones(ctx.color);
  const half = width / 2;
  const sideWidth = width * 0.075;

  const plinthHeight = height * 0.055;
  const topThickness = height * 0.035;
  const innerTop = -height + topThickness;
  const innerBottom = -plinthHeight;
  const bay = (innerBottom - innerTop) / BAYS;
  const innerHalf = half - sideWidth;

  /* --- Carcass ----------------------------------------------------------- */
  /*
   * The interior, and the one number that most changed how this reads.
   *
   * It used to be `ramp.deep` — near-black at the wood's saturation — and a
   * black rectangle behind coloured spines makes the spines glow like a
   * lightbox. A warm mid-shade instead: the inside of a bookcase is in
   * shadow, but it is shadow in a room lit by a window, not a void.
   */
  const backPanel = new Graphics();
  backPanel.rect(-innerHalf, -height + topThickness * 0.5, innerHalf * 2, height - plinthHeight);
  backPanel.fill(
    formFill(tones(mix(darken(ctx.color, 0.22), PALETTE.ember, 0.12)), 0.3),
  );
  root.addChild(backPanel);

  /* --- Bays -------------------------------------------------------------- */
  for (let s = 0; s < BAYS; s++) {
    const shelfY = innerTop + bay * (s + 1);
    const books = new Container();
    books.y = shelfY;

    /*
     * Where the standing books have to stop.
     *
     * The middle shelf keeps a gap on purpose. Leaving it to chance meant the
     * flat stack — the detail that says a person put these here — appeared only
     * when the random widths happened to fall short, which on most seeds they
     * did not.
     */
    const limit = innerHalf * 0.94 - (s === 1 ? width * 0.24 : 0);
    let x = -innerHalf * 0.94;

    // A run of one hue, two to four books long, then a new hue. Sorting is
    // what a shelf of books looks like from across a room.
    let hue = SPINE_HUES[Math.floor(rng() * SPINE_HUES.length)];
    let runLeft = 2 + Math.floor(rng() * 3);
    let leaned = false;

    while (x < limit - width * 0.04) {
      if (runLeft === 0) {
        hue = SPINE_HUES[Math.floor(rng() * SPINE_HUES.length)];
        runLeft = 2 + Math.floor(rng() * 3);
      }
      runLeft--;

      const bookWidth = rngRange(rng, width * 0.05, width * 0.085);
      if (x + bookWidth > limit) break;

      const bookHeight = bay * rngRange(rng, 0.6, 0.84);
      // Within a run the books differ only in lightness — the same edition in
      // several volumes, which is exactly what a run of one hue should say.
      const color = lighten(hue, rngRange(rng, -0.08, 0.08));

      // One book per shelf has given up against its neighbour.
      const lean = !leaned && rng() < 0.3 && x > 0 ? rngRange(rng, 0.2, 0.34) : 0;
      if (lean !== 0) leaned = true;

      const book = standingBook(bookWidth, bookHeight, color);
      book.x = x;
      book.rotation = lean;
      books.addChild(book);

      x += bookWidth + (lean !== 0 ? bookWidth * 0.55 : rngRange(rng, 0, width * 0.004));
    }

    root.addChild(books);

    // The board itself, drawn after its books so its front edge cuts them off
    // — which is what puts the books *on* the shelf rather than beside it.
    root.addChild(
      slab({
        y: shelfY,
        width: innerHalf * 2,
        // Shallow on purpose. A shelf board is seen almost edge-on from the
        // room's camera, and giving it the carcass's full depth turned its top
        // face into a beige pillow that swallowed the bottom third of every
        // book. At this depth the board is a lip the books stand behind.
        depth: depth * 0.34,
        thickness: height * 0.014,
        color: mix(ctx.color, PALETTE.cream, 0.07),
        roundness: 0.25,
        plain: true,
      }),
    );

    /*
     * A flat stack in whatever gap the standing books left.
     *
     * Added *after* the board rather than with its neighbours, and that is the
     * whole reason it is visible: everything in `books` is drawn behind the
     * board so the board's lip cuts the spines off, which is correct for a book
     * standing behind it and wrong for one lying on it. This one is on top.
     */
    const gap = innerHalf * 0.94 - x;
    if (s === 1 && gap > width * 0.14) {
      const stack = new Container();
      stack.position.set(x + width * 0.015, shelfY - height * 0.006);
      const stackWidth = Math.min(gap * 0.82, width * 0.2);

      for (let i = 0; i < 3; i++) {
        const leaf = tones(lighten(SPINE_HUES[(s + i * 2) % SPINE_HUES.length], 0.05));
        const thickness = bay * 0.085;
        const flat = new Graphics();
        flat.roundRect(
          i * width * 0.005,
          -thickness * (i + 1),
          stackWidth - i * width * 0.012,
          thickness,
          thickness * 0.34,
        );
        flat.fill(formFill(leaf, 0.72));
        flat.roundRect(
          i * width * 0.005,
          -thickness * (i + 1),
          stackWidth - i * width * 0.012,
          thickness,
          thickness * 0.34,
        );
        edge(flat, leaf.base, 1.4, 0.3);
        stack.addChild(flat);
      }

      root.addChild(stack);
    }
  }

  /* --- Sides, top and plinth --------------------------------------------- */
  for (const side of [-1, 1]) {
    const panel = new Graphics();
    panel.roundRect(
      side < 0 ? -half : half - sideWidth,
      -height,
      sideWidth,
      height - plinthHeight * 0.3,
      width * 0.014,
    );
    // The right-hand panel is the one turned away from the window, so it takes
    // the darker end of the ramp. One decision, and the whole box has volume.
    // Lit side against shaded side. The window is upper left, so the left
    // panel is lifted and the right one dropped — without the split the frame
    // matched the interior behind it and the box had no edges at all.
    panel.fill(
      formFill(side < 0 ? tones(lighten(ctx.color, 0.1)) : tones(darken(ctx.color, 0.14)), 0.55),
    );
    root.addChild(panel);

    const panelGrain = grain(height * 0.86, sideWidth * 0.9, ctx.color, ctx.seed + 4 + side, 4);
    panelGrain.rotation = Math.PI / 2;
    panelGrain.position.set(side * (half - sideWidth / 2), -height * 0.5);
    root.addChild(panelGrain);
  }

  root.addChild(
    slab({
      y: -height,
      width,
      depth: depth * 0.62,
      thickness: topThickness,
      color: mix(ctx.color, PALETTE.ember, 0.06),
      roundness: 0.24,
      // No gloss. On a face this wide the standard highlight reads as a smear
      // wiped across the top rather than as light landing on it.
      plain: true,
    }),
  );

  // The plinth, with its feet notched out. A box that meets the floor along its
  // whole width looks like it was extruded; two feet look like furniture.
  const plinth = new Graphics();
  plinth.roundRect(-half * 0.99, -plinthHeight, half * 1.98, plinthHeight, width * 0.012);
  plinth.fill(formFill(tones(darken(ctx.color, 0.08)), 0.4));
  plinth.moveTo(-half * 0.34, 0);
  plinth.lineTo(half * 0.34, 0);
  plinth.quadraticCurveTo(0, -plinthHeight * 0.66, -half * 0.34, 0);
  plinth.closePath();
  plinth.fill({ color: ramp.deep, alpha: 0.32 });
  root.addChild(plinth);

  /* --- A plant on top ----------------------------------------------------- */
  // The one thing that turns a bookcase into somebody's bookcase. It sways,
  // very slightly, because everything in this room is alive a little.
  const trailing = new Container();
  trailing.position.set(half * 0.58, -height - topThickness * 0.1);
  trailing.pivot.set(0, 0);

  const potHeight = height * 0.055;
  const potWidth = width * 0.11;
  const potTones = tones(ctx.accentColor);

  const foliage = new Graphics();
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI + (i / 4) * Math.PI;
    const reach = potWidth * rngRange(rng, 0.72, 1.05);
    drawOrganicOval(
      foliage,
      Math.cos(angle) * reach * 0.85,
      -potHeight - potWidth * 0.32 + Math.sin(angle) * reach * 0.4,
      potWidth * rngRange(rng, 0.34, 0.46),
      potWidth * rngRange(rng, 0.26, 0.34),
      20,
      0.07,
      i * 1.7,
    );
  }
  foliage.fill(formFill(tones(ctx.secondaryColor), 0.66));
  edge(foliage, ctx.secondaryColor, 2, 0.32);
  trailing.addChild(foliage);

  const pot = new Graphics();
  pot.moveTo(-potWidth * 0.5, -potHeight);
  pot.lineTo(potWidth * 0.5, -potHeight);
  pot.lineTo(potWidth * 0.36, 0);
  pot.quadraticCurveTo(0, potWidth * 0.14, -potWidth * 0.36, 0);
  pot.closePath();
  pot.fill(formFill(potTones, 0.5));
  edge(pot, ctx.accentColor, 2, 0.34);
  trailing.addChild(pot);

  const potRim = new Graphics();
  floorOval(potRim, 0, -potHeight, potWidth, potWidth * 0.9);
  potRim.fill({ color: lighten(potTones.light, 0.1) });
  trailing.addChild(potRim);

  const potLight = new Graphics();
  gloss(
    potLight,
    -potWidth * 0.18,
    -potHeight * 0.55,
    potWidth * 0.1,
    potHeight * 0.22,
    lighten(potTones.light, 0.3),
    0.34,
  );
  trailing.addChild(potLight);

  root.addChild(trailing);

  let time = ctx.seed % 5;
  attachLife(root, {
    update(dt) {
      time += dt;
      trailing.rotation = Math.sin(time * 0.5) * 0.02;
    },
  });

  return root;
}
