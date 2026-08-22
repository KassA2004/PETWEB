/**
 * Lighting — the mood, built entirely out of flat translucent shapes.
 *
 * Three passes, in the order the eye reads them:
 *
 *   haze      the back of the room paled and cooled, so distance reads even
 *             where nothing overlaps (aerial perspective, §8)
 *   ambient   what the light is doing on the floor: the shafts falling out of
 *             the window and the pool they land in. Below the furniture, so
 *             light lies *under* things rather than being painted over them.
 *   overlay   the mood sheet and the vignette, above everything including the
 *             creature — the two passes that make the same room read as
 *             morning or as midnight (§17)
 *
 * There is no gradient, no blend mode and no filter anywhere in this project.
 * Light is a shape, like everything else (/Docs/theme-and-design.md §4).
 */

import { Container, Graphics } from 'pixi.js';
import type { Ambience } from '../../world/Ambience';
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  floorLine,
  project,
  scaleAt,
} from '../../world/Projection';

export interface LightingOptions {
  width: number;
  height: number;
  ambience: Ambience;
  /** The window, in room coordinates: where the light comes from. */
  window: { x: number; y: number; z: number };
  /** Half-extents of the opening, in world units. */
  windowHalf: { w: number; h: number };
  /** Where the light lands on the floor, in room coordinates. */
  pool: { x: number; z: number };
}

export interface LightingLayers {
  /** Behind the room's contents but in front of the walls: haze. */
  haze: Container;
  /** Above the floor, below anything standing on it: shafts and pool. */
  ambient: Container;
  /** Above everything: mood wash and vignette. */
  overlay: Container;
}

/** A quad from four screen points. */
function quad(
  graphics: Graphics,
  points: { x: number; y: number }[],
  color: number,
  alpha: number,
) {
  graphics.poly(points.flatMap((point) => [point.x, point.y]));
  graphics.fill({ color, alpha });
}

/**
 * The beam of light between a window opening and the patch of floor it lands
 * on.
 *
 * Drawn as a quad rather than a cone because the two ends are exactly what the
 * eye is checking: the beam has to leave the window at the window's width and
 * arrive on the floor where the pool is, or it reads as a stray triangle.
 */
function shaft(
  graphics: Graphics,
  window: LightingOptions['window'],
  half: LightingOptions['windowHalf'],
  pool: LightingOptions['pool'],
  spread: number,
  color: number,
  alpha: number,
) {
  const landWidth = half.w * spread;

  quad(
    graphics,
    [
      project(window.x - half.w, window.y + half.h, window.z),
      project(window.x + half.w, window.y + half.h, window.z),
      project(pool.x + landWidth, 0, pool.z),
      project(pool.x - landWidth, 0, pool.z),
    ],
    color,
    alpha,
  );
}

export function createLighting(options: LightingOptions): LightingLayers {
  const { width, height, ambience, window: win, windowHalf, pool } = options;
  const strength = ambience.key.strength;
  const key = ambience.key.color;

  // --- Haze: distance, painted -------------------------------------------
  // A band lying over the back of the room only, fading out by the middle
  // depth row. It is what makes the back wall sit *behind* the furniture in
  // front of it rather than merely above it in the draw order.
  const haze = new Container();
  haze.label = 'lighting-haze';

  const distance = new Graphics();
  const hazeColor = ambience.wash.alpha > 0.14 ? ambience.wash.color : key;
  // Six thin bands rather than three thick ones: the falloff has to be
  // invisible, and a band the eye can find is a band that reads as a stripe
  // painted across the wall.
  for (const [depth, alpha] of [
    [0, 0.05],
    [70, 0.045],
    [140, 0.04],
    [220, 0.032],
    [300, 0.024],
    [380, 0.016],
  ] as const) {
    const [left, right] = floorLine(depth);
    distance.poly([0, 0, width, 0, right.x, right.y, left.x, left.y]);
    distance.fill({ color: hazeColor, alpha: alpha * (0.6 + strength * 0.5) });
  }
  haze.addChild(distance);

  // --- Ambient: light on the floor ---------------------------------------
  const ambient = new Container();
  ambient.label = 'lighting-ambient';

  // A stack of beams at widening spreads reads as one shaft with a soft edge.
  // A single quad reads as a triangle somebody drew on the floor.
  const beams = new Graphics();
  for (const [spread, alpha] of [
    [2.9, 0.028],
    [2.3, 0.028],
    [1.8, 0.03],
    [1.35, 0.03],
    [0.95, 0.032],
  ] as const) {
    shaft(beams, win, windowHalf, pool, spread, key, alpha * strength);
  }
  ambient.addChild(beams);

  // The pool itself, flattened by the perspective and scaled to its depth, so
  // light landing at the back of the room is a smaller patch of light.
  const centre = project(pool.x, 0, pool.z);
  const s = scaleAt(pool.z);

  const patch = new Graphics();
  // Seven rings, each barely there. The pool has no edge anywhere, which is
  // the whole difference between light lying on a floor and a disc drawn on
  // one.
  for (let i = 7; i >= 1; i--) {
    const t = i / 7;
    patch.ellipse(centre.x, centre.y, 440 * t * s, 158 * t * s);
    patch.fill({ color: key, alpha: 0.042 * strength });
  }
  ambient.addChild(patch);

  // A wash of light along the wall the window is in, spilling from the sill
  // down onto the baseboard. Cheap, and it stops the back wall from being one
  // dead flat colour.
  const spill = new Graphics();
  quad(
    spill,
    [
      project(win.x - windowHalf.w * 2.1, win.y - windowHalf.h * 0.2, 0),
      project(win.x + windowHalf.w * 2.1, win.y - windowHalf.h * 0.2, 0),
      project(win.x + windowHalf.w * 3.2, 0, 0),
      project(win.x - windowHalf.w * 3.2, 0, 0),
    ],
    key,
    0.05 * strength,
  );
  ambient.addChild(spill);

  // --- Overlay: the mood sheet and the frame ------------------------------
  const overlay = new Container();
  overlay.label = 'lighting-overlay';

  if (ambience.wash.alpha > 0) {
    const wash = new Graphics();
    wash.rect(0, 0, width, height);
    wash.fill({ color: ambience.wash.color, alpha: ambience.wash.alpha });
    overlay.addChild(wash);
  }

  // Vignette: four stacks of bands rather than a radial gradient. They overlap
  // at the corners, which is where a vignette is meant to be darkest anyway.
  //
  // Nine bands, and the widest ones carry the least: an even stack has a
  // visible step at its outer edge, and a step in a vignette is a picture
  // frame drawn around the room.
  const vignette = new Graphics();
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const alpha = (ambience.vignette.alpha / steps) * (1.6 - t);
    const bandY = height * 0.22 * t;
    const bandX = width * 0.17 * t;

    vignette.rect(0, 0, width, bandY);
    vignette.rect(0, height - bandY * 1.15, width, bandY * 1.15);
    vignette.rect(0, 0, bandX, height);
    vignette.rect(width - bandX, 0, bandX, height);
    vignette.fill({ color: ambience.vignette.color, alpha });
  }
  overlay.addChild(vignette);

  return { haze, ambient, overlay };
}

/** Where the window's light lands, for a window at this place on the wall. */
export function poolFor(window: { x: number }): { x: number; z: number } {
  return {
    x: Math.min(ROOM_WIDTH * 0.86, window.x + ROOM_WIDTH * 0.12),
    z: ROOM_DEPTH * 0.52,
  };
}
