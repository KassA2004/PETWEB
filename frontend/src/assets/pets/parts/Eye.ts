/**
 * Eye — a dark shape, a highlight dot, and a lid.
 *
 * That is deliberately all of it. A flat dark eye with one glint is the most
 * legible expression tool there is at small sizes, and it lets the whole face
 * be animated by moving three containers instead of redrawing anything.
 *
 * The structure is identical for every eye type, which is what lets blinking
 * and looking work the same across all of them:
 *
 *   root
 *   ├── pupil   the dark shape. Slides a few pixels to look around.
 *   └── lid     coat-colored cover, scaled 0 (open) to 1 (shut).
 */

import { Container, Graphics } from 'pixi.js';
import { darken } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { getEyeShape } from '../customization/EyeTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export interface EyeView {
  root: Container;
  /** The dark shape. Move this to look around; it is clamped by the caller. */
  pupil: Container;
  /**
   * Upper eyelid. `scale.y` runs 0 (open) to 1 (closed) — the blink module
   * writes here, and only ever increases it.
   */
  lid: Container;
  radiusX: number;
  radiusY: number;
}

export function createEye(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): EyeView {
  const shape = getEyeShape(appearance.eyeType);

  const rx = proportions.eyeWidth / 2;
  const ry = proportions.eyeHeight / 2;

  const root = new Container();
  root.label = `eye-${side}`;

  // --- Pupil ---------------------------------------------------------------
  const pupil = new Container();
  pupil.label = `pupil-${side}`;
  root.addChild(pupil);

  const dark = new Graphics();
  drawSquircle(dark, 0, 0, rx, ry, { roundness: shape.roundness });
  dark.fill({ color: 0x3d2233 });
  pupil.addChild(dark);

  if (shape.glints > 0) {
    const glint = new Graphics();
    glint.circle(-rx * 0.3, -ry * 0.36, rx * 0.3);
    if (shape.glints > 1) {
      glint.circle(rx * 0.32, ry * 0.3, rx * 0.15);
    }
    glint.fill({ color: 0xffffff, alpha: 0.92 });
    pupil.addChild(glint);
  }

  // --- Lid -----------------------------------------------------------------
  // Pivoted at the top of the eye, so scaling y closes it downward like a
  // real lid rather than shrinking it toward its own middle.
  const lid = new Container();
  lid.label = `lid-${side}`;
  lid.position.set(0, -ry * 1.1);

  const lidArt = new Graphics();
  lidArt.ellipse(0, ry * 1.05, rx * 1.3, ry * 1.2);
  lidArt.fill({ color: appearance.primaryColor });
  lid.addChild(lidArt);

  // The lash line, riding the lid's lower edge. It is the whole reason a shut
  // eye reads as shut rather than as a blank patch of coat: as the lid scales
  // down over the eye, this curve travels down with it and ends up as the
  // closed-eye line.
  const lash = new Graphics();
  lash.moveTo(-rx * 0.86, ry * 1.4);
  lash.quadraticCurveTo(0, ry * 2.05, rx * 0.86, ry * 1.4);
  lash.stroke({
    color: darken(appearance.primaryColor, 0.45),
    width: Math.max(2, rx * 0.16),
    cap: 'round',
  });
  lid.addChild(lash);

  lid.scale.y = shape.lidRest;
  root.addChild(lid);

  return { root, pupil, lid, radiusX: rx, radiusY: ry };
}
