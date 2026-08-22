/**
 * Object life — the small, permanent motion that objects have of their own.
 *
 * Physics moves things when something happens to them. This is the other kind
 * of motion: the pendulum that never stops, the leaves that sway, the lamp
 * that breathes. It runs whether or not anyone touches the room, and it is
 * what makes the difference between a room full of props and a room.
 *
 * Renderers stay pure factories — they build a container and, if the thing
 * they built is alive, register how it moves. The room updates every entity's
 * life once per frame and never needs to know which objects have any:
 *
 *   createClock()  ->  Container  +  attachLife(view, { update, drain })
 *                                        |
 *   PetRoom frame  ------------------> updateLife(view, dt, ctx) -> events
 *
 * `drain` is how an object tells the room something happened — the clock
 * striking the hour is an event the creature reacts to, and it has to travel
 * out of the artwork and into the simulation somehow.
 */

import type { Container } from 'pixi.js';

export interface LifeContext {
  /** Seconds since the room opened. */
  time: number;
  /** Whether the room's light is on. */
  lightsOn: boolean;
  /** Real wall-clock time, so a clock in the room tells the actual time. */
  now: Date;
}

export interface ObjectLife {
  update(dt: number, ctx: LifeContext): void;
  /**
   * An event name to hand to the room, consumed by reading it. Called every
   * frame, so it must return null when nothing has happened.
   */
  drain?(): string | null;
}

const LIVES = new WeakMap<Container, ObjectLife[]>();

/** Register motion for a rendered object. Safe to call more than once. */
export function attachLife(view: Container, life: ObjectLife): void {
  const existing = LIVES.get(view);
  if (existing) existing.push(life);
  else LIVES.set(view, [life]);
}

/**
 * Advance an object's own motion.
 *
 * @returns event names the object raised this frame, usually none.
 */
export function updateLife(
  view: Container,
  dt: number,
  ctx: LifeContext,
): string[] {
  const lives = LIVES.get(view);
  if (!lives) return [];

  const events: string[] = [];

  for (const life of lives) {
    life.update(dt, ctx);
    const event = life.drain?.();
    if (event) events.push(event);
  }

  return events;
}

export function hasLife(view: Container): boolean {
  return LIVES.has(view);
}
