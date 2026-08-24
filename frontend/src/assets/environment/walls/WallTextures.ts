/**
 * What the walls are made of.
 *
 * Texture, not colour. The colour is the room's tint graded by the hour
 * (world/Ambience.ts); this is the *material* laid over it, and the two are
 * kept apart for the same reason the floor's pattern is kept apart from the
 * floorboards' colour: a sage panelled room and an ember panelled room should
 * be the same panelling.
 *
 * Everything here is drawn in **world space and projected**, so a texture
 * follows the room's perspective onto all three faces. That is the whole
 * difference between wallpaper and a screen-space pattern painted over a
 * picture of a wall: brick courses have to converge toward the vanishing point
 * on the side walls, or the box stops being a box.
 *
 * The budget is deliberately small — a couple of tones and some lines. A wall
 * is background (§16: the environment stays softer than the pet), and a wall
 * with a rendered material on it competes with the creature standing in front
 * of it.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  WALL_HEIGHT,
  project,
} from '../../../world/Projection';

export const WALL_TEXTURES = [
  'plaster',
  'panelled',
  'planks',
  'brick',
  'stripes',
  'tile',
] as const;

export type WallTexture = (typeof WALL_TEXTURES)[number];

export const WALL_TEXTURE_LABELS: Record<WallTexture, string> = {
  plaster: 'Plaster',
  panelled: 'Panelling',
  planks: 'Planks',
  brick: 'Brick',
  stripes: 'Stripes',
  tile: 'Tiles',
};

/** How high up the walls a texture is drawn before it fades out. */
const TEXTURE_TOP = 640;

/**
 * A point on whichever wall we are decorating.
 *
 * `u` runs 0..1 along the wall and `v` runs 0..1 up it, so one drawing routine
 * serves all three faces and each one gets the perspective it deserves for
 * free. The back wall runs across x at z = 0; the side walls run along z at a
 * fixed x.
 */
type WallFace = 'back' | 'left' | 'right';

function facePoint(face: WallFace, u: number, v: number) {
  const y = v * TEXTURE_TOP;
  if (face === 'back') return project(u * ROOM_WIDTH, y, 0);
  return project(face === 'left' ? 0 : ROOM_WIDTH, y, u * ROOM_DEPTH);
}

/** Every face, so a texture is written once and applied three times. */
const FACES: WallFace[] = ['back', 'left', 'right'];

/** How much darker or lighter each face is, matching `createWalls`. */
const FACE_SHIFT: Record<WallFace, number> = { back: 0, left: -0.18, right: 0.07 };

function faceColor(face: WallFace, color: number): number {
  const shift = FACE_SHIFT[face];
  return shift < 0 ? darken(color, -shift) : lighten(color, shift);
}

/** Draw a horizontal seam across a face at height `v`. */
function seam(g: Graphics, face: WallFace, v: number) {
  const a = facePoint(face, 0, v);
  const b = facePoint(face, 1, v);
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
}

/** Draw a vertical seam up a face at position `u`. */
function riser(g: Graphics, face: WallFace, u: number, from: number, to: number) {
  const a = facePoint(face, u, from);
  const b = facePoint(face, u, to);
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
}

/** Fill the quad between two u's and two v's on a face. */
function patch(
  g: Graphics,
  face: WallFace,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
) {
  const a = facePoint(face, u0, v1);
  const b = facePoint(face, u1, v1);
  const c = facePoint(face, u1, v0);
  const d = facePoint(face, u0, v0);
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
}

/* -------------------------------------------------------------------------- */

/**
 * Build the texture layer for a wall colour.
 *
 * Returns a container to be laid over the flat wall shell. Nothing here fills
 * the wall itself — that is `createWalls`'s job, and keeping the fill and the
 * material apart is what lets the material be swapped without repainting.
 */
export function createWallTexture(texture: WallTexture, color: number, seed = 5): Container {
  const root = new Container();
  root.label = `wall-${texture}`;

  if (texture === 'plaster') {
    // Not nothing: a few very faint patches, so a flat wall has some life in
    // it. Anything more and plaster stops being the quiet option.
    const rng = createRng(seed);
    const mottle = new Graphics();
    for (const face of FACES) {
      for (let i = 0; i < 5; i++) {
        const u = rngRange(rng, 0.05, 0.95);
        const v = rngRange(rng, 0.1, 0.9);
        const w = rngRange(rng, 0.04, 0.12);
        patch(mottle, face, u - w, u + w, v - w * 0.7, v + w * 0.7);
      }
    }
    mottle.fill({ color: lighten(color, 0.12), alpha: 0.12 });
    root.addChild(mottle);
    return root;
  }

  if (texture === 'panelled') {
    // A dado rail with raised panels below it, which is the single most
    // effective way to make a room look like somebody's house.
    const railV = 0.34;

    for (const face of FACES) {
      const local = faceColor(face, color);

      const below = new Graphics();
      patch(below, face, 0, 1, 0, railV);
      below.fill({ color: darken(local, 0.1) });
      root.addChild(below);

      const panels = new Graphics();
      const count = face === 'back' ? 9 : 5;
      for (let i = 0; i < count; i++) {
        const u0 = (i + 0.14) / count;
        const u1 = (i + 0.86) / count;
        patch(panels, face, u0, u1, 0.06, railV - 0.06);
      }
      panels.fill({ color: lighten(local, 0.08) });
      panels.stroke({ color: darken(local, 0.24), width: 1.6, alpha: 0.5 });
      root.addChild(panels);

      const rail = new Graphics();
      patch(rail, face, 0, 1, railV, railV + 0.022);
      rail.fill({ color: lighten(local, 0.24) });
      root.addChild(rail);
    }

    return root;
  }

  if (texture === 'planks') {
    const boards = new Graphics();
    for (const face of FACES) {
      for (let i = 1; i < 11; i++) seam(boards, face, i / 11);
    }
    boards.stroke({ color: darken(color, 0.26), width: 2, alpha: 0.3 });
    root.addChild(boards);

    const shade = new Graphics();
    for (const face of FACES) {
      for (let i = 0; i < 11; i += 2) patch(shade, face, 0, 1, i / 11, (i + 1) / 11);
    }
    shade.fill({ color: darken(color, 0.12), alpha: 0.25 });
    root.addChild(shade);
    return root;
  }

  if (texture === 'brick') {
    const courses = 16;
    const mortar = new Graphics();
    const faceShade = new Graphics();

    for (const face of FACES) {
      const perCourse = face === 'back' ? 12 : 7;

      for (let row = 0; row < courses; row++) {
        const v0 = row / courses;
        const v1 = (row + 1) / courses;
        seam(mortar, face, v0);

        // Every other course offset by half a brick — the bond is the entire
        // difference between brick and a grid of rectangles.
        const offset = row % 2 === 0 ? 0 : 0.5;
        for (let i = 0; i <= perCourse; i++) {
          const u = (i + offset) / perCourse;
          if (u <= 0 || u >= 1) continue;
          riser(mortar, face, u, v0, v1);
        }

        if (row % 3 === 0) patch(faceShade, face, 0, 1, v0, v1);
      }
    }

    faceShade.fill({ color: darken(color, 0.14), alpha: 0.2 });
    root.addChild(faceShade);
    mortar.stroke({ color: lighten(color, 0.2), width: 1.8, alpha: 0.35 });
    root.addChild(mortar);
    return root;
  }

  if (texture === 'stripes') {
    const stripes = new Graphics();
    for (const face of FACES) {
      const count = face === 'back' ? 22 : 13;
      for (let i = 0; i < count; i += 2) {
        patch(stripes, face, i / count, (i + 1) / count, 0, 1);
      }
    }
    stripes.fill({ color: lighten(color, 0.14), alpha: 0.32 });
    root.addChild(stripes);
    return root;
  }

  // tile
  const grout = new Graphics();
  const glaze = new Graphics();

  for (const face of FACES) {
    const cols = face === 'back' ? 14 : 8;
    const rows = 10;

    for (let i = 1; i < cols; i++) riser(grout, face, i / cols, 0, 1);
    for (let j = 1; j < rows; j++) seam(grout, face, j / rows);

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i + j) % 4 !== 0) continue;
        patch(glaze, face, i / cols, (i + 1) / cols, j / rows, (j + 1) / rows);
      }
    }
  }

  glaze.fill({ color: mix(lighten(color, 0.3), 0xffffff, 0.2), alpha: 0.18 });
  root.addChild(glaze);
  grout.stroke({ color: darken(color, 0.3), width: 1.6, alpha: 0.3 });
  root.addChild(grout);

  return root;
}

/**
 * A soft fade over the top of the texture layer.
 *
 * The textures stop at `TEXTURE_TOP` and would otherwise end in a hard line
 * across the wall. One translucent band, sold as the room going dark toward
 * the ceiling, which is what a room actually does.
 */
export function createWallFade(color: number): Container {
  const root = new Container();
  const g = new Graphics();

  const a = project(0, TEXTURE_TOP, 0);
  const b = project(ROOM_WIDTH, TEXTURE_TOP, 0);
  const c = project(ROOM_WIDTH, WALL_HEIGHT, 0);
  const d = project(0, WALL_HEIGHT, 0);
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
  g.fill({ color: darken(color, 0.22), alpha: 0.3 });

  root.addChild(g);
  return root;
}
