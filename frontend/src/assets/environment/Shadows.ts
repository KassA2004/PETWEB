/**
 * Shadows.
 *
 * Shadows are mandatory in this project — nothing may look like it is floating
 * (/Docs/theme-and-design.md section 5). Every pet and every object gets a
 * contact shadow from this one factory so they all sit in the same light.
 *
 * Flat, not blurred: two stacked ellipses, a wider soft one and a tighter dark
 * one. Banded flat shadows are the shadow language of this art style, and they
 * cost one draw call with no filter padding to fight.
 */

import { Graphics } from 'pixi.js';
import { SHADOW_TINT } from '../shared/color';

export interface ContactShadowOptions {
  /** Full width of the shadow ellipse. */
  width: number;
  /** Full height. Flatter shadows read as a lower light angle. */
  height?: number;
  /** Darkness of the inner band, 0..1. */
  strength?: number;
  color?: number;
  /** Horizontal offset — the light comes from the upper left. */
  offsetX?: number;
}

/**
 * A flat contact shadow, centred on (0, 0).
 *
 * Place it at the object's floor contact point.
 */
export function createContactShadow(options: ContactShadowOptions): Graphics {
  const width = options.width;
  const height = options.height ?? width * 0.24;
  const strength = options.strength ?? 0.24;
  const color = options.color ?? SHADOW_TINT;
  const offsetX = options.offsetX ?? width * 0.04;

  const shadow = new Graphics();
  shadow.label = 'contact-shadow';

  // Outer band: wide and faint.
  shadow.ellipse(offsetX, 0, width * 0.58, height * 0.62);
  shadow.fill({ color, alpha: strength * 0.5 });

  // Inner band: tight and darker, right under the object.
  shadow.ellipse(offsetX, 0, width * 0.4, height * 0.42);
  shadow.fill({ color, alpha: strength });

  return shadow;
}

/**
 * Update a contact shadow for an object that has left the ground.
 *
 * The shadow tightens when something is close to the floor and spreads and
 * fades as it rises.
 *
 * @param shadow  the graphics returned by `createContactShadow`
 * @param height  how far above the floor the object is, in pixels
 * @param falloff distance at which the shadow has fully faded
 */
export function applyShadowHeight(
  shadow: Graphics,
  height: number,
  falloff = 120,
): void {
  const t = Math.max(0, Math.min(1, height / falloff));
  shadow.alpha = 1 - t * 0.75;
  shadow.scale.set(1 + t * 0.35, 1 + t * 0.2);
}
