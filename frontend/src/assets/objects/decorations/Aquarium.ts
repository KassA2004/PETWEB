/**
 * Fish bowl — a stand, a globe of water, and two fish that never stop.
 *
 * The room's `watch` affordance, and the reason it earns a place: everything
 * else in the room moves because the creature or the user touched it. The fish
 * move because they are fish. A curious creature can go and stand in front of
 * them and look, which is a thing to do that is not playing and not sleeping.
 *
 * The fish are `ObjectLife`, so they keep swimming whether or not anybody is
 * watching. They are clipped to the water by construction rather than by a
 * mask: each one is given a lane inside the globe and a turn-around point, so
 * it can never reach the glass.
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten, mix, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import { attachLife } from '../ObjectLife';
import {
  FLOOR_SQUASH,
  edge,
  floorOval,
  formFill,
  gloss,
  groundShadow,
  submerged,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

interface Swimmer {
  view: Container;
  /** Half-width and half-height of the ellipse it patrols. */
  rx: number;
  ry: number;
  speed: number;
  phase: number;
  bob: number;
}

export function createAquarium(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 509);

  const root = new Container();
  root.label = 'aquarium';

  root.addChild(groundShadow(width, depth, 0.26));

  const standHeight = height * 0.26;
  const globeR = width * 0.5;
  const globeY = -standHeight - globeR * 0.94;
  // The colour the catalog gives it is the *glass*; the water is a deeper,
  // more saturated version of it. A tank filled with the same pale blue as its
  // own highlight has nothing in it to see the fish against.
  const water = darken(mix(ctx.color, PALETTE.sky, 0.8), 0.2);

  // --- Stand ---------------------------------------------------------------
  const standTones = tones(ctx.secondaryColor);
  const stand = new Graphics();
  // One closed shape. An ellipse call would begin its own subpath, which is
  // how this used to render as a bowl floating with no stand under it.
  stand.moveTo(-width * 0.42, -standHeight);
  stand.lineTo(width * 0.42, -standHeight);
  stand.lineTo(width * 0.46, 0);
  stand.quadraticCurveTo(0, depth * 0.5 * FLOOR_SQUASH, -width * 0.46, 0);
  stand.closePath();
  stand.fill(formFill(standTones, 0.42));
  edge(stand, ctx.secondaryColor, 3, 0.4);
  root.addChild(stand);

  const standTop = new Graphics();
  floorOval(standTop, 0, -standHeight, width * 0.84, depth * 0.84);
  standTop.fill({ color: standTones.light });
  root.addChild(standTop);

  // --- Everything behind the glass ----------------------------------------
  // One masked container. The gravel, the weed and the fish are all drawn to
  // the globe's own outline rather than trimmed by hand, which is the same
  // rule the creature's face follows: a part cannot leave a shape it is drawn
  // inside of. Without it the gravel spread out past the bottom of the bowl
  // and read as something spilled on the stand.
  const inside = new Container();

  const clip = new Graphics();
  drawSquircle(clip, 0, globeY, globeR, globeR * 1.02, { roundness: 0.95 });
  clip.fill({ color: 0xffffff });
  root.addChild(clip);
  inside.mask = clip;
  root.addChild(inside);

  const body = new Graphics();
  drawSquircle(body, 0, globeY, globeR, globeR * 1.02, { roundness: 0.95 });
  body.fill(formFill(tones(water), 0.7));
  inside.addChild(body);

  // The waterline: the air above it is left paler, which is the shape that
  // says "full of water" rather than "coloured ball".
  const waterY = globeY - globeR * 0.44;

  const air = new Graphics();
  air.rect(-globeR, globeY - globeR * 1.2, globeR * 2, globeR * 1.2 + (waterY - globeY));
  air.fill({ color: lighten(water, 0.66), alpha: 0.8 });
  inside.addChild(air);

  // The waterline is a *line*, not a lens. At the ellipse's natural depth it
  // covered four fifths of the tank in pale blue and there was nothing left to
  // see a fish against.
  const surface = new Graphics();
  floorOval(surface, 0, waterY, globeR * 1.9, globeR * 0.4);
  surface.fill({ color: lighten(water, 0.5), alpha: 0.9 });
  inside.addChild(surface);

  // --- Gravel and a plant --------------------------------------------------
  const bed = new Graphics();
  bed.moveTo(-globeR, globeY + globeR * 0.5);
  bed.quadraticCurveTo(0, globeY + globeR * 0.26, globeR, globeR * 0 + globeY + globeR * 0.5);
  bed.lineTo(globeR, globeY + globeR * 1.2);
  bed.lineTo(-globeR, globeY + globeR * 1.2);
  bed.closePath();
  bed.fill({ color: submerged(darken(ctx.secondaryColor, 0.16), water, 0.45) });
  inside.addChild(bed);

  const weed = new Graphics();
  for (let i = 0; i < 3; i++) {
    const x = rngRange(rng, -globeR * 0.55, globeR * 0.55);
    const tall = rngRange(rng, globeR * 0.4, globeR * 0.8);
    weed.moveTo(x, globeY + globeR * 0.45);
    weed.quadraticCurveTo(
      x + rngRange(rng, -8, 8),
      globeY + globeR * 0.45 - tall * 0.6,
      x + rngRange(rng, -12, 12),
      globeY + globeR * 0.45 - tall,
    );
  }
  weed.stroke({
    color: submerged(PALETTE.mint, water, 0.3),
    width: Math.max(3, width * 0.05),
    alpha: 0.9,
  });
  inside.addChild(weed);

  // --- Fish ----------------------------------------------------------------
  const swimmers: Swimmer[] = [];

  for (let i = 0; i < 2; i++) {
    const fish = new Container();
    const size = globeR * rngRange(rng, 0.26, 0.34);
    const colour = submerged(
      i === 0 ? ctx.accentColor : mix(ctx.accentColor, PALETTE.punch, 0.5),
      water,
      0.12,
    );

    const art = new Graphics();
    // A body and a tail. Two shapes, and it is unmistakably a fish.
    drawSquircle(art, 0, 0, size, size * 0.62, { roundness: 0.9 });
    art.fill({ color: colour });
    art.moveTo(-size * 0.8, 0);
    art.lineTo(-size * 1.7, -size * 0.6);
    art.lineTo(-size * 1.7, size * 0.6);
    art.closePath();
    art.fill({ color: darken(colour, 0.12) });
    art.circle(size * 0.42, -size * 0.14, size * 0.13);
    art.fill({ color: PALETTE.ink });
    fish.addChild(art);

    inside.addChild(fish);

    swimmers.push({
      view: fish,
      rx: globeR * rngRange(rng, 0.3, 0.44),
      ry: globeR * rngRange(rng, 0.1, 0.2),
      speed: rngRange(rng, 0.35, 0.62) * (i === 0 ? 1 : -1),
      phase: rngRange(rng, 0, Math.PI * 2),
      bob: rngRange(rng, 0.5, 1.1),
    });
  }

  // --- Glass ---------------------------------------------------------------
  const glass = new Graphics();
  drawSquircle(glass, 0, globeY, globeR, globeR * 1.02, { roundness: 0.95 });
  glass.fill({ color: lighten(water, 0.6), alpha: 0.08 });
  drawSquircle(glass, 0, globeY, globeR, globeR * 1.02, { roundness: 0.95 });
  glass.stroke({ color: lighten(water, 0.55), width: 3, alpha: 0.5 });
  root.addChild(glass);

  const shine = new Graphics();
  gloss(shine, -globeR * 0.36, globeY - globeR * 0.36, globeR * 0.2, globeR * 0.3, 0xffffff, 0.34);
  root.addChild(shine);

  // The rim of the opening, over everything.
  const rim = new Graphics();
  floorOval(rim, 0, globeY - globeR * 0.88, globeR * 1.05, globeR * 1.05);
  rim.fill({ color: lighten(ctx.color, 0.4), alpha: 0.6 });
  root.addChild(rim);

  // --- Life ----------------------------------------------------------------
  let time = rngRange(rng, 0, 20);

  attachLife(root, {
    update(dt) {
      time += dt;

      for (const fish of swimmers) {
        const t = time * fish.speed + fish.phase;
        fish.view.position.set(
          Math.cos(t) * fish.rx,
          globeY + globeR * 0.06 + Math.sin(t * fish.bob) * fish.ry,
        );
        // Facing: flip on the horizontal component of travel, and lift the
        // nose a little when climbing. A fish that swims backwards is the one
        // thing everybody notices.
        const heading = -Math.sin(t) * fish.speed;
        fish.view.scale.x = heading >= 0 ? 1 : -1;
        fish.view.rotation = Math.cos(t * fish.bob) * 0.22 * (heading >= 0 ? 1 : -1);
      }

      // The waterline breathes very slightly.
      surface.y = Math.sin(time * 0.9) * globeR * 0.012;
    },
  });

  // A faint pool of coloured light on the floor. A lit tank in a dim room is
  // most of the reason to own one.
  const cast = new Graphics();
  floorOval(cast, 0, 0, width * 2, depth * 2);
  cast.fill({ color: lighten(water, 0.3), alpha: 0.07 });
  root.addChildAt(cast, 1);

  return root;
}
