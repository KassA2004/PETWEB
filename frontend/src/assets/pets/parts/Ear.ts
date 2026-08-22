/**
 * Ears — and horns, antennae and fins, which are ears as far as the rig is
 * concerned.
 *
 * Every type is drawn growing upward from its own origin, so the joint can
 * rotate it about its base. That is the whole reason ears carry so much of the
 * animation: a spring on this joint turns any body movement into a flop, and
 * flopping ears are worth more than any amount of squashing the body
 * (/Docs/animation-approach.md §13).
 */

import { Container, Graphics } from 'pixi.js';
import { lighten, mix, tones } from '../../shared/color';
import { drawCapsule, formShading } from '../../shared/shapes';
import { getEarShape } from '../customization/AppendageTypes';
import type { EarType } from '../customization/AppendageTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export function createEar(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): Container {
  const root = new Container();
  root.label = `ear-${side}`;

  const shape = getEarShape(appearance.earType);
  const w = proportions.earWidth;
  const h = proportions.earHeight;
  if (w <= 0 || h <= 0) return root;

  const ramp = tones(appearance.primaryColor);
  const mirror = side === 'left' ? -1 : 1;
  const art = new Graphics();

  switch (appearance.earType as EarType) {
    case 'none':
      return root;

    case 'bunny': {
      // A long lozenge that leans out and curls over at the tip.
      const bend = shape.droop * mirror;
      art.moveTo(-w / 2, 0);
      art.bezierCurveTo(-w * 0.62, -h * 0.55, -w * (0.34 - bend), -h * 0.98, w * bend * 0.6, -h);
      art.bezierCurveTo(w * (0.4 + bend), -h * 0.96, w * 0.6, -h * 0.5, w / 2, 0);
      art.closePath();
      art.fill(formShading(ramp, 0.65));
      art.stroke({ color: ramp.line, width: 2.5, alpha: 0.3 });
      root.addChild(art);

      const inner = new Graphics();
      inner.moveTo(-w * 0.26, -h * 0.08);
      inner.bezierCurveTo(-w * 0.34, -h * 0.55, -w * 0.16, -h * 0.82, w * bend * 0.5, -h * 0.84);
      inner.bezierCurveTo(w * 0.2, -h * 0.8, w * 0.32, -h * 0.5, w * 0.26, -h * 0.08);
      inner.closePath();
      inner.fill({ color: mix(appearance.accentColor, appearance.secondaryColor, 0.35), alpha: 0.9 });
      root.addChild(inner);
      break;
    }

    case 'cat': {
      art.moveTo(-w / 2, h * 0.1);
      art.quadraticCurveTo(-w * 0.34, -h * 0.62, w * 0.06, -h);
      art.quadraticCurveTo(w * 0.42, -h * 0.5, w / 2, h * 0.1);
      art.closePath();
      art.fill(formShading(ramp, 0.6));
      art.stroke({ color: ramp.line, width: 2.5, alpha: 0.3 });
      root.addChild(art);

      const inner = new Graphics();
      inner.moveTo(-w * 0.26, h * 0.02);
      inner.quadraticCurveTo(-w * 0.14, -h * 0.5, w * 0.05, -h * 0.72);
      inner.quadraticCurveTo(w * 0.24, -h * 0.42, w * 0.26, h * 0.02);
      inner.closePath();
      inner.fill({ color: mix(appearance.accentColor, appearance.secondaryColor, 0.3), alpha: 0.9 });
      root.addChild(inner);
      break;
    }

    case 'round': {
      art.circle(0, -h * 0.42, Math.min(w, h) * 0.55);
      art.fill(formShading(ramp, 0.6));
      art.stroke({ color: ramp.line, width: 2.5, alpha: 0.3 });
      root.addChild(art);

      const inner = new Graphics();
      inner.circle(0, -h * 0.4, Math.min(w, h) * 0.55 * shape.inner);
      inner.fill({ color: mix(appearance.accentColor, appearance.secondaryColor, 0.4), alpha: 0.9 });
      root.addChild(inner);
      break;
    }

    case 'floppy': {
      // Hangs down and outward from the base.
      art.moveTo(-w * 0.42, 0);
      art.bezierCurveTo(-w * 0.7, h * 0.42, -w * 0.5, h * 0.95, 0, h);
      art.bezierCurveTo(w * 0.5, h * 0.95, w * 0.7, h * 0.4, w * 0.42, 0);
      art.closePath();
      art.fill(formShading(ramp, 0.4));
      art.stroke({ color: ramp.line, width: 2.5, alpha: 0.3 });
      root.addChild(art);

      const inner = new Graphics();
      inner.ellipse(0, h * 0.46, w * 0.26, h * 0.32);
      inner.fill({ color: mix(appearance.accentColor, appearance.secondaryColor, 0.35), alpha: 0.75 });
      root.addChild(inner);
      break;
    }

    case 'antenna': {
      drawCapsule(art, 0, -h, w * 0.5, h);
      art.fill({ color: ramp.shade });
      root.addChild(art);

      const bobble = new Graphics();
      bobble.circle(0, -h, w * 1.15);
      bobble.fill(formShading(tones(appearance.accentColor), 0.7));
      root.addChild(bobble);
      break;
    }

    case 'horns': {
      // A tapering curve that hooks outward.
      art.moveTo(-w * 0.5, 0);
      art.bezierCurveTo(-w * 0.55, -h * 0.5, mirror * w * 0.2, -h * 0.85, mirror * w * 0.75, -h);
      art.bezierCurveTo(mirror * w * 0.3, -h * 0.7, w * 0.4, -h * 0.35, w * 0.5, 0);
      art.closePath();
      art.fill(formShading(tones(mix(appearance.secondaryColor, 0x8a7a5c, 0.5)), 0.7));
      art.stroke({ color: ramp.line, width: 2, alpha: 0.25 });
      root.addChild(art);

      // Two ridges, so it reads as horn rather than as a beige blob.
      const ridges = new Graphics();
      for (const t of [0.35, 0.6]) {
        ridges.moveTo(-w * 0.4 * (1 - t), -h * t);
        ridges.lineTo(w * 0.42 * (1 - t) + mirror * w * 0.2 * t, -h * (t + 0.04));
      }
      ridges.stroke({ color: ramp.line, width: 2, alpha: 0.25 });
      root.addChild(ridges);
      break;
    }

    case 'fins': {
      art.moveTo(0, h * 0.2);
      art.quadraticCurveTo(mirror * w * 0.5, -h * 0.4, mirror * w, -h * 0.1);
      art.quadraticCurveTo(mirror * w * 0.62, h * 0.35, 0, h * 0.2);
      art.closePath();
      art.fill(formShading(tones(mix(appearance.primaryColor, appearance.accentColor, 0.4)), 0.5));
      art.stroke({ color: ramp.line, width: 2.5, alpha: 0.3 });
      root.addChild(art);

      const rays = new Graphics();
      for (const t of [0.3, 0.55, 0.8]) {
        rays.moveTo(mirror * w * 0.1, h * 0.16);
        rays.lineTo(mirror * w * t, -h * 0.16 + h * 0.2 * t);
      }
      rays.stroke({ color: ramp.line, width: 2, alpha: 0.3 });
      root.addChild(rays);
      break;
    }
  }

  // A soft highlight along the outer edge, matching the body's gloss.
  if (appearance.earType !== 'antenna' && appearance.earType !== 'none') {
    const gloss = new Graphics();
    gloss.ellipse(-w * 0.14, -h * 0.5, w * 0.14, h * 0.16);
    gloss.fill({ color: lighten(appearance.primaryColor, 0.5), alpha: 0.28 });
    root.addChild(gloss);
  }

  return root;
}
