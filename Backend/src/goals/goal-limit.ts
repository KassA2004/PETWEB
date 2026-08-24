/**
 * How many goals a user may have open at once.
 *
 * Six, and the number is the feature rather than a safety valve. A list you can
 * add to for ever becomes a place to put things you are avoiding: the seventh
 * goal is almost never the one that gets done, it is the one that makes the
 * other six feel heavier. Capping the list is the product saying "finish
 * something" out loud.
 *
 * Enforced here, in the service, and not only by a disabled button — a button
 * is a suggestion, and the request that arrives while two tabs are open was
 * never going to see it.
 */
export const MAX_OPEN_GOALS = 6;

/**
 * What the user is told when they hit it.
 *
 * Kept beside the number so the two cannot drift, and written in the room's
 * voice rather than an API's: this is a refusal the user is meant to agree with.
 */
export const GOAL_LIMIT_MESSAGE =
  'You already have six things to work toward. Finish one before adding another — ' +
  'one step at a time beats another mountain.';
