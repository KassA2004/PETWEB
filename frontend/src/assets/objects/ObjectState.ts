/**
 * Object state — the small amount an object remembers about itself.
 *
 * `ObjectLife` is how an object *moves*; this is how it *changes*. A bowl
 * empties as it is eaten from, a music box is playing or not. Neither is
 * physics and neither is animation, and neither belongs in the scene — a room
 * that had to know how full every bowl in it was would be back to being one
 * file that knows about everything.
 *
 * Stored in a WeakMap keyed by the object's container, exactly as lives are:
 * the state goes away when the object does, and a renderer stays a pure
 * factory that happens to hand something back.
 *
 * Nothing here is persisted. An empty bowl fills itself up again while you are
 * away; that is cheaper than a schema and reads the same.
 */

import type { Container } from 'pixi.js';

const STATES = new WeakMap<Container, object>();

/** Give a rendered object its state. Returns it, so a renderer can keep it. */
export function attachState<T extends object>(view: Container, state: T): T {
  STATES.set(view, state);
  return state;
}

/**
 * Read an object's state, or null if it has none.
 *
 * The caller names the shape it expects. Objects that offer an affordance are
 * the only things that read this, and they know what they asked for.
 */
export function readState<T extends object>(view: Container): T | null {
  return (STATES.get(view) as T | undefined) ?? null;
}

/* -------------------------------------------------------------------------- */
/* The shapes state comes in                                                  */
/* -------------------------------------------------------------------------- */

/** Something that can be used up and refills itself: the supper bowl. */
export interface SuppliedState {
  /** 0 empty, 1 full. */
  level: number;
  /** Take some. Returns how much was actually there. */
  take(amount: number): number;
}

/** Something that is doing its thing right now: the music box. */
export interface PerformingState {
  playing: boolean;
}
