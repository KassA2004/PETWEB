/**
 * Tails.
 *
 * Short tails are one shape on one joint. Long tails are a chain of segments,
 * returned to the rig so the secondary-motion layer can run a wave down them —
 * a tail that swings as one rigid arm looks like a stick, and a tail that lags
 * segment by segment looks alive (/Docs/animation-approach.md §14).
 *
 * Drawn growing backward and down from the base, in tail-local space.
 */

import { Container, Graphics } from 'pixi.js';
import { lighten, mix, tones } from '../../shared/color';
import { drawCapsule, drawOrganicOval, formShading } from '../../shared/shapes';
import { getTailShape } from '../customization/AppendageTypes';
import type { TailType } from '../customization/AppendageTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';

export interface TailView {
  root: Container;
  /** Empty for single-shape tails. */
  segments: Container[];
  restRotations: number[];
}

export function createTail(
  proportions: PetProportions,
  appearance: PetAppearance,
): TailView {
  const root = new Container();
  root.label = 'tail-art';

  const shape = getTailShape(appearance.tailType);
  const w = proportions.tailWidth;
  const h = proportions.tailHeight;

  const segments: Container[] = [];
  const restRotations: number[] = [];

  if (w <= 0 || h <= 0 || appearance.tailType === 'none') {
    return { root, segments, restRotations };
  }

  const ramp = tones(appearance.primaryColor);

  switch (appearance.tailType as TailType) {
    case 'puff': {
      const art = new Graphics();
      drawOrganicOval(art, 0, -h * 0.1, w * 0.62, h * 0.62, 26, 0.09, appearance.seed % 5);
      art.fill(formShading(tones(mix(appearance.primaryColor, appearance.secondaryColor, 0.55)), 0.7));
      art.stroke({ color: ramp.line, width: 2.5, alpha: 0.28 });
      root.addChild(art);

      const gloss = new Graphics();
      gloss.ellipse(-w * 0.16, -h * 0.3, w * 0.2, h * 0.14);
      gloss.fill({ color: lighten(appearance.secondaryColor, 0.4), alpha: 0.5 });
      root.addChild(gloss);
      break;
    }

    case 'curl': {
      // One corkscrew stroke. The pig's whole personality.
      const art = new Graphics();
      art.moveTo(0, 0);
      art.bezierCurveTo(-w * 1.1, -h * 0.35, -w * 0.2, -h * 1.1, w * 0.35, -h * 0.55);
      art.bezierCurveTo(w * 0.7, -h * 0.2, w * 0.1, -h * 0.05, -w * 0.1, -h * 0.35);
      art.stroke({
        color: ramp.shade,
        width: Math.max(4, w * 0.42),
        cap: 'round',
        join: 'round',
      });
      root.addChild(art);
      break;
    }

    case 'stinger': {
      const art = new Graphics();
      art.moveTo(-w * 0.5, 0);
      art.quadraticCurveTo(-w * 0.3, -h * 0.8, 0, -h);
      art.quadraticCurveTo(w * 0.3, -h * 0.8, w * 0.5, 0);
      art.closePath();
      art.fill(formShading(tones(mix(appearance.accentColor, 0x2a1a1f, 0.35)), 0.6));
      root.addChild(art);
      break;
    }

    case 'long':
    case 'fluffy': {
      // A chain: each segment parents the next, so one rotation at the base
      // travels all the way to the tip.
      const count = Math.max(2, shape.segments);
      const length = h / count;
      let parent: Container = root;

      for (let i = 0; i < count; i++) {
        const segment = new Container();
        segment.label = `tail-segment-${i}`;
        segment.position.set(0, i === 0 ? 0 : -length * 0.92);

        const rest = -shape.curl * 0.32;
        segment.rotation = rest;

        const taper = 1 - (i / count) * 0.45;
        const art = new Graphics();
        drawCapsule(art, 0, -length, w * taper, length);
        art.fill(formShading(ramp, 0.55));
        segment.addChild(art);

        parent.addChild(segment);
        parent = segment;

        segments.push(segment);
        restRotations.push(rest);
      }

      if (shape.tuft > 0) {
        const tuft = new Graphics();
        drawOrganicOval(tuft, 0, -length * 0.6, w * shape.tuft * 0.9, h * 0.18 * shape.tuft, 24, 0.1, 3);
        tuft.fill(formShading(tones(mix(appearance.primaryColor, appearance.secondaryColor, 0.5)), 0.7));
        parent.addChild(tuft);
      }
      break;
    }
  }

  return { root, segments, restRotations };
}
