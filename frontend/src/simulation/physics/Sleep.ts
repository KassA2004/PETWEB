/**
 * Deciding when something has finished moving.
 *
 * Sleeping is not an optimisation here, or not only one. A body that never
 * quite stops is a body that keeps generating contacts, and contacts keep
 * generating corrections, and a room full of that drifts. The test is
 * therefore deliberately strict: a body must be *supported*, *slow*, and have
 * stayed both for a beat before it is allowed to go still — and going still
 * means its velocity is set to exactly zero, not to nearly zero.
 */

import { sleep } from './Body';
import { SLEEP_DELAY, SLEEP_SPEED } from './constants';
import { speedOf } from './math';
import type { PhysicsBody } from './types';

export function updateSleep(body: PhysicsBody, dt: number): void {
  if (body.type === 'static') return;

  if (body.held || body.neverSleeps) {
    body.sleeping = false;
    body.stillTime = 0;
    return;
  }

  // Sleep is sticky: once a body is out, only `wake` gets it back, and `wake`
  // is called by everything that could possibly matter — a neighbour arriving
  // at speed, a shove, the thing underneath being picked up or taken away.
  //
  // It has to work this way round. A sleeping body is skipped by the
  // broadphase, so it stops generating the very contact that proves it is
  // standing on something; re-deriving "still supported" every step would
  // wake it the instant it fell asleep, and it would spend its life
  // alternating between the two.
  if (body.sleeping) return;

  const settled = body.grounded && speedOf(body.velocity) < SLEEP_SPEED;

  if (!settled) {
    body.stillTime = 0;
    body.sleeping = false;
    return;
  }

  body.stillTime += dt;
  if (body.stillTime >= SLEEP_DELAY) sleep(body);
}
