/**
 * Mouth — the user's chosen design, drawn from the creature's current feelings.
 *
 * This is where character and expression meet, and neither one wins:
 *
 *   the *design* comes from the user (../customization/MouthTypes) and never
 *   changes at runtime, and
 *
 *   the *curve, openness and twist* come from the expression system every
 *   frame, and the design decides how far it bends in response.
 *
 * So a `:3` picked in the editor is still a `:3` when the creature is furious —
 * the lobes just turn over. Nothing swaps the shape out from under the user.
 *
 * The layers are built once and redrawn in place, and redraws are gated on
 * meaningful change, so holding an expression costs nothing per frame.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix } from '../../shared/color';
import { clamp } from '../../shared/shapes';
import { drawSmoothClosed, drawSmoothOpen } from '../../shared/geometry';
import {
  defaultLowerLip,
  getMouthShape,
  resolveMouthCurve,
} from '../customization/MouthTypes';
import type { MouthGeometryParams, MouthType } from '../customization/MouthTypes';
import { getTeethShape } from '../customization/TeethTypes';
import type { TeethType } from '../customization/TeethTypes';
import { drawTeeth } from './Teeth';

export interface MouthParams {
  /** The user's design. Never changed by the expression system. */
  type: MouthType;
  teeth: TeethType;

  /** -1 miserable .. +1 delighted. From the expression system. */
  curve: number;
  /** 0 shut .. 1 wide open. */
  open: number;
  /** -1 .. 1 sideways pull. Smirking, chewing, confusion. */
  twist: number;

  /** Full width in pixels, before the design's own multiplier. */
  width: number;
  /** Stroke weight in pixels. */
  weight: number;
  /** Tooth size, 0..1. */
  fangs: number;

  /** Line and fill colour. */
  color: number;
  tongue: number;
  /** Drives which tooth is the wrong one. */
  seed: number;
}

export interface MouthView {
  root: Container;
  apply(params: MouthParams): void;
}

function changed(a: MouthParams | null, b: MouthParams): boolean {
  if (!a) return true;

  return (
    a.type !== b.type ||
    a.teeth !== b.teeth ||
    Math.abs(a.curve - b.curve) > 0.012 ||
    Math.abs(a.open - b.open) > 0.012 ||
    Math.abs(a.twist - b.twist) > 0.02 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.weight - b.weight) > 0.3 ||
    Math.abs(a.fangs - b.fangs) > 0.04 ||
    a.color !== b.color ||
    a.tongue !== b.tongue ||
    a.seed !== b.seed
  );
}

export function createMouth(): MouthView {
  const root = new Container();
  root.label = 'mouth';

  // Fixed layers, built once and redrawn in place.
  const shape = new Graphics();
  const clip = new Graphics();
  const interior = new Container();
  const tongue = new Graphics();
  const teeth = new Graphics();
  const marks = new Graphics();

  interior.addChild(tongue);
  interior.mask = clip;

  root.addChild(shape, clip, interior, teeth, marks);

  let last: MouthParams | null = null;

  const apply = (params: MouthParams) => {
    if (!changed(last, params)) return;
    last = { ...params };

    shape.clear();
    clip.clear();
    tongue.clear();
    teeth.clear();
    marks.clear();

    const design = getMouthShape(params.type);
    const half = Math.max(4, (params.width * design.widthMul) / 2);
    const weight = Math.max(1.5, params.weight);

    const curve = resolveMouthCurve(design, clamp(params.curve, -1, 1));
    const open = clamp(clamp(params.open, 0, 1) * design.openGain, 0, 1.2);
    const twist = clamp(params.twist, -1, 1);

    const geometry: MouthGeometryParams = { half, curve, open, twist, weight };

    const upper = design.upper(geometry);
    const depth = half * (0.18 + open * 0.95);
    const isOpen = open > 0.06;
    // A beak has corners and a smile does not; the design says which.
    const tension = design.tension ?? 1;

    // --- The mouth itself ---------------------------------------------------
    if (design.kind === 'hole') {
      // A hole is always an opening; the expression sizes it.
      drawSmoothClosed(shape, upper, tension);
      shape.fill({ color: params.color });

      drawSmoothClosed(clip, upper, tension);
      clip.fill({ color: 0xffffff });

      tongue.ellipse(0, half * 0.5, half * 0.7, half * 0.55);
      tongue.fill({ color: params.tongue, alpha: 0.95 });
    } else if (!isOpen) {
      // Shut: one stroke along the upper lip.
      drawSmoothOpen(shape, upper, tension);
      shape.stroke({ color: params.color, width: weight, cap: 'round', join: 'round' });

      // A smile deep enough to need corners gets them, which keeps a wide grin
      // from reading as a plain arc.
      if (curve > 0.55) {
        const first = upper[0];
        const lastPoint = upper[upper.length - 1];

        shape.moveTo(first.x, first.y);
        shape.lineTo(first.x + half * 0.14, first.y - weight * 1.4);
        shape.moveTo(lastPoint.x, lastPoint.y);
        shape.lineTo(lastPoint.x - half * 0.14, lastPoint.y - weight * 1.4);
        shape.stroke({ color: params.color, width: weight * 0.8, cap: 'round' });
      }
    } else {
      // Open: a closed shape between the two lips.
      const lower = design.lower
        ? design.lower(geometry, depth)
        : defaultLowerLip(geometry, depth);

      const outline = [...upper, ...lower.slice(1, lower.length - 1)];

      drawSmoothClosed(shape, outline, tension);
      shape.fill({ color: params.color });
      shape.stroke({ color: darken(params.color, 0.2), width: weight * 0.5, alpha: 0.5 });

      drawSmoothClosed(clip, outline, tension);
      clip.fill({ color: 0xffffff });

      // The tongue sits low in the opening, and only shows once there is room.
      if (open > 0.25) {
        tongue.ellipse(twist * half * 0.15, depth * 0.68, half * 0.52, depth * 0.4);
        tongue.fill({ color: params.tongue, alpha: 0.95 });
        tongue.ellipse(twist * half * 0.15, depth * 0.6, half * 0.2, depth * 0.14);
        tongue.fill({ color: lighten(params.tongue, 0.25), alpha: 0.5 });
      }
    }

    // --- Teeth ---------------------------------------------------------------
    // Drawn over everything and deliberately unclipped: teeth that protrude
    // past the lip are the whole point of a fang.
    const teethShape = getTeethShape(params.teeth);

    // Rooted at the lowest point of the lip when shut, and at the middle of the
    // upper lip when open — the two places a tooth can emerge from without
    // crossing the mouth it belongs to.
    const lipFloor = upper.reduce((low, p) => Math.max(low, p.y), 0);
    const lipCentre = upper[Math.floor(upper.length / 2)]?.y ?? 0;

    drawTeeth(teeth, teethShape, {
      half,
      rootY: isOpen || design.kind === 'hole' ? lipCentre : lipFloor,
      depth: isOpen || design.kind === 'hole' ? depth : 0,
      open,
      seed: params.seed,
      strength: clamp(params.fangs, 0, 1),
    });

    teeth.fill({ color: 0xfff8ec });
    teeth.stroke({
      color: mix(params.color, 0xfff8ec, 0.45),
      width: Math.max(1, weight * 0.35),
      alpha: 0.55,
    });

    // --- Design decorations ---------------------------------------------------
    if (design.decorate) {
      for (const line of design.decorate(geometry)) {
        drawSmoothOpen(marks, line, 1);
      }
      marks.stroke({ color: params.color, width: weight * 0.7, cap: 'round' });
    }
  };

  return { root, apply };
}
