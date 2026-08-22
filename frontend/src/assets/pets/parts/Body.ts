/**
 * Body.ts
 *
 * Stylized pet body.
 *
 * Design language:
 * - Soft cubic / rounded silhouette
 * - Slightly narrower upper shoulders
 * - Broad, heavy lower body
 * - Chunky integrated feet
 * - Flat layered shading
 * - Small controlled highlight shapes
 * - No gradients
 * - No generic superellipse silhouette
 *
 * The body is drawn in body-local space with the origin at its centre.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import type { PetAppearance } from '../customization/PetAppearance';
import { getFootShape } from '../customization/BodyTypes';
import { drawPattern } from '../customization/Patterns';
import type { PetProportions } from '../anatomy/proportions';

export interface BodySilhouetteOptions {
  roundness: number;
  topTaper: number;
  bottomBias: number;
  wobble: number;
  phase: number;
  segments?: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundedBodyPath(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  options: BodySilhouetteOptions,
): Graphics {
  const roundness = clamp(options.roundness, 0, 1);
  const topTaper = clamp(options.topTaper, 0, 1);
  const bottomBias = clamp(options.bottomBias, 0, 1);
  const wobble = clamp(options.wobble, 0, 1);

  /*
   * These control points deliberately form a "soft block" rather than
   * mathematically perfect geometry.
   *
   * Reference shape:
   *
   *              ______
   *           __/      \__
   *         /              \
   *        |                |
   *        |                |
   *        |                |
   *         \              /
   *          \____    ____/
   *
   * The lower corners are heavier than the upper corners.
   */

  const topWidth = rx * (0.78 + topTaper * 0.12);
  const shoulderWidth = rx * (0.96 + bottomBias * 0.04);
  const lowerWidth = rx * (0.90 + bottomBias * 0.08);

  const topY = cy - ry;
  const shoulderY = cy - ry * 0.78;
  const sideY = cy - ry * 0.15;
  const lowerY = cy + ry * 0.68;
  const bottomY = cy + ry;

  const topRadius = rx * (0.18 + roundness * 0.08);
  const lowerRadius = rx * (0.16 + roundness * 0.12);

  /*
   * Tiny deterministic irregularity.
   * This is intentionally subtle. The old wobble could make the silhouette
   * look like damaged vector art rather than a living creature.
   */
  const phase = options.phase;
  const leftWobble =
    1 +
    wobble *
      0.025 *
      Math.sin(phase * 1.7);

  const rightWobble =
    1 +
    wobble *
      0.025 *
      Math.cos(phase * 1.3);

  const leftShoulder = shoulderWidth * leftWobble;
  const rightShoulder = shoulderWidth * rightWobble;

  g.moveTo(cx - topWidth + topRadius, topY);

  /* Top-left crown */
  g.bezierCurveTo(
    cx - topWidth * 0.55,
    topY,
    cx - topWidth * 0.18,
    topY,
    cx - topWidth + topRadius,
    topY,
  );

  g.bezierCurveTo(
    cx - topWidth * 0.98,
    topY + ry * 0.03,
    cx - leftShoulder * 0.98,
    shoulderY - ry * 0.05,
    cx - leftShoulder,
    shoulderY,
  );

  /* Left shoulder into side */
  g.bezierCurveTo(
    cx - leftShoulder * 1.02,
    shoulderY + ry * 0.15,
    cx - leftShoulder,
    sideY - ry * 0.12,
    cx - leftShoulder,
    sideY,
  );

  /* Left side */
  g.bezierCurveTo(
    cx - leftShoulder,
    sideY + ry * 0.28,
    cx - lowerWidth * 1.01,
    lowerY - ry * 0.10,
    cx - lowerWidth + lowerRadius,
    lowerY,
  );

  /* Lower-left corner */
  g.bezierCurveTo(
    cx - lowerWidth * 0.72,
    lowerY + ry * 0.20,
    cx - rx * 0.66,
    bottomY,
    cx - rx * 0.40,
    bottomY,
  );

  /* Bottom */
  g.bezierCurveTo(
    cx - rx * 0.18,
    bottomY,
    cx + rx * 0.18,
    bottomY,
    cx + rx * 0.40,
    bottomY,
  );

  /* Lower-right corner */
  g.bezierCurveTo(
    cx + rx * 0.66,
    bottomY,
    cx + lowerWidth * 0.72,
    lowerY + ry * 0.20,
    cx + lowerWidth - lowerRadius,
    lowerY,
  );

  /* Right side */
  g.bezierCurveTo(
    cx + lowerWidth * 1.01,
    lowerY - ry * 0.10,
    cx + rightShoulder,
    sideY + ry * 0.28,
    cx + rightShoulder,
    sideY,
  );

  g.bezierCurveTo(
    cx + rightShoulder,
    sideY - ry * 0.12,
    cx + rightShoulder * 1.02,
    shoulderY + ry * 0.15,
    cx + rightShoulder,
    shoulderY,
  );

  /* Right shoulder into crown */
  g.bezierCurveTo(
    cx + rightShoulder * 0.98,
    shoulderY - ry * 0.05,
    cx + topWidth * 0.98,
    topY + ry * 0.03,
    cx + topWidth - topRadius,
    topY,
  );

  /* Crown */
  g.bezierCurveTo(
    cx + topWidth * 0.18,
    topY,
    cx + topWidth * 0.55,
    topY,
    cx - topWidth + topRadius,
    topY,
  );

  g.closePath();

  return g;
}

/* -------------------------------------------------------------------------- */
/* Public silhouette                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Draws the main body silhouette.
 *
 * This intentionally uses a hand-shaped cubic path instead of a superellipse.
 * A superellipse is mathematically neat but produces a very generic mascot
 * body. This path gives us the chunky "toy creature" proportions of the
 * reference.
 */
export function drawBodySilhouette(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  options: BodySilhouetteOptions,
): Graphics {
  return roundedBodyPath(
    g,
    cx,
    cy,
    rx,
    ry,
    options,
  );
}

export function drawPetSilhouette(
  g: Graphics,
  proportions: PetProportions,
  appearance: PetAppearance,
): Graphics {
  return drawBodySilhouette(
    g,
    0,
    0,
    proportions.bodyWidth / 2,
    proportions.bodyHeight / 2,
    {
      roundness: proportions.bodyRoundness,
      topTaper: proportions.bodyTopTaper,
      bottomBias: proportions.bodyBottomBias,
      wobble: proportions.bodyWobble,
      phase: appearance.seed % 7,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Feet                                                                       */
/* -------------------------------------------------------------------------- */

function drawFoot(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
): void {
  /*
   * The feet are deliberately organic rather than perfect rounded rectangles.
   * They should feel like they are growing out of the body.
   */

  const halfW = width / 2;

  g.moveTo(x - halfW * 0.72, y - height * 0.38);

  g.bezierCurveTo(
    x - halfW * 0.95,
    y - height * 0.18,
    x - halfW * 0.92,
    y + height * 0.25,
    x - halfW * 0.62,
    y + height * 0.43,
  );

  g.bezierCurveTo(
    x - halfW * 0.30,
    y + height * 0.62,
    x + halfW * 0.30,
    y + height * 0.62,
    x + halfW * 0.62,
    y + height * 0.43,
  );

  g.bezierCurveTo(
    x + halfW * 0.92,
    y + height * 0.25,
    x + halfW * 0.95,
    y - height * 0.18,
    x + halfW * 0.72,
    y - height * 0.38,
  );

  g.bezierCurveTo(
    x + halfW * 0.40,
    y - height * 0.55,
    x - halfW * 0.40,
    y - height * 0.55,
    x - halfW * 0.72,
    y - height * 0.38,
  );

  g.closePath();

  g.fill({ color });
}

function drawToeHints(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  toes: number,
  color: number,
): void {
  if (toes <= 0) return;

  const count = Math.min(toes, 4);
  const toeRadius = Math.max(1.5, width * 0.075);

  for (let i = 0; i < count; i++) {
    const normalized =
      count === 1
        ? 0
        : (i / (count - 1)) * 2 - 1;

    g.ellipse(
      x + normalized * width * 0.22,
      y + height * 0.28,
      toeRadius,
      toeRadius * 0.72,
    );
  }

  g.fill({
    color,
    alpha: 0.42,
  });
}

/* -------------------------------------------------------------------------- */
/* Body                                                                       */
/* -------------------------------------------------------------------------- */

export function createBody(
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = 'body-art';

  const ramp = tones(appearance.primaryColor);

  const rx = proportions.bodyWidth / 2;
  const ry = proportions.bodyHeight / 2;

  /* ---------------------------------------------------------------------- */
  /* Feet                                                                     */
  /* ---------------------------------------------------------------------- */

  const foot = getFootShape(appearance.footType);

  if (foot.count > 0 && proportions.footWidth > 0) {
    const feet = new Graphics();
    const toes = new Graphics();

    /*
     * Two-foot animals get the classic wide mascot stance.
     * Four-foot animals use a tighter arrangement so the body remains
     * visually dominant.
     */
    const offsets =
      foot.count === 4
        ? [-0.37, -0.13, 0.13, 0.37]
        : [-0.30, 0.30];

    const footY =
      ry * 0.82 +
      proportions.footHeight * 0.20;

    const footColor = darken(ramp.deep, 0.08);

    for (const offset of offsets) {
      const fx = offset * proportions.bodyWidth;

      drawFoot(
        feet,
        fx,
        footY,
        proportions.footWidth,
        proportions.footHeight * 1.18,
        footColor,
      );

      drawToeHints(
        toes,
        fx,
        footY,
        proportions.footWidth,
        proportions.footHeight,
        foot.toes,
        darken(ramp.deep, 0.30),
      );
    }

    root.addChild(feet);

    if (foot.toes > 0) {
      root.addChild(toes);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Main body                                                               */
  /* ---------------------------------------------------------------------- */

  const silhouette = new Graphics();

  drawPetSilhouette(
    silhouette,
    proportions,
    appearance,
  );

  silhouette.fill({
    color: ramp.base,
  });

  /*
   * Extremely subtle outline.
   *
   * The reference does not use a cartoon-black outline. A slightly darker
   * version of the body color gives separation without turning the character
   * into a sticker.
   */
  silhouette.stroke({
    color: darken(ramp.base, 0.12),
    width: Math.max(2, rx * 0.025),
    alignment: 1,
    alpha: 0.72,
  });

  root.addChild(silhouette);

  /* ---------------------------------------------------------------------- */
  /* Clipped body details                                                    */
  /* ---------------------------------------------------------------------- */

  const mask = new Graphics();

  drawPetSilhouette(
    mask,
    proportions,
    appearance,
  );

  mask.fill({
    color: 0xffffff,
  });

  root.addChild(mask);

  const clipped = new Container();
  clipped.label = 'body-detail';
  clipped.mask = mask;

  root.addChild(clipped);

  /* ---------------------------------------------------------------------- */
  /* Lower body shadow                                                       */
  /* ---------------------------------------------------------------------- */

  /*
   * Large soft-edged flat shape rather than a rectangular shadow.
   * This gives the lower body the same dimensional treatment as the
   * reference without looking like a gradient.
   */
  const lowerShadow = new Graphics();

  lowerShadow.moveTo(
    -rx * 1.05,
    ry * 0.40,
  );

  lowerShadow.bezierCurveTo(
    -rx * 0.72,
    ry * 0.55,
    -rx * 0.54,
    ry * 0.88,
    -rx * 0.20,
    ry * 1.03,
  );

  lowerShadow.bezierCurveTo(
    rx * 0.15,
    ry * 1.08,
    rx * 0.72,
    ry * 0.88,
    rx * 1.05,
    ry * 0.43,
  );

  lowerShadow.lineTo(
    rx * 1.15,
    ry * 1.15,
  );

  lowerShadow.lineTo(
    -rx * 1.15,
    ry * 1.15,
  );

  lowerShadow.closePath();

  lowerShadow.fill({
    color: ramp.deep,
    alpha: 0.22,
  });

  clipped.addChild(lowerShadow);

  /* ---------------------------------------------------------------------- */
  /* Belly panel                                                             */
  /* ---------------------------------------------------------------------- */

  /*
   * The belly is not a giant obvious rectangle.
   * It is a broad, low-contrast patch that follows the body language.
   */
  const belly = new Graphics();

  const bellyWidth = rx * 0.92;
  const bellyHeight = ry * 0.72;

  belly.roundRect(
    -bellyWidth / 2,
    ry * 0.25,
    bellyWidth,
    bellyHeight,
    bellyWidth * 0.28,
  );

  belly.fill({
    color: appearance.secondaryColor,
    alpha: 0.48,
  });

  clipped.addChild(belly);

  /* ---------------------------------------------------------------------- */
  /* Pattern                                                                  */
  /* ---------------------------------------------------------------------- */

  if (appearance.pattern !== 'none') {
    const marks = new Graphics();

    drawPattern(
      marks,
      appearance.pattern,
      {
        cx: 0,
        cy: 0,
        rx,
        ry,
      },
      {
        color: appearance.patternColor,
        alpha: 0.38,
        seed: appearance.seed,
      },
    );

    clipped.addChild(marks);
  }

  /* ---------------------------------------------------------------------- */
  /* Upper-left light patch                                                   */
  /* ---------------------------------------------------------------------- */

  /*
   * Instead of a glossy line, use two small irregular patches.
   * This is much closer to the reference artwork.
   */
  const highlight = new Graphics();

  highlight.ellipse(
    -rx * 0.56,
    -ry * 0.55,
    rx * 0.13,
    ry * 0.10,
  );

  highlight.ellipse(
    -rx * 0.34,
    -ry * 0.61,
    rx * 0.10,
    ry * 0.075,
  );

  highlight.fill({
    color: lighten(appearance.primaryColor, 0.24),
    alpha: 0.42,
  });

  clipped.addChild(highlight);

  /* ---------------------------------------------------------------------- */
  /* Small lower side shadows                                                 */
  /* ---------------------------------------------------------------------- */

  const leftShadow = new Graphics();

  leftShadow.ellipse(
    -rx * 0.82,
    ry * 0.30,
    rx * 0.16,
    ry * 0.25,
  );

  leftShadow.fill({
    color: ramp.deep,
    alpha: 0.12,
  });

  clipped.addChild(leftShadow);

  const rightShadow = new Graphics();

  rightShadow.ellipse(
    rx * 0.82,
    ry * 0.30,
    rx * 0.16,
    ry * 0.25,
  );

  rightShadow.fill({
    color: ramp.deep,
    alpha: 0.12,
  });

  clipped.addChild(rightShadow);

  return root;
}