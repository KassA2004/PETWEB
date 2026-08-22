/**
 * Contact response, in two strictly separate halves.
 *
 * This separation is the single most important idea in the rewrite. The system
 * it replaces stored velocity implicitly, as the gap between a body's current
 * and previous positions, which meant that *moving a body out of a wall was
 * indistinguishable from throwing it*. Every jitter, every slow drift, every
 * creature launched into orbit came from that one confusion.
 *
 * Here:
 *
 *   resolveVelocity   decides what the collision *does* — bounce and friction.
 *                     Runs only when the two are genuinely approaching.
 *   resolvePosition   fixes the overlap. Moves positions and nothing else.
 *                     A resting stack runs this every frame and never gains a
 *                     single pixel per second from it.
 *
 * Resting friction is a third thing again, and deliberately not a contact
 * impulse: a body standing on something has explicit horizontal friction
 * applied to it, with a cutoff that takes it to exactly zero. "Exactly" is
 * what makes sleeping possible, and sleeping is what makes the room quiet.
 */

import { effectiveInvMass, wake } from './Body';
import { clampToFootprint, topOf } from './Collider';
import {
  CORRECTION,
  SOFT_CORRECTION,
  IMPACT_SPEED,
  MAX_CORRECTION,
  RESTING_FALL_SPEED,
  SLOP,
  SPEED_LIMIT,
  STATIC_FRICTION_SPEED,
  WAKE_SPEED,
} from './constants';
import { horizontalSpeed, speedOf } from './math';
import type { Contact, PhysicsBody, SurfaceKind } from './types';

/**
 * Bounce and scrub, if the pair are actually colliding.
 *
 * @returns the closing speed along the normal, or 0 for a resting contact.
 */
export function resolveVelocity(contact: Contact): number {
  const { a, b, normal } = contact;

  const invA = effectiveInvMass(a);
  const invB = b ? effectiveInvMass(b) : 0;
  const total = invA + invB;
  if (total === 0) return 0;

  const rvx = a.velocity.x - (b?.velocity.x ?? 0);
  const rvy = a.velocity.y - (b?.velocity.y ?? 0);
  const rvz = a.velocity.z - (b?.velocity.z ?? 0);

  // Negative means the two are closing on each other.
  const approach = rvx * normal.x + rvy * normal.y + rvz * normal.z;
  if (approach >= 0) return 0;

  const closing = -approach;

  // A lean is not a collision. Below walking pace the pair are separated
  // positionally and otherwise left alone, which is what lets a pile settle.
  // If a dynamic toy is colliding, use the maximum restitution so it keeps its bounce
  const isToyCollision = a.type === 'character' && b?.type === 'dynamic';
  const baseRestitution = isToyCollision
    ? Math.max(a.restitution, b.restitution)
    : Math.min(a.restitution, b?.restitution ?? 0.2);

  const restitution = closing > IMPACT_SPEED ? baseRestitution : 0;


  const j = ((1 + restitution) * closing) / total;

  a.velocity.x += normal.x * j * invA;
  a.velocity.y += normal.y * j * invA;
  a.velocity.z += normal.z * j * invA;

  if (b) {
    b.velocity.x -= normal.x * j * invB;
    b.velocity.y -= normal.y * j * invB;
    b.velocity.z -= normal.z * j * invB;
  }

  // Coulomb friction along the contact plane, capped by the normal impulse so
  // a glancing blow scuffs and a head-on one does not stop dead sideways.
  const tx = rvx - normal.x * approach;
  const ty = rvy - normal.y * approach;
  const tz = rvz - normal.z * approach;
  const tangent = Math.hypot(tx, ty, tz);

  if (tangent > 1e-4 && a.type !== 'character' && b?.type !== 'character') {
    const mu = Math.sqrt(a.friction * (b?.friction ?? 0.7));
    const jt = Math.min(tangent / total, mu * j);
    const nx = tx / tangent;
    const ny = ty / tangent;
    const nz = tz / tangent;

    a.velocity.x -= nx * jt * invA;
    a.velocity.y -= ny * jt * invA;
    a.velocity.z -= nz * jt * invA;

    if (b) {
      b.velocity.x += nx * jt * invB;
      b.velocity.y += ny * jt * invB;
      b.velocity.z += nz * jt * invB;
    }
  }

  return closing;
}

/**
 * Push the pair apart. Positions only — never velocities.
 *
 * A hair of overlap is left behind on purpose (`SLOP`): resolving contact to
 * exactly zero means the next step finds them apart, the step after finds them
 * touching, and the pair hum against each other forever.
 *
 * The creature gets a gentler rate than everything else (`SOFT_CORRECTION`).
 * It is the same arithmetic; it just takes a few frames longer, and those few
 * frames are the whole difference between a creature that bumps into the bed
 * and one that stops against it like a wall.
 */
export function resolvePosition(contact: Contact): void {
  const { a, b, normal, depth } = contact;

  const invA = effectiveInvMass(a);
  const invB = b ? effectiveInvMass(b) : 0;
  const total = invA + invB;
  if (total === 0) return;

  const excess = depth - SLOP;
  if (excess <= 0) return;

  const soft = a.type === 'character' || b?.type === 'character';
  const push = Math.min(excess * (soft ? SOFT_CORRECTION : CORRECTION), MAX_CORRECTION);

  a.position.x += normal.x * push * (invA / total);
  a.position.y += normal.y * push * (invA / total);
  a.position.z += normal.z * push * (invA / total);

  if (b) {
    b.position.x -= normal.x * push * (invB / total);
    b.position.y -= normal.y * push * (invB / total);
    b.position.z -= normal.z * push * (invB / total);
  }
}

/**
 * Record who is standing on whom, and wake anyone a moving neighbour touched.
 *
 * Support is read off the contacts rather than searched for separately, which
 * removes an entire subsystem: if you are being held up by something, there is
 * a contact saying so.
 */
export function registerContact(contact: Contact): void {
  const { a, b, normal } = contact;

  if (normal.y > 0.5) {
    a.grounded = true;
    a.support = {
      id: b?.id ?? null,
      top: b ? topOf(b) : 0,
      kind: b?.surface?.kind ?? 'floor',
    };
  } else if (normal.y < -0.5 && b) {
    b.grounded = true;
    b.support = { id: a.id, top: topOf(a), kind: a.surface?.kind ?? ('floor' as SurfaceKind) };
  }

  // A sleeping body only wakes for a neighbour that is actually going
  // somewhere. Without the speed test, one twitchy object keeps a whole shelf
  // awake for ever.
  if (b) {
    if (a.sleeping && speedOf(b.velocity) > WAKE_SPEED) wake(a);
    if (b.sleeping && speedOf(a.velocity) > WAKE_SPEED) wake(b);
  }
}

/**
 * Friction against whatever a body is standing on.
 *
 * Explicit, rather than a side effect of collision: `mu * g` is a deceleration
 * in px/s², applied against the direction of travel, and anything slower than
 * a crawl is simply stopped. That last clause is the one that matters. An
 * exponential decay leaves a body creeping at a fraction of a pixel a second
 * forever, which reads as a room that is subtly alive in the wrong way.
 */
export function applyGroundFriction(
  body: PhysicsBody,
  dt: number,
  gravity: number,
): void {
  if (!body.grounded || body.held || body.type === 'static') return;

  // Not the creature. A character's horizontal velocity belongs to its
  // controller, which already decelerates it when it stops asking to move;
  // applying ground friction on top means the legs are fighting the floor
  // every step, and with a coefficient high enough to stand on a sloping bed
  // the floor wins and the creature never gets going.
  if (body.type === 'character') return;

  const speed = horizontalSpeed(body.velocity);
  if (speed === 0) return;

  if (speed < STATIC_FRICTION_SPEED) {
    body.velocity.x = 0;
    body.velocity.z = 0;
    return;
  }

  const decel = body.friction * gravity * dt;
  const scale = Math.max(0, speed - decel) / speed;

  body.velocity.x *= scale;
  body.velocity.z *= scale;
}

/**
 * A supported body is not falling.
 *
 * The counterpart to grounded friction, for the vertical axis. See
 * `RESTING_FALL_SPEED` for why a stack that is visibly motionless can still be
 * reporting several pixels a second of descent, and why leaving it there means
 * nothing on top of anything else ever gets to sleep.
 */
export function dampRestingFall(body: PhysicsBody): void {
  if (!body.grounded || body.type === 'static') return;
  if (body.velocity.y >= 0 || body.velocity.y < -RESTING_FALL_SPEED) return;
  body.velocity.y = 0;
}

/**
 * The inside of a container.
 *
 * A basket is physically a low platform — you stand on its inside floor — and
 * a rim that is drawn in front of whatever is in it. Rather than model four
 * thin walls that things can rattle between, occupants are simply held inside
 * the footprint. Three toys in a basket then behave exactly as they look:
 * jostling each other, going nowhere.
 */
export function applyContainer(body: PhysicsBody, holder: PhysicsBody): void {
  const surface = holder.surface;
  if (!surface || surface.kind !== 'container') return;

  const inset = surface.inset ?? 12;
  const held = clampToFootprint(holder, body.position, inset);

  if (held.x !== body.position.x) {
    body.position.x = held.x;
    body.velocity.x *= -0.2;
  }
  if (held.z !== body.position.z) {
    body.position.z = held.z;
    body.velocity.z *= -0.2;
  }
}

/** The backstop. Nothing leaves the room at three thousand pixels a second. */
export function limitSpeed(body: PhysicsBody): void {
  const speed = speedOf(body.velocity);
  if (speed <= SPEED_LIMIT) return;

  const scale = SPEED_LIMIT / speed;
  body.velocity.x *= scale;
  body.velocity.y *= scale;
  body.velocity.z *= scale;
}
