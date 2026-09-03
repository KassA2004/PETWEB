/**
 * Sand Timer — two bulbs, a wooden frame, and sand that has mostly fallen.
 *
 * The one object in the room that is *about* the product. Everything else is
 * furniture a creature lives among; this is the thing on the shelf that says
 * what the hours were spent on, which is why it is unlocked by focus minutes
 * rather than by anything else.
 *
 * Drawn mid-run on purpose. A full top bulb reads as an ornament nobody has
 * turned over and an empty one reads as finished; two thirds through is the
 * only state that reads as *running*, and it is the state the object is for.
 *
 * The falling thread is a single hairline. It does not animate: the room's
 * motion budget belongs to things that are alive, and a timer that visibly
 * runs while the user is not focusing would be the product telling a small lie.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
  post,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createHourglass(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 389);

  const root = new Container();
  root.label = 'hourglass';

  root.addChild(groundShadow(width * 0.9, depth * 0.9, 0.26));

  const half = width / 2;
  const capH = height * 0.09;
  const topY = -height + capH;
  const baseY = -capH;
  const waistY = (topY + baseY) / 2;
  const bulbHalf = half * 0.62;
  const neck = half * 0.09;

  const wood = tones(ctx.secondaryColor);
  const sandColor = ctx.accentColor;

  /* --- The two posts, behind the glass ------------------------------------ */
  for (const side of [-1, 1]) {
    root.addChild(
      post({
        x: side * half * 0.78,
        top: topY,
        length: baseY - topY + capH * 0.4,
        width: width * 0.1,
        color: ctx.secondaryColor,
        taper: 0.08,
      }),
    );
  }

  /* --- Glass -------------------------------------------------------------- */
  /*
   * One closed path for both bulbs, pinched at the waist.
   *
   * Two separate shapes would need their necks to meet exactly, and any gap at
   * all reads as a crack. As one outline the waist is a control point and
   * cannot come apart.
   */
  const outline = (g: Graphics, k: number): Graphics => {
    const bh = bulbHalf * k;
    const nk = neck * k;
    g.moveTo(-bh, topY);
    g.quadraticCurveTo(-bh, waistY - (waistY - topY) * 0.32, -nk, waistY);
    g.quadraticCurveTo(-bh, baseY + (waistY - baseY) * 0.32, -bh, baseY);
    g.lineTo(bh, baseY);
    g.quadraticCurveTo(bh, baseY + (waistY - baseY) * 0.32, nk, waistY);
    g.quadraticCurveTo(bh, waistY - (waistY - topY) * 0.32, bh, topY);
    g.closePath();
    return g;
  };

  const glassColor = mix(ctx.color, 0xffffff, 0.4);
  const glass = new Graphics();
  outline(glass, 1);
  glass.fill({ color: glassColor, alpha: 0.32 });
  root.addChild(glass);

  /* --- Sand --------------------------------------------------------------- */
  // Everything sandy is drawn inside the glass outline, so nothing can bulge
  // through the wall — the same rule the fish bowl follows.
  const inside = new Container();
  const clip = new Graphics();
  outline(clip, 1);
  clip.fill({ color: 0xffffff });
  root.addChild(clip);
  inside.mask = clip;
  root.addChild(inside);

  // What is left in the upper bulb: a cone hanging from a dished surface.
  const remaining = 0.34;
  const upperTop = topY + (waistY - topY) * (1 - remaining);

  const upper = new Graphics();
  upper.moveTo(-bulbHalf, upperTop);
  upper.quadraticCurveTo(0, upperTop + (waistY - topY) * 0.16, bulbHalf, upperTop);
  upper.lineTo(bulbHalf, waistY);
  upper.lineTo(-bulbHalf, waistY);
  upper.closePath();
  upper.fill(formFill(tones(sandColor), 0.6));
  inside.addChild(upper);

  // The heap in the lower bulb, with a dimple where the thread lands.
  const heapTop = baseY - (baseY - waistY) * 0.52;
  const heap = new Graphics();
  heap.moveTo(-bulbHalf, baseY);
  heap.lineTo(-bulbHalf * 0.86, heapTop + (baseY - heapTop) * 0.3);
  heap.quadraticCurveTo(0, heapTop, bulbHalf * 0.86, heapTop + (baseY - heapTop) * 0.3);
  heap.lineTo(bulbHalf, baseY);
  heap.closePath();
  heap.fill(formFill(tones(sandColor), 0.75));
  inside.addChild(heap);

  const dimple = new Graphics();
  floorOval(dimple, 0, heapTop + (baseY - heapTop) * 0.06, bulbHalf * 0.5, bulbHalf * 0.5);
  dimple.fill({ color: darken(sandColor, 0.16), alpha: 0.5 });
  inside.addChild(dimple);

  const thread = new Graphics();
  thread.moveTo(0, waistY);
  thread.lineTo(rngRange(rng, -1.5, 1.5), heapTop);
  thread.stroke({ color: lighten(sandColor, 0.16), width: Math.max(1.6, width * 0.022) });
  inside.addChild(thread);

  /* --- Glass, over the sand ------------------------------------------------ */
  const rim = new Graphics();
  outline(rim, 1);
  edge(rim, ctx.color, 2.5, 0.42);
  root.addChild(rim);

  const shine = new Graphics();
  drawSquircle(shine, -bulbHalf * 0.44, topY + (waistY - topY) * 0.34, width * 0.035, height * 0.1, {
    roundness: 1,
  });
  shine.fill({ color: 0xffffff, alpha: 0.42 });
  root.addChild(shine);

  /* --- Caps --------------------------------------------------------------- */
  for (const y of [topY, baseY]) {
    const cap = new Graphics();
    cap.moveTo(-half, y - (y === topY ? capH : 0));
    cap.lineTo(half, y - (y === topY ? capH : 0));
    cap.lineTo(half, y + (y === topY ? 0 : capH));
    cap.quadraticCurveTo(
      0,
      y + (y === topY ? 0 : capH) + depth * FLOOR_SQUASH * 0.3,
      -half,
      y + (y === topY ? 0 : capH),
    );
    cap.closePath();
    cap.fill(formFill(wood, 0.55));
    edge(cap, ctx.secondaryColor, 2.5, 0.34);
    root.addChild(cap);
  }

  const capTop = new Graphics();
  floorOval(capTop, 0, -height, width, depth);
  capTop.fill({ color: lighten(wood.light, 0.12) });
  root.addChild(capTop);

  const capLight = new Graphics();
  gloss(
    capLight,
    -width * 0.24,
    -height + capH * 0.1,
    width * 0.12,
    capH * 0.2,
    lighten(wood.light, 0.3),
    0.34,
  );
  root.addChild(capLight);

  return root;
}
