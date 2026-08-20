/**
 * Limbs — the little nubs.
 *
 * A blob has no real anatomy below the mass: two side nubs for arms and two
 * stubs for feet, each one flat shape in a slightly darker coat tone. They
 * exist for motion, not for detail — an arm that swings and a foot that peeks
 * out under the body is what stops the creature reading as a beanbag.
 *
 * Both are drawn hanging from their own origin, so the rig can rotate them
 * about their attachment point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, outline } from '../../shared/color';
import { drawCapsule } from '../../shared/shapes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

/** A side nub, hanging down and slightly outward from the shoulder. */
export function createArm(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = `arm-${side}`;

  if (proportions.armLength <= 0 || proportions.armWidth <= 0) return root;

  const color = darken(appearance.primaryColor, 0.16);

  const art = new Graphics();
  drawCapsule(art, 0, -proportions.armWidth * 0.3, proportions.armWidth, proportions.armLength);
  art.fill({ color });
  art.stroke({ color: outline(color, 0.25), width: 2, alpha: 0.4 });
  root.addChild(art);

  return root;
}

/** A foot stub, flat on the floor. */
export function createFoot(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = `foot-${side}`;

  if (proportions.footWidth <= 0 || proportions.footHeight <= 0) return root;

  const color = darken(appearance.primaryColor, 0.22);

  const art = new Graphics();
  art.ellipse(0, 0, proportions.footWidth / 2, proportions.footHeight / 2);
  art.fill({ color });
  art.stroke({ color: outline(color, 0.25), width: 2, alpha: 0.4 });
  root.addChild(art);

  return root;
}
