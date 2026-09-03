/**
 * Glow Mushrooms — a clump growing straight out of the floor.
 *
 * The only object in the room with no base, no pot and no stand: it is not
 * furniture somebody carried in, it is something that turned up. That is worth
 * one object in a set of thirty, and it is why this is the reward for a long
 * run of finished goals rather than for anything you can buy in an afternoon.
 *
 * Three caps of clearly different sizes on stems that lean apart. The lean is
 * what stops a clump reading as a bar chart: mushrooms grow away from each
 * other, and three verticals side by side is the one arrangement that never
 * looks grown.
 *
 * They glow gently under the caps — a `softGlow` on the floor and one at each
 * set of gills, both radial ramps rather than filters.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
  softGlow,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

interface Cap {
  x: number;
  /** Cap height above the floor, as a fraction of the object's height. */
  reach: number;
  /** Cap half-width, as a fraction of the object's half-width. */
  spread: number;
  lean: number;
}

export function createMushrooms(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 641);

  const root = new Container();
  root.label = 'mushrooms';

  root.addChild(groundShadow(width * 0.96, depth * 0.96, 0.24));

  const glowColor = lighten(mix(ctx.accentColor, PALETTE.cream, 0.35), 0.1);
  const pool = softGlow(width * 1.1, glowColor, 0.24, true);
  root.addChild(pool);

  const half = width / 2;
  const capTones = tones(ctx.color);
  const stemColor = ctx.secondaryColor;

  /* --- A little moss at the foot ------------------------------------------ */
  // Three flat ovals. Without them the stems end at a hard line and the clump
  // reads as standing on the floor rather than as growing out of it.
  const moss = new Graphics();
  for (let i = 0; i < 3; i++) {
    floorOval(
      moss,
      rngRange(rng, -half * 0.7, half * 0.7),
      -height * 0.005,
      width * rngRange(rng, 0.3, 0.5),
      depth * rngRange(rng, 0.3, 0.5),
    );
  }
  moss.fill({ color: mix(ctx.secondaryColor, PALETTE.mint, 0.45), alpha: 0.55 });
  root.addChild(moss);

  const caps: Cap[] = [
    { x: -half * 0.44, reach: 0.62, spread: 0.44, lean: -0.16 },
    { x: half * 0.06, reach: 1, spread: 0.58, lean: 0.05 },
    { x: half * 0.52, reach: 0.44, spread: 0.34, lean: 0.2 },
  ];

  const halos: Container[] = [];

  // Shortest first, so the big cap in the middle overlaps its neighbours
  // rather than being cut into by them.
  for (const cap of [caps[2], caps[0], caps[1]]) {
    const capY = -height * cap.reach;
    const capW = half * cap.spread;
    const stemW = capW * 0.36;
    const footX = cap.x - cap.lean * height * 0.14;

    /* --- Stem ------------------------------------------------------------- */
    const stem = new Graphics();
    stem.moveTo(footX - stemW * 0.62, 0);
    stem.quadraticCurveTo(cap.x - stemW * 0.44, capY * 0.5, cap.x - stemW * 0.44, capY);
    stem.lineTo(cap.x + stemW * 0.44, capY);
    stem.quadraticCurveTo(cap.x + stemW * 0.44, capY * 0.5, footX + stemW * 0.62, 0);
    stem.quadraticCurveTo(footX, depth * FLOOR_SQUASH * 0.2, footX - stemW * 0.62, 0);
    stem.closePath();
    stem.fill(formFill(tones(stemColor), 0.72));
    edge(stem, stemColor, 2, 0.3);
    root.addChild(stem);

    /* --- The glow under the cap ------------------------------------------- */
    const halo = softGlow(capW * 2, glowColor, 0.34);
    halo.position.set(cap.x, capY);
    root.addChild(halo);
    halos.push(halo);

    // The gills: one dark crescent tucked under the cap. It is what gives the
    // cap an underside, and what the glow appears to be coming out of.
    const gills = new Graphics();
    drawSquircle(gills, cap.x, capY + capW * 0.1, capW * 0.86, capW * 0.22, {
      roundness: 0.95,
    });
    gills.fill({ color: lighten(glowColor, 0.2), alpha: 0.9 });
    root.addChild(gills);

    /* --- Cap -------------------------------------------------------------- */
    const dome = new Graphics();
    dome.moveTo(cap.x - capW, capY + capW * 0.06);
    dome.quadraticCurveTo(cap.x - capW * 0.94, capY - capW * 0.9, cap.x, capY - capW * 0.86);
    dome.quadraticCurveTo(cap.x + capW * 0.94, capY - capW * 0.9, cap.x + capW, capY + capW * 0.06);
    dome.quadraticCurveTo(cap.x, capY + capW * 0.3, cap.x - capW, capY + capW * 0.06);
    dome.closePath();
    dome.fill(formFill(capTones, 0.78));
    edge(dome, ctx.color, 2.5, 0.34);
    root.addChild(dome);

    // Spots. Two or three, never a scatter — the cap is small and a fourth
    // turns it into a pattern.
    const spots = new Graphics();
    const count = capW > half * 0.4 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      spots.ellipse(
        cap.x + (t - 0.5) * capW * 1.2,
        capY - capW * (0.34 + Math.sin(t * Math.PI) * 0.24),
        capW * rngRange(rng, 0.11, 0.16),
        capW * rngRange(rng, 0.08, 0.11),
      );
    }
    spots.fill({ color: lighten(PALETTE.cream, 0.1), alpha: 0.8 });
    root.addChild(spots);

    const shine = new Graphics();
    gloss(
      shine,
      cap.x - capW * 0.36,
      capY - capW * 0.5,
      capW * 0.24,
      capW * 0.14,
      lighten(capTones.light, 0.4),
      0.42,
    );
    root.addChild(shine);
  }

  /* --- Alive, barely ------------------------------------------------------- */
  let time = rngRange(rng, 0, 12);

  attachLife(root, {
    update(dt) {
      time += dt;
      halos.forEach((halo, i) => {
        halo.alpha = 0.8 + Math.sin(time * 0.5 + i * 2.1) * 0.16;
      });
      pool.alpha = 0.84 + Math.sin(time * 0.4) * 0.14;
    },
  });

  return root;
}
