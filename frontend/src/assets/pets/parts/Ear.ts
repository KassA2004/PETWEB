/**
 * Ear — one renderer, twelve silhouettes.
 *
 * There is no switch on ear type here. Every ear is a spine with a width along
 * it (../../shared/geometry), a disc, or a fin, and the type supplies the
 * numbers. Adding a thirteenth ear means adding a row to ../customization/
 * EarTypes, not editing this file.
 *
 * Two things make an ear look grown rather than glued:
 *
 *   the shape starts below its own joint (`baseSink`), so it continues into
 *   the mass instead of stopping at it, and
 *
 *   ears drawn in front of the body get a base cap in the coat colour, which
 *   erases the outline where the two meet.
 *
 * Ears are drawn growing upward from the origin so the joint can rotate them
 * about their base — a spring on that joint turns any body movement into a
 * flop, which is worth more than any amount of squashing the body
 * (/Docs/animation-approach.md §13).
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import type { Tones } from '../../shared/color';
import {
  drawSmoothClosed,
  growSpine,
  ribbonOutline,
  scalePoints,
  taperWidths,
} from '../../shared/geometry';
import type { Vec2 } from '../../shared/geometry';
import { earSideVariation, getEarShape } from '../customization/EarTypes';
import type { EarShape } from '../customization/EarTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

const SPINE_SAMPLES = 8;

interface EarBuild {
  /** The outer silhouette, in ear-local space. */
  outline: Vec2[];
  /** The inner-ear shape, or null when the type has none. */
  inner: Vec2[] | null;
  /** Where the tip ended up — antennae hang a bobble there. */
  tip: Vec2;
}

/* -------------------------------------------------------------------------- */
/* Shape building                                                             */
/* -------------------------------------------------------------------------- */

function buildRibbon(
  shape: EarShape,
  w: number,
  h: number,
  mirror: number,
  droop: number,
): EarBuild {
  const sink = h * shape.baseSink;

  // The spine runs from inside the body up to the tip. Adding the sink to the
  // length and then shifting down keeps the curve continuous through the seam.
  const spine = growSpine({
    length: h + sink,
    // `bend` is a turn in radians, so a floppy ear genuinely folds over instead
    // of leaning sideways while still pointing up.
    bend: mirror * shape.bend,
    droop,
    samples: SPINE_SAMPLES,
  }).map((p) => ({ x: p.x, y: p.y + sink }));

  const half = w / 2;
  // The buried section is widest of all, so the ear flares where it leaves the
  // body rather than meeting it at a constant width.
  const widths = taperWidths(
    spine.length,
    half * shape.base,
    half * shape.tip,
    half * shape.belly,
  );
  widths[0] = half * shape.base * 1.35;

  const outline = ribbonOutline(spine, widths);

  const inner =
    shape.inner > 0
      ? ribbonOutline(
          spine.map((p) => ({ x: p.x * 0.9, y: p.y * 0.94 + sink * 0.06 })),
          widths.map((v, i) => v * shape.inner * (i === 0 ? 0.6 : 1)),
        )
      : null;

  return { outline, inner, tip: spine[spine.length - 1] };
}

function buildDisc(shape: EarShape, w: number, h: number): EarBuild {
  const rx = w / 2;
  const ry = h / 2;
  const sink = h * shape.baseSink;
  const cy = -ry + sink;

  // A disc, dragged downward into the body so its lower half is buried.
  const outline: Vec2[] = [];
  const samples = 18;

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2 - Math.PI / 2;
    const stretch = Math.sin(angle) > 0 ? 1 + shape.baseSink * 0.7 : 1;
    outline.push({
      x: Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry * stretch,
    });
  }

  const inner = shape.inner > 0 ? scalePoints(outline, shape.inner * 0.92) : null;

  return {
    outline,
    inner: inner ? inner.map((p) => ({ x: p.x, y: p.y + cy * (1 - shape.inner * 0.92) })) : null,
    tip: { x: 0, y: cy - ry },
  };
}

function buildFin(shape: EarShape, w: number, h: number, mirror: number): EarBuild {
  const sink = h * shape.baseSink;

  // A swept wedge leaving the head sideways, with a scalloped trailing edge.
  const outline: Vec2[] = [
    { x: 0, y: sink * 0.6 },
    { x: mirror * w * 0.34, y: -h * 0.3 },
    { x: mirror * w * 0.74, y: -h * 0.52 },
    { x: mirror * w, y: -h * 0.34 },
    { x: mirror * w * 0.86, y: -h * 0.06 },
    { x: mirror * w * 0.94, y: h * 0.16 },
    { x: mirror * w * 0.6, y: h * 0.2 },
    { x: mirror * w * 0.28, y: h * 0.34 },
  ];

  const inner = shape.inner > 0 ? scalePoints(outline, shape.inner * 0.8) : null;

  return { outline, inner, tip: { x: mirror * w * 0.8, y: -h * 0.4 } };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The cap that hides the seam.
 *
 * Ears drawn in front of the mass would otherwise show their own outline
 * crossing the body. A flat shape in the coat colour, no stroke, sitting over
 * the base is all it takes to make the two shapes read as one.
 */
function baseCap(w: number, h: number, shape: EarShape, ramp: Tones): Graphics {
  const g = new Graphics();
  const half = (w / 2) * shape.base * 1.5;
  const depth = Math.max(h * shape.baseSink, h * 0.1);

  g.ellipse(0, depth * 0.45, half, depth * 0.95);
  g.fill({ color: ramp.base });

  return g;
}

export function createEar(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = `ear-${side}`;

  const shape = getEarShape(appearance.earType);
  if (shape.kind === 'none') return root;

  const variation = earSideVariation(shape, side);
  const w = proportions.earWidth * variation.scale;
  const h = proportions.earHeight * variation.scale;
  if (w <= 0 || h <= 0) return root;

  const mirror = side === 'left' ? -1 : 1;
  const ramp = tones(appearance.primaryColor);
  const droop = Math.min(1, shape.droop + variation.droop);

  const build =
    shape.kind === 'disc'
      ? buildDisc(shape, w, h)
      : shape.kind === 'fin'
        ? buildFin(shape, w, h, mirror)
        : buildRibbon(shape, w, h, mirror, droop);

  if (build.outline.length < 3) return root;

  // Horns are bone, not coat. Everything else is the creature's own colour.
  const isHorn = appearance.earType === 'horns';
  const coat = isHorn
    ? tones(mix(appearance.secondaryColor, 0x8a7a5c, 0.5))
    : ramp;

  // --- Silhouette -----------------------------------------------------------
  const art = new Graphics();
  drawSmoothClosed(art, build.outline, shape.tension);
  art.fill({ color: coat.base });
  art.stroke({
    color: coat.line,
    width: Math.max(1.5, w * 0.035),
    alpha: 0.5,
    alignment: 1,
  });
  root.addChild(art);

  // --- Flat shading -------------------------------------------------------
  // One solid band down the shadowed side, cut to the ear. Two flat colours
  // give a shape volume; a gradient just makes it look wet.
  const shadeMask = new Graphics();
  drawSmoothClosed(shadeMask, build.outline, shape.tension);
  shadeMask.fill({ color: 0xffffff });

  const shadeBand = new Graphics();
  shadeBand.rect(mirror > 0 ? -w * 2 : w * 0.06, -h * 2.4, w * 2, h * 4.8);
  shadeBand.fill({ color: coat.shade, alpha: 0.38 });
  shadeBand.mask = shadeMask;

  root.addChild(shadeMask, shadeBand);

  // --- Inner ear ------------------------------------------------------------
  if (build.inner && build.inner.length >= 3 && !isHorn) {
    const inner = new Graphics();
    drawSmoothClosed(inner, build.inner, shape.tension);
    inner.fill({
      color: mix(appearance.accentColor, appearance.secondaryColor, 0.4),
      alpha: 0.92,
    });
    root.addChild(inner);
  }

  // --- Type-specific tips ---------------------------------------------------
  if (appearance.earType === 'antenna') {
    const bobble = new Graphics();
    bobble.circle(build.tip.x, build.tip.y, w * 0.95);
    bobble.fill({ color: appearance.accentColor });
    bobble.circle(build.tip.x - w * 0.3, build.tip.y - w * 0.3, w * 0.3);
    bobble.fill({ color: lighten(appearance.accentColor, 0.4), alpha: 0.6 });
    root.addChild(bobble);
  }

  if (isHorn) {
    // Two ridges, so a horn reads as horn rather than as a beige wedge.
    const ridges = new Graphics();
    for (const t of [0.4, 0.65]) {
      const y = -h * t;
      const half = (w / 2) * (1 - t) * 0.9;
      ridges.moveTo(-half, y);
      ridges.lineTo(half + mirror * w * 0.2 * t, y - h * 0.03);
    }
    ridges.stroke({ color: coat.line, width: Math.max(1.5, w * 0.06), alpha: 0.4 });
    root.addChild(ridges);
  }

  // --- The seam cap, for ears that draw over the mass -----------------------
  if (!shape.behind) {
    root.addChild(baseCap(w, h, shape, ramp));
  }

  // --- One small light patch, matching the body -----------------------------
  if (!isHorn) {
    const gloss = new Graphics();
    gloss.ellipse(-mirror * w * 0.14, -h * 0.55, w * 0.13, h * 0.14);
    gloss.fill({ color: lighten(appearance.primaryColor, 0.34), alpha: 0.3 });
    root.addChild(gloss);
  }

  // Very dark coats need the ear separated from the body behind it.
  if (shape.behind) {
    const rim = new Graphics();
    drawSmoothClosed(rim, build.outline, shape.tension);
    rim.stroke({ color: darken(coat.base, 0.2), width: 1.5, alpha: 0.25, alignment: 0 });
    root.addChild(rim);
  }

  return root;
}
