/**
 * What is on the other side of the glass.
 *
 * The window is the one place in the room where the world outside is stated
 * outright instead of implied, and it used to be worth exactly four shapes — a
 * sky, two hills, a disc and some stars — because there was only ever one view
 * and its whole job was to say what time it was.
 *
 * Now the view is something the user chooses, and that changes what it is for.
 * A window onto a lava dungeon and a window onto a city are not two versions
 * of the same weather; they are two answers to "where is this room". So each
 * view gets a real composition, and the hour still runs over the top of all of
 * them.
 *
 * The division of labour, which is the important part
 * ---------------------------------------------------
 *
 *   the view    what is out there: the shapes, and their own colours
 *   the hour    how lit it is (world/Ambience.ts) — the sky colour, whether
 *               there is a disc in the pane, how many stars
 *
 * A view therefore never hard-codes a sky. It is handed the hour's `SkySpec`
 * and paints its own land against it, so a mountain range at midnight is the
 * same mountain range, in the dark. The one exception is a view that supplies
 * its *own* light — the lava dungeon glows whatever the time — and it says so
 * with `selfLit`, which the lighting also reads so the shafts through the glass
 * pick up the right colour.
 *
 * Every view draws into a box centred on (0, 0) measured in half-extents, and
 * is clipped to the pane by the caller. Nothing here knows where the window is.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix } from '../../shared/color';
import { createRng, drawOrganicOval, rngRange } from '../../shared/shapes';
import type { SkySpec } from '../../../world/Ambience';

export const WINDOW_VIEWS = [
  'meadow',
  'mountains',
  'city',
  'park',
  'dungeon',
  'ocean',
] as const;

export type WindowViewId = (typeof WINDOW_VIEWS)[number];

export interface WindowViewSpec {
  id: WindowViewId;
  label: string;
  /** One line for the interface. */
  note: string;
  /**
   * The colour this view pushes into the room, and how strongly, or null if it
   * simply takes whatever light the hour is giving.
   *
   * The lava dungeon is the reason this exists: it is a light source, so the
   * shafts through the glass and the pool on the floor have to go orange no
   * matter what the clock says.
   */
  selfLit: { color: number; strength: number } | null;
  /**
   * Build the view.
   *
   * @param halfW half-width of the pane, in screen units
   * @param halfH half-height
   * @param sky   the hour's own sky, so the view sits in the right light
   */
  draw(halfW: number, halfH: number, sky: SkySpec, seed: number): Container;
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

/** The sky itself, plus stars and a sun or moon if the hour has one. */
function skyBackdrop(halfW: number, halfH: number, sky: SkySpec, seed: number): Container {
  const group = new Container();

  const field = new Graphics();
  field.rect(-halfW, -halfH, halfW * 2, halfH * 2);
  field.fill({ color: sky.color });
  // A band of lighter sky at the horizon, which is what every real sky does and
  // what stops the pane reading as a swatch.
  field.rect(-halfW, -halfH * 0.1, halfW * 2, halfH * 1.1);
  field.fill({ color: lighten(sky.color, 0.18), alpha: 0.6 });
  group.addChild(field);

  if (sky.stars > 0) {
    const rng = createRng(seed + 4242);
    const stars = new Graphics();
    for (let i = 0; i < sky.stars; i++) {
      stars.circle(
        rngRange(rng, -halfW, halfW),
        rngRange(rng, -halfH, halfH * 0.2),
        rngRange(rng, 1.2, 2.6),
      );
    }
    stars.fill({ color: 0xffffff, alpha: 0.7 });
    group.addChild(stars);
  }

  if (sky.disc !== null) {
    const discY = halfH * (0.5 - sky.discHeight);
    const discX = halfW * 0.22;
    const radius = halfW * 0.3;

    const disc = new Graphics();
    disc.circle(discX, discY, radius * 2.1);
    disc.fill({ color: sky.disc, alpha: 0.16 });
    disc.circle(discX, discY, radius * 1.45);
    disc.fill({ color: sky.disc, alpha: 0.22 });
    disc.circle(discX, discY, radius);
    disc.fill({ color: sky.disc });
    group.addChild(disc);
  }

  return group;
}

/** A silhouette band across the bottom of the pane. */
function ground(halfW: number, halfH: number, color: number, top: number): Graphics {
  const g = new Graphics();
  g.rect(-halfW, halfH * top, halfW * 2, halfH * (1 - top));
  g.fill({ color });
  return g;
}

/* -------------------------------------------------------------------------- */
/* The views                                                                  */
/* -------------------------------------------------------------------------- */

const meadow: WindowViewSpec = {
  id: 'meadow',
  label: 'Meadow',
  note: 'Two soft hills and whatever the sky is doing.',
  selfLit: null,
  draw(halfW, halfH, sky, seed) {
    const rng = createRng(seed + 11);
    const view = skyBackdrop(halfW, halfH, sky, seed);

    const hills = new Graphics();
    hills.ellipse(-halfW * 0.44, halfH * 0.52, halfW * 0.88, halfH * 0.34);
    hills.ellipse(halfW * 0.6, halfH * 0.56, halfW * 0.72, halfH * 0.26);
    hills.fill({ color: sky.land, alpha: 0.9 });
    view.addChild(hills);

    view.addChild(ground(halfW, halfH, darken(sky.land, 0.12), 0.68));

    // Three fenceposts and a wire, near enough to read as somebody's field.
    const fence = new Graphics();
    for (let i = -1; i <= 1; i++) {
      const x = i * halfW * 0.42 + rngRange(rng, -4, 4);
      fence.rect(x - halfW * 0.015, halfH * 0.6, halfW * 0.03, halfH * 0.16);
    }
    fence.fill({ color: darken(sky.land, 0.42) });
    fence.moveTo(-halfW, halfH * 0.66);
    fence.lineTo(halfW, halfH * 0.64);
    fence.stroke({ color: darken(sky.land, 0.42), width: 1.6, alpha: 0.7 });
    view.addChild(fence);

    return view;
  },
};

const mountains: WindowViewSpec = {
  id: 'mountains',
  label: 'Mountains',
  note: 'A far range with snow still on it.',
  selfLit: null,
  draw(halfW, halfH, sky, seed) {
    const rng = createRng(seed + 23);
    const view = skyBackdrop(halfW, halfH, sky, seed);

    // Two ranges: a pale far one and a darker near one. Aerial perspective in
    // two shapes, and it is the whole reason a mountain view reads as *far*.
    for (const [depth, alpha, lift] of [
      [0.55, 0.5, 0.1],
      [0, 1, 0.3],
    ] as const) {
      const range = new Graphics();
      const peaks = 5;
      range.moveTo(-halfW, halfH * 0.7);
      for (let i = 0; i <= peaks; i++) {
        const x = -halfW + (i / peaks) * halfW * 2;
        const peak = halfH * (0.62 - lift - rngRange(rng, 0.1, 0.42));
        range.lineTo(x - halfW / peaks / 2, peak);
        range.lineTo(x, halfH * (0.5 - lift * 0.4));
      }
      range.lineTo(halfW, halfH * 0.7);
      range.closePath();
      range.fill({ color: mix(sky.land, sky.color, depth), alpha });
      view.addChild(range);
    }

    // Snow: a few flat caps clipped nowhere, because they are drawn small
    // enough to sit inside their own peaks.
    const snow = new Graphics();
    for (let i = 0; i < 4; i++) {
      const x = rngRange(rng, -halfW * 0.8, halfW * 0.8);
      const y = halfH * rngRange(rng, -0.05, 0.16);
      snow.moveTo(x - halfW * 0.06, y + halfH * 0.08);
      snow.lineTo(x, y);
      snow.lineTo(x + halfW * 0.06, y + halfH * 0.08);
      snow.closePath();
    }
    snow.fill({ color: lighten(PALETTE.cream, 0.2), alpha: 0.75 });
    view.addChild(snow);

    view.addChild(ground(halfW, halfH, darken(sky.land, 0.24), 0.68));

    return view;
  },
};

const city: WindowViewSpec = {
  id: 'city',
  label: 'City',
  note: 'Rooftops, and somebody else still awake.',
  selfLit: null,
  draw(halfW, halfH, sky, seed) {
    const rng = createRng(seed + 37);
    const view = skyBackdrop(halfW, halfH, sky, seed);

    // How lit the windows are follows the hour: the darker the sky, the more of
    // the city is switched on. One number, and the view has a day and a night.
    const night = 1 - Math.min(1, (sky.stars > 0 ? 0.2 : 0.9));

    const far = new Graphics();
    const near = new Graphics();
    const lights = new Graphics();

    let x = -halfW;
    while (x < halfW) {
      const w = rngRange(rng, halfW * 0.1, halfW * 0.24);
      const tall = halfH * rngRange(rng, 0.25, 0.95);
      const back = rng() < 0.45;
      const target = back ? far : near;

      target.rect(x, halfH * 0.7 - tall, w, tall + halfH * 0.3);

      if (!back) {
        // Windows: a grid of small squares, a fraction of them lit.
        const cols = Math.max(1, Math.floor(w / (halfW * 0.055)));
        const rows = Math.max(1, Math.floor(tall / (halfH * 0.1)));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rng() > 0.22 + night * 0.45) continue;
            lights.rect(
              x + (c + 0.3) * (w / cols),
              halfH * 0.7 - tall + (r + 0.3) * (tall / rows),
              (w / cols) * 0.4,
              (tall / rows) * 0.4,
            );
          }
        }
      }

      x += w + rngRange(rng, 1, halfW * 0.05);
    }

    far.fill({ color: mix(sky.land, sky.color, 0.45) });
    near.fill({ color: darken(sky.land, 0.3) });
    lights.fill({ color: mix(0xffd98a, PALETTE.cream, 0.2), alpha: 0.55 + night * 0.4 });

    view.addChild(far);
    view.addChild(near);
    view.addChild(lights);

    return view;
  },
};

const park: WindowViewSpec = {
  id: 'park',
  label: 'Park',
  note: 'Big round trees and a path going somewhere.',
  selfLit: null,
  draw(halfW, halfH, sky, seed) {
    const rng = createRng(seed + 53);
    const view = skyBackdrop(halfW, halfH, sky, seed);

    view.addChild(ground(halfW, halfH, sky.land, 0.5));

    // The path: a wedge narrowing toward the horizon, which is the cheapest
    // possible statement that the view has depth.
    const path = new Graphics();
    path.moveTo(-halfW * 0.08, halfH * 0.5);
    path.lineTo(halfW * 0.08, halfH * 0.5);
    path.lineTo(halfW * 0.42, halfH);
    path.lineTo(-halfW * 0.34, halfH);
    path.closePath();
    path.fill({ color: mix(PALETTE.sand, sky.land, 0.35), alpha: 0.9 });
    view.addChild(path);

    // Trees: canopies as organic ovals, trunks as two-unit rectangles. Bigger
    // and lower means nearer.
    const trees = new Graphics();
    const trunks = new Graphics();

    for (let i = 0; i < 5; i++) {
      const nearness = rng();
      const x = rngRange(rng, -halfW * 0.95, halfW * 0.95);
      const base = halfH * (0.46 + nearness * 0.42);
      const size = halfW * (0.16 + nearness * 0.24);

      trunks.rect(x - size * 0.1, base - size * 0.8, size * 0.2, size * 0.9);
      drawOrganicOval(trees, x, base - size * 1.25, size, size * 0.85, 20, 0.1, i * 2);
    }

    trunks.fill({ color: darken(sky.land, 0.5) });
    trees.fill({ color: darken(sky.land, 0.18) });
    view.addChild(trunks);
    view.addChild(trees);

    return view;
  },
};

const dungeon: WindowViewSpec = {
  id: 'dungeon',
  label: 'Lava Dungeon',
  note: 'Something is wrong with this house, and it is wonderful.',
  // The one view that lights the room itself. See `selfLit` above.
  selfLit: { color: 0xff7a2e, strength: 1.15 },
  draw(halfW, halfH, _sky, seed) {
    const rng = createRng(seed + 71);
    const view = new Container();

    // No sky. A cavern's backdrop is its own far wall, and the light comes from
    // below rather than above — which inverts every gradient in the view and is
    // most of why it reads as *wrong* in a cozy room.
    const cavern = new Graphics();
    cavern.rect(-halfW, -halfH, halfW * 2, halfH * 2);
    cavern.fill({ color: 0x2a1420 });
    cavern.rect(-halfW, halfH * 0.1, halfW * 2, halfH * 0.9);
    cavern.fill({ color: 0x4a1d22, alpha: 0.8 });
    view.addChild(cavern);

    // Stalactites down from the top.
    const teeth = new Graphics();
    let x = -halfW;
    while (x < halfW) {
      const w = rngRange(rng, halfW * 0.08, halfW * 0.2);
      teeth.moveTo(x, -halfH);
      teeth.lineTo(x + w, -halfH);
      teeth.lineTo(x + w * 0.5, -halfH + rngRange(rng, halfH * 0.15, halfH * 0.6));
      teeth.closePath();
      x += w;
    }
    teeth.fill({ color: 0x1d0f18 });
    view.addChild(teeth);

    // The lava: a lake with a hot core, drawn as three stacked bands rather
    // than a gradient, so it matches the rest of the project's lighting (§9).
    const lake = new Graphics();
    lake.rect(-halfW, halfH * 0.52, halfW * 2, halfH * 0.48);
    lake.fill({ color: 0xc23b1e });
    lake.rect(-halfW, halfH * 0.62, halfW * 2, halfH * 0.38);
    lake.fill({ color: 0xf0641f });
    lake.rect(-halfW, halfH * 0.76, halfW * 2, halfH * 0.24);
    lake.fill({ color: 0xffb03a });
    view.addChild(lake);

    // Crust: dark islands floating on it.
    const crust = new Graphics();
    for (let i = 0; i < 5; i++) {
      drawOrganicOval(
        crust,
        rngRange(rng, -halfW, halfW),
        halfH * rngRange(rng, 0.6, 0.94),
        halfW * rngRange(rng, 0.1, 0.26),
        halfH * rngRange(rng, 0.03, 0.07),
        16,
        0.14,
        i,
      );
    }
    crust.fill({ color: 0x3a1a1c, alpha: 0.85 });
    view.addChild(crust);

    // The glow the lake throws onto the cavern above it.
    const heat = new Graphics();
    for (const [scale, alpha] of [[1.6, 0.1], [1.1, 0.12], [0.7, 0.14]] as const) {
      heat.ellipse(0, halfH * 0.6, halfW * scale, halfH * 0.7 * scale);
      heat.fill({ color: 0xff7a2e, alpha });
    }
    view.addChild(heat);

    // A pillar, so the cave has architecture and is not just a hot floor.
    const pillar = new Graphics();
    pillar.moveTo(halfW * 0.42, -halfH);
    pillar.lineTo(halfW * 0.68, -halfH);
    pillar.lineTo(halfW * 0.62, halfH * 0.62);
    pillar.lineTo(halfW * 0.46, halfH * 0.62);
    pillar.closePath();
    pillar.fill({ color: 0x241019 });
    view.addChild(pillar);

    return view;
  },
};

const ocean: WindowViewSpec = {
  id: 'ocean',
  label: 'Ocean',
  note: 'Flat water to the horizon, and one small boat.',
  selfLit: null,
  draw(halfW, halfH, sky, seed) {
    const rng = createRng(seed + 89);
    const view = skyBackdrop(halfW, halfH, sky, seed);

    const sea = new Graphics();
    sea.rect(-halfW, halfH * 0.34, halfW * 2, halfH * 0.66);
    sea.fill({ color: mix(sky.color, 0x1e5f86, 0.62) });
    sea.rect(-halfW, halfH * 0.62, halfW * 2, halfH * 0.38);
    sea.fill({ color: darken(mix(sky.color, 0x1e5f86, 0.72), 0.12) });
    view.addChild(sea);

    // Swell: flat dashes, bigger and further apart toward the viewer. Four rows
    // is a sea; twenty is a texture.
    const swell = new Graphics();
    for (let row = 0; row < 5; row++) {
      const t = row / 4;
      const y = halfH * (0.4 + t * 0.52);
      const count = 7 - row;
      for (let i = 0; i < count; i++) {
        const x = rngRange(rng, -halfW * 0.95, halfW * 0.95);
        const w = halfW * (0.06 + t * 0.14);
        swell.moveTo(x - w, y);
        swell.lineTo(x + w, y);
      }
    }
    swell.stroke({ color: lighten(sky.color, 0.4), width: 1.8, alpha: 0.45 });
    view.addChild(swell);

    // The disc's reflection, if the hour has one in the pane.
    if (sky.disc !== null) {
      const glitter = new Graphics();
      glitter.ellipse(halfW * 0.22, halfH * 0.62, halfW * 0.14, halfH * 0.28);
      glitter.fill({ color: sky.disc, alpha: 0.22 });
      view.addChild(glitter);
    }

    const boat = new Graphics();
    const bx = -halfW * 0.42;
    const by = halfH * 0.5;
    boat.moveTo(bx - halfW * 0.1, by);
    boat.lineTo(bx + halfW * 0.1, by);
    boat.lineTo(bx + halfW * 0.06, by + halfH * 0.06);
    boat.lineTo(bx - halfW * 0.06, by + halfH * 0.06);
    boat.closePath();
    boat.fill({ color: darken(sky.land, 0.4) });
    boat.moveTo(bx, by);
    boat.lineTo(bx, by - halfH * 0.18);
    boat.lineTo(bx + halfW * 0.09, by - halfH * 0.02);
    boat.closePath();
    boat.fill({ color: PALETTE.cream, alpha: 0.9 });
    view.addChild(boat);

    return view;
  },
};

const VIEWS: Record<WindowViewId, WindowViewSpec> = {
  meadow,
  mountains,
  city,
  park,
  dungeon,
  ocean,
};

export const WINDOW_VIEW_LIST: WindowViewSpec[] = WINDOW_VIEWS.map((id) => VIEWS[id]);

export const DEFAULT_WINDOW_VIEW: WindowViewId = 'meadow';

export function getWindowView(id: WindowViewId | string): WindowViewSpec {
  return VIEWS[id as WindowViewId] ?? VIEWS[DEFAULT_WINDOW_VIEW];
}
