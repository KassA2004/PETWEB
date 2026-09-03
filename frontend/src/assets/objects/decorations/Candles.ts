/**
 * Candle Cluster — three candles on a saucer, lit.
 *
 * The room's second light source, and deliberately a different *kind* of light
 * from the Floor Lamp: the lamp is a cone from above that pools on the floor,
 * and this is three small points at knee height. A room with only one way of
 * being lit is a room with one mood.
 *
 * The glow is a radial ramp (`softGlow`), not a filter — the same substitute
 * the lamp and the window use, and the reason this project can light a scene
 * without a single blur pass in the display list. It is the ramp rather than
 * the older stacked-circle `glowBall` because a flame needs a brighter halo
 * than a lampshade does, and at that strength the stacked version's steps show
 * as concentric rings.
 *
 * The flames lean and breathe on two slow sine waves that do not divide into
 * each other, so the cluster never repeats and never reads as a loop.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
  softGlow,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

/** The colour a flame is, before the room's own tint touches it. */
const FLAME = 0xffd487;

export function createCandles(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 271);

  const root = new Container();
  root.label = 'candles';

  root.addChild(groundShadow(width, depth, 0.24));

  // The light the cluster throws on the floor around it, under everything.
  const pool = softGlow(width * 1.3, FLAME, 0.26, true);
  root.addChild(pool);

  /* --- Saucer -------------------------------------------------------------- */
  const dishTones = tones(ctx.secondaryColor);
  const dishY = -height * 0.07;

  const dish = new Graphics();
  dish.moveTo(-width * 0.46, dishY);
  dish.quadraticCurveTo(0, dishY + height * 0.1, width * 0.46, dishY);
  dish.quadraticCurveTo(0, dishY + height * 0.16, -width * 0.46, dishY);
  dish.closePath();
  dish.fill(formFill(dishTones, 0.5));
  edge(dish, ctx.secondaryColor, 2.5, 0.34);
  root.addChild(dish);

  const dishTop = new Graphics();
  floorOval(dishTop, 0, dishY, width * 0.92, depth * 0.92);
  dishTop.fill({ color: lighten(dishTones.light, 0.1) });
  root.addChild(dishTop);

  /* --- Three candles ------------------------------------------------------- */
  /*
   * Different heights, always. Three of a height is a candelabra; three
   * different ones are candles that have been burning for different lengths of
   * time, which is the difference between an ornament and something in use.
   */
  const wax = tones(ctx.color);
  const stands: { x: number; top: number; r: number }[] = [
    { x: -width * 0.26, top: dishY - height * rngRange(rng, 0.42, 0.5), r: width * 0.11 },
    { x: width * 0.02, top: dishY - height * rngRange(rng, 0.68, 0.78), r: width * 0.125 },
    { x: width * 0.28, top: dishY - height * rngRange(rng, 0.32, 0.4), r: width * 0.1 },
  ];

  // Back to front, so the tall one in the middle sits behind the short ones and
  // the cluster reads as a group rather than as a row.
  const order = [1, 0, 2];
  const flames: Container[] = [];

  for (const index of order) {
    const candle = stands[index];

    const body = new Graphics();
    body.moveTo(candle.x - candle.r, candle.top);
    body.lineTo(candle.x + candle.r, candle.top);
    body.lineTo(candle.x + candle.r * 0.94, dishY);
    body.quadraticCurveTo(candle.x, dishY + height * 0.03, candle.x - candle.r * 0.94, dishY);
    body.closePath();
    body.fill(formFill(wax, 0.7));
    edge(body, ctx.color, 2, 0.3);
    root.addChild(body);

    // The melted lip, and one drip. Two shapes, and the candle stops being a
    // cylinder with a flame balanced on it.
    const lip = new Graphics();
    floorOval(lip, candle.x, candle.top, candle.r * 2, candle.r * 1.7);
    lip.fill({ color: lighten(wax.light, 0.18) });
    root.addChild(lip);

    const drip = new Graphics();
    const side = index === 2 ? -1 : 1;
    drip.moveTo(candle.x + side * candle.r * 0.7, candle.top);
    drip.quadraticCurveTo(
      candle.x + side * candle.r * 1.05,
      candle.top + height * 0.07,
      candle.x + side * candle.r * 0.72,
      candle.top + height * 0.11,
    );
    drip.quadraticCurveTo(
      candle.x + side * candle.r * 0.45,
      candle.top + height * 0.06,
      candle.x + side * candle.r * 0.7,
      candle.top,
    );
    drip.closePath();
    drip.fill({ color: lighten(wax.light, 0.24), alpha: 0.85 });
    root.addChild(drip);

    /* --- Flame ------------------------------------------------------------ */
    const flame = new Container();
    flame.position.set(candle.x, candle.top - candle.r * 0.16);
    // Pivoted at the wick, so the lean rotates the flame about its base rather
    // than swinging the whole thing sideways off the candle.
    flame.pivot.set(0, 0);

    const halo = softGlow(candle.r * 3.4, FLAME, 0.34);
    flame.addChild(halo);

    const wick = new Graphics();
    wick.rect(-1.2, -candle.r * 0.3, 2.4, candle.r * 0.34);
    wick.fill({ color: darken(ctx.accentColor, 0.5) });
    flame.addChild(wick);

    const tongue = new Graphics();
    tongue.moveTo(0, -candle.r * 1.5);
    tongue.quadraticCurveTo(candle.r * 0.52, -candle.r * 0.5, 0, candle.r * 0.16);
    tongue.quadraticCurveTo(-candle.r * 0.52, -candle.r * 0.5, 0, -candle.r * 1.5);
    tongue.closePath();
    tongue.fill(
      formFill(tones(mix(ctx.accentColor, FLAME, 0.6)), 0.9),
    );
    flame.addChild(tongue);

    const core = new Graphics();
    drawSquircle(core, 0, -candle.r * 0.36, candle.r * 0.19, candle.r * 0.44, {
      roundness: 0.9,
    });
    core.fill({ color: lighten(FLAME, 0.5), alpha: 0.9 });
    flame.addChild(core);

    root.addChild(flame);
    flames.push(flame);
  }

  const shine = new Graphics();
  gloss(
    shine,
    -width * 0.3,
    dishY - height * 0.02,
    width * 0.1,
    height * 0.02,
    lighten(dishTones.light, 0.3),
    0.3,
  );
  root.addChild(shine);

  /* --- Alive --------------------------------------------------------------- */
  let time = rngRange(rng, 0, 10);

  attachLife(root, {
    update(dt) {
      time += dt;

      flames.forEach((flame, i) => {
        const t = time + i * 1.7;
        flame.rotation = Math.sin(t * 2.3) * 0.07 + Math.sin(t * 0.9) * 0.04;
        // The height flickers, not the width — a flame that gets fat reads as
        // a balloon inflating.
        flame.scale.set(1, 1 + Math.sin(t * 3.1) * 0.06 + Math.sin(t * 1.3) * 0.03);
      });

      pool.alpha = 0.85 + Math.sin(time * 1.9) * 0.15;
    },
  });

  return root;
}
