/**
 * Critters — the small things that live in the room without being told to.
 *
 * A beetle crossing the floorboards, a moth working the lamp, dust rolling
 * along the skirting. None of them are features. They exist because a room
 * where the only moving thing is the pet reads as a stage set with one actor
 * on it, and three seconds of watching a beetle change its mind is worth more
 * atmosphere than any amount of particle effects
 * (/Docs/animation-approach.md §44 — alive does not mean always active).
 *
 * They are deliberately *not* physics bodies. They weigh nothing, they never
 * need to stack, and giving them mass would only mean the creature could kill
 * one with a chair. They are simulated here, drawn here, and exported as plain
 * positions so the creature's brain can notice them and give chase.
 *
 * Each critter carries its own container so it sorts by z against the
 * furniture like everything else: a beetle at the front of the room passes in
 * front of the rug, a moth by the window passes behind the plant.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, darken, lighten } from '../shared/color';
import { createRng, drawOrganicOval, rngRange } from '../shared/shapes';
import { project, scaleAt } from '../../world/Projection';

export type CritterKind = 'beetle' | 'moth' | 'dust';

/** What the room and the creature's brain see of a critter. */
export interface CritterState {
  id: string;
  kind: CritterKind;
  x: number;
  z: number;
  height: number;
  speed: number;
  /** Its own container, added to the stage by the room. */
  view: Container;
}

export interface CritterContext {
  lightsOn: boolean;
  /** Where the lamp's glow is, in room coordinates. */
  lampX: number;
  lampY: number;
  /** Where the creature is, so small things can get out of the way. */
  petX: number;
  petZ: number;
}

export interface CrittersOptions {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Top of the airspace moths are willing to use. */
  ceiling: number;
  seed?: number;
}

export interface CrittersView {
  critters: CritterState[];
  update(dt: number, ctx: CritterContext): void;
  /** Something loud happened here — scatter. */
  disturb(x: number, z: number, power: number): void;
}

/** How close the creature has to get before a critter loses its nerve. */
const FLIGHT_DISTANCE = 150;

export function createCritters(options: CrittersOptions): CrittersView {
  const rng = createRng(options.seed ?? 2024);
  const critters: Critter[] = [];

  const spawn = (kind: CritterKind, index: number) => {
    const x = rngRange(rng, options.minX + 40, options.maxX - 40);
    const z = rngRange(rng, options.minZ + 20, options.maxZ - 10);
    critters.push(new Critter(`critter-${kind}-${index}`, kind, x, z, rng, options));
  };

  spawn('beetle', 0);
  spawn('beetle', 1);
  spawn('moth', 0);
  spawn('moth', 1);
  spawn('dust', 0);
  spawn('dust', 1);
  spawn('dust', 2);

  return {
    critters,

    update(dt: number, ctx: CritterContext) {
      for (const critter of critters) critter.update(dt, ctx);
    },

    disturb(x: number, z: number, power: number) {
      for (const critter of critters) critter.disturb(x, z, power);
    },
  };
}

/**
 * One critter.
 *
 * All three kinds share the same shape of mind — drift toward an intention,
 * pick a new one when it runs out, abandon everything if something large comes
 * near — which is the same shape the creature's own brain has, one size down.
 */
class Critter implements CritterState {
  readonly id: string;
  readonly kind: CritterKind;
  readonly view: Container;

  x: number;
  z: number;
  height: number;
  speed = 0;

  private vx = 0;
  private vz = 0;
  private vHeight = 0;

  private bounds: CrittersOptions;
  private rng: () => number;

  /** Seconds left of whatever it is currently doing. */
  private hold = 0;
  private targetX = 0;
  private targetZ = 0;
  private targetHeight = 0;
  private startled = 0;
  private phase: number;

  /** Parts that need to move independently. */
  private wings: Container | null = null;
  private legs: Graphics | null = null;
  private glow: Graphics | null = null;
  private art: Container;

  constructor(
    id: string,
    kind: CritterKind,
    x: number,
    z: number,
    rng: () => number,
    bounds: CrittersOptions,
  ) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.height = kind === 'moth' ? rngRange(rng, 90, 200) : 0;
    this.rng = rng;
    this.bounds = bounds;
    this.phase = rngRange(rng, 0, Math.PI * 2);

    this.view = new Container();
    this.view.label = id;

    this.art = new Container();
    this.view.addChild(this.art);

    if (kind === 'beetle') this.buildBeetle();
    else if (kind === 'moth') this.buildMoth();
    else this.buildDust();

    this.targetX = x;
    this.targetZ = z;
    this.targetHeight = this.height;
  }

  // --- Art ------------------------------------------------------------------

  private buildBeetle(): void {
    const legs = new Graphics();
    for (const side of [-1, 1]) {
      for (const offset of [-4, 0, 4]) {
        legs.moveTo(offset, -3);
        legs.lineTo(offset + side * 5, 0);
      }
    }
    legs.stroke({ color: darken(PALETTE.ink, 0.1), width: 1.6 });
    this.art.addChild(legs);
    this.legs = legs;

    const shell = new Graphics();
    drawOrganicOval(shell, 0, -5, 7, 5, 20, 0.04, this.phase);
    shell.fill({ color: darken(PALETTE.grape, 0.35) });
    // One split down the back, and one highlight. At this size that is a beetle.
    shell.moveTo(0, -9.5);
    shell.lineTo(0, -1);
    shell.stroke({ color: PALETTE.ink, width: 1.2, alpha: 0.6 });
    shell.ellipse(-2.4, -7, 2, 1.3);
    shell.fill({ color: lighten(PALETTE.grape, 0.5), alpha: 0.55 });
    this.art.addChild(shell);
  }

  private buildMoth(): void {
    const glow = new Graphics();
    glow.circle(0, 0, 11);
    glow.fill({ color: PALETTE.cream, alpha: 0.1 });
    glow.circle(0, 0, 6);
    glow.fill({ color: PALETTE.cream, alpha: 0.14 });
    glow.alpha = 0;
    this.art.addChild(glow);
    this.glow = glow;

    const wings = new Container();
    for (const side of [-1, 1]) {
      const wing = new Graphics();
      drawOrganicOval(wing, side * 4.5, -1, 5.5, 4, 16, 0.06, side);
      wing.fill({ color: PALETTE.cream, alpha: 0.85 });
      wings.addChild(wing);
    }
    this.art.addChild(wings);
    this.wings = wings;

    const body = new Graphics();
    body.ellipse(0, 0, 2.2, 4);
    body.fill({ color: darken(PALETTE.sand, 0.35) });
    this.art.addChild(body);
  }

  private buildDust(): void {
    const puff = new Graphics();
    drawOrganicOval(puff, 0, -7, 9, 7, 18, 0.16, this.phase);
    puff.fill({ color: PALETTE.cream, alpha: 0.32 });
    drawOrganicOval(puff, 0, -7, 5, 4, 14, 0.2, this.phase + 2);
    puff.fill({ color: PALETTE.cream, alpha: 0.22 });
    this.art.addChild(puff);
  }

  // --- Mind -----------------------------------------------------------------

  disturb(x: number, z: number, power: number): void {
    const distance = Math.hypot(x - this.x, z - this.z);
    if (distance > 180) return;

    this.startled = Math.max(this.startled, Math.min(1.6, power));
    this.hold = 0;
    this.flee(x);
  }

  private flee(fromX: number): void {
    const away = Math.sign(this.x - fromX) || (this.rng() < 0.5 ? -1 : 1);
    const { minX, maxX, minZ, maxZ } = this.bounds;

    this.targetX = clampTo(this.x + away * rngRange(this.rng, 160, 320), minX, maxX);
    this.targetZ = clampTo(
      this.z + rngRange(this.rng, -40, 40),
      minZ,
      maxZ,
    );

    if (this.kind === 'moth') {
      this.targetHeight = rngRange(this.rng, 140, this.bounds.ceiling);
    }

    this.hold = rngRange(this.rng, 0.5, 1.1);
  }

  update(dt: number, ctx: CritterContext): void {
    this.startled = Math.max(0, this.startled - dt * 0.9);

    // Anything big and close outranks whatever it was doing.
    const petDistance = Math.hypot(ctx.petX - this.x, ctx.petZ - this.z);
    if (this.kind !== 'dust' && petDistance < FLIGHT_DISTANCE && this.startled < 0.2) {
      this.startled = 0.8;
      this.flee(ctx.petX);
    }

    this.hold -= dt;
    if (this.hold <= 0) this.decide(ctx);

    switch (this.kind) {
      case 'beetle':
        this.moveBeetle(dt);
        break;
      case 'moth':
        this.moveMoth(dt, ctx);
        break;
      case 'dust':
        this.moveDust(dt);
        break;
    }

    this.speed = Math.hypot(this.vx, this.vHeight, this.vz);
    this.draw(dt, ctx);
  }

  private decide(ctx: CritterContext): void {
    const { minX, maxX, minZ, maxZ, ceiling } = this.bounds;

    switch (this.kind) {
      case 'beetle': {
        // Beetles work in bursts: a scurry, then a long suspicious pause.
        const scurry = this.rng() < 0.65;
        this.targetX = scurry
          ? clampTo(this.x + rngRange(this.rng, -220, 220), minX, maxX)
          : this.x;
        this.targetZ = clampTo(
          this.z + rngRange(this.rng, -50, 50),
          minZ,
          maxZ,
        );
        this.hold = scurry ? rngRange(this.rng, 0.6, 1.4) : rngRange(this.rng, 1.2, 3.4);
        break;
      }

      case 'moth': {
        if (ctx.lightsOn) {
          // Orbiting the lamp, never quite arriving.
          const angle = this.rng() * Math.PI * 2;
          const radius = rngRange(this.rng, 40, 130);
          this.targetX = clampTo(ctx.lampX + Math.cos(angle) * radius, minX, maxX);
          this.targetHeight = clampTo(
            ctx.lampY + Math.sin(angle) * radius * 0.6,
            60,
            ceiling,
          );
          this.hold = rngRange(this.rng, 0.5, 1.3);
        } else {
          // In the dark it wanders, and glows for itself.
          this.targetX = clampTo(this.x + rngRange(this.rng, -260, 260), minX, maxX);
          this.targetHeight = rngRange(this.rng, 80, ceiling);
          this.hold = rngRange(this.rng, 1.4, 3);
        }
        this.targetZ = clampTo(
          this.z + rngRange(this.rng, -60, 60),
          minZ,
          maxZ,
        );
        break;
      }

      case 'dust': {
        this.targetX = clampTo(this.x + rngRange(this.rng, -300, 300), minX, maxX);
        this.targetZ = clampTo(
          this.z + rngRange(this.rng, -30, 30),
          minZ,
          maxZ,
        );
        this.hold = rngRange(this.rng, 3, 7);
        break;
      }
    }
  }

  private moveBeetle(dt: number): void {
    const rush = 1 + this.startled * 2.4;
    const dx = this.targetX - this.x;
    const dd = this.targetZ - this.z;

    const top = 46 * rush;
    this.vx = clampTo(dx * 2.4, -top, top);
    this.vz = clampTo(dd * 1.6, -top * 0.5, top * 0.5);

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.height = 0;
  }

  private moveMoth(dt: number, ctx: CritterContext): void {
    const dx = this.targetX - this.x;
    const dh = this.targetHeight - this.height;
    const dd = this.targetZ - this.z;

    const urgency = ctx.lightsOn ? 1 : 0.7;
    const rush = urgency * (1 + this.startled * 1.8);

    // Deliberately jittery: a moth's path is a stagger, not a curve.
    const flutter = Math.sin(this.phase + performance.now() / 90) * 26;

    this.vx += (dx * 1.5 + flutter - this.vx) * Math.min(1, dt * 5);
    this.vHeight += (dh * 1.6 - this.vHeight) * Math.min(1, dt * 4);
    this.vz += (dd * 0.9 - this.vz) * Math.min(1, dt * 3);

    const top = 170 * rush;
    this.x += clampTo(this.vx, -top, top) * dt;
    this.height += clampTo(this.vHeight, -top, top) * dt;
    this.z += clampTo(this.vz, -60, 60) * dt;

    this.height = clampTo(this.height, 40, this.bounds.ceiling);
  }

  private moveDust(dt: number): void {
    const dx = this.targetX - this.x;
    const dd = this.targetZ - this.z;

    this.vx += (clampTo(dx * 0.5, -22, 22) - this.vx) * Math.min(1, dt * 1.2);
    this.vz = clampTo(dd * 0.4, -8, 8);

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // A dust bunny is never quite on the floor and never quite off it.
    this.height = 2 + Math.sin(this.phase + performance.now() / 700) * 2;
  }

  // --- Drawing --------------------------------------------------------------

  private draw(dt: number, ctx: CritterContext): void {
    // Critters live in the same room as everything else, so they are placed by
    // the same camera: a beetle at the back of the floor is genuinely smaller
    // than one at the front, and crossing the room it grows as it comes.
    const screen = project(this.x, this.height, this.z);
    this.view.position.set(screen.x, screen.y);
    this.view.scale.set(scaleAt(this.z));
    this.view.zIndex = this.z;

    switch (this.kind) {
      case 'beetle': {
        if (Math.abs(this.vx) > 3) this.art.scale.x = this.vx < 0 ? -1 : 1;
        // Legs only scrabble while it is actually going somewhere.
        if (this.legs) {
          const stride = Math.min(1, Math.abs(this.vx) / 40);
          this.legs.y = Math.sin(performance.now() / 40) * stride * 1.2;
          this.legs.alpha = 0.5 + stride * 0.5;
        }
        this.art.rotation = clampTo(this.vx / 400, -0.2, 0.2);
        break;
      }

      case 'moth': {
        if (this.wings) {
          // Wing beat, faster when it is going somewhere in a hurry.
          const beat = 0.35 + Math.min(0.5, Math.abs(this.vx) / 260);
          this.wings.scale.x = 0.35 + Math.abs(Math.sin(performance.now() / 45)) * beat;
        }
        if (this.glow) {
          // In the dark it is the only light source of its own in the room.
          const target = ctx.lightsOn ? 0 : 0.55 + Math.sin(performance.now() / 500) * 0.25;
          this.glow.alpha += (target - this.glow.alpha) * Math.min(1, dt * 2);
        }
        this.art.rotation = clampTo(this.vx / 700, -0.3, 0.3);
        break;
      }

      case 'dust': {
        this.art.rotation += this.vx * dt * 0.02;
        break;
      }
    }
  }
}

function clampTo(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
