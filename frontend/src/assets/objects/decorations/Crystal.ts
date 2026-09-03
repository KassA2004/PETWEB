/**
 * Memory Crystal — a lit shard on a turned base.
 *
 * The reward for sharing, and the only object in the room built out of *flat
 * planes*. That is the point of it: everything else here is soft, and after
 * twenty rounded objects a thing with facets is genuinely a different note.
 *
 * The facets are not shading tricks — they are four separate polygons cut from
 * one silhouette, each filled at a different point on the tone ramp. It is the
 * cheapest way to get a hard, refractive material out of the same five-colour
 * language the cushions are made of, and it needs no gradient at all on three
 * of the four.
 *
 * It breathes. Slowly, and only in the glow — the crystal itself never moves,
 * because a solid object that pulses reads as a heartbeat and this is a stone.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
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

interface Shard {
  /** Where it comes out of the rock, as a fraction of the object's half-width. */
  base: number;
  /** Half-width at the base, as a fraction of the object's half-width. */
  spread: number;
  /** Tip height, as a fraction of the total. */
  reach: number;
  /** Sideways offset of the tip from its own base. */
  lean: number;
}

export function createCrystal(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 977);

  const root = new Container();
  root.label = 'crystal';

  root.addChild(groundShadow(width * 0.92, depth * 0.92, 0.26));

  const glowColor = lighten(ctx.color, 0.3);
  const pool = softGlow(width * 1.2, glowColor, 0.26, true);
  root.addChild(pool);

  const half = width / 2;
  const baseH = height * 0.16;
  const rockTones = tones(ctx.secondaryColor);

  /* --- The rock it grew out of -------------------------------------------- */
  const rock = new Graphics();
  rock.moveTo(-half * 0.86, -baseH);
  rock.lineTo(-half * 0.3, -baseH * 1.35);
  rock.lineTo(half * 0.42, -baseH * 1.2);
  rock.lineTo(half * 0.88, -baseH);
  rock.lineTo(half * 0.8, 0);
  rock.quadraticCurveTo(0, depth * FLOOR_SQUASH * 0.42, -half * 0.8, 0);
  rock.closePath();
  rock.fill(formFill(rockTones, 0.45));
  edge(rock, ctx.secondaryColor, 2.5, 0.36);
  root.addChild(rock);

  const rockTop = new Graphics();
  floorOval(rockTop, 0, -baseH * 1.05, width * 0.84, depth * 0.7);
  rockTop.fill({ color: lighten(rockTones.light, 0.08), alpha: 0.7 });
  root.addChild(rockTop);

  /* --- Shards ------------------------------------------------------------- */
  /*
   * Three, of clearly different heights.
   *
   * Two would read as a pair of horns and four starts to look like a fence.
   * The tallest is off-centre, because a symmetrical cluster reads as a logo.
   */
  /*
   * Wide enough to be stone.
   *
   * The first pass used a third of the half-width for a shard nearly the full
   * height of the object, and three of those read as blades of grass rather
   * than as quartz. A crystal's faces have to be broad enough to catch
   * different light on each side of the ridge, which is the entire mechanism
   * this object is drawn with.
   */
  const shards: Shard[] = [
    { base: -0.46, spread: 0.4, reach: 0.5, lean: -0.24 },
    { base: 0.02, spread: 0.52, reach: 0.92, lean: 0.04 },
    { base: 0.5, spread: 0.34, reach: 0.36, lean: 0.26 },
  ];

  const halo = softGlow(width * 0.95, glowColor, 0.3);
  halo.position.set(0, -height * 0.62);
  root.addChild(halo);

  // Back to front by height, so the tall one is not cut into by a short one.
  for (const shard of [shards[0], shards[2], shards[1]]) {
    const cluster = new Container();
    const baseY = -baseH * rngRange(rng, 1, 1.25);
    const tipY = baseY - (height - baseH) * shard.reach;
    const w = half * shard.spread;
    /*
     * Each shard now has its own root on the rock.
     *
     * The first pass gave all three the same base at x = 0 and moved only
     * their tips, so they overlapped almost completely and read as one big
     * triangle with a couple of chips out of it. Separating the bases is what
     * makes a cluster.
     */
    const baseX = half * shard.base;
    const tipX = baseX + half * shard.lean;
    // Where the front and back faces meet, running up the shard.
    const ridgeX = baseX + (tipX - baseX) * 0.55 - w * 0.12;

    const ramp = tones(ctx.color);

    // The lit face, left of the ridge.
    const lit = new Graphics();
    lit.moveTo(baseX - w, baseY);
    lit.lineTo(tipX, tipY);
    lit.lineTo(ridgeX, baseY);
    lit.closePath();
    lit.fill(formFill(tones(lighten(ctx.color, 0.16)), 0.85));
    cluster.addChild(lit);

    // The shaded face, right of it.
    const shaded = new Graphics();
    shaded.moveTo(ridgeX, baseY);
    shaded.lineTo(tipX, tipY);
    shaded.lineTo(baseX + w, baseY);
    shaded.closePath();
    shaded.fill({ color: darken(ramp.shade, 0.06) });
    cluster.addChild(shaded);

    // One bright facet near the tip, on the lit side. The single mark that
    // makes the material read as glass rather than as painted card.
    const facet = new Graphics();
    facet.moveTo(tipX, tipY);
    facet.lineTo(ridgeX, baseY - (baseY - tipY) * 0.34);
    facet.lineTo(tipX + (ridgeX - tipX) * 0.34, baseY - (baseY - tipY) * 0.2);
    facet.closePath();
    facet.fill({ color: lighten(ramp.light, 0.42), alpha: 0.65 });
    cluster.addChild(facet);

    const outline = new Graphics();
    outline.moveTo(baseX - w, baseY);
    outline.lineTo(tipX, tipY);
    outline.lineTo(baseX + w, baseY);
    outline.closePath();
    edge(outline, ctx.color, 2.5, 0.34);
    cluster.addChild(outline);

    root.addChild(cluster);
  }

  const shine = new Graphics();
  gloss(
    shine,
    -half * 0.2,
    -height * 0.72,
    width * 0.035,
    height * 0.1,
    lighten(ctx.accentColor, 0.5),
    0.45,
  );
  root.addChild(shine);

  /* --- Alive, barely ------------------------------------------------------- */
  let time = rngRange(rng, 0, 12);

  attachLife(root, {
    update(dt) {
      time += dt;
      // Two slow waves that do not divide into each other, so the light never
      // settles into a pulse anybody could count.
      const breath = 0.82 + Math.sin(time * 0.62) * 0.12 + Math.sin(time * 0.27) * 0.06;
      halo.alpha = breath;
      pool.alpha = breath;
    },
  });

  // The colour it throws onto whatever it is standing on.
  const cast = new Graphics();
  floorOval(cast, 0, 0, width * 1.4, depth * 1.4);
  cast.fill({ color: mix(glowColor, ctx.accentColor, 0.3), alpha: 0.1 });
  root.addChildAt(cast, 1);

  return root;
}
