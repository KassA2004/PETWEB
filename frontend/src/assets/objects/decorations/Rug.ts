/**
 * Rug — flat on the floor, so it gets no contact shadow of its own.
 *
 * Concentric bands in the definition's three colors. It exists to break up the
 * floor and to give the room a centre; nothing more.
 */

import { Container, Graphics } from 'pixi.js';
import { outline } from '../../shared/color';
import { drawOrganicOval } from '../../shared/shapes';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createRug(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'rug';

  const width = 400 * ctx.scale;
  const height = 130 * ctx.scale;

  const outer = new Graphics();
  drawOrganicOval(outer, 0, 0, width / 2, height / 2, 40, 0.02, ctx.seed % 6);
  outer.fill({ color: ctx.color });
  outer.stroke({ color: outline(ctx.color), width: 3, alpha: 0.4 });
  root.addChild(outer);

  const middle = new Graphics();
  drawOrganicOval(middle, 0, 0, width * 0.38, height * 0.36, 36, 0.02, 2);
  middle.fill({ color: ctx.secondaryColor });
  root.addChild(middle);

  const inner = new Graphics();
  drawOrganicOval(inner, 0, 0, width * 0.2, height * 0.19, 32, 0.02, 4);
  inner.fill({ color: ctx.accentColor });
  root.addChild(inner);

  return root;
}
