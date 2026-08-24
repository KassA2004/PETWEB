/**
 * Scratching post — a rope-wound column on a weighted base, with a bauble.
 *
 * The room's `scratch` affordance, and the object that most needed to exist:
 * the creature had nothing to do with being cross. Sleeping is what it does
 * when it is tired and playing is what it does when it is bored, but anger had
 * only ever been something that wore off. Now it has somewhere to go.
 *
 * The rope is the whole design. Two dozen short arcs stacked up the column,
 * alternating direction so the winding reads as a spiral rather than as a
 * ladder, plus a few loose fibres near the middle where it has been used.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
  slab,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createScratcher(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 401);

  const root = new Container();
  root.label = 'scratcher';

  root.addChild(groundShadow(width * 1.25, depth * 1.25, 0.28));

  const baseHeight = height * 0.09;
  const postWidth = width * 0.42;
  const postTop = -height * 0.92;
  const ropeTones = tones(ctx.color);

  // --- Base ----------------------------------------------------------------
  root.addChild(
    slab({
      y: -baseHeight,
      width: width * 1.2,
      depth: depth * 1.2,
      thickness: baseHeight,
      color: ctx.secondaryColor,
      roundness: 0.4,
    }),
  );

  // --- Column --------------------------------------------------------------
  const column = new Graphics();
  column.roundRect(-postWidth / 2, postTop, postWidth, -postTop - baseHeight, postWidth * 0.12);
  column.fill(formFill(ropeTones, 0.5));
  root.addChild(column);

  // --- Rope winding --------------------------------------------------------
  const rope = new Graphics();
  const turns = Math.max(10, Math.round((-postTop - baseHeight) / (width * 0.075)));
  const step = (-postTop - baseHeight) / turns;

  for (let i = 0; i < turns; i++) {
    const y = postTop + i * step;
    const lean = i % 2 === 0 ? 1 : -1;
    rope.moveTo(-postWidth / 2, y + step * 0.5);
    rope.quadraticCurveTo(0, y + step * (0.5 + 0.42 * lean), postWidth / 2, y + step * 0.5);
  }
  rope.stroke({
    color: darken(ropeTones.base, 0.22),
    width: Math.max(2, width * 0.028),
    alpha: 0.6,
  });
  root.addChild(rope);

  // The worn patch: where a creature its size would actually reach.
  const worn = new Graphics();
  worn.roundRect(
    -postWidth * 0.46,
    postTop + (-postTop - baseHeight) * 0.44,
    postWidth * 0.92,
    (-postTop - baseHeight) * 0.3,
    postWidth * 0.1,
  );
  worn.fill({ color: lighten(ropeTones.light, 0.16), alpha: 0.4 });
  root.addChild(worn);

  const fibres = new Graphics();
  for (let i = 0; i < 6; i++) {
    const y = postTop + (-postTop - baseHeight) * rngRange(rng, 0.46, 0.72);
    const side = rng() < 0.5 ? -1 : 1;
    fibres.moveTo((side * postWidth) / 2, y);
    fibres.quadraticCurveTo(
      (side * postWidth) / 2 + side * width * 0.06,
      y - width * 0.02,
      (side * postWidth) / 2 + side * width * 0.1,
      y + rngRange(rng, -width * 0.03, width * 0.03),
    );
  }
  fibres.stroke({ color: ropeTones.line, width: 1.8, alpha: 0.5 });
  root.addChild(fibres);

  const shine = new Graphics();
  gloss(
    shine,
    -postWidth * 0.22,
    postTop + (-postTop) * 0.3,
    postWidth * 0.1,
    (-postTop) * 0.22,
    lighten(ropeTones.light, 0.3),
    0.24,
  );
  root.addChild(shine);

  // --- Cap and bauble ------------------------------------------------------
  const cap = new Graphics();
  floorOval(cap, 0, postTop, postWidth * 1.15, depth * 0.5);
  cap.fill({ color: lighten(ctx.secondaryColor, 0.14) });
  floorOval(cap, 0, postTop, postWidth * 1.15, depth * 0.5);
  edge(cap, ctx.secondaryColor, 2.5, 0.35);
  root.addChild(cap);

  // A ball on a string, hanging off one side. It swings, and it is the only
  // thing about this object that moves when nobody is using it.
  const dangle = new Container();
  dangle.position.set(postWidth * 0.42, postTop - depth * FLOOR_SQUASH * 0.2);
  root.addChild(dangle);

  const stringLength = height * 0.2;
  const string = new Graphics();
  string.moveTo(0, 0);
  string.lineTo(0, stringLength);
  string.stroke({ color: darken(ctx.secondaryColor, 0.25), width: 2 });
  dangle.addChild(string);

  const bauble = new Graphics();
  const ballR = width * 0.11;
  drawSquircle(bauble, 0, stringLength + ballR, ballR, ballR, { roundness: 0.95 });
  bauble.fill(formFill(tones(ctx.accentColor), 0.7));
  drawSquircle(bauble, 0, stringLength + ballR, ballR, ballR, { roundness: 0.95 });
  edge(bauble, ctx.accentColor, 2, 0.4);
  bauble.circle(-ballR * 0.3, stringLength + ballR * 0.68, ballR * 0.26);
  bauble.fill({ color: mix(0xffffff, ctx.accentColor, 0.2), alpha: 0.6 });
  dangle.addChild(bauble);

  let time = rngRange(rng, 0, 8);
  attachLife(root, {
    update(dt) {
      time += dt;
      dangle.rotation = Math.sin(time * 1.25) * 0.16 + Math.sin(time * 0.51) * 0.07;
    },
  });

  return root;
}
