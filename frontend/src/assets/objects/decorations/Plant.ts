/**
 * Plant — a pot, soil, and five or six leaves that sway.
 *
 * The leaf count, lengths and angles are seeded, so two plants placed in the
 * same room are recognisably the same object without being identical (§14).
 *
 * The foliage sways on two slow sine waves that do not divide into each other,
 * pivoting where the stems leave the pot, so it never repeats and never looks
 * like it is being animated at you (§19).
 *
 * What changed when the room got a grid: the pot is now exactly as wide as its
 * share of a cell, and the leaves are measured against the pot rather than
 * against a pixel count — so a plant is a plant at any tile size.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawOrganicOval, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createPlant(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 41);

  const root = new Container();
  root.label = 'plant';

  root.addChild(groundShadow(width * 1.1, depth * 1.1, 0.26));

  const potHeight = height * 0.4;
  const potWidth = width;
  const leafTones = tones(ctx.color);

  // --- Foliage -------------------------------------------------------------
  // Drawn before the pot so the pot's rim cuts the stems, which is what makes
  // the plant grow *out of* the pot rather than stand behind it.
  const foliage = new Container();
  foliage.label = 'plant-foliage';
  foliage.pivot.set(0, -potHeight * 0.8);
  foliage.position.set(0, -potHeight * 0.8);

  const stems = new Graphics();
  const leaves = new Graphics();
  const veins = new Graphics();

  const count = 5 + Math.floor(rng() * 2);
  const reach = height - potHeight;

  for (let i = 0; i < count; i++) {
    const lean = ((i - (count - 1) / 2) / count) * 2.3 + rngRange(rng, -0.18, 0.18);
    const length = reach * rngRange(rng, 0.62, 1);

    const tipX = Math.sin(lean) * length * 0.72;
    const tipY = -potHeight - Math.cos(lean * 0.5) * length;

    stems.moveTo(0, -potHeight * 0.7);
    stems.quadraticCurveTo(tipX * 0.36, (tipY - potHeight) * 0.5, tipX, tipY);

    const leafW = width * rngRange(rng, 0.3, 0.42);
    const leafH = reach * rngRange(rng, 0.22, 0.32);

    drawOrganicOval(leaves, tipX, tipY, leafW, leafH, 22, 0.08, i);

    // One vein per leaf, following its lean. The only mark a leaf gets.
    veins.moveTo(tipX - Math.sin(lean) * leafW * 0.5, tipY + leafH * 0.6);
    veins.quadraticCurveTo(tipX, tipY, tipX + Math.sin(lean) * leafW * 0.3, tipY - leafH * 0.7);
  }

  stems.stroke({ color: darken(ctx.color, 0.35), width: Math.max(4, width * 0.09) });

  leaves.fill(formFill(leafTones, 0.62));
  edge(leaves, ctx.color, 3, 0.42);
  veins.stroke({ color: leafTones.deep, width: 1.8, alpha: 0.35 });

  foliage.addChild(stems);
  foliage.addChild(leaves);
  foliage.addChild(veins);
  root.addChild(foliage);

  let time = rngRange(rng, 0, 10);

  attachLife(root, {
    update(dt) {
      time += dt;
      foliage.rotation = Math.sin(time * 0.53) * 0.035 + Math.sin(time * 0.21 + 1.3) * 0.022;
      foliage.skew.x = Math.sin(time * 0.37 + 0.6) * 0.02;
    },
  });

  // --- Pot -----------------------------------------------------------------
  const potTones = tones(ctx.secondaryColor);

  const pot = new Graphics();
  pot.moveTo(-potWidth / 2, -potHeight);
  pot.lineTo(potWidth / 2, -potHeight);
  pot.quadraticCurveTo(potWidth * 0.4, -potHeight * 0.05, potWidth * 0.33, 0);
  pot.quadraticCurveTo(0, depth * FLOOR_SQUASH * 0.28, -potWidth * 0.33, 0);
  pot.quadraticCurveTo(-potWidth * 0.4, -potHeight * 0.05, -potWidth / 2, -potHeight);
  pot.closePath();
  pot.fill(formFill(potTones, 0.5));
  edge(pot, ctx.secondaryColor, 3, 0.42);
  root.addChild(pot);

  // Rim band, and the soil inside it.
  const rim = new Graphics();
  floorOval(rim, 0, -potHeight, potWidth, depth);
  rim.fill({ color: lighten(potTones.light, 0.08) });
  floorOval(rim, 0, -potHeight + depth * FLOOR_SQUASH * 0.06, potWidth * 0.82, depth * 0.82);
  rim.fill({ color: mix(darken(ctx.secondaryColor, 0.55), 0x3b2a22, 0.6) });
  root.addChild(rim);

  const band = new Graphics();
  band.rect(-potWidth * 0.5, -potHeight + depth * FLOOR_SQUASH * 0.2, potWidth, potHeight * 0.14);
  band.fill({ color: ctx.accentColor, alpha: 0.55 });
  root.addChild(band);

  const light = new Graphics();
  gloss(
    light,
    -potWidth * 0.22,
    -potHeight * 0.58,
    potWidth * 0.1,
    potHeight * 0.24,
    lighten(potTones.light, 0.35),
    0.35,
  );
  root.addChild(light);

  return root;
}
