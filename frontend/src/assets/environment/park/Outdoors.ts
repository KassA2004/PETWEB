/**
 * The park's scenery: a sky, a treeline, a fence and a lawn.
 *
 * The room's own scenery is a box with a window in it (`Walls.ts`, `Floor.ts`),
 * and none of it survives being taken outdoors: there is no back wall to paint,
 * no glass to look through, and the light is not coming from anywhere in
 * particular. So the park brings its own, which is exactly what
 * `world/environments/types.ts` says an environment is for — *"a floor to walk
 * on, some scenery to draw, a light to sit under"* — and why `createScenery`
 * returns containers rather than taking a wallpaper.
 *
 * What is *not* different is the camera. The park is the same box seen from the
 * same place (`world/Projection.ts`): the same trapezoid of ground, the same
 * grid seams under it, the same rule that things at the back are drawn smaller.
 * An environment may change what is in it and what it is made of; it may never
 * move the viewer, because the pointer, the depth rows and the draw order are
 * all built on the camera (`types.ts` again). A park that moved the camera would
 * be a different game rather than a different place.
 *
 * Everything here is drawn from `Ambience`, the same five hours the room has, so
 * a park at dusk and a bedroom at dusk are lit by the same decision and read as
 * the same world.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, outline } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import type { Ambience } from '../../../world/Ambience';
import {
  GRID_COLUMNS,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_ROWS,
  TILE,
  columnLine,
  rowLine,
} from '../../../world/FloorGrid';
import {
  HORIZON_FLOOR_Y,
  ROOM_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  floorQuad,
  project,
  scaleAt,
} from '../../../world/Projection';

export interface OutdoorsOptions {
  ambience: Ambience;
  /** The park's own colour — the grass, before the hour grades it. */
  tint: number;
  seed?: number;
}

/**
 * The sky, and what is standing against it.
 *
 * Everything above the horizon, in one container, drawn back to front: the sky
 * band, a far treeline, a nearer one, and the fence that closes the lawn.
 *
 * The horizon is `HORIZON_FLOOR_Y` — the screen y where the ground meets the
 * back of the room — so the sky ends exactly where the grass begins. Taking
 * that number from the projection rather than writing one down is what stops a
 * seam appearing the day the camera is retuned.
 */
export function createSky(options: OutdoorsOptions): Container {
  const { ambience } = options;
  const { sky } = ambience;
  const rng = createRng(options.seed ?? 41);

  const root = new Container();
  root.label = 'park-sky';

  // --- The sky itself ------------------------------------------------------
  // Two bands rather than a gradient fill: the palette is flat everywhere else
  // in the product (theme-and-design.md §11.1 — "layered solid-colour shapes
  // rather than gradients"), and three overlapping translucent bands read as
  // atmosphere where a true gradient reads as a different renderer.
  const canvas = new Graphics();
  canvas.rect(0, 0, SCREEN_WIDTH, HORIZON_FLOOR_Y + 4);
  canvas.fill({ color: sky.color });

  canvas.rect(0, 0, SCREEN_WIDTH, HORIZON_FLOOR_Y * 0.55);
  canvas.fill({ color: darken(sky.color, 0.16), alpha: 0.55 });

  canvas.rect(0, HORIZON_FLOOR_Y * 0.62, SCREEN_WIDTH, HORIZON_FLOOR_Y * 0.38);
  canvas.fill({ color: lighten(sky.color, 0.22), alpha: 0.5 });
  root.addChild(canvas);

  // --- Stars, on the hours that have any ----------------------------------
  if (sky.stars > 0) {
    const stars = new Graphics();

    for (let i = 0; i < sky.stars * 4; i += 1) {
      const x = rngRange(rng, 0, SCREEN_WIDTH);
      const y = rngRange(rng, 10, HORIZON_FLOOR_Y * 0.7);
      stars.circle(x, y, rngRange(rng, 0.8, 2.1));
      stars.fill({ color: 0xffffff, alpha: rngRange(rng, 0.35, 0.9) });
    }

    root.addChild(stars);
  }

  // --- Sun or moon ---------------------------------------------------------
  if (sky.disc !== null) {
    const disc = new Graphics();
    const x = SCREEN_WIDTH * 0.74;
    const y = HORIZON_FLOOR_Y * (1 - sky.discHeight);

    // A soft halo, then the disc. Two circles is the whole of "it is glowing",
    // and it costs nothing.
    disc.circle(x, y, 74);
    disc.fill({ color: sky.disc, alpha: 0.16 });
    disc.circle(x, y, 50);
    disc.fill({ color: sky.disc, alpha: 0.26 });
    disc.circle(x, y, 30);
    disc.fill({ color: sky.disc });
    root.addChild(disc);
  }

  // --- Clouds --------------------------------------------------------------
  // Only on hours with light in them. A cloud at midnight is a grey smudge.
  //
  // **Ellipses, wide and flat, at low alpha — not circles.** The first version
  // of this was overlapping circles at half opacity, and every one of them read
  // as a soap bubble: a circle has a single obvious centre, and three of them
  // at high contrast is a diagram of three circles rather than a cloud. Flat
  // ellipses have no centre to find, and drawing each cloud as ONE fill rather
  // than one per puff removes the seams where they crossed, which is what made
  // the bubbles legible as bubbles.
  if (sky.stars === 0) {
    for (let i = 0; i < 3; i += 1) {
      const cloud = new Graphics();
      const width = rngRange(rng, 170, 300);
      // Kept inside the frame: a cloud half off the edge is a smudge.
      const x = rngRange(rng, width * 0.6, SCREEN_WIDTH - width * 0.6);
      const y = rngRange(rng, 46, HORIZON_FLOOR_Y * 0.42);
      const puffs = 4;

      for (let p = 0; p < puffs; p += 1) {
        const t = p / (puffs - 1) - 0.5;
        // Tallest in the middle, tapering to nothing at both ends.
        const taper = 1 - Math.abs(t) * 1.4;
        cloud.ellipse(
          x + t * width,
          y - Math.max(0, taper) * 7,
          width * 0.32,
          Math.max(5, 22 * taper),
        );
      }

      // A flat base, so the cloud sits on a line the way a real one does.
      cloud.ellipse(x, y + 6, width * 0.46, 9);

      cloud.fill({ color: lighten(sky.color, 0.62), alpha: 0.34 });
      root.addChild(cloud);
    }
  }

  // --- Two treelines -------------------------------------------------------
  // The far one is nearly the sky's colour and the near one nearly the land's,
  // which is aerial perspective doing the work rather than a blur.
  root.addChild(
    createTreeline({
      baseY: HORIZON_FLOOR_Y + 2,
      height: 62,
      color: mix(sky.land, sky.color, 0.55),
      count: 22,
      rng,
    }),
  );

  root.addChild(
    createTreeline({
      baseY: HORIZON_FLOOR_Y + 4,
      height: 38,
      color: mix(sky.land, PALETTE.ink, 0.18),
      count: 15,
      rng,
    }),
  );

  root.addChild(createFence(options));

  return root;
}

/**
 * A row of trees as one silhouette.
 *
 * One `Graphics` and one fill for the whole line, because a treeline is read as
 * a shape rather than as trees — and twenty individually filled trees would be
 * twenty draw calls for something nobody will ever look at directly.
 */
function createTreeline(options: {
  baseY: number;
  height: number;
  color: number;
  count: number;
  rng: () => number;
}): Graphics {
  const { baseY, height, color, count, rng } = options;
  const line = new Graphics();
  const step = SCREEN_WIDTH / (count - 1);

  for (let i = 0; i < count; i += 1) {
    const x = i * step + rngRange(rng, -step * 0.3, step * 0.3);
    const h = height * rngRange(rng, 0.55, 1.35);
    const w = h * rngRange(rng, 0.5, 0.85);

    // Three overlapping blobs per tree: a canopy that is not a circle, which
    // is the difference between a treeline and a row of lollipops.
    line.ellipse(x, baseY - h * 0.8, w * 0.6, h * 0.55);
    line.ellipse(x - w * 0.34, baseY - h * 0.5, w * 0.45, h * 0.42);
    line.ellipse(x + w * 0.32, baseY - h * 0.55, w * 0.42, h * 0.4);
    line.rect(x - w * 0.07, baseY - h * 0.6, w * 0.14, h * 0.6);
  }

  line.fill({ color });
  return line;
}

/**
 * The fence along the back of the lawn.
 *
 * Sits on the line where the ground meets the horizon, in perspective: the
 * posts are placed in *room* coordinates and projected, so they converge with
 * everything else rather than marching across the screen at a constant pitch.
 * A fence drawn in screen space is the single easiest way to break the
 * illusion the projection has just built.
 */
function createFence(options: OutdoorsOptions): Container {
  const { ambience, tint } = options;
  const rng = createRng((options.seed ?? 41) + 7);

  const root = new Container();
  root.label = 'park-fence';

  const wood = mix(PALETTE.sand, tint, 0.18);
  const graded = mix(wood, ambience.grade.color, ambience.grade.amount);

  const posts = new Graphics();
  const rails = new Graphics();

  const backZ = 0;
  const postHeight = 150;
  const count = 15;

  const railTops: { x: number; y: number }[] = [];
  const railMids: { x: number; y: number }[] = [];

  for (let i = 0; i <= count; i += 1) {
    const x = (i / count) * ROOM_WIDTH;
    const foot = project(x, 0, backZ);
    const head = project(x, postHeight * rngRange(rng, 0.92, 1.08), backZ);
    const width = 13 * scaleAt(backZ);

    posts.rect(foot.x - width / 2, head.y, width, foot.y - head.y);

    railTops.push(project(x, postHeight * 0.86, backZ));
    railMids.push(project(x, postHeight * 0.48, backZ));
  }

  posts.fill({ color: graded });

  // Two rails, drawn as thin quads between the projected points so they sit at
  // the posts' own scale rather than at a stroke width somebody chose.
  for (const row of [railTops, railMids]) {
    rails.moveTo(row[0].x, row[0].y);
    for (const point of row) rails.lineTo(point.x, point.y);
    rails.stroke({ color: darken(graded, 0.12), width: 7 * scaleAt(backZ) });
  }

  root.addChild(rails);
  root.addChild(posts);

  // A dark seam where the posts meet the ground, so the fence is standing in
  // the grass rather than resting on it.
  const seam = new Graphics();
  const left = project(0, 0, backZ);
  const right = project(ROOM_WIDTH, 0, backZ);
  seam.moveTo(left.x, left.y);
  seam.lineTo(right.x, right.y);
  seam.stroke({ color: outline(graded, 0.4), width: 3, alpha: 0.35 });
  root.addChild(seam);

  return root;
}

/**
 * The lawn.
 *
 * The same trapezoid the room's floor uses, for the same reason: it is the
 * shape the camera makes of a rectangle of ground, and using any other one
 * would mean the grass and the furniture standing on it disagreed about where
 * the room is.
 *
 * The grid seams are drawn here too, faintly. They are not decoration — they
 * sit exactly on the placement grid, so "which cell is that in" has a visible
 * answer at all times (`Floor.ts` makes the same argument). Fainter than
 * indoors, because mown stripes are a real thing a lawn does and floorboards
 * are a real thing a floor does, and neither should look like a wireframe.
 */
export function createLawn(options: OutdoorsOptions): Container {
  const { ambience, tint } = options;
  const rng = createRng((options.seed ?? 41) + 3);

  const root = new Container();
  root.label = 'park-lawn';

  const grass = mix(mix(PALETTE.mint, tint, 0.28), ambience.grade.color, ambience.grade.amount);

  const ground = new Graphics();
  ground.poly(floorQuad().flatMap((point) => [point.x, point.y]));
  ground.fill({ color: grass });

  // Mown stripes: alternate rows a shade apart. Drawn from the grid's own rows
  // so the stripes and the cells are the same lines.
  for (let row = 0; row < GRID_ROWS; row += 1) {
    if (row % 2 === 1) continue;

    const near = GRID_ORIGIN_Z + row * TILE;
    const far = near + TILE;

    ground.poly([
      project(GRID_ORIGIN_X, 0, near),
      project(GRID_ORIGIN_X + GRID_COLUMNS * TILE, 0, near),
      project(GRID_ORIGIN_X + GRID_COLUMNS * TILE, 0, far),
      project(GRID_ORIGIN_X, 0, far),
    ].flatMap((point) => [point.x, point.y]));
    ground.fill({ color: lighten(grass, 0.06) });
  }

  root.addChild(ground);

  // The seams, at a third of the floor's strength.
  const seams = new Graphics();

  for (let col = 0; col <= GRID_COLUMNS; col += 1) {
    const [a, b] = columnLine(GRID_ORIGIN_X + col * TILE);
    seams.moveTo(a.x, a.y);
    seams.lineTo(b.x, b.y);
  }

  for (let row = 0; row <= GRID_ROWS; row += 1) {
    const [a, b] = rowLine(GRID_ORIGIN_Z + row * TILE);
    seams.moveTo(a.x, a.y);
    seams.lineTo(b.x, b.y);
  }

  seams.stroke({ color: darken(grass, 0.22), width: 1.5, alpha: 0.28 });
  root.addChild(seams);

  // --- Tufts ---------------------------------------------------------------
  // Scattered on the grid rather than on the screen, and scaled by depth, so
  // the near ones are big and the far ones are small — the same rule
  // everything else in the world obeys. Without it the lawn reads as a
  // wallpaper the creature is standing in front of.
  const tufts = new Graphics();

  for (let i = 0; i < 90; i += 1) {
    const x = rngRange(rng, GRID_ORIGIN_X, GRID_ORIGIN_X + GRID_COLUMNS * TILE);
    const z = rngRange(rng, GRID_ORIGIN_Z, GRID_ORIGIN_Z + GRID_ROWS * TILE);
    const at = project(x, 0, z);
    const scale = scaleAt(z);
    const height = rngRange(rng, 7, 15) * scale;

    for (let blade = -1; blade <= 1; blade += 1) {
      tufts.moveTo(at.x + blade * 3 * scale, at.y);
      tufts.lineTo(at.x + blade * 5.5 * scale, at.y - height * (1 - Math.abs(blade) * 0.3));
    }

    tufts.stroke({
      color: rng() > 0.5 ? darken(grass, 0.2) : lighten(grass, 0.16),
      width: Math.max(0.8, 1.8 * scale),
      alpha: 0.7,
    });
  }

  root.addChild(tufts);

  // --- The field beyond the frame -----------------------------------------
  // The frame letterboxes when the canvas is not exactly 16:9, and a park whose
  // grass stops at the edge of the picture reads as a picture of a park. One
  // band of the same green under everything fixes it.
  const field = new Graphics();
  field.rect(0, HORIZON_FLOOR_Y, SCREEN_WIDTH, SCREEN_HEIGHT - HORIZON_FLOOR_Y);
  // Barely darker than the lawn. It used to be a fifth darker, which turned the
  // two bottom corners into a different field with a hard seam along the
  // horizon — the band's job is to keep the green going past the frame, not to
  // be something.
  field.fill({ color: darken(grass, 0.05) });

  const withField = new Container();
  withField.addChild(field);
  withField.addChild(root);
  withField.label = 'park-ground';

  return withField;
}

/**
 * Bushes along the edges, in front of the fence.
 *
 * Scenery in the strict sense the simulation uses: something to look at and
 * wonder about, never to walk to (`PetBrain`'s `reachable`). They are placed
 * *outside* the placement grid — in the margin between the grid's edge and the
 * room's wall — so they can never stand where somebody's creature wants to be.
 */
export function createBorder(options: OutdoorsOptions): Container {
  const { ambience, tint } = options;
  const rng = createRng((options.seed ?? 41) + 11);

  const root = new Container();
  root.label = 'park-border';

  const leaf = mix(mix(PALETTE.mint, tint, 0.2), ambience.grade.color, ambience.grade.amount);

  // Both margins: the strip of ground between the grid and each side wall.
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 5; i += 1) {
      const z = GRID_ORIGIN_Z + (i / 4) * GRID_ROWS * TILE * 0.9;
      const x = side < 0
        ? rngRange(rng, 4, GRID_ORIGIN_X - 6)
        : rngRange(rng, GRID_ORIGIN_X + GRID_COLUMNS * TILE + 6, ROOM_WIDTH - 4);

      root.addChild(createBush(x, z, leaf, rng));
    }
  }

  // Depth order within the border, so a near bush covers a far one.
  root.sortableChildren = true;
  return root;
}

/**
 * One shrub.
 *
 * The first version of these was the lawn's own green lightened, and at the
 * front of the room they read as patches of fog lying on the grass rather than
 * as plants — too pale, too big, and no shading to say which way is up. Three
 * changes fixed it and all three are the project's existing rules applied
 * rather than anything new:
 *
 *   **darker than the ground it stands on.** Foliage in front of grass is the
 *   darker of the two, always, or it reads as mist
 *   **a shade along the bottom** (theme-and-design.md §9) — one solid shape,
 *   not a gradient
 *   **one small highlight** on top, likewise solid (§11.1)
 */
function createBush(x: number, z: number, color: number, rng: () => number): Graphics {
  const bush = new Graphics();
  const at = project(x, 0, z);
  const scale = scaleAt(z);
  const size = rngRange(rng, 26, 44) * scale;

  // A bush is darker than the lawn behind it — that contrast is the whole of
  // "this is a plant and that is the ground".
  const leaf = darken(color, 0.22);

  bush.ellipse(at.x, at.y - size * 0.55, size * 0.9, size * 0.62);
  bush.ellipse(at.x - size * 0.5, at.y - size * 0.28, size * 0.55, size * 0.4);
  bush.ellipse(at.x + size * 0.48, at.y - size * 0.32, size * 0.52, size * 0.38);

  // Four bumps along the top, at uneven heights. Without them the silhouette is
  // one smooth dome, and a smooth dark green dome on grass is a rock. Foliage
  // is read at the outline before it is read anywhere else — the same argument
  // §11.1 makes about creatures: the shape has to be right before the shading
  // is worth doing.
  for (let i = 0; i < 4; i += 1) {
    const t = (i / 3 - 0.5) * 1.5;
    bush.circle(
      at.x + t * size * 0.8,
      at.y - size * (0.82 - Math.abs(t) * 0.3) - rngRange(rng, 0, size * 0.1),
      size * rngRange(rng, 0.2, 0.3),
    );
  }

  bush.fill({ color: leaf });

  // The shade along the bottom.
  bush.ellipse(at.x, at.y - size * 0.2, size * 1.05, size * 0.3);
  bush.fill({ color: darken(leaf, 0.2), alpha: 0.55 });

  // And one highlight where the light lands.
  bush.ellipse(at.x - size * 0.18, at.y - size * 0.82, size * 0.4, size * 0.2);
  bush.fill({ color: lighten(leaf, 0.24), alpha: 0.7 });

  bush.zIndex = z;
  return bush;
}
