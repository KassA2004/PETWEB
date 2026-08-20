/**
 * Lighting — two flat passes that frame the scene.
 *
 *   ambient   a light pool on the floor, under the props, so it reads as light
 *             lying on the ground rather than a wash painted over everything
 *   overlay   two soft bands darkening the top and bottom edges of the frame
 *
 * Both are flat translucent shapes. There is no gradient, no blend mode and no
 * filter anywhere in this project — light here is a shape, like everything else
 * (/Docs/theme-and-design.md section 4).
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, SHADOW_TINT } from '../shared/color';

export interface LightingOptions {
  width: number;
  height: number;
  /** Centre of the pool of light on the floor. */
  lightX?: number;
  lightY?: number;
  /** 0..1 overall strength. */
  strength?: number;
}

export interface LightingLayers {
  /** Goes above the room but BELOW the pet and objects. */
  ambient: Container;
  /** Goes above everything. */
  overlay: Container;
}

export function createLighting(options: LightingOptions): LightingLayers {
  const { width, height } = options;
  const lightX = options.lightX ?? width * 0.28;
  const lightY = options.lightY ?? height * 0.75;
  const strength = options.strength ?? 1;

  // --- Ambient: the pool of light on the floor -----------------------------
  const ambient = new Container();
  ambient.label = 'lighting-ambient';

  const pool = new Graphics();
  pool.ellipse(lightX, lightY, width * 0.34, height * 0.16);
  pool.fill({ color: PALETTE.cream, alpha: 0.16 * strength });
  pool.ellipse(lightX, lightY, width * 0.22, height * 0.1);
  pool.fill({ color: PALETTE.cream, alpha: 0.12 * strength });
  ambient.addChild(pool);

  // --- Overlay: edge bands -------------------------------------------------
  const overlay = new Container();
  overlay.label = 'lighting-overlay';

  const bands = new Graphics();
  bands.rect(0, 0, width, height * 0.14);
  bands.fill({ color: SHADOW_TINT, alpha: 0.1 * strength });
  bands.rect(0, height * 0.86, width, height * 0.14);
  bands.fill({ color: SHADOW_TINT, alpha: 0.12 * strength });
  overlay.addChild(bands);

  return { ambient, overlay };
}
