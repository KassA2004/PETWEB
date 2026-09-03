/**
 * Wall decor — the things that give a room a mood rather than a light level.
 *
 * The room could already be five rooms by the hour and eight rooms by the
 * paint, and it was still, every time, the same empty box. Light sets the
 * *time*; it cannot set the *vibe*. A painting, a shelf of oddments, ivy
 * coming through the plaster and a hole with something living behind it are
 * four different rooms at the same hour in the same colour.
 *
 * Everything here hangs on the wall grid (`world/WallGrid.ts`), which shares
 * its columns with the floor grid — so a painting is genuinely above the
 * bookshelf rather than approximately above it.
 *
 * Each kind is one row of data plus one draw function taking a box measured in
 * half-extents and centred on (0, 0). Adding a decoration is one entry; nothing
 * else in the project has to know it exists.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawOrganicOval, drawSquircle, rngRange } from '../../shared/shapes';
import { edge, formFill, gloss, softGlow } from '../../objects/shared/Surface';
import { createClock } from '../../objects/decorations/Clock';
import { updateLife } from '../../objects/ObjectLife';
import type { WallFootprint } from '../../../world/WallGrid';

export const WALL_DECOR_KINDS = [
  'painting',
  'portrait',
  'shelf',
  'vines',
  'hole',
  'bunting',
  'mirror',
  'sconce',
  'clock',
] as const;

export type WallDecorKind = (typeof WALL_DECOR_KINDS)[number];

export interface WallDecorSpec {
  kind: WallDecorKind;
  label: string;
  note: string;
  footprint: WallFootprint;
  /** How much of its cells the artwork claims. */
  fill?: number;
  /**
   * Whether it lights the wall around it. Sconces and holes do.
   *
   * The scene reads this to decide whether the piece keeps glowing when the
   * lamps go out — the same switch the floor lamp answers to.
   */
  emits?: { color: number; radius: number; strength: number };
  draw(halfW: number, halfH: number, palette: DecorPalette, seed: number): Container;
}

/**
 * The colours a decoration is allowed to use.
 *
 * Handed in rather than imported, so a piece is made *of the room* — a shelf
 * is the room's own woodwork, ivy is the room's green, and the wall showing
 * through a hole is the wall it is a hole in.
 */
export interface DecorPalette {
  /** The wall it is hanging on, already graded by the hour. */
  wall: number;
  /** The room's chosen tint. */
  tint: number;
  /** The project's own accent, for anything that wants to sing. */
  accent: number;
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

/** A picture frame with a mount, a canvas and a cast shadow. */
function framed(
  halfW: number,
  halfH: number,
  palette: DecorPalette,
  canvas: (g: Graphics, w: number, h: number) => void,
): Container {
  const group = new Container();

  const frameColor = darken(palette.wall, 0.42);
  const lip = Math.min(halfW, halfH) * 0.13;

  // The shadow it casts on the wall, offset down and right.
  const shadow = new Graphics();
  shadow.roundRect(-halfW + lip, -halfH + lip * 1.4, halfW * 2, halfH * 2, lip);
  shadow.fill({ color: darken(palette.wall, 0.5), alpha: 0.22 });
  group.addChild(shadow);

  const frame = new Graphics();
  frame.roundRect(-halfW, -halfH, halfW * 2, halfH * 2, lip * 0.6);
  frame.fill(formFill(tones(frameColor), 0.6));
  frame.roundRect(-halfW, -halfH, halfW * 2, halfH * 2, lip * 0.6);
  edge(frame, frameColor, 2, 0.4);
  group.addChild(frame);

  const mount = new Graphics();
  mount.rect(-halfW + lip, -halfH + lip, (halfW - lip) * 2, (halfH - lip) * 2);
  mount.fill({ color: lighten(PALETTE.cream, 0.1) });
  group.addChild(mount);

  const inner = new Graphics();
  const w = halfW - lip * 2;
  const h = halfH - lip * 2;
  canvas(inner, w, h);
  const clip = new Graphics();
  clip.rect(-w, -h, w * 2, h * 2);
  clip.fill({ color: 0xffffff });
  group.addChild(clip);
  inner.mask = clip;
  group.addChild(inner);

  // One flat diagonal sheen across the glass.
  const sheen = new Graphics();
  sheen.moveTo(-halfW, halfH * 0.2);
  sheen.lineTo(halfW * 0.1, -halfH);
  sheen.lineTo(halfW * 0.45, -halfH);
  sheen.lineTo(-halfW, halfH * 0.75);
  sheen.closePath();
  sheen.fill({ color: 0xffffff, alpha: 0.09 });
  group.addChild(sheen);

  return group;
}

/* -------------------------------------------------------------------------- */
/* The pieces                                                                 */
/* -------------------------------------------------------------------------- */

const painting: WallDecorSpec = {
  kind: 'painting',
  label: 'Landscape',
  note: 'Somewhere with more sky than here.',
  footprint: { cols: 2, rows: 1 },
  draw(halfW, halfH, palette, seed) {
    const rng = createRng(seed + 3);

    return framed(halfW, halfH, palette, (g, w, h) => {
      g.rect(-w, -h, w * 2, h * 2);
      g.fill({ color: mix(PALETTE.sky, PALETTE.cream, 0.3) });

      // Three hills at different depths, then a sun. The whole painting.
      for (const [depth, lift] of [[0.55, 0.2], [0.3, 0.05], [0, -0.15]] as const) {
        const hill = new Graphics();
        drawOrganicOval(
          hill,
          rngRange(rng, -w * 0.6, w * 0.6),
          h * (0.5 - lift),
          w * rngRange(rng, 0.7, 1.1),
          h * rngRange(rng, 0.5, 0.8),
          20,
          0.06,
          depth * 7,
        );
        hill.fill({ color: mix(PALETTE.mint, PALETTE.sky, depth) });
        g.addChild(hill);
      }

      const sun = new Graphics();
      sun.circle(w * 0.42, -h * 0.42, Math.min(w, h) * 0.22);
      sun.fill({ color: lighten(palette.accent, 0.35) });
      g.addChild(sun);
    });
  },
};

const portrait: WallDecorSpec = {
  kind: 'portrait',
  label: 'Portrait',
  note: 'A previous occupant, looking unimpressed.',
  footprint: { cols: 1, rows: 1 },
  draw(halfW, halfH, palette, seed) {
    const rng = createRng(seed + 19);

    return framed(halfW, halfH, palette, (g, w, h) => {
      g.rect(-w, -h, w * 2, h * 2);
      g.fill({ color: darken(mix(palette.tint, PALETTE.grape, 0.5), 0.2) });

      // A blob creature in the family style: body, ears, two dot eyes and a
      // flat mouth. Deliberately not cute — the library needs faces that are
      // wrong on purpose (§11.2).
      const bodyColor = mix(palette.accent, PALETTE.blush, rng());
      const body = new Graphics();
      drawSquircle(body, 0, h * 0.35, w * 0.55, h * 0.7, { roundness: 0.6 });
      body.fill(formFill(tones(bodyColor), 0.6));
      g.addChild(body);

      const ears = new Graphics();
      ears.ellipse(-w * 0.34, -h * 0.2, w * 0.16, h * 0.3);
      ears.ellipse(w * 0.34, -h * 0.24, w * 0.14, h * 0.26);
      ears.fill({ color: darken(bodyColor, 0.1) });
      g.addChildAt(ears, 0);

      const face = new Graphics();
      face.circle(-w * 0.2, h * 0.1, w * 0.075);
      face.circle(w * 0.2, h * 0.1, w * 0.075);
      face.fill({ color: PALETTE.ink });
      face.moveTo(-w * 0.16, h * 0.42);
      face.lineTo(w * 0.16, h * 0.42);
      face.stroke({ color: PALETTE.ink, width: 2.4, cap: 'round' });
      g.addChild(face);
    });
  },
};

const shelf: WallDecorSpec = {
  kind: 'shelf',
  label: 'Wall Shelf',
  note: 'Small oddments, arranged by nobody.',
  footprint: { cols: 2, rows: 1 },
  draw(halfW, halfH, palette, seed) {
    const rng = createRng(seed + 41);
    const group = new Container();

    const woodColor = darken(palette.wall, 0.34);
    const boardY = halfH * 0.5;
    const boardT = halfH * 0.16;

    // Two brackets under the board.
    const brackets = new Graphics();
    for (const side of [-1, 1]) {
      const x = side * halfW * 0.62;
      brackets.moveTo(x - halfW * 0.05, boardY + boardT);
      brackets.lineTo(x + halfW * 0.05, boardY + boardT);
      brackets.lineTo(x + halfW * 0.02, boardY + boardT + halfH * 0.44);
      brackets.lineTo(x - halfW * 0.02, boardY + boardT + halfH * 0.44);
      brackets.closePath();
    }
    brackets.fill({ color: darken(woodColor, 0.2) });
    group.addChild(brackets);

    // The things on it, drawn before the board so its front edge cuts them.
    const stuff = new Container();
    stuff.y = boardY;
    group.addChild(stuff);

    const colors = [PALETTE.punch, PALETTE.mint, PALETTE.sky, PALETTE.grape, palette.accent];
    let x = -halfW * 0.78;
    while (x < halfW * 0.7) {
      const kind = rng();
      const w = halfW * rngRange(rng, 0.09, 0.16);
      const h = halfH * rngRange(rng, 0.4, 0.95);
      const color = colors[Math.floor(rng() * colors.length)];

      const item = new Graphics();
      if (kind < 0.45) {
        // A book, leaning or not.
        item.roundRect(x, -h, w, h, w * 0.2);
        item.fill(formFill(tones(color), 0.5));
        item.rotation = rng() < 0.2 ? rngRange(rng, 0.15, 0.3) : 0;
      } else if (kind < 0.78) {
        // A pot.
        item.moveTo(x, -h * 0.6);
        item.lineTo(x + w, -h * 0.6);
        item.lineTo(x + w * 0.82, 0);
        item.lineTo(x + w * 0.18, 0);
        item.closePath();
        item.fill(formFill(tones(color), 0.5));
        item.ellipse(x + w / 2, -h * 0.6, w * 0.55, h * 0.1);
        item.fill({ color: darken(color, 0.3) });
        // A sprig out of it.
        item.moveTo(x + w / 2, -h * 0.6);
        item.quadraticCurveTo(x + w * 0.2, -h * 0.95, x + w * 0.1, -h * 1.25);
        item.stroke({ color: PALETTE.mint, width: 2.4 });
      } else {
        // A round thing.
        item.circle(x + w / 2, -w * 0.6, w * 0.6);
        item.fill(formFill(tones(color), 0.7));
      }
      stuff.addChild(item);

      x += w + halfW * rngRange(rng, 0.03, 0.14);
    }

    const board = new Graphics();
    board.roundRect(-halfW, boardY, halfW * 2, boardT, boardT * 0.35);
    board.fill(formFill(tones(woodColor), 0.5));
    board.roundRect(-halfW, boardY, halfW * 2, boardT, boardT * 0.35);
    edge(board, woodColor, 2, 0.4);
    group.addChild(board);

    return group;
  },
};

const vines: WallDecorSpec = {
  kind: 'vines',
  label: 'Creeping Ivy',
  note: 'Getting in, slowly, from somewhere.',
  footprint: { cols: 2, rows: 3 },
  fill: 1,
  draw(halfW, halfH, palette, seed) {
    const rng = createRng(seed + 67);
    const group = new Container();

    const leafColor = mix(PALETTE.mint, palette.tint, 0.2);
    const stems = new Graphics();
    const leaves = new Graphics();

    // Four runners falling from the top edge, each wandering sideways as it
    // goes. Leaves are alternated left and right off the stem, which is what
    // makes ivy read as ivy rather than as seaweed.
    for (let i = 0; i < 4; i++) {
      let x = rngRange(rng, -halfW * 0.9, halfW * 0.9);
      let y = -halfH;
      const length = halfH * rngRange(rng, 0.8, 2);
      const steps = 8;

      stems.moveTo(x, y);
      for (let s = 1; s <= steps; s++) {
        const nx = x + rngRange(rng, -halfW * 0.12, halfW * 0.12);
        const ny = -halfH + (s / steps) * length;
        stems.quadraticCurveTo(x, (y + ny) / 2, nx, ny);

        const side = s % 2 === 0 ? 1 : -1;
        const leafW = halfW * rngRange(rng, 0.08, 0.15);
        drawOrganicOval(
          leaves,
          nx + side * leafW * 0.9,
          ny,
          leafW,
          leafW * 0.78,
          14,
          0.12,
          s + i,
        );

        x = nx;
        y = ny;
      }
    }

    stems.stroke({ color: darken(leafColor, 0.34), width: 2.4, alpha: 0.9 });
    leaves.fill(formFill(tones(leafColor), 0.66));
    leaves.stroke({ color: darken(leafColor, 0.36), width: 1.4, alpha: 0.4 });

    group.addChild(stems);
    group.addChild(leaves);

    return group;
  },
};

const hole: WallDecorSpec = {
  kind: 'hole',
  label: 'Hole in the Wall',
  note: 'Something lives in there. It is fine.',
  footprint: { cols: 1, rows: 1 },
  emits: { color: 0xffca6b, radius: 2.2, strength: 0.16 },
  draw(halfW, halfH, palette, seed) {
    const rng = createRng(seed + 101);
    const group = new Container();

    const r = Math.min(halfW, halfH);

    // The broken plaster around the opening: a ragged ring, lighter than the
    // wall, because a fresh break shows the pale stuff underneath.
    const broken = new Graphics();
    drawOrganicOval(broken, 0, 0, r * 1.15, r * 1.02, 26, 0.16, 3);
    broken.fill({ color: lighten(palette.wall, 0.24) });
    group.addChild(broken);

    // The hole itself, and the darkness in it.
    const cavity = new Graphics();
    drawOrganicOval(cavity, 0, r * 0.04, r * 0.86, r * 0.76, 24, 0.12, 1);
    cavity.fill({ color: darken(palette.wall, 0.78) });
    group.addChild(cavity);

    // A warm glow from inside, so the hole is somewhere rather than nothing.
    const inner = softGlow(r * 0.72, 0xffca6b, 0.28);
    inner.label = 'lamp-glow';
    inner.position.set(-r * 0.1, r * 0.1);
    group.addChild(inner);

    // Two eyes in the dark. They blink, and that is the entire joke.
    const eyes = new Graphics();
    const eyeR = r * 0.11;
    eyes.circle(-r * 0.22, r * 0.1, eyeR);
    eyes.circle(r * 0.14, r * 0.12, eyeR * 0.92);
    eyes.fill({ color: PALETTE.cream });
    eyes.circle(-r * 0.2, r * 0.11, eyeR * 0.5);
    eyes.circle(r * 0.16, r * 0.13, eyeR * 0.46);
    eyes.fill({ color: PALETTE.ink });
    group.addChild(eyes);

    // Crumbs of plaster on the wall below the break.
    const crumbs = new Graphics();
    for (let i = 0; i < 5; i++) {
      crumbs.circle(
        rngRange(rng, -r * 0.9, r * 0.9),
        r * rngRange(rng, 1.1, 1.5),
        rngRange(rng, 1.5, 3.5),
      );
    }
    crumbs.fill({ color: lighten(palette.wall, 0.3), alpha: 0.7 });
    group.addChild(crumbs);

    return group;
  },
};

const bunting: WallDecorSpec = {
  kind: 'bunting',
  label: 'Bunting',
  note: 'Left up long after whatever it was for.',
  footprint: { cols: 4, rows: 1 },
  fill: 1,
  draw(halfW, halfH, palette, seed) {
    const rng = createRng(seed + 131);
    const group = new Container();

    const colors = [PALETTE.punch, PALETTE.mint, PALETTE.sky, PALETTE.grape, palette.accent];
    const sag = halfH * 0.5;

    const string = new Graphics();
    string.moveTo(-halfW, -halfH * 0.5);
    string.quadraticCurveTo(0, -halfH * 0.5 + sag * 2, halfW, -halfH * 0.5);
    string.stroke({ color: darken(palette.wall, 0.45), width: 2, alpha: 0.8 });
    group.addChild(string);

    const flags = new Graphics();
    const count = 11;
    for (let i = 1; i < count; i++) {
      const t = i / count;
      // The string's own parabola, so the flags hang from it exactly.
      const x = -halfW + t * halfW * 2;
      const y = -halfH * 0.5 + 4 * sag * t * (1 - t);
      const w = halfW * 0.07;
      const h = halfH * rngRange(rng, 0.6, 0.8);

      flags.moveTo(x - w, y);
      flags.lineTo(x + w, y);
      flags.lineTo(x, y + h);
      flags.closePath();
      flags.fill({ color: colors[i % colors.length] });
    }
    group.addChild(flags);

    return group;
  },
};

const mirror: WallDecorSpec = {
  kind: 'mirror',
  label: 'Round Mirror',
  note: 'Reflects the light, and nothing else.',
  footprint: { cols: 1, rows: 1 },
  draw(halfW, halfH, palette) {
    const group = new Container();
    const r = Math.min(halfW, halfH);

    const shadow = new Graphics();
    shadow.circle(r * 0.08, r * 0.1, r);
    shadow.fill({ color: darken(palette.wall, 0.5), alpha: 0.22 });
    group.addChild(shadow);

    const rim = new Graphics();
    rim.circle(0, 0, r);
    rim.fill(formFill(tones(lighten(palette.accent, 0.1)), 0.6));
    group.addChild(rim);

    const glass = new Graphics();
    glass.circle(0, 0, r * 0.82);
    glass.fill(formFill(tones(mix(PALETTE.sky, PALETTE.cream, 0.55)), 0.8));
    group.addChild(glass);

    // Two flat sheens, upper left. A mirror is a highlight with a frame.
    const sheen = new Graphics();
    gloss(sheen, -r * 0.3, -r * 0.3, r * 0.28, r * 0.4, 0xffffff, 0.45);
    gloss(sheen, r * 0.24, r * 0.3, r * 0.14, r * 0.2, 0xffffff, 0.25);
    group.addChild(sheen);

    return group;
  },
};

const sconce: WallDecorSpec = {
  kind: 'sconce',
  label: 'Wall Sconce',
  note: 'A small light that is always on.',
  footprint: { cols: 1, rows: 1 },
  emits: { color: 0xffd9a0, radius: 3, strength: 0.2 },
  draw(halfW, halfH, palette) {
    const group = new Container();
    const brass = lighten(palette.accent, 0.15);

    const glow = softGlow(Math.min(halfW, halfH) * 3, 0xffd9a0, 0.3);
    glow.label = 'lamp-glow';
    glow.position.set(0, -halfH * 0.1);
    group.addChild(glow);

    const back = new Graphics();
    back.roundRect(-halfW * 0.16, -halfH * 0.1, halfW * 0.32, halfH * 0.9, halfW * 0.08);
    back.fill(formFill(tones(brass), 0.5));
    group.addChild(back);

    // The shade: a cone opening upward, with the lit inside showing.
    const shade = new Graphics();
    shade.moveTo(-halfW * 0.62, -halfH * 0.5);
    shade.lineTo(halfW * 0.62, -halfH * 0.5);
    shade.lineTo(halfW * 0.22, halfH * 0.1);
    shade.lineTo(-halfW * 0.22, halfH * 0.1);
    shade.closePath();
    shade.fill(formFill(tones(PALETTE.cream), 0.75));
    edge(shade, PALETTE.cream, 2, 0.35);
    group.addChild(shade);

    const mouth = new Graphics();
    mouth.label = 'lamp-glow';
    mouth.ellipse(0, -halfH * 0.5, halfW * 0.62, halfH * 0.12);
    mouth.fill({ color: 0xfff3d0, alpha: 0.9 });
    group.addChild(mouth);

    return group;
  },
};

const clock: WallDecorSpec = {
  kind: 'clock',
  label: 'Wall Clock',
  note: 'Tells the real time — the one honest thing in the room.',
  footprint: { cols: 1, rows: 1 },
  fill: 0.9,
  /**
   * The clock used to be a physics prop with its own anchored collider — four
   * separate systems special-cased it (`sortKeyOf`, `surfaceBodyAt`,
   * `Broadphase.interesting`, and the hit-test order in `PetHabitat`) purely so
   * it could hang in one fixed place, and none of that ever made it
   * draggable. It belongs here instead, where dragging, refusing an occupied
   * cell and deleting by lifting a piece off the wall already work for
   * everything else hanging up.
   *
   * `createClock` is reused whole (`assets/objects/decorations/Clock.ts`) — the
   * same artwork the room always drew, not a redrawn copy of it. Two things
   * reconcile it with this grid instead of the physics:
   *
   *   position   `createClock` draws bottom-anchored, the convention every
   *              floor prop uses (its case hangs from a hook at y=0 and
   *              extends upward). Every other piece on this wall is centred
   *              on (0, 0). One translation settles the difference; nothing
   *              about the clock's own drawing code changes.
   *   the hands  wall decor is drawn once into a container that is never
   *              ticked — there is no per-frame update for anything hanging
   *              on this grid, unlike a physics prop's `ObjectLife`. So the
   *              hands are posed once, for the moment the wall is built, by
   *              calling the same `updateLife` the room would otherwise call
   *              every frame. The clock is right when you look at it and does
   *              not visibly advance between glances — the trade the wall's
   *              simplicity costs, and cheap at the price: the wall rebuilds
   *              (and the clock reposes) on every `RoomStyle` change already.
   */
  draw(halfW, halfH) {
    const group = new Container();

    const clockView = createClock({
      width: halfW * 2,
      height: halfH * 2,
      // Its own fixed colours, not the room's palette — the clock never took
      // its tint from the room even as a physics prop (the old
      // `ObjectCatalog.OBJECT_COLORS.clock` named these same three constants),
      // and a face that repainted itself to match the walls would stop
      // reading as a clock.
      color: PALETTE.cream,
      secondaryColor: darken(PALETTE.sand, 0.3),
      accentColor: PALETTE.ink,
    });
    clockView.position.set(0, halfH);
    updateLife(clockView, 0, { time: 0, lightsOn: true, now: new Date() });

    group.addChild(clockView);
    return group;
  },
};

const DECOR: Record<WallDecorKind, WallDecorSpec> = {
  painting,
  portrait,
  shelf,
  vines,
  hole,
  bunting,
  mirror,
  sconce,
  clock,
};

export const WALL_DECOR_LIST: WallDecorSpec[] = WALL_DECOR_KINDS.map((kind) => DECOR[kind]);

export function getWallDecor(kind: WallDecorKind | string): WallDecorSpec {
  return DECOR[kind as WallDecorKind] ?? DECOR.painting;
}
