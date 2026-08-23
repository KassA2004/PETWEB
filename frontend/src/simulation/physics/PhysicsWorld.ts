/**
 * The room's physics world.
 *
 * This file is the conductor and almost nothing else. Every actual decision
 * lives in a file of its own — which pairs are worth testing (`Broadphase`),
 * whether they touch and where (`Narrowphase`), what that does to them
 * (`Solver`), when they may stop (`Sleep`), how the creature moves
 * (`CharacterController`), how the pointer moves things (`Manipulator`) — and
 * the value of that is not tidiness. It is that each of those questions now
 * has exactly one answer in exactly one place, which is what the system this
 * replaced did not have.
 *
 * The step
 * --------
 *   1. accumulate real time into fixed 1/120s steps
 *   2. characters decide where they are going; the pointer moves what it holds
 *   3. integrate: gravity, drag, position
 *   4. resolve, twice:
 *        floor        the plane at y = 0
 *        contacts     body against body, in all three axes
 *   5. walls, containers, ground friction, speed cap
 *   6. work out what may go to sleep
 *
 * Everything the rest of the app needs — what hit what, how hard, what landed
 * — comes back from `step` as events, because the creature's brain and its
 * animation both react to collisions and neither should be polling.
 */

import {
  addVelocity,
  bodyRadius,
  createBody,
  effectiveInvMass,
  placeBody,
  setVelocity,
  wake,
} from './Body';
import { findPairs } from './Broadphase';
import type { Pair } from './Broadphase';
import { CharacterController } from './CharacterController';
import type { CharacterOptions } from './CharacterController';
import { footprintContains, halfX, halfZ, topOf } from './Collider';
import { Environment } from './Environment';
import type { RoomBounds } from './Environment';
import { Manipulator, clearanceOf } from './Manipulator';
import { collide } from './Narrowphase';
import {
  applyContainer,
  applyGroundFriction,
  dampRestingFall,
  limitSpeed,
  registerContact,
  resolvePosition,
  resolveVelocity,
} from './Solver';
import { updateSleep } from './Sleep';
import {
  DEFAULT_GRAVITY,
  FIXED_STEP,
  ITERATIONS,
  IMPACT_SPEED,
  LANDING_SPEED,
  MAX_SUBSTEPS,
  REPORT_SPEED,
  SETTLE_SLACK,
} from './constants';
import { damp } from './math';
import type {
  GroundImpact,
  Impact,
  PhysicsBody,
  StepResult,
  WallImpact,
} from './types';

export interface PhysicsWorldOptions {
  bounds: RoomBounds;
  /** px/s². Tuned for a room measured in hundreds of pixels, not metres. */
  gravity?: number;
}

/** What is standing in the way, and how far along the probe it was found. */
export interface Obstruction {
  body: PhysicsBody;
  distance: number;
}

export class PhysicsWorld {
  readonly bodies: PhysicsBody[] = [];
  readonly environment: Environment;
  readonly manipulator: Manipulator;

  readonly gravity: number;

  private controllers: CharacterController[] = [];
  private accumulator = 0;

  private pairs: Pair[] = [];
  private impacts = new Map<string, Impact>();
  private walls: WallImpact[] = [];
  private ground = new Map<string, GroundImpact>();

  constructor(options: PhysicsWorldOptions) {
    this.environment = new Environment(options.bounds);
    this.gravity = options.gravity ?? DEFAULT_GRAVITY;

    this.manipulator = new Manipulator({
      surfaceHeightAt: (x, z, ignoreId) => this.surfaceHeightAt(x, z, ignoreId),
      // A carried body is not contained by the walls — it is kinematic, and the
      // hand is stronger than the room — so the clamp has to allow for its own
      // footprint here, or a bed dragged to the back of the room ends up half
      // inside the plaster.
      clampToRoom: (x, z, body) =>
        this.environment.clamp(x, z, halfX(body.collider), halfZ(body.collider)),
    });
  }

  get bounds(): RoomBounds {
    return this.environment.bounds;
  }

  // --- Membership -----------------------------------------------------------

  add(body: PhysicsBody): PhysicsBody {
    this.bodies.push(body);
    return body;
  }

  /** Register a body as a driven character and get its controller. */
  addCharacter(body: PhysicsBody, options: CharacterOptions): CharacterController {
    const controller = new CharacterController(body, options);
    this.controllers.push(controller);
    return controller;
  }

  remove(id: string): void {
    const index = this.bodies.findIndex((body) => body.id === id);
    if (index >= 0) this.bodies.splice(index, 1);

    this.controllers = this.controllers.filter((controller) => controller.body.id !== id);

    // Anything resting on the departed needs to notice the floor is back.
    for (const body of this.bodies) {
      if (body.support?.id === id) {
        body.support = null;
        wake(body);
      }
      if (body.passThrough === id) body.passThrough = null;
    }
  }

  get(id: string): PhysicsBody | undefined {
    return this.bodies.find((body) => body.id === id);
  }

  // --- Talking to the world -------------------------------------------------

  /** Nudge a body. */
  push(body: PhysicsBody, velocity: { x?: number; y?: number; z?: number }): void {
    addVelocity(body, velocity);
  }

  /** Set a body's velocity outright — a throw, or a bat from a paw. */
  setVelocity(body: PhysicsBody, velocity: { x?: number; y?: number; z?: number }): void {
    setVelocity(body, velocity);
  }

  wake(body: PhysicsBody): void {
    wake(body);
  }

  /**
   * Pick something up.
   *
   * Goes through the world rather than straight to the manipulator so that
   * whatever was sitting on it finds out. Sleeping bodies are invisible to the
   * broadphase, so a toy asleep on a table that is suddenly lifted away would
   * otherwise stay exactly where it was, in mid-air, indefinitely.
   */
  grab(body: PhysicsBody): void {
    for (const rider of this.occupants(body.id)) wake(rider);
    this.manipulator.grab(body);
  }

  /** Let go, and wake anything that was relying on where it used to be. */
  release(): ReturnType<Manipulator['release']> {
    const released = this.manipulator.release();
    if (released) {
      for (const rider of this.occupants(released.body.id)) wake(rider);
    }
    return released;
  }

  /** Move a body without giving it any velocity. */
  place(body: PhysicsBody, position: { x?: number; y?: number; z?: number }): void {
    placeBody(body, position);
  }

  // --- Queries --------------------------------------------------------------

  /**
   * Height of the highest thing a body would come to rest on at this point.
   *
   * The floor is 0, so this always has an answer. Used to work out how high a
   * carried object should hover, and where the drop marker goes.
   */
  surfaceHeightAt(x: number, z: number, ignoreId?: string): number {
    let best = 0;

    for (const body of this.bodies) {
      if (body.id === ignoreId || body.held) continue;
      if (body.type === 'character') continue;
      if (!footprintContains(body, x, z)) continue;

      best = Math.max(best, clearanceOf(body));
    }

    return best;
  }

  /** What is standing on this body right now. */
  occupants(id: string): PhysicsBody[] {
    return this.bodies.filter((body) => body.support?.id === id);
  }

  /**
   * Is something solid in the way?
   *
   * The creature is allowed to bump into the furniture, and should — but it
   * has no business leaning on a bookcase for six seconds because its target
   * happens to be on the other side of it. Anything it can simply step over,
   * anything lighter than itself, and all of the scenery is not an obstacle:
   * those are for shoving, or for walking straight through.
   *
   * This is the *local* answer, a stride ahead and no further. The route round
   * the room is the navigator's question (`simulation/navigation`), and the
   * two are deliberately different scales of the same problem: one steers past
   * what has just wandered into the way, the other decides which side of the
   * bed to go around.
   */
  blocked(
    body: PhysicsBody,
    dirX: number,
    dirZ: number,
    reach: number,
  ): Obstruction | null {
    const length = Math.hypot(dirX, dirZ);
    if (length === 0) return null;

    const nx = dirX / length;
    const nz = dirZ / length;
    const radius = bodyRadius(body);

    let nearest: Obstruction | null = null;

    for (const other of this.bodies) {
      if (other === body || other.held) continue;
      if (other.type === 'dynamic' && other.mass < body.mass * 0.6) continue;
      if (other.id === body.passThrough) continue;
      // Scenery is drawn in the room, not standing in it. A creature that
      // stopped for the pot plant would spend its life apologising to the
      // furniture.
      if (body.type === 'character' && other.solidity === 'scenery') continue;

      // Things it can walk over, walk under, or is already standing on.
      if (topOf(other) <= body.position.y + body.stepHeight) continue;
      if (other.position.y >= topOf(body)) continue;
      if (body.support?.id === other.id) continue;

      // Distance to the obstacle's footprint along the probe.
      const dx = other.position.x - body.position.x;
      const dz = other.position.z - body.position.z;
      const along = dx * nx + dz * nz;
      if (along < 0) continue;

      const across = Math.abs(dx * -nz + dz * nx);
      const span = Math.hypot(halfX(other.collider), halfZ(other.collider));
      if (across > span + radius) continue;

      const distance = along - span - radius;
      if (distance > reach) continue;

      if (!nearest || distance < nearest.distance) {
        nearest = { body: other, distance: Math.max(0, distance) };
      }
    }

    return nearest;
  }

  // --- The step -------------------------------------------------------------

  /**
   * Advance the world.
   *
   * @param dt seconds of real time. Chopped into fixed steps internally.
   */
  step(dt: number): StepResult {
    this.impacts.clear();
    this.walls = [];
    this.ground.clear();

    this.accumulator = Math.min(this.accumulator + dt, FIXED_STEP * MAX_SUBSTEPS);

    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      this.substep();
    }

    return {
      impacts: [...this.impacts.values()].sort((a, b) => b.speed - a.speed),
      walls: this.walls,
      ground: [...this.ground.values()],
    };
  }

  private substep(): void {
    const dt = FIXED_STEP;

    for (const controller of this.controllers) controller.update(dt);
    this.manipulator.update(dt);

    for (const body of this.bodies) {
      body.grounded = false;
      this.integrate(body, dt);
    }

    findPairs(this.bodies, this.pairs);

    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const first = iteration === 0;

      for (const body of this.bodies) this.solveFloor(body, first);

      for (const pair of this.pairs) {
        const contact = collide(pair.a, pair.b);
        if (!contact) continue;

        registerContact(contact);

        // Velocity is resolved on every pass, not only the first. A single
        // pass is enough for two things touching and hopeless for five: the
        // support has to travel up a stack one contact at a time, and a stack
        // that never quite holds its own weight never stops moving, and so
        // never gets to sleep. Only the *reporting* is first-pass, because the
        // closing speed the room wants to hear about is the one on arrival.
        const closing = resolveVelocity(contact);
        if (first) {
          this.record(contact.a, contact.b, contact.standing, contact.normal.y, closing);
        }

        if (this.stepUp(contact)) continue;
        resolvePosition(contact);
      }
    }

    // One last look at the floor, so nothing is left a fraction of a pixel
    // inside it by the contact pass that ran after the previous one.
    for (const body of this.bodies) this.solveFloor(body, false);

    for (const body of this.bodies) {
      if (!body.sleeping) {
        dampRestingFall(body);
        const hit = this.environment.contain(body);
        if (hit) this.walls.push({ body, speed: hit.speed, direction: hit.direction });

        if (body.support?.id) {
          const holder = this.get(body.support.id);
          if (holder) applyContainer(body, holder);
        }

        applyGroundFriction(body, dt, this.gravity);
        limitSpeed(body);

        // A sleeping body keeps its support: it is skipped by the broadphase,
        // so there is no contact left to re-derive it from, and the scene
        // still needs to know that the creature is asleep *on the bed*.
        if (!body.grounded) body.support = null;
      }

      updateSleep(body, dt);
    }

    this.settleUnsupported(dt);
  }

  /**
   * Make sure nothing static is standing on thin air.
   *
   * Static bodies are never integrated — that is what "furniture stays put"
   * means — so they have no gravity of their own, and the moment the thing they
   * were placed on top of is carried away or taken out of the room they simply
   * stay where they are. Stack another one on that, remove the one underneath,
   * repeat, and furniture climbs out of the frame.
   *
   * Dynamic bodies never had this problem: `remove` and `grab` wake them and
   * they fall. So this is the same rule, applied to the one class of body that
   * cannot enforce it for itself: if a static thing is above whatever is under
   * it, it falls until it is not.
   *
   * It falls rather than snaps because the two look completely different — a
   * chair that drops onto the floor when you take the table away reads as
   * physics, and one that teleports reads as a glitch.
   *
   * Note what this deliberately does NOT do: it never pushes anything *up*, and
   * it has no opinion about how high a stack may go. Building upward is a
   * feature; hanging in the air is not.
   */
  private settleUnsupported(dt: number): void {
    // Bottom of the stack first. Lowering a table has to happen before the lamp
    // standing on it is asked what it is standing on, or the lamp spends a frame
    // measuring against a surface that is already on its way down.
    const stack = this.bodies
      .filter(
        (body) =>
          body.type === 'static' && !body.held && !body.anchored,
      )
      .sort((a, b) => a.position.y - b.position.y);

    for (const body of stack) {
      const rest = this.surfaceHeightAt(body.position.x, body.position.z, body.id);
      const gap = body.position.y - rest;

      if (gap <= SETTLE_SLACK) {
        body.velocity.y = 0;
        continue;
      }

      body.velocity.y -= this.gravity * dt;
      const next = body.position.y + body.velocity.y * dt;

      if (next <= rest) {
        body.position.y = rest;
        body.velocity.y = 0;
        // Whatever was riding on it has just been moved, whether it knows or not.
        for (const rider of this.occupants(body.id)) wake(rider);
      } else {
        body.position.y = next;
      }
    }
  }

  /**
   * Gravity, drag, and one step of motion.
   *
   * Semi-implicit Euler, deliberately: velocity is a value the body owns
   * rather than an accident of two positions, which is what lets the solver
   * correct an overlap without that correction becoming speed.
   */
  private integrate(body: PhysicsBody, dt: number): void {
    if (body.type === 'static' || body.held || body.sleeping) {
      body.previous.x = body.position.x;
      body.previous.y = body.position.y;
      body.previous.z = body.position.z;
      return;
    }

    body.previous.x = body.position.x;
    body.previous.y = body.position.y;
    body.previous.z = body.position.z;

    body.velocity.y -= this.gravity * dt;

    // Air resistance only off the ground; on it, friction is the solver's job
    // and doubling up would make everything feel like it was moving in syrup.
    if (!body.grounded && body.drag > 0) {
      body.velocity.x = damp(body.velocity.x, body.drag, dt);
      body.velocity.z = damp(body.velocity.z, body.drag, dt);
    }

    body.position.x += body.velocity.x * dt;
    body.position.y += body.velocity.y * dt;
    body.position.z += body.velocity.z * dt;
  }

  /**
   * The floor: one plane, at zero.
   *
   * Touching counts, not just overlapping. A body that has settled sits at
   * exactly zero, and if that did not register as ground contact then the
   * moment anything went to sleep it would stop being grounded and wake
   * straight back up.
   */
  private solveFloor(body: PhysicsBody, record: boolean): void {
    if (effectiveInvMass(body) === 0 || body.position.y > 0) return;

    if (body.position.y < 0 && body.velocity.y < 0) {
      const fall = -body.velocity.y;
      if (record && fall > LANDING_SPEED) this.recordGround(body, fall, null);

      const bounce = fall * body.restitution;
      body.velocity.y = bounce > IMPACT_SPEED ? bounce : 0;
    }

    body.position.y = 0;
    body.grounded = true;
    body.support = { id: null, top: 0, kind: 'floor' };
  }

  /**
   * Walking up onto something low.
   *
   * A horizontal contact with a ledge the body could simply step onto becomes
   * a step instead of a wall. This is a character-controller feature living
   * where the contacts are, because it is fundamentally a decision to *ignore*
   * a contact, and the only honest place to make that decision is here.
   */
  private stepUp(contact: {
    a: PhysicsBody;
    b: PhysicsBody | null;
    normal: { x: number; y: number; z: number };
  }): boolean {
    const { a, b, normal } = contact;
    if (!b || normal.y !== 0) return false;

    const climber = a.stepHeight > 0 ? a : b.stepHeight > 0 ? b : null;
    if (!climber) return false;

    const ledge = climber === a ? b : a;
    if (ledge.stepHeight > 0 || !climber.grounded || climber.held) return false;
    if (ledge.surface?.kind === 'container') return false;

    const rise = topOf(ledge) - climber.position.y;
    if (rise <= 0.5 || rise > climber.stepHeight) return false;

    climber.position.y = topOf(ledge);
    if (climber.velocity.y < 0) climber.velocity.y = 0;
    climber.grounded = true;
    climber.support = { id: ledge.id, top: topOf(ledge), kind: ledge.surface?.kind ?? 'shelf' };

    return true;
  }

  // --- Events ---------------------------------------------------------------

  private record(
    a: PhysicsBody,
    b: PhysicsBody | null,
    standing: boolean,
    normalY: number,
    closing: number,
  ): void {
    if (!b || closing < REPORT_SPEED) return;

    if (normalY !== 0 && closing > LANDING_SPEED) {
      const lander = standing ? a : b;
      const onto = standing ? b : a;
      this.recordGround(lander, closing, onto.id);
    }

    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const existing = this.impacts.get(key);

    if (existing) existing.speed = Math.max(existing.speed, closing);
    else this.impacts.set(key, { a, b, speed: closing });
  }

  private recordGround(body: PhysicsBody, speed: number, onto: string | null): void {
    const existing = this.ground.get(body.id);
    if (existing) {
      existing.speed = Math.max(existing.speed, speed);
      return;
    }
    this.ground.set(body.id, { body, speed, onto });
  }
}

export { createBody };
