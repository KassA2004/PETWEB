/**
 * Making and moving bodies.
 *
 * One record holds everything about a physical thing — position, velocity,
 * collider, mass, friction, what it is standing on, whether it is asleep, and
 * the visual it belongs to. That is the point: the system this replaced kept a
 * body's position in one array, its support in a second, its sleep state in a
 * third and its visual angle in a fourth, and every bug lived in the gaps.
 *
 * Nothing in this file solves anything. It creates bodies and applies
 * deliberate changes to them, and it is the only place outside the solver that
 * is allowed to write a velocity.
 */

import { footprintRadius } from './Collider';
import type {
  BodyType,
  Collider,
  PhysicsBody,
  Solidity,
  SurfaceSpec,
  Vec3,
} from './types';

export interface BodyOptions {
  id: string;
  type?: BodyType;
  collider: Collider;
  /** Base centre. `y` is the bottom of the collider; 0 is the floor. */
  position: Vec3;
  mass?: number;
  friction?: number;
  restitution?: number;
  drag?: number;
  surface?: SurfaceSpec | null;
  /** Whether a character walks around this, or straight through it. */
  solidity?: Solidity;
  /** How tall a ledge this body steps onto instead of bumping into. */
  stepHeight?: number;
  neverSleeps?: boolean;
  userData?: unknown;
}

export function createBody(options: BodyOptions): PhysicsBody {
  const type = options.type ?? 'dynamic';
  const mass = type === 'static' ? Infinity : (options.mass ?? 1);

  return {
    id: options.id,
    type,

    position: { ...options.position },
    velocity: { x: 0, y: 0, z: 0 },
    previous: { ...options.position },

    collider: options.collider,

    mass,
    invMass: type === 'static' ? 0 : 1 / Math.max(0.02, mass),

    friction: options.friction ?? 0.6,
    restitution: options.restitution ?? 0.3,
    drag: options.drag ?? 0.25,

    grounded: false,
    support: null,

    // Something placed on the floor is already settled; something dropped in
    // from above has to fall before it can rest.
    sleeping: type === 'static' || options.position.y <= 0,
    stillTime: 0,
    neverSleeps: options.neverSleeps ?? type === 'character',

    held: false,
    stepHeight: options.stepHeight ?? 0,

    solidity: options.solidity ?? 'solid',
    surface: options.surface ?? null,
    passThrough: null,

    userData: options.userData,
  };
}

/** Footprint radius, which is what perception and the brain measure with. */
export function bodyRadius(body: PhysicsBody): number {
  return footprintRadius(body.collider);
}

/**
 * Effective inverse mass.
 *
 * A held body is immovable for the length of the carry: the pointer is
 * stronger than the room, and a creature being lifted past a table should move
 * the table, not stop dead against it.
 */
export function effectiveInvMass(body: PhysicsBody): number {
  if (body.type === 'static' || body.held) return 0;
  return body.invMass;
}

export function wake(body: PhysicsBody): void {
  if (body.type === 'static') return;
  body.sleeping = false;
  body.stillTime = 0;
}

export function sleep(body: PhysicsBody): void {
  body.sleeping = true;
  body.stillTime = 0;
  body.velocity.x = 0;
  body.velocity.y = 0;
  body.velocity.z = 0;
}

/** Add to a body's velocity, in px/s. */
export function addVelocity(body: PhysicsBody, delta: Partial<Vec3>): void {
  if (body.type === 'static') return;
  body.velocity.x += delta.x ?? 0;
  body.velocity.y += delta.y ?? 0;
  body.velocity.z += delta.z ?? 0;
  wake(body);
}

/** Set a body's velocity outright — a throw, or a bat from a paw. */
export function setVelocity(body: PhysicsBody, velocity: Partial<Vec3>): void {
  if (body.type === 'static') return;
  if (velocity.x !== undefined) body.velocity.x = velocity.x;
  if (velocity.y !== undefined) body.velocity.y = velocity.y;
  if (velocity.z !== undefined) body.velocity.z = velocity.z;
  wake(body);
}

/** Move a body bodily, without giving it any velocity. */
export function placeBody(body: PhysicsBody, position: Partial<Vec3>): void {
  if (position.x !== undefined) body.position.x = position.x;
  if (position.y !== undefined) body.position.y = position.y;
  if (position.z !== undefined) body.position.z = position.z;
  wake(body);
}
