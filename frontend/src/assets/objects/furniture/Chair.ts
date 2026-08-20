/**
 * Chair — back, seat, two legs.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, outline } from '../../shared/color';
import { drawCapsule, drawSquircle } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createChair(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'chair';

  const width = 96 * ctx.scale;
  const seatY = -78 * ctx.scale;
  const legWidth = 13 * ctx.scale;

  root.addChild(createContactShadow({ width: width * 1.1, strength: 0.24 }));

  // Legs.
  const legs = new Graphics();
  drawCapsule(legs, -width * 0.32, seatY, legWidth, -seatY);
  drawCapsule(legs, width * 0.32, seatY, legWidth, -seatY);
  legs.fill({ color: darken(ctx.color, 0.28) });
  root.addChild(legs);

  // Back.
  const back = new Graphics();
  drawSquircle(
    back,
    -width * 0.02,
    seatY - width * 0.42,
    width * 0.34,
    width * 0.42,
    { roundness: 0.55 },
  );
  back.fill({ color: ctx.color });
  back.stroke({ color: outline(ctx.color), width: 3, alpha: 0.4 });
  root.addChild(back);

  // Seat cushion, drawn last so it sits in front of the back.
  const seat = new Graphics();
  drawSquircle(seat, 0, seatY, width / 2, width * 0.15, { roundness: 0.7 });
  seat.fill({ color: ctx.secondaryColor });
  seat.stroke({ color: outline(ctx.secondaryColor), width: 3, alpha: 0.4 });
  root.addChild(seat);

  return root;
}
