/**
 * Atmosphere — a few floating motes.
 *
 * The brief from /Docs/theme-and-design.md section 6 is explicit: the user
 * should feel the atmosphere before consciously noticing it. So these are few,
 * small, slow and barely opaque — flat cream dots drifting upward, nothing more.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE } from '../shared/color';
import { createRng, rngRange } from '../shared/shapes';

export interface AtmosphereOptions {
  width: number;
  height: number;
  count?: number;
  seed?: number;
}

interface Mote {
  sprite: Graphics;
  baseX: number;
  baseY: number;
  drift: number;
  speed: number;
  phase: number;
  /** Vertical travel per second — these ones rise. */
  rise: number;
}

export interface AtmosphereView {
  root: Container;
  /** @param delta seconds since the last frame. */
  update(delta: number): void;
}

export function createAtmosphere(options: AtmosphereOptions): AtmosphereView {
  const { width, height } = options;
  const count = options.count ?? 16;
  const rng = createRng(options.seed ?? 6060);

  const root = new Container();
  root.label = 'atmosphere';

  const motes: Mote[] = [];

  for (let i = 0; i < count; i++) {
    const radius = rngRange(rng, 2.5, 5.5);
    const x = rngRange(rng, 0, width);
    const y = rngRange(rng, 0, height);

    const sprite = new Graphics();
    sprite.circle(0, 0, radius);
    sprite.fill({ color: PALETTE.cream });
    sprite.position.set(x, y);
    sprite.alpha = rngRange(rng, 0.12, 0.3);
    root.addChild(sprite);

    motes.push({
      sprite,
      baseX: x,
      baseY: y,
      drift: rngRange(rng, 10, 30),
      speed: rngRange(rng, 0.1, 0.3),
      phase: rngRange(rng, 0, Math.PI * 2),
      rise: rngRange(rng, 2, 7),
    });
  }

  let time = 0;

  return {
    root,
    update(delta: number) {
      time += delta;

      for (const mote of motes) {
        mote.baseY -= mote.rise * delta;
        // Wrap back to the bottom once a mote drifts off the top.
        if (mote.baseY < -10) {
          mote.baseY = height + 10;
          mote.baseX = rngRange(rng, 0, width);
        }

        mote.sprite.position.set(
          mote.baseX + Math.sin(time * mote.speed + mote.phase) * mote.drift,
          mote.baseY,
        );
      }
    },
  };
}
