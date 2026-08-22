/**
 * Mouth — drawn from the creature's current feelings, every time they change.
 *
 * There is no list of mouth shapes to choose from. Picking "grin" from a menu
 * and then watching it grin while the creature is being thrown across the room
 * is exactly what makes a pet feel like a puppet, so the shape is a function of
 * three animated numbers instead:
 *
 *   curve   -1 (miserable) .. +1 (delighted)
 *   open     0 (shut) .. 1 (yelling)
 *   width    how wide the whole thing is
 *
 * The user picks size, line weight, fangs and a resting mood — cosmetics and
 * personality, not poses (/Docs/animation-approach.md §55).
 *
 * The layers below are built once and redrawn in place. Redraws are gated on
 * meaningful change, so holding an expression costs nothing per frame.
 */

import { Container, Graphics } from 'pixi.js';
import { mix } from '../../shared/color';

export interface MouthParams {
  /** -1 frown .. +1 smile. */
  curve: number;
  /** 0 shut .. 1 wide open. */
  open: number;
  /** Full width in pixels. */
  width: number;
  /** Stroke weight in pixels. */
  weight: number;
  /** 0..1 visible teeth. */
  fangs: number;
  /** Line and fill color. */
  color: number;
  tongue: number;
}

export interface MouthView {
  root: Container;
  apply(params: MouthParams): void;
}

function changed(a: MouthParams | null, b: MouthParams): boolean {
  if (!a) return true;
  return (
    Math.abs(a.curve - b.curve) > 0.012 ||
    Math.abs(a.open - b.open) > 0.012 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.weight - b.weight) > 0.3 ||
    Math.abs(a.fangs - b.fangs) > 0.05 ||
    a.color !== b.color ||
    a.tongue !== b.tongue
  );
}

export function createMouth(): MouthView {
  const root = new Container();
  root.label = 'mouth';

  // Fixed layers, built once and redrawn in place.
  const shape = new Graphics();
  const clip = new Graphics();
  const tongue = new Graphics();
  const teeth = new Graphics();

  tongue.mask = clip;

  root.addChild(shape, clip, tongue, teeth);

  let last: MouthParams | null = null;

  const apply = (params: MouthParams) => {
    if (!changed(last, params)) return;
    last = { ...params };

    const w = Math.max(6, params.width);
    const half = w / 2;
    const curve = Math.max(-1, Math.min(1, params.curve));
    const open = Math.max(0, Math.min(1, params.open));
    const weight = Math.max(1.5, params.weight);

    // The line the upper lip follows. A positive curve bows downward on
    // screen, which is a smile; negative bows up, which is a frown.
    const lift = curve * w * 0.3;

    shape.clear();
    clip.clear();
    tongue.clear();
    teeth.clear();

    if (open < 0.05) {
      // --- Closed: one stroke ---------------------------------------------
      shape.moveTo(-half, 0);
      shape.quadraticCurveTo(0, lift, half, 0);
      shape.stroke({ color: params.color, width: weight, cap: 'round' });

      // A smile deep enough to need corners gets them, which stops a wide
      // grin from reading as a plain arc.
      if (curve > 0.45) {
        shape.moveTo(-half, 0);
        shape.quadraticCurveTo(-half * 0.9, -weight * 0.9, -half * 0.72, -weight * 1.2);
        shape.moveTo(half, 0);
        shape.quadraticCurveTo(half * 0.9, -weight * 0.9, half * 0.72, -weight * 1.2);
        shape.stroke({ color: params.color, width: weight * 0.8, cap: 'round' });
      }
    } else {
      // --- Open: a closed shape between two arcs ---------------------------
      const depth = w * (0.16 + open * 0.62);

      const outline = (g: Graphics) => {
        g.moveTo(-half, 0);
        g.quadraticCurveTo(0, lift, half, 0);
        g.quadraticCurveTo(0, lift + depth, -half, 0);
        g.closePath();
      };

      outline(shape);
      shape.fill({ color: params.color });

      outline(clip);
      clip.fill({ color: 0xffffff });

      tongue.ellipse(0, lift + depth * 0.72, half * 0.5, depth * 0.42);
      tongue.fill({ color: params.tongue, alpha: 0.95 });
    }

    // --- Fangs ---------------------------------------------------------------
    if (params.fangs > 0.05) {
      const size = weight * (1.1 + params.fangs * 1.8);
      const inset = half * (0.52 - params.fangs * 0.12);

      for (const side of [-1, 1]) {
        const x = side * inset;
        const top = lift * 0.5;
        teeth.moveTo(x - size * 0.5, top);
        teeth.lineTo(x + size * 0.5, top);
        teeth.lineTo(x, top + size * 1.5);
        teeth.closePath();
      }

      teeth.fill({ color: 0xfff6e8 });
      teeth.stroke({ color: mix(params.color, 0xfff6e8, 0.3), width: 1, alpha: 0.4 });
    }
  };

  return { root, apply };
}
