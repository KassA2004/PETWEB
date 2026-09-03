/**
 * The object surface language — how a thing in this room is made.
 *
 * The creature system has one of these already, and it is the reason a random
 * purple blob and a pig look like they came out of the same box of crayons:
 * one base colour in, a five-step tone ramp out, and a fixed budget of shapes
 * on top of it (/Docs/theme-and-design.md §9). The furniture never had one,
 * which is why the room read as a set of icons standing next to a character.
 *
 * So this file is the furniture's version of that rule, and every object
 * renderer is written against it rather than against `Graphics` directly.
 *
 * The budget, per form
 * --------------------
 *
 *   base shape        filled with the tone ramp as a soft vertical gradient
 *   + one top face    the plane the light lands on, foreshortened by the camera
 *   + one gloss       a single lighter shape, upper left
 *   + one shade       a single darker shape along the lower edge
 *   + a contact shadow
 *
 * A third flat shape on a form is a sign the form itself is not reading and
 * should be redrawn (§9). Blend modes and filters are still used nowhere: they
 * cost frame time and every effect they would provide is achievable as a
 * translucent shape.
 *
 * Coordinates
 * -----------
 * Objects are drawn in **world units**, anchored at their floor contact point,
 * with y running negative upward. The scene multiplies the whole container by
 * the camera's scale for its depth (`scaleAt`), so a renderer never has to
 * know how far into the room it is.
 */

import { Container, Graphics } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import { darken, lighten, mix, outline, tones } from '../../shared/color';
import type { Tones } from '../../shared/color';
import {
  createRng,
  drawSquircle,
  radialGradient,
  rngRange,
  verticalGradient,
} from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';

export type { Tones };
export { tones };

/**
 * How flat a floor-plane extent is drawn, in an object's local space.
 *
 * A square metre of floor is not a square on screen — the camera squashes it.
 * The exact factor varies with depth, but an object's artwork lives inside a
 * container that has already been scaled by the camera, so it cannot vary it
 * per object without the object changing shape as it moves back. One constant,
 * matching the landing ring the drag guide already draws (`DepthGuide`), keeps
 * every top face and bowl rim agreeing with every contact shadow.
 */
export const FLOOR_SQUASH = 0.42;

/**
 * Trace the ellipse that a rectangle of floor `width` x `depth` reads as.
 *
 * Every horizontal plane in the room — a tabletop, the water in a bowl, the
 * mouth of a basket — is this shape at some height.
 */
export function floorOval(
  g: Graphics,
  cx: number,
  cy: number,
  width: number,
  depth: number,
): Graphics {
  g.ellipse(cx, cy, width / 2, (depth / 2) * FLOOR_SQUASH);
  return g;
}

/** The same, as a soft superellipse — for things that are boxy but not sharp. */
export function floorSlab(
  g: Graphics,
  cx: number,
  cy: number,
  width: number,
  depth: number,
  roundness = 0.55,
): Graphics {
  return drawSquircle(g, cx, cy, width / 2, (depth / 2) * FLOOR_SQUASH, { roundness });
}

/**
 * The standard fill for an upright form: light at the top, base through the
 * middle, shade along the bottom.
 *
 * `weight` biases how much of the form the light claims. Small objects want a
 * higher light so they do not read as dirty.
 */
export function formFill(ramp: Tones, weight = 0.5): FillGradient {
  return verticalGradient([
    { offset: 0, color: ramp.light },
    { offset: 0.28 + weight * 0.12, color: ramp.base },
    { offset: 0.84, color: ramp.shade },
    { offset: 1, color: ramp.deep },
  ]);
}

/**
 * The fill for a face pointing *up* at the light.
 *
 * Brighter and flatter than a side: a tabletop is the one surface in the room
 * that is fully turned toward whatever is lighting it, and rendering it with
 * the same ramp as the leg beneath it is what makes cheap furniture look like
 * a sticker of furniture.
 */
export function topFill(ramp: Tones): FillGradient {
  return verticalGradient([
    { offset: 0, color: lighten(ramp.light, 0.12) },
    { offset: 0.55, color: ramp.light },
    { offset: 1, color: ramp.base },
  ]);
}

/**
 * The one lighter shape a form is allowed.
 *
 * Upper left, always, because the room is lit from the window on the back wall
 * and consistency about where the light comes from is most of what makes a set
 * of objects look like one set of objects.
 */
export function gloss(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  alpha = 0.34,
): Graphics {
  drawSquircle(g, cx, cy, rx, ry, { roundness: 0.85 });
  g.fill({ color, alpha });
  return g;
}

/**
 * The soft outline every object carries.
 *
 * Never a uniform black line (§13) — a darker version of the colour it is
 * separating, thin, and translucent enough that it reads as a shaded edge
 * rather than as ink.
 */
export function edge(g: Graphics, color: number, width = 3, alpha = 0.38): Graphics {
  g.stroke({ color: outline(color, 0.34), width, alpha });
  return g;
}

/**
 * A contact shadow sized from an object's own footprint.
 *
 * Shadows are mandatory — nothing may look like it is floating (§5) — and
 * driving the width from the footprint rather than from a number in the
 * renderer is what stops a resized object from keeping its old shadow.
 */
export function groundShadow(
  width: number,
  depth: number,
  strength = 0.24,
): Graphics {
  return createContactShadow({
    width: width * 1.02,
    height: depth * FLOOR_SQUASH * 1.05,
    strength,
  });
}

/* -------------------------------------------------------------------------- */
/* Composite forms                                                            */
/* -------------------------------------------------------------------------- */

export interface SlabOptions {
  /** Centre of the slab's top face, in the object's local space. */
  x?: number;
  /** Height of the top face above the floor, as a negative local y. */
  y: number;
  width: number;
  depth: number;
  /** How thick the slab is. The front face is this tall. */
  thickness: number;
  color: number;
  roundness?: number;
  /** Skip the gloss, for a slab that is mostly hidden. */
  plain?: boolean;
}

/**
 * A horizontal slab seen from slightly above: a mattress, a tabletop, a shelf,
 * the lid of a box.
 *
 * Three shapes and it has volume — the front face in the body ramp, the top
 * face in the top ramp, and one gloss. Drawing it as a single rounded
 * rectangle is what made every table in the old room read as a plank floating
 * in space, because a plank with no visible top face has no thickness and no
 * relationship to the floor.
 */
export function slab(options: SlabOptions): Container {
  const { y, width, depth, thickness, color } = options;
  const x = options.x ?? 0;
  const roundness = options.roundness ?? 0.5;
  const ramp = tones(color);

  const group = new Container();

  // The front face: everything between the top face and the underside.
  const front = new Graphics();
  floorSlab(front, x, y + thickness / 2, width, depth, roundness);
  front.rect(x - width / 2, y, width, thickness);
  floorSlab(front, x, y + thickness, width, depth, roundness);
  front.fill(formFill(ramp, 0.4));
  group.addChild(front);

  // The top face.
  const top = new Graphics();
  floorSlab(top, x, y, width, depth, roundness);
  top.fill(topFill(ramp));
  floorSlab(top, x, y, width, depth, roundness);
  edge(top, color, 2.5, 0.3);
  group.addChild(top);

  if (!options.plain) {
    const light = new Graphics();
    gloss(
      light,
      x - width * 0.18,
      y - depth * FLOOR_SQUASH * 0.16,
      width * 0.26,
      depth * FLOOR_SQUASH * 0.2,
      lighten(ramp.light, 0.35),
      0.4,
    );
    group.addChild(light);
  }

  return group;
}

export interface PostOptions {
  x: number;
  /** Top of the post, as a negative local y. */
  top: number;
  /** How far down it goes from `top`. */
  length: number;
  width: number;
  color: number;
  /** Taper toward the floor, 0..1. Furniture legs usually do a little. */
  taper?: number;
}

/**
 * A leg, a stem, a post.
 *
 * Tapered by default: a perfectly parallel leg reads as a pipe, and every
 * piece of furniture in a cozy room is slightly handmade (§14).
 */
export function post(options: PostOptions): Graphics {
  const { x, top, length, width, color } = options;
  const taper = options.taper ?? 0.2;
  const ramp = tones(color);

  const half = width / 2;
  const footHalf = half * (1 - taper);

  const g = new Graphics();
  g.moveTo(x - half, top);
  g.lineTo(x + half, top);
  g.lineTo(x + footHalf, top + length);
  g.quadraticCurveTo(x, top + length + half * 0.5, x - footHalf, top + length);
  g.closePath();
  g.fill(formFill(ramp, 0.35));

  // One shade shape down the right-hand side, because the light is upper left.
  const shade = new Graphics();
  shade.moveTo(x + half * 0.3, top);
  shade.lineTo(x + half, top);
  shade.lineTo(x + footHalf, top + length);
  shade.lineTo(x + footHalf * 0.3, top + length);
  shade.closePath();
  shade.fill({ color: ramp.deep, alpha: 0.35 });
  g.addChild(shade);

  return g;
}

export interface CushionOptions {
  x?: number;
  /** Centre of the cushion. */
  y: number;
  width: number;
  height: number;
  color: number;
  roundness?: number;
  /** Dimples along the top, for something stuffed. */
  tufts?: number;
  seed?: number;
}

/**
 * Something soft and stuffed: a seat pad, a pillow, a bean bag, a mattress.
 *
 * A squircle rather than a rounded rectangle, so it reads as having give. The
 * gloss sits high and left; the shade is one band along the bottom.
 */
export function cushion(options: CushionOptions): Container {
  const { y, width, height, color } = options;
  const x = options.x ?? 0;
  const roundness = options.roundness ?? 0.75;
  const ramp = tones(color);
  const rng = createRng(options.seed ?? 1);

  const group = new Container();

  const body = new Graphics();
  drawSquircle(body, x, y, width / 2, height / 2, {
    roundness,
    wobble: 0.02,
    phase: rngRange(rng, 0, 6),
  });
  body.fill(formFill(ramp, 0.6));
  drawSquircle(body, x, y, width / 2, height / 2, { roundness });
  edge(body, color, 3, 0.34);
  group.addChild(body);

  const light = new Graphics();
  gloss(
    light,
    x - width * 0.16,
    y - height * 0.24,
    width * 0.24,
    height * 0.2,
    lighten(ramp.light, 0.3),
    0.38,
  );
  group.addChild(light);

  if (options.tufts) {
    const dimples = new Graphics();
    for (let i = 0; i < options.tufts; i++) {
      const t = (i + 0.5) / options.tufts;
      dimples.circle(x + (t - 0.5) * width * 0.66, y - height * 0.05, width * 0.018);
    }
    dimples.fill({ color: ramp.deep, alpha: 0.4 });
    group.addChild(dimples);
  }

  return group;
}

/* -------------------------------------------------------------------------- */
/* Small marks                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Wood grain: a handful of faint curved strokes along a face.
 *
 * Deliberately few. Texture in this style is *evidence* of a material, not a
 * rendering of one — six strokes say "wood" and thirty say "hatching".
 */
export function grain(
  width: number,
  height: number,
  color: number,
  seed = 1,
  count = 5,
): Graphics {
  const rng = createRng(seed);
  const g = new Graphics();

  for (let i = 0; i < count; i++) {
    const y = (rngRange(rng, 0.12, 0.88) - 0.5) * height;
    const from = -width / 2 + rngRange(rng, 0.02, 0.2) * width;
    const to = width / 2 - rngRange(rng, 0.02, 0.2) * width;
    g.moveTo(from, y);
    g.quadraticCurveTo((from + to) / 2, y + rngRange(rng, -2.5, 2.5), to, y);
  }

  g.stroke({ color: darken(color, 0.28), width: 1.6, alpha: 0.28 });
  return g;
}

/**
 * Woven texture: two families of shallow arcs crossing each other.
 *
 * Wicker, rattan, a rope mat, the side of a basket.
 */
export function weave(
  width: number,
  height: number,
  color: number,
  rows = 4,
): Graphics {
  const g = new Graphics();

  for (let i = 1; i <= rows; i++) {
    const y = -height / 2 + (i / (rows + 1)) * height;
    g.moveTo(-width / 2, y);
    g.quadraticCurveTo(0, y + height * 0.06, width / 2, y);
  }
  g.stroke({ color: darken(color, 0.24), width: 2, alpha: 0.3 });

  const uprights = new Graphics();
  const columns = Math.max(3, Math.round(width / 18));
  for (let i = 1; i < columns; i++) {
    const x = -width / 2 + (i / columns) * width;
    uprights.moveTo(x, -height / 2);
    uprights.lineTo(x, height / 2);
  }
  uprights.stroke({ color: lighten(color, 0.18), width: 1.4, alpha: 0.22 });
  g.addChild(uprights);

  return g;
}

/**
 * A soft pool of light on a surface, as a stack of translucent ovals.
 *
 * The project's substitute for a blur filter, and the reason lamps and windows
 * can glow without a single filter in the display list (§9).
 */
export function glowPool(
  width: number,
  depth: number,
  color: number,
  strength = 0.3,
  bands = 3,
): Graphics {
  const g = new Graphics();

  for (let i = bands; i >= 1; i--) {
    const t = i / bands;
    floorOval(g, 0, 0, width * t, depth * t);
    g.fill({ color, alpha: (strength / bands) * (1.4 - t * 0.4) });
  }

  return g;
}

/**
 * A smooth halo, for anything that emits rather than reflects.
 *
 * `glowPool` and `glowBall` below stack hard-edged shapes at stepped alphas,
 * which is fine at the strength the floor lamp uses and shows its rings the
 * moment anything brighter needs one — a candle flame or a lit crystal came out
 * looking like a dartboard. This is one shape with a radial ramp instead:
 * smooth at any strength, one draw call, and still not a filter.
 *
 * Squashed by `FLOOR_SQUASH` when `depth` is given, so a glow lying *on* the
 * floor agrees with every contact shadow in the room; left circular when it is
 * not, for a light in the air.
 */
export function softGlow(
  radius: number,
  color: number,
  strength = 0.3,
  onFloor = false,
): Graphics {
  const g = new Graphics();
  g.ellipse(0, 0, radius, onFloor ? radius * FLOOR_SQUASH : radius);
  g.fill(
    radialGradient([
      { offset: 0, color, alpha: strength },
      { offset: 0.45, color, alpha: strength * 0.5 },
      { offset: 0.75, color, alpha: strength * 0.16 },
      { offset: 1, color, alpha: 0 },
    ]),
  );
  return g;
}

/**
 * A vertical soft glow, for anything that emits rather than reflects.
 *
 * Same trick as `glowPool`, stacked as circles instead of ovals. Kept for the
 * places already using it; `softGlow` is the better shape for anything new.
 */
export function glowBall(radius: number, color: number, strength = 0.35, bands = 4): Graphics {
  const g = new Graphics();

  for (let i = bands; i >= 1; i--) {
    const t = i / bands;
    g.circle(0, 0, radius * t);
    g.fill({ color, alpha: (strength / bands) * (1.5 - t * 0.5) });
  }

  return g;
}

/**
 * The colour something reads as when it is behind glass or water.
 *
 * Pulled toward the glass's own tint and lifted slightly, which is the whole
 * of "underwater" in a flat style.
 */
export function submerged(color: number, water: number, depth = 0.35): number {
  return lighten(mix(color, water, depth), 0.06);
}
