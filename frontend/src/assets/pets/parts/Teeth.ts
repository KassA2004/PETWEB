/**
 * Teeth — domes with flat roots, drawn into the mouth.
 *
 * One renderer for every set. A tooth is a rounded shape whose root is buried
 * in the lip it hangs from, so it never reads as a block sitting inside a
 * smile: the lip line cuts it, the way a real tooth is cut by a gum.
 *
 * Everything is positioned from the mouth's own geometry, so the same set fits
 * a `:3` and a wide open slab without a single special case.
 */

import type { Graphics } from 'pixi.js';
import { clamp, createRng, lerp } from '../../shared/shapes';
import { drawSmoothClosed } from '../../shared/geometry';
import type { Vec2 } from '../../shared/geometry';
import type { TeethShape } from '../customization/TeethTypes';

export interface TeethLayout {
  /** Half the mouth's width. */
  half: number;
  /**
   * Where the teeth are rooted.
   *
   * When the mouth is shut this is the *lowest* point of the lip line, so buck
   * teeth hang below the whole mouth instead of poking through it — which is
   * what went wrong when they were rooted at the centre of a `:3`.
   */
  rootY: number;
  /** How far down the mouth is open. 0 when shut. */
  depth: number;
  /** 0 shut .. 1 wide. */
  open: number;
  /** Deterministic irregularity. */
  seed: number;
  /** Overall size multiplier from the appearance — the old `fangs` dial. */
  strength: number;
}

/** One tooth: a dome, pointing down for an upper tooth and up for a lower one. */
function toothOutline(
  cx: number,
  rootY: number,
  halfWidth: number,
  length: number,
  round: number,
  direction: number,
): Vec2[] {
  const tipY = rootY + length * direction;
  const shoulder = lerp(0.98, 0.6, round);

  return [
    { x: cx - halfWidth, y: rootY - length * 0.3 * direction },
    { x: cx - halfWidth * shoulder, y: rootY + length * 0.45 * direction },
    { x: cx - halfWidth * shoulder * 0.55, y: tipY },
    { x: cx, y: tipY + length * 0.1 * direction },
    { x: cx + halfWidth * shoulder * 0.55, y: tipY },
    { x: cx + halfWidth * shoulder, y: rootY + length * 0.45 * direction },
    { x: cx + halfWidth, y: rootY - length * 0.3 * direction },
  ];
}

/**
 * Draw a set of teeth into `g`.
 *
 * The caller fills afterwards — one fill for the whole set, so they read as one
 * flat shape rather than as a group of objects.
 */
export function drawTeeth(
  g: Graphics,
  shape: TeethShape,
  layout: TeethLayout,
): void {
  if (shape.count <= 0 || layout.strength <= 0.02) return;

  const rng = createRng(layout.seed ^ 0x7ee7);
  const { half, rootY, depth, open } = layout;

  // A closed mouth still shows what the set is allowed to protrude; an open one
  // shows the whole tooth. The blend between them is the mouth's own openness.
  const visible = lerp(shape.protrude, 1, open);
  if (visible <= 0.02) return;

  // The tooth-size dial trims and swells the set rather than switching it off;
  // `teethType: 'none'` is the off switch.
  const scale = lerp(0.62, 1.4, clamp(layout.strength, 0, 1));
  const toothHalf = half * shape.width * 0.5 * scale;
  const reach = Math.max(depth, half * 0.85) * shape.length * visible * scale;

  const upperCount = shape.lower >= 1 ? 0 : Math.round(shape.count * (1 - shape.lower));
  const lowerCount = shape.count - upperCount;

  const place = (count: number, direction: number, root: number) => {
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1);
      const centre = count <= 1 ? 0 : (t * 2 - 1) * half * shape.spread;

      // Irregularity is deterministic: the same creature always has the same
      // wrong tooth.
      const wobble = (rng() - 0.5) * 2 * shape.jitter;
      const sizeJitter = 1 + wobble * 0.35;
      const lengthJitter = 1 + wobble * 0.45;
      const offset = wobble * toothHalf * 0.8;

      // A lone tooth reads its spread as a sideways offset rather than as the
      // width of a span — that is what puts the snaggletooth off to one side.
      const lonely = count === 1 && shape.jitter > 0;
      const x = centre + offset + (lonely ? half * shape.spread : 0);

      drawSmoothClosed(
        g,
        toothOutline(
          x,
          root,
          Math.max(1, toothHalf * sizeJitter),
          Math.max(1, reach * lengthJitter),
          shape.round,
          direction,
        ),
        0.6,
      );
    }
  };

  if (upperCount > 0) place(upperCount, 1, rootY);
  if (lowerCount > 0) place(lowerCount, -1, rootY + Math.max(depth, half * 0.35));
}
