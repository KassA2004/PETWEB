/**
 * Atmosphere — whatever is floating in the light.
 *
 * The brief from /Docs/theme-and-design.md §6 is explicit: the user should
 * feel the atmosphere before consciously noticing it. So these stay few, small,
 * slow and barely opaque.
 *
 * What they *are* is the mood's business, not this file's. Daylight gets dust
 * that rises and barely breathes; night gets fireflies, which are mostly
 * breath — the same fourteen dots reading as an entirely different room
 * because of one number (`twinkle`) in the ambience.
 */

import { Container, Graphics } from 'pixi.js';
import type { AirSpec } from '../../world/Ambience';
import { createRng, rngRange } from '../shared/shapes';

export interface AtmosphereOptions {
  width: number;
  height: number;
  air: AirSpec;
  seed?: number;
}

interface Mote {
  sprite: Graphics;
  baseX: number;
  baseY: number;
  /** How far it wanders sideways. */
  drift: number;
  /** How fast it wanders. */
  speed: number;
  phase: number;
  /** Vertical travel per second. */
  rise: number;
  /** Its own steady brightness, before twinkling. */
  alpha: number;
  /** Its own twinkle clock, so a swarm never blinks in unison. */
  twinklePhase: number;
  twinkleSpeed: number;
}

export interface AtmosphereView {
  root: Container;
  /** @param delta seconds since the last frame. */
  update(delta: number): void;
}

export function createAtmosphere(options: AtmosphereOptions): AtmosphereView {
  const { width, height, air } = options;
  const rng = createRng(options.seed ?? 6060);

  const root = new Container();
  root.label = 'atmosphere';

  const motes: Mote[] = [];

  for (let i = 0; i < air.count; i++) {
    const radius = rngRange(rng, air.size[0], air.size[1]);
    const x = rngRange(rng, 0, width);
    const y = rngRange(rng, 0, height);
    const alpha = rngRange(rng, air.alpha[0], air.alpha[1]);

    const sprite = new Graphics();
    // Two rings: a faint halo and a tighter core. At firefly alphas the halo
    // is what stops the mote from reading as a hard little disc.
    sprite.circle(0, 0, radius * 2.1);
    sprite.fill({ color: air.color, alpha: 0.35 });
    sprite.circle(0, 0, radius);
    sprite.fill({ color: air.color });
    sprite.position.set(x, y);
    sprite.alpha = alpha;
    root.addChild(sprite);

    motes.push({
      sprite,
      baseX: x,
      baseY: y,
      drift: rngRange(rng, 10, 30),
      speed: rngRange(rng, 0.1, 0.3),
      phase: rngRange(rng, 0, Math.PI * 2),
      rise: air.rise * rngRange(rng, 0.6, 1.5),
      alpha,
      twinklePhase: rngRange(rng, 0, Math.PI * 2),
      twinkleSpeed: (Math.PI * 2) / (air.twinkleRate * rngRange(rng, 0.7, 1.4)),
    });
  }

  let time = 0;

  return {
    root,
    update(delta: number) {
      time += delta;

      for (const mote of motes) {
        mote.baseY -= mote.rise * delta;

        // Wrap round whichever edge this air drifts off.
        if (mote.baseY < -10) {
          mote.baseY = height + 10;
          mote.baseX = rngRange(rng, 0, width);
        } else if (mote.baseY > height + 10) {
          mote.baseY = -10;
          mote.baseX = rngRange(rng, 0, width);
        }

        mote.sprite.position.set(
          mote.baseX + Math.sin(time * mote.speed + mote.phase) * mote.drift,
          mote.baseY,
        );

        if (air.twinkle > 0) {
          const pulse = Math.sin(time * mote.twinkleSpeed + mote.twinklePhase);
          mote.sprite.alpha = mote.alpha * (1 - air.twinkle * (0.5 - pulse * 0.5));
        }
      }
    },
  };
}
