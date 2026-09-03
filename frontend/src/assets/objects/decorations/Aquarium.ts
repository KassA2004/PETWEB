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
  /**
   * The height its ellipse is centred on.
   *
   * Per fish rather than shared, and that is what keeps two of them from
   * swimming through each other: they are given separate depths in the tank,
   * the way fish in a bowl actually sort themselves out.
   */
  lane: number;
  speed: number;
  phase: number;
  bob: number;
}

/**
 * One fish, and the reason this object was redesigned.
 *
 * The first pair were a squircle, a triangle and a dot, all pulled hard toward
 * the water colour by `submerged` — which is correct for gravel and completely
 * wrong for the thing the object exists to let you watch. At the size the
 * catalogue shows a Fish Bowl they were a faint smudge, and the `watch`
 * affordance pointed at nothing.
 *
 * So a fish is now built the way a creature is: a soft body under the standard
 * form gradient, a face that reads at any size, and one gloss. Six shapes.
 *
 * ```text
 *   tail     a rounded fan, behind, in the shade tone
 *   body     a squircle under `formFill` — the same shading the furniture uses
 *   fin      one small oval on the near flank
 *   eye      a big dark dot with a white catchlight. This is the whole of
 *            "cute": a small eye reads as a fish, a large one reads as a pet
 *   smile    a short arc, barely there
 *   gloss    upper left, like everything else in the room
 * ```
 *
 * It is barely submerged (0.06 rather than 0.35) — it is *in front of* the
 * water, not steeped in it, and the tank has nothing else worth looking at.
 */
function drawFish(size: number, base: number, water: number): Container {
  const colour = submerged(base, water, 0.06);
  const ramp = tones(colour);
  const group = new Container();

  /*
   * Tail: a fan that meets the body, drawn first so the body overlaps its root.
   *
   * Lighter than the body and slightly translucent, not darker. A fin is a
   * membrane with water behind it — painting it in the shade tone made it
   * disappear into the body's own underside, which is exactly what happened in
   * the first pass: the fish read as a pill with a face.
   */
  const tail = new Graphics();
  tail.moveTo(-size * 0.5, 0);
  tail.quadraticCurveTo(-size * 1.35, -size * 1.05, -size * 1.62, -size * 0.62);
  tail.quadraticCurveTo(-size * 1.1, 0, -size * 1.62, size * 0.62);
  tail.quadraticCurveTo(-size * 1.35, size * 1.05, -size * 0.5, 0);
  tail.closePath();
  tail.fill({ color: lighten(ramp.light, 0.1), alpha: 0.9 });
  edge(tail, colour, 2, 0.34);
  group.addChild(tail);

  const body = new Graphics();
  drawSquircle(body, 0, 0, size, size * 0.74, { roundness: 0.86 });
  body.fill(formFill(ramp, 0.72));
  drawSquircle(body, 0, 0, size, size * 0.74, { roundness: 0.86 });
  edge(body, colour, 2.2, 0.32);
  group.addChild(body);

  // The one fin, on the flank turned toward us.
  const fin = new Graphics();
  drawSquircle(fin, -size * 0.06, size * 0.42, size * 0.36, size * 0.22, { roundness: 0.9 });
  fin.fill({ color: lighten(ramp.light, 0.06), alpha: 0.8 });
  group.addChild(fin);

  const face = new Graphics();
  face.circle(size * 0.44, -size * 0.16, size * 0.21);
  face.fill({ color: PALETTE.ink });
  group.addChild(face);

  const catchlight = new Graphics();
  catchlight.circle(size * 0.5, -size * 0.24, size * 0.075);
  catchlight.fill({ color: 0xffffff, alpha: 0.92 });
  group.addChild(catchlight);

  const smile = new Graphics();
  smile.moveTo(size * 0.72, size * 0.12);
  smile.quadraticCurveTo(size * 0.9, size * 0.26, size * 0.98, size * 0.04);
  smile.stroke({ color: darken(colour, 0.42), width: Math.max(1.4, size * 0.07), alpha: 0.6 });
  group.addChild(smile);

  const shine = new Graphics();
  gloss(shine, -size * 0.16, -size * 0.38, size * 0.32, size * 0.16, lighten(ramp.light, 0.4), 0.5);
  group.addChild(shine);

  return group;
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

  /* --- Stand --------------------------------------------------------------
   *
   * A turned wooden foot, not a trapezoid.
   *
   * The straight-sided version had a heavy outline running down both edges
   * that read as a mis-drawn seam, and no light on it at all — which made it
   * the one part of the object still drawn in the old flat language while the
   * globe above it had gradients and a highlight. It now waists in toward the
   * neck and back out to a base rim, and carries the same gloss every other
   * form in the room does.
   */
  const standTones = tones(ctx.secondaryColor);
  const neckHalf = width * 0.29;
  const footHalf = width * 0.4;

  // One closed shape. An ellipse call would begin its own subpath, which is
  // how this used to render as a bowl floating with no stand under it.
  const stand = new Graphics();
  stand.moveTo(-neckHalf, -standHeight);
  stand.lineTo(neckHalf, -standHeight);
  stand.quadraticCurveTo(neckHalf * 1.05, -standHeight * 0.4, footHalf, -standHeight * 0.16);
  stand.lineTo(footHalf, 0);
  stand.quadraticCurveTo(0, depth * 0.5 * FLOOR_SQUASH, -footHalf, 0);
  stand.lineTo(-footHalf, -standHeight * 0.16);
  stand.quadraticCurveTo(-neckHalf * 1.05, -standHeight * 0.4, -neckHalf, -standHeight);
  stand.closePath();
  stand.fill(formFill(standTones, 0.5));
  edge(stand, ctx.secondaryColor, 2.5, 0.28);
  root.addChild(stand);

  const standTop = new Graphics();
  floorOval(standTop, 0, -standHeight, neckHalf * 2, depth * 0.6);
  standTop.fill({ color: standTones.light });
  root.addChild(standTop);

  // The band where the foot flares. One line, and the turning reads.
  const collar = new Graphics();
  floorOval(collar, 0, -standHeight * 0.16, footHalf * 2, depth * 0.72);
  collar.fill({ color: lighten(standTones.light, 0.14), alpha: 0.75 });
  root.addChild(collar);

  const standLight = new Graphics();
  gloss(
    standLight,
    -width * 0.16,
    -standHeight * 0.6,
    width * 0.05,
    standHeight * 0.2,
    lighten(standTones.light, 0.3),
    0.24,
  );
  root.addChild(standLight);

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
  // A quarter of the way to the water, not half. At 0.45 the sand came out
  // the same grey-blue as the glass and the bottom of the tank read as
  // concrete; the bed should still be warm sand seen through water.
  bed.fill({ color: submerged(darken(ctx.secondaryColor, 0.1), water, 0.24) });
  inside.addChild(bed);

  /*
   * Weed, as blades rather than as wire.
   *
   * Three stroked curves of even width read as bent pipe cleaners. Filled
   * blades that taper to a point read as a plant, and they carry the same form
   * gradient as everything else in the room, so the tank stops being the one
   * object drawn in a different language from its neighbours.
   */
  const weedColour = submerged(mix(PALETTE.mint, PALETTE.sand, 0.22), water, 0.2);
  const weed = new Graphics();
  const root0 = globeY + globeR * 0.46;

  for (let i = 0; i < 5; i++) {
    const x = rngRange(rng, -globeR * 0.62, globeR * 0.62);
    const tall = rngRange(rng, globeR * 0.3, globeR * 0.6);
    const lean = rngRange(rng, -globeR * 0.22, globeR * 0.22);
    const wide = Math.max(2, globeR * rngRange(rng, 0.028, 0.045));

    weed.moveTo(x - wide, root0);
    weed.quadraticCurveTo(x - wide * 0.4, root0 - tall * 0.55, x + lean, root0 - tall);
    weed.quadraticCurveTo(x + wide * 0.9, root0 - tall * 0.5, x + wide, root0);
    weed.closePath();
  }
  weed.fill(formFill(tones(darken(weedColour, 0.12)), 0.6));
  inside.addChild(weed);

  // Two pebbles on the sand. The one detail that stops the bed being a stripe.
  const pebbles = new Graphics();
  for (let i = 0; i < 3; i++) {
    pebbles.ellipse(
      rngRange(rng, -globeR * 0.6, globeR * 0.6),
      root0 + globeR * rngRange(rng, 0.04, 0.16),
      globeR * rngRange(rng, 0.07, 0.12),
      globeR * rngRange(rng, 0.035, 0.06),
    );
  }
  pebbles.fill({ color: submerged(darken(ctx.secondaryColor, 0.22), water, 0.2), alpha: 0.55 });
  inside.addChild(pebbles);

  /*
   * A few bubbles, drawn once and left alone.
   *
   * Static on purpose. Everything else in this object that moves does so
   * because a fish is swimming; a rising bubble would be a second, unrelated
   * animation running forever on an object that mostly sits in the corner of
   * the room, and the still frame reads exactly as well with them parked.
   *
   * Behind the fish, so one can never come to rest on somebody's face.
   */
  const bubbles = new Graphics();
  for (let i = 0; i < 4; i++) {
    bubbles.circle(
      rngRange(rng, -globeR * 0.66, globeR * 0.66),
      globeY + globeR * rngRange(rng, -0.32, 0.34),
      globeR * rngRange(rng, 0.022, 0.042),
    );
  }
  bubbles.stroke({ color: lighten(water, 0.75), width: 2, alpha: 0.45 });
  inside.addChild(bubbles);

  // --- Fish ----------------------------------------------------------------
  const swimmers: Swimmer[] = [];

  for (let i = 0; i < 2; i++) {
    const fish = new Container();
    /*
     * Sized against the globe, and small.
     *
     * A fish is nose to tail about 2.5x this number, so 0.2 of the radius is a
     * body about a quarter of the bowl across — which is what leaves room for
     * two of them to pass each other and for the water to still read as water.
     * The first pass used 0.4 and the pair filled the tank like a bag of shopping.
     */
    const size = globeR * (i === 0 ? 0.2 : 0.155);
    fish.addChild(
      drawFish(size, i === 0 ? ctx.accentColor : mix(PALETTE.punch, PALETTE.cream, 0.34), water),
    );

    inside.addChild(fish);

    swimmers.push({
      view: fish,
      rx: globeR * rngRange(rng, 0.34, 0.46),
      ry: globeR * rngRange(rng, 0.06, 0.12),
      // The big one cruises low, the small one darts about above it.
      lane: globeY + globeR * (i === 0 ? 0.32 : -0.2),
      speed: rngRange(rng, 0.3, 0.44) * (i === 0 ? 1 : -1),
      // Half a lap apart, not wherever the seed lands them. Two fish given
      // random phases spend a fair share of every minute occupying the same
      // patch of water, and the still frame the catalogue renders caught them
      // doing exactly that.
      phase: i * Math.PI + rngRange(rng, -0.35, 0.35),
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

  /*
   * The highlight on the glass.
   *
   * Two marks at the same angle rather than one upright blob — a long streak
   * and the short one that trails it, which is how every curved glass surface
   * in illustration is read. The single squircle it replaces sat bolt upright
   * in the middle of the water and looked like something floating in the tank
   * rather than like light on its surface.
   */
  const shine = new Container();
  shine.position.set(-globeR * 0.4, globeY - globeR * 0.34);
  shine.rotation = -0.42;

  const streak = new Graphics();
  drawSquircle(streak, 0, 0, globeR * 0.075, globeR * 0.3, { roundness: 1 });
  streak.fill({ color: 0xffffff, alpha: 0.4 });
  shine.addChild(streak);

  const spark = new Graphics();
  drawSquircle(spark, globeR * 0.16, globeR * 0.24, globeR * 0.05, globeR * 0.1, {
    roundness: 1,
  });
  spark.fill({ color: 0xffffff, alpha: 0.32 });
  shine.addChild(spark);

  root.addChild(shine);

  // The rim of the opening, over everything.
  const rim = new Graphics();
  floorOval(rim, 0, globeY - globeR * 0.88, globeR * 1.05, globeR * 1.05);
  rim.fill({ color: lighten(ctx.color, 0.4), alpha: 0.6 });
  root.addChild(rim);

  // --- Life ----------------------------------------------------------------
  let time = rngRange(rng, 0, 20);

  /**
   * Put one fish where it should be at a given moment.
   *
   * Pulled out of the update loop and **called once at build time**, which
   * fixes a bug the catalogue made obvious: a fish's position existed only
   * inside `attachLife.update`, and `ObjectLife` only ticks inside a running
   * scene. Anything that renders this object as a still — the picture in the
   * Room panel, the locked-item modal, a preview — got fish parked at the
   * container's origin, which is the floor contact point, well outside the
   * globe's mask. The tank was empty in every screenshot the product shows of
   * it, and the `watch` affordance pointed at nothing.
   *
   * Anything animated by `ObjectLife` has to be drawn correctly on frame zero
   * for the same reason. Motion is a thing the object *does*, never the thing
   * that assembles it.
   */
  const place = (fish: Swimmer, at: number) => {
    const t = at * fish.speed + fish.phase;
    fish.view.position.set(Math.cos(t) * fish.rx, fish.lane + Math.sin(t * fish.bob) * fish.ry);
    // Facing: flip on the horizontal component of travel, and lift the nose a
    // little when climbing. A fish that swims backwards is the one thing
    // everybody notices.
    const heading = -Math.sin(t) * fish.speed;
    fish.view.scale.x = heading >= 0 ? 1 : -1;
    fish.view.rotation = Math.cos(t * fish.bob) * 0.22 * (heading >= 0 ? 1 : -1);
  };

  for (const fish of swimmers) place(fish, time);

  attachLife(root, {
    update(dt) {
      time += dt;
      for (const fish of swimmers) place(fish, time);

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
