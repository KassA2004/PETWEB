/**
 * Bookshelf — the room's vertical, and somewhere for the small clutter that
 * makes a room look lived in (§15).
 *
 * The tallest thing on the floor, which is its job: a room made entirely of
 * knee-high furniture reads as a doll's house, and one tall silhouette against
 * the back wall gives the eye something to measure the creature against.
 *
 * The books are procedural — widths, heights, lean and colour all seeded — so
 * two shelves in one room are visibly two shelves. One of them has fallen over
 * against its neighbour, always, because a perfectly stacked shelf looks like
 * a texture (§14).
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { PALETTE } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  FLOOR_SQUASH,
  edge,
  formFill,
  grain,
  groundShadow,
  slab,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

/** Books are drawn from the room's own palette, not from arbitrary hues. */
const SPINE_COLORS = [
  PALETTE.punch,
  PALETTE.sky,
  PALETTE.mint,
  PALETTE.grape,
  PALETTE.ember,
  PALETTE.blush,
  PALETTE.cream,
];

export function createBookshelf(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 211);

  const root = new Container();
  root.label = 'bookshelf';

  root.addChild(groundShadow(width, depth, 0.3));

  const ramp = tones(ctx.color);
  const half = width / 2;
  const sideWidth = width * 0.07;
  const depthLift = depth * FLOOR_SQUASH * 0.5;

  // --- Carcass -------------------------------------------------------------
  // The back panel, set back and darker, is what gives the shelves somewhere
  // to be in front of.
  const backPanel = new Graphics();
  backPanel.roundRect(-half * 0.94, -height, half * 1.88, height - depthLift, width * 0.02);
  backPanel.fill({ color: ramp.deep });
  root.addChild(backPanel);

  const shelfCount = 4;
  const innerTop = -height + height * 0.06;
  const innerBottom = -height * 0.08;
  const bay = (innerBottom - innerTop) / shelfCount;

  // --- Contents ------------------------------------------------------------
  for (let s = 0; s < shelfCount; s++) {
    const shelfY = innerTop + bay * (s + 1);
    const books = new Container();
    books.y = shelfY;

    let x = -half * 0.86;
    const limit = half * 0.86;
    let leaned = false;

    while (x < limit - width * 0.03) {
      const bookWidth = rngRange(rng, width * 0.035, width * 0.075);
      if (x + bookWidth > limit) break;

      const bookHeight = bay * rngRange(rng, 0.52, 0.86);
      const color = SPINE_COLORS[Math.floor(rng() * SPINE_COLORS.length)];
      const spineTones = tones(color);

      // One book per shelf has given up. It is always the last one that fits.
      const lean = !leaned && rng() < 0.22 && x > 0 ? rngRange(rng, 0.22, 0.4) : 0;
      if (lean !== 0) leaned = true;

      const book = new Graphics();
      book.roundRect(0, -bookHeight, bookWidth, bookHeight, bookWidth * 0.16);
      book.fill(formFill(spineTones, 0.5));
      book.roundRect(0, -bookHeight, bookWidth, bookHeight, bookWidth * 0.16);
      edge(book, color, 1.6, 0.4);

      // Two bands on the spine. That is the whole of a book at this size.
      book.rect(bookWidth * 0.18, -bookHeight * 0.78, bookWidth * 0.64, bookHeight * 0.05);
      book.rect(bookWidth * 0.18, -bookHeight * 0.3, bookWidth * 0.64, bookHeight * 0.04);
      book.fill({ color: lighten(spineTones.light, 0.3), alpha: 0.6 });

      book.x = x;
      book.rotation = lean;
      books.addChild(book);

      x += bookWidth + (lean !== 0 ? bookWidth * 0.5 : rngRange(rng, 0, width * 0.006));
    }

    root.addChild(books);

    // The shelf board itself, drawn after its books so the front edge cuts them.
    root.addChild(
      slab({
        y: shelfY,
        width: width * 0.94,
        depth: depth * 0.72,
        thickness: height * 0.018,
        color: mix(ctx.color, PALETTE.cream, 0.12),
        roundness: 0.3,
        plain: true,
      }),
    );
  }

  // --- Sides, top and plinth ----------------------------------------------
  const frame = new Graphics();
  for (const side of [-1, 1]) {
    frame.roundRect(
      side * half - (side < 0 ? 0 : sideWidth),
      -height,
      sideWidth,
      height,
      width * 0.015,
    );
  }
  frame.fill(formFill(ramp, 0.55));
  root.addChild(frame);

  const sideGrain = grain(height * 0.9, sideWidth, ctx.color, ctx.seed + 4, 4);
  sideGrain.rotation = Math.PI / 2;
  sideGrain.position.set(-half + sideWidth / 2, -height * 0.5);
  root.addChild(sideGrain);

  root.addChild(
    slab({
      y: -height,
      width,
      depth,
      thickness: height * 0.03,
      color: ctx.color,
      roundness: 0.3,
    }),
  );

  const plinth = new Graphics();
  plinth.roundRect(-half * 0.96, -height * 0.08, half * 1.92, height * 0.08, width * 0.01);
  plinth.fill({ color: darken(ramp.shade, 0.1) });
  root.addChild(plinth);

  // --- A plant on top ------------------------------------------------------
  // The one thing that turns a bookcase into somebody's bookcase. It sways,
  // very slightly, because everything in this room is alive a little.
  const trailing = new Container();
  trailing.position.set(half * 0.62, -height);

  const potTones = tones(ctx.accentColor);
  const pot = new Graphics();
  pot.moveTo(-width * 0.05, -height * 0.055);
  pot.lineTo(width * 0.05, -height * 0.055);
  pot.lineTo(width * 0.036, 0);
  pot.lineTo(-width * 0.036, 0);
  pot.closePath();
  pot.fill(formFill(potTones, 0.5));
  trailing.addChild(pot);

  const vine = new Graphics();
  for (let i = 0; i < 5; i++) {
    const drop = rngRange(rng, height * 0.06, height * 0.16);
    const sway = rngRange(rng, -width * 0.06, width * 0.06);
    vine.moveTo(0, -height * 0.05);
    vine.quadraticCurveTo(sway, -height * 0.05 + drop * 0.6, sway * 1.4, -height * 0.05 + drop);
    vine.circle(sway * 1.4, -height * 0.05 + drop, width * 0.012);
  }
  vine.stroke({ color: darken(ctx.secondaryColor, 0.2), width: 2 });
  vine.fill({ color: ctx.secondaryColor });
  trailing.addChild(vine);

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
