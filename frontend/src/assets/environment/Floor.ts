/**
 * Floor — the plane the pet and objects stand on.
 *
 * Three flat bands: a darker strip in the distance, the main surface, and a
 * couple of seam lines. Depth in this style comes from the bands getting
 * taller toward the viewer, not from perspective or shading.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, outline } from '../shared/color';

export interface FloorOptions {
  width: number;
  height: number;
  /** Y coordinate where the floor begins (the wall/floor crease). */
  floorY: number;
  color?: number;
}

export function createFloor(options: FloorOptions): Container {
  const { width, height, floorY } = options;
  const color = options.color ?? PALETTE.sand;

  const root = new Container();
  root.label = 'floor';

  const depth = height - floorY;

  // Main surface.
  const plane = new Graphics();
  plane.rect(0, floorY, width, depth);
  plane.fill({ color });
  root.addChild(plane);

  // Far strip, sitting in the wall's shadow.
  const far = new Graphics();
  far.rect(0, floorY, width, depth * 0.16);
  far.fill({ color: darken(color, 0.24) });
  root.addChild(far);

  // Two seam lines, spaced wider as they come forward.
  const seams = new Graphics();
  for (const t of [0.34, 0.72]) {
    const y = floorY + depth * t;
    seams.moveTo(0, y);
    seams.lineTo(width, y);
  }
  seams.stroke({ color: outline(color, 0.3), width: 3, alpha: 0.35 });
  root.addChild(seams);

  return root;
}
