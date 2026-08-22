/**
 * Small vector and scalar helpers.
 *
 * Deliberately allocation-light: the solver runs 120 times a second over every
 * pair in the room, so the hot paths take and return plain numbers and only the
 * bookkeeping uses `Vec3` objects.
 */

import type { Vec3 } from './types';

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Length of a 3D vector given as three numbers. */
export function length3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** Length in the floor plane only — how far apart two things are on the ground. */
export function lengthXZ(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

export function speedOf(v: Vec3): number {
  return length3(v.x, v.y, v.z);
}

export function horizontalSpeed(v: Vec3): number {
  return lengthXZ(v.x, v.z);
}

/**
 * Move `current` toward `target`, never by more than `maxDelta`.
 *
 * The whole of "legs accelerate, they do not set speed": a creature that can
 * only change its velocity by so much per step has to lose the argument with
 * anything heavier than itself.
 */
export function approach(current: number, target: number, maxDelta: number): number {
  const difference = target - current;
  if (difference > maxDelta) return current + maxDelta;
  if (difference < -maxDelta) return current - maxDelta;
  return target;
}

/**
 * Exponential decay that is correct for any timestep.
 *
 * `rate` is the fraction shed per second, so a value survives `exp(-rate * dt)`
 * of itself. Framerate-independent, unlike multiplying by 0.98 every frame.
 */
export function damp(value: number, rate: number, dt: number): number {
  return value * Math.exp(-rate * dt);
}
