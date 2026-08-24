/**
 * Tunnel — a fabric tube on hoops, and the only thing in the room a creature
 * can disappear into.
 *
 * Two cells wide with an opening at each end, which is what makes the `hide`
 * affordance legible: you can see straight through it, so a creature that goes
 * in is obviously in *there* rather than gone.
 *
 * Drawn as a horizontal capsule — a rounded body with an elliptical cap at
 * each end — rather than as a body with the mouths drawn beside it. That first
 * version put the caps outside the tube entirely and the whole thing read as a
 * slinky lying on the floor. A tube is one shape; the hoops are marks on it.
 *
 * Deliberately scenery to the physics: you go *through* a tunnel. Making it
 * solid would make it a wall with a picture of a hole on it.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { createRng, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import { FLOOR_SQUASH, edge, formFill, groundShadow } from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createTunnel(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 137);

  const root = new Container();
  root.label = 'tunnel';

  root.addChild(groundShadow(width, depth * 0.9, 0.28));

  const ramp = tones(ctx.color);
  const half = width / 2;
  /** How wide an end cap reads: the tube's depth, foreshortened. */
  const capRx = depth * 0.46 * FLOOR_SQUASH * 1.6;
  const capRy = height / 2;
  const midY = -capRy;
  const bodyHalf = half - capRx;

  /**
   * The whole tube as one filled shape: a rectangle with an elliptical cap at
   * each end. Three overlapping subpaths under the nonzero fill rule union
   * into a capsule, which is both cheaper and more robust than trying to trace
   * the outline by hand.
   */
  const tubePath = (g: Graphics) => {
    g.rect(-bodyHalf, midY - capRy, bodyHalf * 2, capRy * 2);
    g.ellipse(-bodyHalf, midY, capRx, capRy);
    g.ellipse(bodyHalf, midY, capRx, capRy);
  };

  // --- The tube ------------------------------------------------------------
  const tube = new Graphics();
  tubePath(tube);
  tube.fill(formFill(ramp, 0.55));
  root.addChild(tube);

  // --- Hoops ---------------------------------------------------------------
  // Five ribs across the body, each a full cross-section of the tube. Without
  // them a tunnel is a sausage; with them it is something with a frame in it.
  const hoops = new Graphics();
  const ribs = 5;
  for (let i = 1; i <= ribs; i++) {
    const t = i / (ribs + 1);
    const x = -bodyHalf + t * bodyHalf * 2;
    hoops.ellipse(x, midY, capRx * 0.92, capRy * 0.99);
  }
  hoops.stroke({
    color: lighten(mix(ctx.secondaryColor, ctx.color, 0.35), 0.05),
    width: Math.max(3, height * 0.055),
    alpha: 0.8,
  });
  root.addChild(hoops);

  // A band of shade along the underside of the tube, so it is a cylinder
  // rather than a printed oval.
  const underside = new Graphics();
  underside.moveTo(-bodyHalf, midY + capRy * 0.42);
  underside.lineTo(bodyHalf, midY + capRy * 0.42);
  underside.lineTo(bodyHalf, midY + capRy);
  underside.lineTo(-bodyHalf, midY + capRy);
  underside.closePath();
  underside.fill({ color: ramp.deep, alpha: 0.3 });
  root.addChild(underside);

  // --- The far opening -----------------------------------------------------
  // A slice of the room seen through the tube, so it reads as open rather than
  // as a dent. Lit, not black: a dark ellipse on a dark object reads as damage.
  const through = new Graphics();
  through.ellipse(bodyHalf, midY, capRx * 0.7, capRy * 0.74);
  through.fill({ color: darken(ramp.deep, 0.25) });
  through.ellipse(bodyHalf, midY + capRy * 0.3, capRx * 0.6, capRy * 0.32);
  through.fill({ color: mix(PALETTE.sand, ramp.deep, 0.5), alpha: 0.8 });
  root.addChild(through);

  // --- The near opening ----------------------------------------------------
  const near = new Graphics();
  near.ellipse(-bodyHalf, midY, capRx, capRy);
  near.fill({ color: lighten(ramp.base, 0.16) });
  near.ellipse(-bodyHalf, midY, capRx * 0.72, capRy * 0.78);
  near.fill({ color: ramp.deep });
  near.ellipse(-bodyHalf, midY, capRx, capRy);
  edge(near, ctx.color, 3.5, 0.45);
  root.addChild(near);

  // A dangling ribbon over the near mouth, so something moves when the
  // creature goes in and out.
  const ribbon = new Container();
  ribbon.position.set(-bodyHalf, midY - capRy);

  const tail = new Graphics();
  tail.moveTo(0, 0);
  tail.quadraticCurveTo(width * 0.02, height * 0.2, -width * 0.01, height * 0.36);
  tail.stroke({ color: ctx.accentColor, width: 3.5, alpha: 0.9 });
  tail.circle(-width * 0.01, height * 0.36, width * 0.022);
  tail.fill({ color: ctx.accentColor });
  ribbon.addChild(tail);
  root.addChild(ribbon);

  let time = rngRange(rng, 0, 8);
  attachLife(root, {
    update(dt) {
      time += dt;
      ribbon.rotation = Math.sin(time * 1.1) * 0.13 + Math.sin(time * 0.43) * 0.06;
    },
  });

  return root;
}
