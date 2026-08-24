/**
 * Affordances — what an object offers the creature to *do*.
 *
 * The alternative was a branch in the brain per object type: "if there is a
 * scratching post and the creature is bored, go and scratch it". Four objects
 * in, that brain is a switch statement wearing a personality, and every new
 * piece of furniture is a change to the creature's mind.
 *
 * So an object *states what it offers* (`assets/objects/ObjectCatalog.ts`) and
 * the brain has exactly one behaviour for using things: go to it, do the thing,
 * feel better. Adding an interactive object costs a row in the catalog and an
 * animation clip, and touches no decision-making code at all.
 *
 * The vocabulary lives here, in the simulation, rather than in the catalog,
 * and the direction of that dependency is the point: what a creature is
 * capable of wanting is a fact about the creature. The furniture only gets to
 * say which of those wants it can satisfy.
 */

export const AFFORDANCE_KINDS = [
  /** Food. Restores energy, and the supply runs down. */
  'eat',
  /** Scratching. Burns off frustration, and is very satisfying. */
  'scratch',
  /** Music. The creature dances where it stands. */
  'dance',
  /** Something to stare at — fish, a window, a moving thing behind glass. */
  'watch',
  /** Somewhere to disappear into for a moment, and pop back out of. */
  'hide',
] as const;

export type AffordanceKind = (typeof AFFORDANCE_KINDS)[number];

/** The needs an affordance is allowed to move. Deliberately a small set. */
export type FeedableNeed =
  | 'energy'
  | 'playfulness'
  | 'curiosity'
  | 'joy'
  | 'anger'
  | 'fear';

export interface Affordance {
  kind: AffordanceKind;
  /**
   * How interesting it is before any need is taken into account, 0..1.
   *
   * The brain multiplies this by whatever need the affordance answers, so a
   * high-appeal object the creature has no use for is still ignored — which is
   * the difference between a room with things in it and a room that pesters
   * you.
   */
  appeal: number;
  /** Seconds spent using it. */
  duration: number;
  /** What using it does to the creature, per second of use. */
  feeds: Partial<Record<FeedableNeed, number>>;
  /** One line for the interface, in the creature's voice. */
  mood: string;
}

/**
 * An affordance as the creature currently perceives it.
 *
 * `supply` is the part that cannot be known from the catalog: a bowl empties
 * as it is eaten from, and a creature standing at an empty bowl looks broken.
 * Anything that never runs out reports 1 for ever.
 */
export interface PerceivedAffordance extends Affordance {
  /** 0 exhausted, 1 full. */
  supply: number;
}

/**
 * How much the creature wants each kind of thing, right now.
 *
 * One function, and it is the whole of "should I go and do that". Keeping it
 * here rather than inside the behaviour picker means the mapping from need to
 * appetite can be read in one place, which matters because these are the
 * numbers that decide whether the room feels like somewhere the creature lives
 * or somewhere it is being made to perform.
 */
export function appetiteFor(
  kind: AffordanceKind,
  needs: {
    energy: number;
    playfulness: number;
    curiosity: number;
    fear: number;
    anger: number;
    joy: number;
  },
): number {
  switch (kind) {
    // Hunger is modelled as spent energy, so a creature that has been running
    // about goes and eats rather than going straight to bed.
    case 'eat':
      return Math.max(0, 0.85 - needs.energy);
    // The one thing a cross creature can do about being cross.
    case 'scratch':
      return needs.anger * 0.9 + needs.playfulness * 0.15;
    // Wanting to dance is mostly wanting to play, plus a little wanting to be
    // happier than you are.
    case 'dance':
      return needs.playfulness * 0.7 + Math.max(0, 0.6 - needs.joy) * 0.5;
    case 'watch':
      return needs.curiosity * 0.8;
    // Frightened creatures hide. Nothing else makes one want to.
    case 'hide':
      return needs.fear * 1.2;
    default:
      return 0;
  }
}
