/**
 * Eye.ts
 *
 * Eye — a dark shape, a highlight, and two lids.
 *
 * Updated for a flat, 2D vector art style. Lids use hard, blocky edges
 * and the pupil is simplified to a solid shape without organic shading.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, luminance, mix, tones } from '../../shared/color';
import { getEyeShape } from '../customization/FaceTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export interface EyeView {
  root: Container;
  pupil: Container;
  lid: Container;
  lowerLid: Container;
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

  // --- Backing -------------------------------------------------------------
  const coatBrightness = luminance(appearance.primaryColor);
  if (coatBrightness < 0.42) {
    const backing = new Graphics();
    backing.circle(0, 0, rx * 1.25);
    backing.fill({
      color: mix(0xfff6e8, appearance.primaryColor, 0.15),
      alpha: 1, // Solid backing for 2D style
    });
    root.addChild(backing);
  }

  // --- Pupil ---------------------------------------------------------------
  const pupil = new Container();
  pupil.label = `pupil-${side}`;
  root.addChild(pupil);

  const dark = new Graphics();
  // Solid, flat circle for the eye base, matching the reference art
  dark.circle(0, 0, rx);
  dark.fill({ color: 0x4a3121 }); // Standardized dark brown/grey from reference
  pupil.addChild(dark);

  // Simplified glint for flat vector style (no soft alpha/multiple layers)
  if (shape.glints > 0) {
    const glint = new Graphics();
    glint.circle(-rx * 0.25, -ry * 0.25, rx * 0.3);
    glint.fill({ color: 0xffffff });
    pupil.addChild(glint);
  }

  const ramp = tones(appearance.primaryColor);

  // --- Lower lid: rises for a squint ---------------------------------------
  const lowerLid = new Container();
  lowerLid.label = `lower-lid-${side}`;
  lowerLid.position.set(0, ry * 1.05);
  lowerLid.scale.y = 0;

  // --- Upper lid: closes downward ------------------------------------------
  const lid = new Container();
  lid.label = `lid-${side}`;
  lid.position.set(0, -ry * 1.05);

  const lidArt = new Graphics();
  // Flat rectangle acting as a rigid mask
  lidArt.rect(-rx * 1.5, 0, rx * 3, ry * 2);
  lidArt.fill({ color: ramp.base });
  lid.addChild(lidArt);

  // Hard, thick vector line for the lash line
  const lash = new Graphics();
  lash.moveTo(-rx * 1.1, ry * 2);
  lash.lineTo(rx * 1.1, ry * 2);
  lash.stroke({
    color: darken(appearance.primaryColor, 0.2),
    width: Math.max(3, rx * 0.2),
    cap: 'round',
  });
  lid.addChild(lash);

  lid.scale.y = shape.lidRest;
  root.addChild(lid);

  return { root, pupil, lid, lowerLid, radiusX: rx, radiusY: ry };
}