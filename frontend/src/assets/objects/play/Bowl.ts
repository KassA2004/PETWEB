/**
 * Supper bowl — a shallow dish with something in it.
 *
 * The room's `eat` affordance, and the simplest object in the catalog on
 * purpose: it is a thing the creature *goes to* rather than a thing to look
 * at, so it earns almost no visual budget. Three shapes for the dish, one for
 * what is in it, one shine.
 *
 * It empties as it is eaten from and fills itself back up over a few minutes,
 * which is the whole of its state — enough that a creature that has just eaten
 * cannot immediately eat again, and that walking past a full bowl is different
 * from walking past an empty one.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import { attachState } from '../ObjectState';
import type { SuppliedState } from '../ObjectState';
import { edge, floorOval, formFill, gloss, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

/** Seconds to go from empty back to full. */
const REFILL_SECONDS = 150;

export function createBowl(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 601);

  const root = new Container();
  root.label = 'bowl';

  root.addChild(groundShadow(width * 1.08, depth * 1.08, 0.26));

  const ramp = tones(ctx.color);
  const rimY = -height;

  // --- Dish ----------------------------------------------------------------
  const dish = new Graphics();
  dish.moveTo(-width / 2, rimY);
  dish.quadraticCurveTo(-width * 0.42, height * 0.5, 0, height * 0.5);
  dish.quadraticCurveTo(width * 0.42, height * 0.5, width / 2, rimY);
  dish.closePath();
  dish.fill(formFill(ramp, 0.45));
  edge(dish, ctx.color, 3, 0.42);
  root.addChild(dish);

  // --- Rim and hollow ------------------------------------------------------
  // Before the food, not after it. The rim used to be added last and painted
  // straight over the supper, so the bowl was always empty.
  const rim = new Graphics();
  floorOval(rim, 0, rimY, width * 1.08, depth * 1.08);
  rim.fill({ color: lighten(ramp.light, 0.1) });
  floorOval(rim, 0, rimY, width * 1.08, depth * 1.08);
  edge(rim, ctx.color, 2.5, 0.4);
  root.addChild(rim);

  const hollow = new Graphics();
  floorOval(hollow, 0, rimY, width * 0.9, depth * 0.9);
  hollow.fill({ color: ramp.deep });
  root.addChild(hollow);

  // --- Food ----------------------------------------------------------------
  // A mound of small rounds. Redrawn whenever the level changes by enough to
  // be worth it, which is once every few seconds at most.
  const food = new Graphics();
  root.addChild(food);

  const kibbleColor = mix(ctx.accentColor, darken(ctx.accentColor, 0.2), 0.4);
  const seeds = Array.from({ length: 14 }, () => ({
    x: rngRange(rng, -0.4, 0.4),
    y: rngRange(rng, -0.3, 0.3),
    r: rngRange(rng, 0.055, 0.09),
  }));

  const drawFood = (level: number) => {
    food.clear();
    if (level <= 0.02) return;

    const spread = 0.55 + level * 0.45;
    const surfaceY = rimY + height * 0.22 * (1 - level);
    floorOval(food, 0, surfaceY, width * 0.84 * spread, depth * 0.84 * spread);
    food.fill({ color: darken(kibbleColor, 0.2) });

    for (const seed of seeds) {
      if (Math.hypot(seed.x, seed.y) > 0.42 * spread) continue;
      food.circle(
        seed.x * width * spread,
        surfaceY + seed.y * depth * 0.42 * spread,
        seed.r * width,
      );
    }
    food.fill({ color: kibbleColor });
  };

  const shine = new Graphics();
  gloss(shine, -width * 0.24, rimY + height * 0.34, width * 0.12, height * 0.16, lighten(ramp.light, 0.4), 0.35);
  root.addChild(shine);

  // --- State ---------------------------------------------------------------
  // How full it is, and the one thing anybody can do to it. The room asks for
  // this by shape (`SuppliedState`), never by knowing it is a bowl.
  const state = attachState<SuppliedState>(root, {
    level: 1,
    take(amount) {
      const taken = Math.min(this.level, amount);
      this.level -= taken;
      return taken;
    },
  });

  let drawn = -1;
  attachLife(root, {
    update(dt) {
      state.level = Math.min(1, state.level + dt / REFILL_SECONDS);

      // Redraw only when the change is visible. A bowl refilling over two and
      // a half minutes does not need sixty redraws a second.
      if (Math.abs(state.level - drawn) > 0.04) {
        drawn = state.level;
        drawFood(state.level);
      }
    },
  });

  drawFood(1);

  return root;
}
