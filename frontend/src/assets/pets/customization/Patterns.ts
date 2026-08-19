/**
 * Coat patterns.
 *
 * A pattern is drawn as a loose overlay and then masked by the silhouette of the
 * part it sits on, so markings always follow the body shape no matter how the
 * proportions are customized.
 */

import { Graphics } from 'pixi.js';
import { createRng, drawBlob, rngRange } from '../../shared/shapes';

export const PATTERN_KEYS = ['none', 'spots', 'stripes', 'dapple', 'patches'] as const;

export type PatternType = (typeof PATTERN_KEYS)[number];

export const PATTERN_LABELS: Record<PatternType, string> = {
  none: 'None',
  spots: 'Spots',
  stripes: 'Stripes',
  dapple: 'Dapple',
  patches: 'Patches',
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
  /** Scales mark size — smaller parts (the head) want smaller markings. */
  scale?: number;
}

/**
 * Draw pattern marks into `g`.
 *
 * The caller is responsible for masking; this function only produces marks.
 * Returns the same Graphics so calls can be chained.
 */
export function drawPattern(
  g: Graphics,
  pattern: PatternType,
  area: PatternArea,
  options: PatternOptions,
): Graphics {
  if (pattern === 'none') return g;

  const alpha = options.alpha ?? 0.5;
  const scale = options.scale ?? 1;
  const rng = createRng(options.seed ?? 4242);

  switch (pattern) {
    case 'spots': {
      const count = 7;
      for (let i = 0; i < count; i++) {
        const x = area.cx + rngRange(rng, -area.rx * 0.75, area.rx * 0.75);
        const y = area.cy + rngRange(rng, -area.ry * 0.7, area.ry * 0.6);
        const r = rngRange(rng, 6, 15) * scale;
        drawBlob(g, x, y, r, r * rngRange(rng, 0.7, 1.05), {
          segments: 8,
          jitter: 0.18,
          rng,
        });
        g.fill({ color: options.color, alpha: alpha * rngRange(rng, 0.7, 1) });
      }
      break;
    }

    case 'stripes': {
      const count = 5;
      const spacing = (area.rx * 1.5) / count;
      for (let i = 0; i < count; i++) {
        const x = area.cx - area.rx * 0.6 + i * spacing + rngRange(rng, -4, 4);
        const height = area.ry * rngRange(rng, 0.8, 1.15);
        const width = rngRange(rng, 9, 16) * scale;
        // Stripes bow slightly so they wrap the form instead of reading as bars.
        g.moveTo(x, area.cy - height);
        g.bezierCurveTo(
          x + width * 0.6,
          area.cy - height * 0.3,
          x + width * 0.6,
          area.cy + height * 0.3,
          x + rngRange(rng, -6, 6),
          area.cy + height * 0.75,
        );
        g.bezierCurveTo(
          x - width * 0.4,
          area.cy + height * 0.3,
          x - width * 0.4,
          area.cy - height * 0.3,
          x,
          area.cy - height,
        );
        g.closePath();
        g.fill({ color: options.color, alpha: alpha * 0.75 });
      }
      break;
    }

    case 'dapple': {
      const count = 16;
      for (let i = 0; i < count; i++) {
        const x = area.cx + rngRange(rng, -area.rx * 0.85, area.rx * 0.85);
        const y = area.cy + rngRange(rng, -area.ry * 0.85, area.ry * 0.7);
        const r = rngRange(rng, 3, 7) * scale;
        g.circle(x, y, r);
        g.fill({ color: options.color, alpha: alpha * rngRange(rng, 0.3, 0.6) });
      }
      break;
    }

    case 'patches': {
      const count = 3;
      for (let i = 0; i < count; i++) {
        const x = area.cx + rngRange(rng, -area.rx * 0.6, area.rx * 0.6);
        const y = area.cy + rngRange(rng, -area.ry * 0.5, area.ry * 0.5);
        const r = rngRange(rng, 18, 34) * scale;
        drawBlob(g, x, y, r, r * rngRange(rng, 0.6, 0.9), {
          segments: 10,
          jitter: 0.26,
          rng,
        });
        g.fill({ color: options.color, alpha: alpha * 0.8 });
      }
      break;
    }
  }

  return g;
}
