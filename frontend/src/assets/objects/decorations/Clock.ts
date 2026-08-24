/**
 * Clock — a farmhouse pendulum clock, hung on the wall, telling the real time.
 *
 * It is the one object in the room that is not decoration. The hands read the
 * user's actual clock, so glancing at the creature's room tells you something
 * true about your own afternoon, and the room's light and the room's hour stay
 * honest with each other.
 *
 * Three moving parts, all procedural:
 *
 *   hands       hour and minute drift, the second hand ticks and overshoots
 *   pendulum    a steady 1.4s swing, the room's heartbeat
 *   strike      on the hour the case rocks and the room is told about it,
 *               which is how the creature comes to look up at a clock
 *
 * Anchored at the bottom of its case; the room hangs it at the trait's mount
 * height, so it has no contact shadow of its own.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, outline, tones } from '../../shared/color';
import { drawCapsule, drawSquircle } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import { formFill } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

/** One full swing, there and back. A slow tock reads calmer than a fast one. */
const SWING_SECONDS = 1.4;

export function createClock(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'clock';

  // Everything is a fraction of the box the catalog handed it, so the clock is
  // exactly as wide as the wall cell it hangs in and its details scale with it.
  const caseWidth = ctx.width;
  const caseHeight = ctx.height;
  const scale = caseWidth / 116;
  const faceRadius = caseWidth * 0.4;
  const faceY = -caseHeight + faceRadius + 22 * scale;

  // The whole clock rocks a little when it strikes, so everything lives under
  // one container that hangs from its hook.
  const hanging = new Container();
  hanging.label = 'clock-case';
  root.addChild(hanging);

  // --- Case ----------------------------------------------------------------
  const shell = new Graphics();
  drawSquircle(shell, 0, -caseHeight / 2, caseWidth / 2, caseHeight / 2, {
    roundness: 0.42,
  });
  shell.fill(formFill(tones(ctx.secondaryColor), 0.55));
  shell.stroke({ color: outline(ctx.secondaryColor, 0.4), width: 4, alpha: 0.5 });
  hanging.addChild(shell);

  // A pitched cap, so it reads as a case rather than as a phone.
  const cap = new Graphics();
  cap.moveTo(-caseWidth * 0.52, -caseHeight + 16 * scale);
  cap.quadraticCurveTo(0, -caseHeight - 18 * scale, caseWidth * 0.52, -caseHeight + 16 * scale);
  cap.closePath();
  cap.fill({ color: darken(ctx.secondaryColor, 0.18) });
  hanging.addChild(cap);

  // --- Pendulum window -----------------------------------------------------
  const windowY = faceY + faceRadius + 30 * scale;
  const windowHeight = caseHeight * 0.34;

  const glass = new Graphics();
  drawSquircle(glass, 0, windowY + windowHeight * 0.2, caseWidth * 0.34, windowHeight * 0.6, {
    roundness: 0.5,
  });
  glass.fill({ color: darken(ctx.secondaryColor, 0.42) });
  hanging.addChild(glass);

  const pendulum = new Container();
  pendulum.position.set(0, windowY - windowHeight * 0.34);
  hanging.addChild(pendulum);

  const rod = new Graphics();
  drawCapsule(rod, 0, 0, 5 * scale, windowHeight * 0.72);
  rod.fill({ color: lighten(ctx.accentColor, 0.35) });
  pendulum.addChild(rod);

  const bob = new Graphics();
  bob.circle(0, windowHeight * 0.74, 15 * scale);
  bob.fill({ color: 0xf2c94c });
  bob.stroke({ color: outline(0xf2c94c), width: 3, alpha: 0.5 });
  bob.circle(-4 * scale, windowHeight * 0.7, 4 * scale);
  bob.fill({ color: 0xffffff, alpha: 0.55 });
  pendulum.addChild(bob);

  // --- Face ----------------------------------------------------------------
  const bezel = new Graphics();
  bezel.circle(0, faceY, faceRadius + 7 * scale);
  bezel.fill({ color: darken(ctx.secondaryColor, 0.3) });
  hanging.addChild(bezel);

  const dial = new Graphics();
  dial.circle(0, faceY, faceRadius);
  dial.fill({ color: ctx.color });
  dial.stroke({ color: outline(ctx.color, 0.28), width: 3, alpha: 0.5 });
  hanging.addChild(dial);

  // Twelve marks, the quarters longer. Numbers would be unreadable at this size.
  const marks = new Graphics();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const quarter = i % 3 === 0;
    const inner = faceRadius * (quarter ? 0.68 : 0.78);
    const outer = faceRadius * 0.88;
    marks.moveTo(Math.sin(angle) * inner, faceY - Math.cos(angle) * inner);
    marks.lineTo(Math.sin(angle) * outer, faceY - Math.cos(angle) * outer);
  }
  marks.stroke({ color: ctx.accentColor, width: 3.5 * scale, alpha: 0.75 });
  hanging.addChild(marks);

  const hourHand = new Container();
  hourHand.position.set(0, faceY);
  const hourArt = new Graphics();
  drawCapsule(hourArt, 0, -faceRadius * 0.54, 8 * scale, faceRadius * 0.6);
  hourArt.fill({ color: ctx.accentColor });
  hourHand.addChild(hourArt);
  hanging.addChild(hourHand);

  const minuteHand = new Container();
  minuteHand.position.set(0, faceY);
  const minuteArt = new Graphics();
  drawCapsule(minuteArt, 0, -faceRadius * 0.8, 6 * scale, faceRadius * 0.86);
  minuteArt.fill({ color: ctx.accentColor });
  minuteHand.addChild(minuteArt);
  hanging.addChild(minuteHand);

  const secondHand = new Container();
  secondHand.position.set(0, faceY);
  const secondArt = new Graphics();
  drawCapsule(secondArt, 0, -faceRadius * 0.86, 3 * scale, faceRadius * 1.02);
  secondArt.fill({ color: PALETTE.punch });
  secondHand.addChild(secondArt);
  hanging.addChild(secondHand);

  const pin = new Graphics();
  pin.circle(0, faceY, 5 * scale);
  pin.fill({ color: darken(ctx.accentColor, 0.2) });
  hanging.addChild(pin);

  // A flat highlight across the glass, upper left like every other shine.
  const shine = new Graphics();
  shine.ellipse(-faceRadius * 0.32, faceY - faceRadius * 0.4, faceRadius * 0.3, faceRadius * 0.16);
  shine.fill({ color: 0xffffff, alpha: 0.35 });
  hanging.addChild(shine);

  // --- Life ----------------------------------------------------------------
  let swing = 0;
  let strike = 0;
  let lastHour = -1;
  let pending: string | null = null;

  attachLife(root, {
    update(dt, life) {
      const now = life.now;
      const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
      const minutes = now.getMinutes() + seconds / 60;
      const hours = (now.getHours() % 12) + minutes / 60;

      hourHand.rotation = (hours / 12) * Math.PI * 2;
      minuteHand.rotation = (minutes / 60) * Math.PI * 2;

      // The second hand steps and overshoots rather than sweeping — that flick
      // is the entire personality of a mechanical clock.
      const step = Math.floor(seconds);
      const settle = Math.min(1, (seconds - step) * 7);
      const overshoot = Math.sin(settle * Math.PI) * (1 - settle) * 0.06;
      secondHand.rotation = ((step + 1) / 60) * Math.PI * 2 + overshoot;

      swing += dt;
      pendulum.rotation = Math.sin((swing / SWING_SECONDS) * Math.PI * 2) * 0.24;

      const hour = now.getHours();
      if (lastHour === -1) {
        lastHour = hour;
      } else if (hour !== lastHour) {
        lastHour = hour;
        strike = 1.6;
        pending = 'chime';
      }

      if (strike > 0) {
        strike = Math.max(0, strike - dt);
        // Rocking on its hook, dying away.
        hanging.rotation = Math.sin(strike * 26) * 0.045 * strike;
      } else if (hanging.rotation !== 0) {
        hanging.rotation *= Math.exp(-6 * dt);
        if (Math.abs(hanging.rotation) < 0.0005) hanging.rotation = 0;
      }
    },

    drain() {
      const event = pending;
      pending = null;
      return event;
    },
  });

  return root;
}
