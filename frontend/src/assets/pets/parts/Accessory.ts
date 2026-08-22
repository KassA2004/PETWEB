/**
 * Accessory art.
 *
 * One function per wearable, all drawn flat from the same three primitives as
 * the rest of the project. Every piece is drawn in its slot's local space with
 * the origin at the slot anchor, and sized from one reference width, so an
 * accessory automatically fits a tiny pebble blob and a huge tower blob
 * without any per-body special cases.
 *
 *   head   origin at the crown. The piece sits above it (negative y).
 *   face   origin between the eyes. The piece is symmetric around it.
 *   neck   origin on the chest. The piece hangs from it.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { getAccessoryShape } from '../customization/AccessoryTypes';
import type { AccessoryConfig, AccessoryType } from '../customization/AccessoryTypes';

/**
 * @param width the slot's reference width, before the accessory's own
 *              `sizeMul` and the wearer's chosen `scale`.
 */
export function createAccessory(
  config: AccessoryConfig,
  width: number,
): Container {
  const shape = getAccessoryShape(config.type);
  const root = new Container();
  root.label = `accessory-${config.type}`;

  const w = width * shape.sizeMul * config.scale;
  if (w <= 0) return root;

  const color = config.color;
  const line = outline(color, 0.3);

  switch (config.type as AccessoryType) {
    // --- Head -------------------------------------------------------------
    case 'beanie': {
      const h = w * 0.6;

      const dome = new Graphics();
      // Half a squircle: the bottom half is hidden behind the brim anyway.
      drawSquircle(dome, 0, -h * 0.35, w * 0.5, h * 0.72, { roundness: 0.85 });
      dome.fill({ color });
      dome.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(dome);

      const brim = new Graphics();
      brim.roundRect(-w * 0.54, -h * 0.28, w * 1.08, h * 0.34, h * 0.17);
      brim.fill({ color: lighten(color, 0.25) });
      brim.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(brim);

      const pom = new Graphics();
      pom.circle(w * 0.04, -h * 1.02, w * 0.15);
      pom.fill({ color: lighten(color, 0.45) });
      root.addChild(pom);
      break;
    }

    case 'topHat': {
      const h = w * 0.86;

      const crown = new Graphics();
      crown.roundRect(-w * 0.31, -h, w * 0.62, h * 0.92, w * 0.06);
      crown.fill({ color });
      crown.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(crown);

      const band = new Graphics();
      band.rect(-w * 0.31, -h * 0.24, w * 0.62, h * 0.16);
      band.fill({ color: lighten(color, 0.5) });
      root.addChild(band);

      const brim = new Graphics();
      brim.ellipse(0, -h * 0.06, w * 0.58, h * 0.11);
      brim.fill({ color });
      brim.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(brim);
      break;
    }

    case 'crown': {
      const h = w * 0.52;

      const art = new Graphics();
      art.moveTo(-w * 0.46, 0);
      art.lineTo(-w * 0.46, -h * 0.5);
      art.lineTo(-w * 0.23, -h * 0.16);
      art.lineTo(0, -h);
      art.lineTo(w * 0.23, -h * 0.16);
      art.lineTo(w * 0.46, -h * 0.5);
      art.lineTo(w * 0.46, 0);
      art.closePath();
      art.fill({ color });
      art.stroke({ color: line, width: 3, alpha: 0.45 });
      root.addChild(art);

      const gems = new Graphics();
      gems.circle(0, -h * 0.28, w * 0.07);
      gems.circle(-w * 0.28, -h * 0.12, w * 0.05);
      gems.circle(w * 0.28, -h * 0.12, w * 0.05);
      gems.fill({ color: lighten(color, 0.6) });
      root.addChild(gems);
      break;
    }

    case 'cap': {
      const h = w * 0.5;

      const dome = new Graphics();
      drawSquircle(dome, 0, -h * 0.2, w * 0.46, h * 0.72, { roundness: 0.9 });
      dome.fill({ color });
      dome.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(dome);

      const visor = new Graphics();
      visor.ellipse(w * 0.42, -h * 0.06, w * 0.36, h * 0.16);
      visor.fill({ color: darken(color, 0.22) });
      visor.stroke({ color: line, width: 3, alpha: 0.35 });
      root.addChild(visor);

      const button = new Graphics();
      button.circle(0, -h * 0.86, w * 0.06);
      button.fill({ color: lighten(color, 0.4) });
      root.addChild(button);
      break;
    }

    case 'flower': {
      const r = w * 0.5;
      const cx = -w * 0.55;
      const cy = -r * 0.6;

      const petals = new Graphics();
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        petals.circle(cx + Math.cos(angle) * r * 0.52, cy + Math.sin(angle) * r * 0.52, r * 0.36);
      }
      petals.fill({ color });
      petals.stroke({ color: line, width: 2.5, alpha: 0.35 });
      root.addChild(petals);

      const middle = new Graphics();
      middle.circle(cx, cy, r * 0.24);
      middle.fill({ color: 0xf2c94c });
      root.addChild(middle);
      break;
    }

    case 'hairBow': {
      const r = w * 0.5;
      const cy = -r * 0.5;

      const loops = new Graphics();
      loops.ellipse(-r * 0.62, cy, r * 0.6, r * 0.44);
      loops.ellipse(r * 0.62, cy, r * 0.6, r * 0.44);
      loops.fill({ color });
      loops.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(loops);

      const knot = new Graphics();
      knot.circle(0, cy, r * 0.26);
      knot.fill({ color: darken(color, 0.18) });
      root.addChild(knot);
      break;
    }

    // --- Face -------------------------------------------------------------
    case 'glasses': {
      const gap = w * 0.26;
      const r = w * 0.22;

      const frames = new Graphics();
      drawSquircle(frames, -gap, 0, r, r * 0.92, { roundness: 0.85 });
      drawSquircle(frames, gap, 0, r, r * 0.92, { roundness: 0.85 });
      frames.stroke({ color, width: Math.max(3, w * 0.035) });

      // Bridge and temples, drawn as one stroked path.
      frames.moveTo(-gap + r * 0.86, -r * 0.14);
      frames.lineTo(gap - r * 0.86, -r * 0.14);
      frames.moveTo(-gap - r * 0.9, -r * 0.2);
      frames.lineTo(-gap - r * 1.5, -r * 0.45);
      frames.moveTo(gap + r * 0.9, -r * 0.2);
      frames.lineTo(gap + r * 1.5, -r * 0.45);
      frames.stroke({ color, width: Math.max(3, w * 0.03), cap: 'round' });
      root.addChild(frames);

      const shine = new Graphics();
      shine.moveTo(-gap - r * 0.35, r * 0.3);
      shine.lineTo(-gap + r * 0.25, -r * 0.4);
      shine.stroke({ color: 0xffffff, width: Math.max(2, w * 0.025), alpha: 0.5, cap: 'round' });
      root.addChild(shine);
      break;
    }

    case 'shades': {
      const gap = w * 0.26;
      const r = w * 0.24;

      const lenses = new Graphics();
      drawSquircle(lenses, -gap, 0, r, r * 0.8, { roundness: 0.5 });
      drawSquircle(lenses, gap, 0, r, r * 0.8, { roundness: 0.5 });
      lenses.fill({ color });
      root.addChild(lenses);

      const bar = new Graphics();
      bar.moveTo(-gap - r * 1.5, -r * 0.6);
      bar.lineTo(gap + r * 1.5, -r * 0.6);
      bar.stroke({ color: darken(color, 0.2), width: Math.max(3, w * 0.045), cap: 'round' });
      root.addChild(bar);

      const shine = new Graphics();
      shine.moveTo(-gap - r * 0.4, r * 0.3);
      shine.lineTo(-gap + r * 0.3, -r * 0.35);
      shine.stroke({ color: 0xffffff, width: Math.max(2, w * 0.03), alpha: 0.45, cap: 'round' });
      root.addChild(shine);
      break;
    }

    case 'eyepatch': {
      const r = w * 0.24;

      const strap = new Graphics();
      strap.moveTo(-w * 0.58, -r * 1.3);
      strap.lineTo(w * 0.5, r * 0.5);
      strap.stroke({ color: darken(color, 0.1), width: Math.max(3, w * 0.035) });
      root.addChild(strap);

      const patch = new Graphics();
      drawSquircle(patch, -w * 0.26, 0, r * 1.1, r, { roundness: 0.55 });
      patch.fill({ color });
      patch.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(patch);
      break;
    }

    // --- Neck -------------------------------------------------------------
    case 'bowtie': {
      const r = w * 0.5;

      const wings = new Graphics();
      wings.moveTo(-r * 0.14, 0);
      wings.lineTo(-r, -r * 0.5);
      wings.lineTo(-r, r * 0.5);
      wings.closePath();
      wings.moveTo(r * 0.14, 0);
      wings.lineTo(r, -r * 0.5);
      wings.lineTo(r, r * 0.5);
      wings.closePath();
      wings.fill({ color });
      wings.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(wings);

      const knot = new Graphics();
      drawSquircle(knot, 0, 0, r * 0.2, r * 0.26, { roundness: 0.6 });
      knot.fill({ color: darken(color, 0.2) });
      root.addChild(knot);
      break;
    }

    case 'necktie': {
      const r = w * 0.5;

      const knot = new Graphics();
      knot.moveTo(-r * 0.28, -r * 0.34);
      knot.lineTo(r * 0.28, -r * 0.34);
      knot.lineTo(r * 0.2, r * 0.06);
      knot.lineTo(-r * 0.2, r * 0.06);
      knot.closePath();
      knot.fill({ color: darken(color, 0.2) });
      root.addChild(knot);

      const blade = new Graphics();
      blade.moveTo(-r * 0.2, r * 0.02);
      blade.lineTo(r * 0.2, r * 0.02);
      blade.lineTo(r * 0.3, r * 1.3);
      blade.lineTo(0, r * 1.72);
      blade.lineTo(-r * 0.3, r * 1.3);
      blade.closePath();
      blade.fill({ color });
      blade.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(blade);
      break;
    }

    case 'scarf': {
      const r = w * 0.5;

      const tail = new Graphics();
      tail.roundRect(r * 0.52, r * 0.1, r * 0.66, r * 1.05, r * 0.3);
      tail.fill({ color: darken(color, 0.12) });
      tail.stroke({ color: line, width: 3, alpha: 0.35 });
      root.addChild(tail);

      const stripes = new Graphics();
      stripes.rect(r * 0.56, r * 0.82, r * 0.58, r * 0.14);
      stripes.fill({ color: lighten(color, 0.45), alpha: 0.85 });
      root.addChild(stripes);

      // Band last, so it laps over the top of the hanging end.
      const band = new Graphics();
      band.roundRect(-r * 1.5, -r * 0.36, r * 3, r * 0.76, r * 0.38);
      band.fill({ color });
      band.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(band);
      break;
    }

    case 'collar': {
      const r = w * 0.5;

      const band = new Graphics();
      band.roundRect(-r * 1.35, -r * 0.24, r * 2.7, r * 0.48, r * 0.24);
      band.fill({ color });
      band.stroke({ color: line, width: 3, alpha: 0.45 });
      root.addChild(band);

      const buckle = new Graphics();
      buckle.roundRect(-r * 0.9, -r * 0.32, r * 0.24, r * 0.64, r * 0.08);
      buckle.fill({ color: lighten(color, 0.5) });
      root.addChild(buckle);

      const tag = new Graphics();
      tag.circle(0, r * 0.48, r * 0.28);
      tag.fill({ color: 0xf2c94c });
      tag.stroke({ color: outline(0xf2c94c, 0.3), width: 2.5, alpha: 0.5 });
      root.addChild(tag);
      break;
    }

    case 'bandana': {
      const r = w * 0.5;

      const cloth = new Graphics();
      cloth.moveTo(-r * 1.35, -r * 0.18);
      cloth.lineTo(r * 1.35, -r * 0.18);
      cloth.lineTo(0, r * 1.4);
      cloth.closePath();
      cloth.fill({ color });
      cloth.stroke({ color: line, width: 3, alpha: 0.4 });
      root.addChild(cloth);

      const band = new Graphics();
      band.roundRect(-r * 1.42, -r * 0.42, r * 2.84, r * 0.44, r * 0.22);
      band.fill({ color: darken(color, 0.18) });
      root.addChild(band);

      const dots = new Graphics();
      dots.circle(-r * 0.34, r * 0.32, r * 0.1);
      dots.circle(r * 0.3, r * 0.28, r * 0.1);
      dots.circle(0, r * 0.78, r * 0.09);
      dots.fill({ color: lighten(color, 0.55), alpha: 0.9 });
      root.addChild(dots);
      break;
    }
  }

  return root;
}

/** Vertical size an accessory occupies, used for framing. Cheap estimate. */
export function accessoryHeight(config: AccessoryConfig, width: number): number {
  const shape = getAccessoryShape(config.type);
  return width * shape.sizeMul * config.scale * 0.9;
}
