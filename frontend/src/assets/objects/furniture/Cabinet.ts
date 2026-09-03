/**
 * Little Cabinet — two doors, two knobs, and a top you can put things on.
 *
 * The room's storage, and the reason it is not simply a short bookshelf: a
 * bookshelf shows you its contents and this hides them. Visually that means the
 * two objects fill the same silhouette with opposite amounts of detail — the
 * shelf is busy and the cabinet is calm — which is what lets a room hold both
 * without looking like it holds one thing twice.
 *
 * The doors are the whole of the drawing: two recessed panels, a hairline gap
 * between them, and a pair of knobs. Everything else is the shared vocabulary —
 * a top slab, side panels lit and shaded, a plinth.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import {
  edge,
  formFill,
  gloss,
  grain,
  groundShadow,
  slab,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createCabinet(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 419);

  const root = new Container();
  root.label = 'cabinet';

  root.addChild(groundShadow(width, depth, 0.3));

  const ramp = tones(ctx.color);
  const half = width / 2;
  const plinthHeight = height * 0.1;
  const topThickness = height * 0.07;
  const caseTop = -height + topThickness;

  /* --- Carcass ------------------------------------------------------------- */
  const carcass = new Graphics();
  carcass.rect(-half, caseTop, width, height - topThickness - plinthHeight * 0.4);
  carcass.fill(formFill(tones(darken(ctx.color, 0.16)), 0.4));
  root.addChild(carcass);

  /* --- Doors --------------------------------------------------------------- */
  const doorTop = caseTop + height * 0.035;
  const doorBottom = -plinthHeight - height * 0.02;
  const doorWidth = width * 0.46;

  for (const side of [-1, 1]) {
    const cx = side * width * 0.245;

    const door = new Graphics();
    door.roundRect(cx - doorWidth / 2, doorTop, doorWidth, doorBottom - doorTop, width * 0.012);
    // The left door faces the window, the right one turns away from it. One
    // decision, and a flat front becomes a box with two planes on it.
    door.fill(formFill(side < 0 ? tones(lighten(ctx.color, 0.1)) : tones(darken(ctx.color, 0.08)), 0.55));
    door.roundRect(cx - doorWidth / 2, doorTop, doorWidth, doorBottom - doorTop, width * 0.012);
    edge(door, ctx.color, 2, 0.3);
    root.addChild(door);

    // The recessed panel: an inset outline, not a second filled rectangle. A
    // fill would need a third tone and §9's budget is one gloss and one shade.
    const panel = new Graphics();
    panel.roundRect(
      cx - doorWidth * 0.34,
      doorTop + height * 0.06,
      doorWidth * 0.68,
      doorBottom - doorTop - height * 0.12,
      width * 0.01,
    );
    panel.stroke({ color: ramp.deep, width: 2, alpha: 0.34 });
    root.addChild(panel);

    const panelGrain = grain(
      doorWidth * 0.6,
      doorBottom - doorTop - height * 0.16,
      ctx.color,
      ctx.seed + 7 + side,
      4,
    );
    panelGrain.rotation = Math.PI / 2;
    panelGrain.position.set(cx, (doorTop + doorBottom) / 2);
    root.addChild(panelGrain);

    /* --- Knob -------------------------------------------------------------- */
    const knobX = cx - side * doorWidth * 0.34;
    const knobY = (doorTop + doorBottom) / 2;

    const knob = new Graphics();
    knob.circle(knobX, knobY, width * 0.028);
    knob.fill(formFill(tones(ctx.accentColor), 0.8));
    knob.circle(knobX, knobY, width * 0.028);
    edge(knob, ctx.accentColor, 1.6, 0.4);
    root.addChild(knob);

    const knobLight = new Graphics();
    knobLight.circle(knobX - width * 0.008, knobY - width * 0.008, width * 0.009);
    knobLight.fill({ color: lighten(ctx.accentColor, 0.55), alpha: 0.8 });
    root.addChild(knobLight);
  }

  /* --- Top, plinth, and what is standing on it ----------------------------- */
  root.addChild(
    slab({
      y: -height,
      width: width * 1.04,
      // Shallow and barely rounded. A cabinet top given the carcass's full
      // depth foreshortens into a pillow laid across it.
      depth: depth * 0.46,
      thickness: topThickness * 0.8,
      color: mix(ctx.color, PALETTE.ember, 0.06),
      roundness: 0.16,
      plain: true,
    }),
  );

  const plinth = new Graphics();
  plinth.roundRect(-half * 0.97, -plinthHeight, half * 1.94, plinthHeight, width * 0.01);
  plinth.fill(formFill(tones(darken(ctx.color, 0.1)), 0.4));
  plinth.moveTo(-half * 0.36, 0);
  plinth.lineTo(half * 0.36, 0);
  plinth.quadraticCurveTo(0, -plinthHeight * 0.62, -half * 0.36, 0);
  plinth.closePath();
  plinth.fill({ color: ramp.deep, alpha: 0.3 });
  root.addChild(plinth);

  /*
   * A jug on top.
   *
   * The bookshelf has its plant and the cabinet has this, and both are there
   * for the same reason: a flat top with nothing on it reads as an unfinished
   * model. One object, off-centre, never in the middle.
   */
  const jug = new Container();
  jug.position.set(half * rngRange(rng, -0.58, -0.4), -height - topThickness * 0.1);

  const jugH = height * 0.24;
  const jugTones = tones(ctx.accentColor);

  // The handle first, so the belly laps over where it joins.
  const handle = new Graphics();
  handle.moveTo(width * 0.052, -jugH * 0.6);
  handle.quadraticCurveTo(width * 0.115, -jugH * 0.46, width * 0.048, -jugH * 0.18);
  handle.stroke({ color: jugTones.shade, width: Math.max(2.5, width * 0.018) });
  jug.addChild(handle);

  const belly = new Graphics();
  drawSquircle(belly, 0, -jugH * 0.38, width * 0.058, jugH * 0.38, { roundness: 0.78 });
  belly.fill(formFill(jugTones, 0.72));
  drawSquircle(belly, 0, -jugH * 0.38, width * 0.058, jugH * 0.38, { roundness: 0.78 });
  edge(belly, ctx.accentColor, 2, 0.34);
  jug.addChild(belly);

  // A waisted neck flaring to a lip. Straight sides read as a tin can.
  const neck = new Graphics();
  neck.moveTo(-width * 0.026, -jugH * 0.66);
  neck.quadraticCurveTo(-width * 0.02, -jugH * 0.86, -width * 0.036, -jugH);
  neck.lineTo(width * 0.036, -jugH);
  neck.quadraticCurveTo(width * 0.02, -jugH * 0.86, width * 0.026, -jugH * 0.66);
  neck.closePath();
  neck.fill(formFill(jugTones, 0.85));
  edge(neck, ctx.accentColor, 1.8, 0.3);
  jug.addChild(neck);

  const jugLight = new Graphics();
  gloss(
    jugLight,
    -width * 0.018,
    -jugH * 0.46,
    width * 0.014,
    jugH * 0.13,
    lighten(jugTones.light, 0.45),
    0.55,
  );
  jug.addChild(jugLight);

  root.addChild(jug);

  return root;
}
