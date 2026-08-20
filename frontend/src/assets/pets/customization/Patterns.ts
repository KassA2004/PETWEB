/**
 * Coat patterns.
 *
 * A pattern is a handful of flat marks drawn over the body and then masked by
 * the body silhouette, so markings always follow the shape no matter how the
 * blob is proportioned. Marks are simple by design: a blob covered in detail
 * stops reading as a blob.
 */

import { Graphics } from 'pixi.js';
import { createRng, drawOrganicOval, rngRange } from '../../shared/shapes';

export const PATTERN_KEYS = ['none', 'spots', 'speckles', 'band', 'patch'] as const;

export type PatternType = (typeof PATTERN_KEYS)[number];

export const PATTERN_LABELS: Record<PatternType, string> = {
  none: 'None',
  spots: 'Spots',
  speckles: 'Speckles',
  band: 'Band',
  patch: 'Patch',
};

export interface PatternArea {
  /** Centre of the area the pattern should cover. */
  cx: number;
  cy: number;
  /** Half-extents of the area. */
  rx: number;
  ry: number;
}

export interface PatternOptions {
  color: number;
  alpha?: number;
  seed?: number;
}

/**
 * Draw pattern marks into `g`.
 *
 * The caller is responsible for masking; this function only produces marks.
 */
export function drawPattern(
  g: Graphics,
  pattern: PatternType,
  area: PatternArea,
  options: PatternOptions,
): Graphics {
  if (pattern === 'none') return g;

  const alpha = options.alpha ?? 0.55;
  const rng = createRng(options.seed ?? 4242);

  switch (pattern) {
    case 'spots': {
      for (let i = 0; i < 5; i++) {
        const x = area.cx + rngRange(rng, -area.rx * 0.8, area.rx * 0.8);
        const y = area.cy + rngRange(rng, -area.ry * 0.8, area.ry * 0.7);
        const r = rngRange(rng, area.rx * 0.1, area.rx * 0.2);
        drawOrganicOval(g, x, y, r, r * rngRange(rng, 0.8, 1.05), 20, 0.07);
        g.fill({ color: options.color, alpha });
      }
      break;
    }

    case 'speckles': {
      for (let i = 0; i < 14; i++) {
        const x = area.cx + rngRange(rng, -area.rx * 0.85, area.rx * 0.85);
        const y = area.cy + rngRange(rng, -area.ry * 0.85, area.ry * 0.8);
        g.circle(x, y, rngRange(rng, area.rx * 0.02, area.rx * 0.045));
        g.fill({ color: options.color, alpha: alpha * 0.9 });
      }
      break;
    }

    case 'band': {
      // One wide stripe across the middle, tilted a touch so it never looks
      // like a UI progress bar.
      const height = area.ry * 0.36;
      const y = area.cy + area.ry * 0.1;
      g.moveTo(-area.rx * 1.4, y - height);
      g.lineTo(area.rx * 1.4, y - height * 1.5);
      g.lineTo(area.rx * 1.4, y + height * 0.6);
      g.lineTo(-area.rx * 1.4, y + height);
      g.closePath();
      g.fill({ color: options.color, alpha });
      break;
    }

    case 'patch': {
      // A single big irregular blotch over one side.
      const x = area.cx + area.rx * rngRange(rng, 0.15, 0.4);
      const y = area.cy - area.ry * rngRange(rng, 0, 0.3);
      drawOrganicOval(g, x, y, area.rx * 0.55, area.ry * 0.5, 26, 0.14, rng() * 6);
      g.fill({ color: options.color, alpha });
      break;
    }
  }

  return g;
}
