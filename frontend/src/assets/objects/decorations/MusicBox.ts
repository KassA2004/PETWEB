/**
 * Music box — a lacquered case with the lid propped open, a crank, and a
 * little dancer turning on a spindle.
 *
 * The room's `dance` affordance. It is the only object that *starts* an
 * interaction rather than waiting to be used: it winds itself a turn every so
 * often and plays for a while, and while it is playing the creature has a
 * reason to be near it. That state is broadcast through `ObjectLife.drain`,
 * exactly as the clock broadcasts the hour, so the scene and the simulation
 * hear about it without either of them knowing what a music box is.
 *
 * The lid is **always open**, and that is a design decision rather than a
 * shortcut. A closed box at this size is a coloured brick — the object was
 * unrecognisable until the thing inside it was visible. An open lid with a
 * figure standing on a spindle is a music box at a glance, and the animation
 * then has something to be *about*.
 *
 * Three notes rise out of it while it plays. Not a particle system: three
 * `Graphics` recycled on a timer, because the whole effect is three shapes
 * moving up and fading, and a system for that would cost more than it renders.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  floorSlab,
  formFill,
  gloss,
  groundShadow,
  topFill,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

/** Seconds of music per winding, and how long it sits quiet in between. */
const PLAY_SECONDS = 14;
const QUIET_SECONDS = 26;

interface Note {
  view: Graphics;
  life: number;
  drift: number;
}

export function createMusicBox(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 811);

  const root = new Container();
  root.label = 'musicbox';

  root.addChild(groundShadow(width, depth, 0.26));

  const half = width / 2;
  const caseHeight = height * 0.56;
  const openingY = -caseHeight;
  const ramp = tones(ctx.color);

  // --- Case ----------------------------------------------------------------
  const box = new Graphics();
  box.roundRect(-half, openingY, width, caseHeight, width * 0.07);
  box.fill(formFill(ramp, 0.5));
  box.roundRect(-half, openingY, width, caseHeight, width * 0.07);
  edge(box, ctx.color, 3, 0.4);
  root.addChild(box);

  // A band of the accent colour around the case, and two brass corners. The
  // whole "this is a nice object" budget, spent in three shapes.
  const band = new Graphics();
  band.rect(-half, openingY + caseHeight * 0.5, width, caseHeight * 0.18);
  band.fill({ color: ctx.accentColor, alpha: 0.85 });
  root.addChild(band);

  const corners = new Graphics();
  for (const side of [-1, 1]) {
    corners.roundRect(
      side * half - (side < 0 ? 0 : width * 0.1),
      openingY + caseHeight * 0.06,
      width * 0.1,
      caseHeight * 0.24,
      width * 0.02,
    );
  }
  corners.fill({ color: lighten(ctx.accentColor, 0.25) });
  root.addChild(corners);

  const shine = new Graphics();
  gloss(
    shine,
    -width * 0.2,
    openingY + caseHeight * 0.24,
    width * 0.13,
    caseHeight * 0.16,
    lighten(ramp.light, 0.3),
    0.32,
  );
  root.addChild(shine);

  // --- The opening ---------------------------------------------------------
  // A dark well with a velvet lining, so the box is visibly hollow.
  const well = new Graphics();
  floorOval(well, 0, openingY, width * 0.92, depth * 0.92);
  well.fill({ color: darken(ramp.deep, 0.3) });
  floorOval(well, 0, openingY + depth * FLOOR_SQUASH * 0.06, width * 0.76, depth * 0.76);
  well.fill({ color: darken(ctx.accentColor, 0.35), alpha: 0.9 });
  root.addChild(well);

  // --- Dancer --------------------------------------------------------------
  const stage = new Container();
  stage.position.set(0, openingY);
  root.addChild(stage);

  const spindle = new Graphics();
  floorOval(spindle, 0, 0, width * 0.34, depth * 0.34);
  spindle.fill({ color: lighten(ctx.accentColor, 0.15) });
  stage.addChild(spindle);

  const dancer = new Container();
  stage.addChild(dancer);

  const figureH = height * 0.42;
  const figure = new Graphics();
  // A skirt, a body and a head. Three shapes, and at this size it is a dancer.
  figure.moveTo(-width * 0.14, 0);
  figure.quadraticCurveTo(0, -figureH * 0.14, width * 0.14, 0);
  figure.lineTo(width * 0.05, -figureH * 0.52);
  figure.lineTo(-width * 0.05, -figureH * 0.52);
  figure.closePath();
  figure.fill(formFill(tones(PALETTE.cream), 0.7));
  drawSquircle(figure, 0, -figureH * 0.62, width * 0.05, figureH * 0.12, { roundness: 0.9 });
  figure.fill({ color: PALETTE.blush });
  drawSquircle(figure, 0, -figureH * 0.8, width * 0.055, figureH * 0.13, { roundness: 0.95 });
  figure.fill({ color: lighten(PALETTE.blush, 0.35) });
  dancer.addChild(figure);

  // --- Lid -----------------------------------------------------------------
  // Hinged at the back and propped open, so it frames the dancer instead of
  // hiding her. Drawn after the stage so its front edge overlaps the opening.
  const lid = new Container();
  lid.position.set(0, openingY - depth * FLOOR_SQUASH * 0.42);
  root.addChild(lid);

  const lidTones = tones(lighten(ctx.color, 0.12));
  const lidPanel = new Graphics();
  floorSlab(lidPanel, 0, 0, width * 1.02, depth * 0.8, 0.3);
  lidPanel.fill(topFill(lidTones));
  floorSlab(lidPanel, 0, 0, width * 1.02, depth * 0.8, 0.3);
  edge(lidPanel, ctx.color, 2.5, 0.36);
  lid.addChild(lidPanel);

  // The mirror on the underside of the lid, the way these boxes always have.
  const mirror = new Graphics();
  floorSlab(mirror, 0, depth * FLOOR_SQUASH * 0.06, width * 0.76, depth * 0.46, 0.4);
  mirror.fill({ color: lighten(PALETTE.sky, 0.42), alpha: 0.75 });
  lid.addChild(mirror);

  lid.rotation = -0.24;
  lid.pivot.set(0, depth * FLOOR_SQUASH * 0.4);

  // --- Crank ---------------------------------------------------------------
  const crank = new Container();
  crank.position.set(half + width * 0.04, openingY + caseHeight * 0.46);
  root.addChild(crank);

  const handle = new Graphics();
  handle.rect(-width * 0.02, -width * 0.17, width * 0.04, width * 0.17);
  handle.fill({ color: lighten(ctx.accentColor, 0.2) });
  handle.circle(0, -width * 0.19, width * 0.05);
  handle.fill({ color: ctx.accentColor });
  crank.addChild(handle);

  // --- Notes ---------------------------------------------------------------
  const notes: Note[] = [];
  const noteLayer = new Container();
  root.addChild(noteLayer);

  for (let i = 0; i < 3; i++) {
    const note = new Graphics();
    note.circle(0, 0, width * 0.05);
    note.fill({ color: PALETTE.cream, alpha: 0.92 });
    note.rect(width * 0.04, -width * 0.18, width * 0.02, width * 0.18);
    note.fill({ color: PALETTE.cream, alpha: 0.92 });
    note.visible = false;
    noteLayer.addChild(note);
    notes.push({ view: note, life: 0, drift: 0 });
  }

  // --- Life ----------------------------------------------------------------
  let time = rngRange(rng, 0, 10);
  let playing = false;
  let timer = QUIET_SECONDS * rngRange(rng, 0.2, 1);
  let spawn = 0;
  let pending: string | null = null;

  attachLife(root, {
    update(dt) {
      time += dt;
      timer -= dt;

      if (timer <= 0) {
        playing = !playing;
        timer = playing ? PLAY_SECONDS : QUIET_SECONDS * rngRange(rng, 0.7, 1.4);
        if (playing) pending = 'music';
      }

      // The lid lifts a little further while it plays, and settles back.
      const wantLid = playing ? -0.34 : -0.2;
      lid.rotation += (wantLid - lid.rotation) * Math.min(1, dt * 4);

      if (playing) {
        crank.rotation += dt * 3.4;
        dancer.rotation += dt * 2.6;
        dancer.scale.x = Math.cos(dancer.rotation) < 0 ? -1 : 1;
        dancer.y = -Math.abs(Math.sin(time * 5)) * height * 0.04;
      } else {
        dancer.y += (0 - dancer.y) * Math.min(1, dt * 4);
      }

      // Notes.
      spawn -= dt;
      if (playing && spawn <= 0) {
        const free = notes.find((note) => note.life <= 0);
        if (free) {
          free.life = 1;
          free.drift = rngRange(rng, -0.6, 0.6);
          free.view.visible = true;
          free.view.position.set(rngRange(rng, -width * 0.2, width * 0.2), openingY);
          free.view.scale.set(rngRange(rng, 0.8, 1.2));
        }
        spawn = 0.55;
      }

      for (const note of notes) {
        if (note.life <= 0) continue;
        note.life -= dt * 0.5;
        note.view.y -= dt * height * 0.9;
        note.view.x += note.drift * dt * width * 0.4;
        note.view.rotation = Math.sin(note.life * 6) * 0.25;
        note.view.alpha = Math.max(0, Math.sin(note.life * Math.PI));
        if (note.life <= 0) note.view.visible = false;
      }

      // The case breathes on the beat while it plays. On the case rather than
      // on the root: the scene owns the root's transform (it is what puts the
      // object in perspective), so anything an object animates about itself has
      // to live one level down.
      const beat = playing ? Math.sin(time * 6) * 0.014 : 0;
      box.scale.set(1 + beat, 1 - beat);
      band.scale.copyFrom(box.scale);
    },

    drain() {
      const event = pending;
      pending = null;
      return event;
    },
  });

  return root;
}
