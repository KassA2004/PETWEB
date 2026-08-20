/**
 * Background — the flat color field the whole room sits on.
 *
 * One fill, plus a handful of large darker patches. The patches are what stop
 * a flat fill from looking like an empty canvas: they give the eye something
 * to read as space behind the room without adding any detail that competes
 * with the pet (/Docs/theme-and-design.md section 8).
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken } from '../shared/color';
import { createRng, drawOrganicOval, rngRange } from '../shared/shapes';

export interface BackgroundOptions {
  width: number;
  height: number;
  /** Overall room color. */
  color?: number;
  seed?: number;
}

export function createBackground(options: BackgroundOptions): Container {
  const { width, height } = options;
  const color = options.color ?? PALETTE.ember;
  const rng = createRng(options.seed ?? 1201);

  const root = new Container();
  root.label = 'background';

  const field = new Graphics();
  field.rect(0, 0, width, height);
  field.fill({ color });
  root.addChild(field);

  // Big soft patches, all the same darker tone, scattered across the field.
  const patches = new Graphics();
  for (let i = 0; i < 7; i++) {
    const x = rngRange(rng, -width * 0.1, width * 1.1);
    const y = rngRange(rng, -height * 0.05, height * 0.85);
    const rx = rngRange(rng, width * 0.1, width * 0.24);
    patches.beginPath();
    drawOrganicOval(patches, x, y, rx, rx * rngRange(rng, 0.45, 0.8), 24, 0.12, i);
  }
  patches.fill({ color: darken(color, 0.22), alpha: 0.55 });
  root.addChild(patches);

  return root;
}
