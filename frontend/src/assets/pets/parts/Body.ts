/**
 * Body — the blob itself, and almost the whole creature.
 *
 * Five flat shapes, in this order:
 *
 *   1. the squircle mass          the silhouette that does all the reading
 *   2. a belly patch              a lighter shape low on the mass
 *   3. a base shade               one darker crescent along the bottom edge
 *   4. the pattern marks          optional, from the appearance
 *   5. a shine                    one lighter shape at the upper left
 *
 * Everything after the first shape is clipped to the silhouette, so markings
 * and shading always follow the body however it is proportioned. No gradients,
 * no filters: depth here is just flat shapes stacked in the right order.
 *
 * Drawn in body-local space: the origin is the body centre.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { drawPattern } from '../customization/Patterns';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

/**
 * The body outline, in body-local space.
 *
 * Exported because the face clips to it: the face lives on the surface of the
 * mass, so a wide-set eye or a cheek on a narrow creature has to disappear
 * over the edge instead of floating beside it.
 */
export function drawBodySilhouette(
  g: Graphics,
  proportions: PetProportions,
  appearance: PetAppearance,
): Graphics {
  return drawSquircle(
    g,
    0,
    0,
    proportions.bodyWidth / 2,
    proportions.bodyHeight / 2,
    {
      roundness: proportions.bodyRoundness,
      wobble: proportions.bodyWobble,
      phase: appearance.seed % 7,
    },
  );
}

export function createBody(
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = 'body-art';

  const rx = proportions.bodyWidth / 2;
  const ry = proportions.bodyHeight / 2;

  const silhouette = (g: Graphics) =>
    drawBodySilhouette(g, proportions, appearance);

  // --- 1. The mass ---------------------------------------------------------
  const base = new Graphics();
  silhouette(base);
  base.fill({ color: appearance.primaryColor });
  base.stroke({
    color: outline(appearance.primaryColor),
    width: Math.max(2, rx * 0.028),
    alpha: 0.45,
  });
  root.addChild(base);

  // --- Everything below is clipped to the mass -----------------------------
  const mask = new Graphics();
  silhouette(mask);
  mask.fill({ color: 0xffffff });
  root.addChild(mask);

  const clipped = new Container();
  clipped.label = 'body-detail';
  clipped.mask = mask;
  root.addChild(clipped);

  // --- 2. Belly ------------------------------------------------------------
  const belly = new Graphics();
  drawSquircle(belly, 0, ry * 0.36, proportions.bellyRadius, ry * 0.5, {
    roundness: 0.9,
    wobble: 0.02,
    phase: appearance.seed % 5,
  });
  belly.fill({ color: appearance.secondaryColor, alpha: 0.9 });
  clipped.addChild(belly);

  // --- 3. Base shade -------------------------------------------------------
  // One flat darker shape hugging the bottom edge. This is the entire
  // "the blob has weight" effect — the flat equivalent of an inset shadow.
  const shade = new Graphics();
  shade.ellipse(0, ry * 1.16, rx * 1.05, ry * 0.42);
  shade.fill({ color: darken(appearance.primaryColor, 0.3), alpha: 0.45 });
  clipped.addChild(shade);

  // --- 4. Pattern ----------------------------------------------------------
  if (appearance.pattern !== 'none') {
    const marks = new Graphics();
    drawPattern(
      marks,
      appearance.pattern,
      { cx: 0, cy: 0, rx, ry },
      { color: appearance.secondaryColor, alpha: 0.5, seed: appearance.seed },
    );
    clipped.addChild(marks);
  }

  // --- 5. Shine ------------------------------------------------------------
  // Upper left, matching the light in the room.
  const shine = new Graphics();
  drawSquircle(shine, -rx * 0.42, -ry * 0.52, rx * 0.3, ry * 0.2, {
    roundness: 0.95,
  });
  shine.fill({ color: lighten(appearance.primaryColor, 0.55), alpha: 0.5 });
  clipped.addChild(shine);

  return root;
}
