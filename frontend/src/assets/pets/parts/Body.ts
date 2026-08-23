/**
 * Body — the mass, its feet and its shading.
 *
 * This file assembles; it does not design. The outline comes from
 * ./BodySilhouette, the feet from ./Foot, and the markings from
 * ../customization/Patterns. What lives here is the *stack*: which flat shape
 * goes over which, and where the feet plant.
 *
 * Shading is four solid shapes and no gradients (/Docs/theme-and-design.md):
 *
 *   1  the coat                     one flat fill
 *   2  a bottom shade               a curved band, cut to the silhouette
 *   3  a belly panel                the lighter surface
 *   4  one small light patch        upper left, where the room's window is
 *
 * Everything after the first is clipped to the silhouette, so no amount of
 * customization can push a highlight off the edge of the creature.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { clamp } from '../../shared/shapes';
import { drawSmoothClosed } from '../../shared/geometry';
import type { PetAppearance } from '../customization/PetAppearance';
import { getBodyShape } from '../customization/BodyTypes';
import { getFootShape } from '../customization/FootTypes';
import { drawPattern } from '../customization/Patterns';
import type { PetProportions } from '../anatomy/proportions';
import { bodyHalfWidthAt, bodyLowerEdgeAt, drawPetSilhouette } from './BodySilhouette';
import { drawFoot, drawFootDetail } from './Foot';

export { bodyOutline, bodyHalfWidthAt, bodyLowerEdgeAt, drawPetSilhouette } from './BodySilhouette';

/* -------------------------------------------------------------------------- */
/* Feet                                                                       */
/* -------------------------------------------------------------------------- */

/** Where each foot sits across the bottom of the body, in body-local x. */
function footPositions(
  proportions: PetProportions,
  appearance: PetAppearance,
): number[] {
  const shape = getFootShape(appearance.footType);
  const body = getBodyShape(appearance.bodyType);
  if (shape.count <= 0) return [];

  const rx = proportions.bodyWidth / 2;
  const stance = body.stance * shape.spread;

  // Never let a foot hang off the side of the mass: the ankle has to have body
  // above it, or the foot stops looking attached. This is the dependent
  // constraint that makes "huge feet on a narrow body" comic instead of broken.
  const ankleHalfWidth = bodyHalfWidthAt(proportions, appearance, 0.86);
  const limit = Math.max(0, ankleHalfWidth - proportions.footWidth * 0.3);

  const spread = Math.min(stance * rx, limit);

  if (shape.count === 4) {
    return [-spread, -spread * 0.34, spread * 0.34, spread];
  }

  return [-spread, spread];
}

function buildFeet(
  proportions: PetProportions,
  appearance: PetAppearance,
): Container | null {
  const shape = getFootShape(appearance.footType);
  const positions = footPositions(proportions, appearance);

  if (positions.length === 0 || proportions.footWidth <= 0) return null;

  const group = new Container();
  group.label = 'feet';

  const ramp = tones(appearance.primaryColor);
  const silhouettes = new Graphics();
  const details = new Graphics();

  const ry = proportions.bodyHeight / 2;
  const floorY = ry + proportions.groundClearance;

  for (const x of positions) {
    // Bury the top of the foot inside the mass, measured from the silhouette's
    // actual lower edge above this foot rather than from the bounding box.
    const edgeY = bodyLowerEdgeAt(proportions, appearance, x);
    const wanted = edgeY - shape.sink * proportions.footHeight;
    const grounded = floorY - proportions.footHeight;
    const top = Math.min(wanted, grounded);

    const options = {
      shape,
      width: proportions.footWidth,
      height: proportions.footHeight,
      mirror: x < 0 ? -1 : 1,
      ramp,
      accent: appearance.secondaryColor,
    };

    drawFoot(silhouettes, x, top, options);
    drawFootDetail(details, x, top, options);
  }

  // One fill for the whole set. Feet are the coat in shade — the same colour
  // family, one step down, so they read as the underside of the creature.
  silhouettes.fill({ color: darken(ramp.shade, 0.05) });
  silhouettes.stroke({
    color: ramp.line,
    width: Math.max(1.5, proportions.footWidth * 0.03),
    alpha: 0.35,
    alignment: 1,
  });

  group.addChild(silhouettes, details);
  return group;
}

/* -------------------------------------------------------------------------- */
/* Shading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The bottom shade: one curved band across the lower body.
 *
 * It is drawn generously wide and clipped to the silhouette, so it follows
 * whatever shape the body happens to be without any per-type maths.
 */
function bottomShade(proportions: PetProportions, ramp: ReturnType<typeof tones>): Graphics {
  const rx = proportions.bodyWidth / 2;
  const ry = proportions.bodyHeight / 2;
  const g = new Graphics();

  drawSmoothClosed(g, [
    { x: -rx * 1.3, y: ry * 0.42 },
    { x: -rx * 0.5, y: ry * 0.62 },
    { x: 0, y: ry * 0.68 },
    { x: rx * 0.5, y: ry * 0.6 },
    { x: rx * 1.3, y: ry * 0.36 },
    { x: rx * 1.3, y: ry * 1.4 },
    { x: -rx * 1.3, y: ry * 1.4 },
  ]);

  g.fill({ color: ramp.deep, alpha: 0.2 });
  return g;
}

/**
 * The belly panel.
 *
 * Sized from the body's own width low down rather than from a fixed fraction,
 * so a narrow creature gets a narrow belly instead of one that fills it.
 */
function bellyPanel(
  proportions: PetProportions,
  appearance: PetAppearance,
): Graphics {
  const ry = proportions.bodyHeight / 2;
  const half = bodyHalfWidthAt(proportions, appearance, 0.7) * 0.66;
  const top = ry * 0.05;
  const bottom = ry * 0.95;

  const g = new Graphics();

  drawSmoothClosed(g, [
    { x: 0, y: top },
    { x: half * 0.86, y: top + (bottom - top) * 0.22 },
    { x: half, y: top + (bottom - top) * 0.62 },
    { x: half * 0.7, y: bottom },
    { x: 0, y: bottom * 1.06 },
    { x: -half * 0.7, y: bottom },
    { x: -half, y: top + (bottom - top) * 0.62 },
    { x: -half * 0.86, y: top + (bottom - top) * 0.22 },
  ]);

  g.fill({ color: appearance.secondaryColor, alpha: 0.5 });
  return g;
}

/** One small flat patch where the light lands. Never a gradient, never gloss. */
function lightPatch(proportions: PetProportions, appearance: PetAppearance): Graphics {
  const rx = proportions.bodyWidth / 2;
  const ry = proportions.bodyHeight / 2;
  const g = new Graphics();

  drawSmoothClosed(g, [
    { x: -rx * 0.66, y: -ry * 0.32 },
    { x: -rx * 0.58, y: -ry * 0.62 },
    { x: -rx * 0.34, y: -ry * 0.76 },
    { x: -rx * 0.28, y: -ry * 0.6 },
    { x: -rx * 0.46, y: -ry * 0.42 },
    { x: -rx * 0.5, y: -ry * 0.24 },
  ]);

  g.fill({ color: lighten(appearance.primaryColor, 0.3), alpha: 0.4 });
  return g;
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

export function createBody(
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = 'body-art';

  const ramp = tones(appearance.primaryColor);
  const rx = proportions.bodyWidth / 2;

  // --- Feet, behind the mass so it swallows the seam ------------------------
  const feet = buildFeet(proportions, appearance);
  if (feet) root.addChild(feet);

  // --- The coat -------------------------------------------------------------
  const silhouette = new Graphics();
  drawPetSilhouette(silhouette, proportions, appearance);
  silhouette.fill({ color: ramp.base });
  silhouette.stroke({
    // A darker version of the coat, never a black cartoon line.
    color: ramp.line,
    width: clamp(rx * 0.022, 1.5, 5),
    alignment: 1,
    alpha: 0.55,
  });
  root.addChild(silhouette);

  // --- Everything below is cut to the coat ----------------------------------
  const mask = new Graphics();
  drawPetSilhouette(mask, proportions, appearance);
  mask.fill({ color: 0xffffff });
  root.addChild(mask);

  const clipped = new Container();
  clipped.label = 'body-detail';
  clipped.mask = mask;
  root.addChild(clipped);

  clipped.addChild(bottomShade(proportions, ramp));
  clipped.addChild(bellyPanel(proportions, appearance));

  if (appearance.pattern !== 'none') {
    const marks = new Graphics();
    drawPattern(
      marks,
      appearance.pattern,
      { cx: 0, cy: 0, rx, ry: proportions.bodyHeight / 2 },
      { color: appearance.patternColor, alpha: 0.42, seed: appearance.seed },
    );
    clipped.addChild(marks);
  }

  clipped.addChild(lightPatch(proportions, appearance));

  // Where the feet meet the body: one soft dark shape per foot, inside the
  // silhouette. This is what turns two adjacent shapes into one creature.
  const shape = getFootShape(appearance.footType);
  if (shape.count > 0 && proportions.footWidth > 0) {
    const joins = new Graphics();

    for (const x of footPositions(proportions, appearance)) {
      const edgeY = bodyLowerEdgeAt(proportions, appearance, x);
      joins.ellipse(
        x,
        edgeY - proportions.footHeight * 0.1,
        proportions.footWidth * 0.55,
        proportions.footHeight * 0.6,
      );
    }

    joins.fill({ color: mix(ramp.deep, ramp.shade, 0.4), alpha: 0.3 });
    clipped.addChild(joins);
  }

  return root;
}
