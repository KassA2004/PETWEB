/**
 * How long a session may be, and the lengths the interface offers.
 *
 * Both live here, together, for the same reason the six-goal cap and its
 * message share a file: the presets and the rule that validates them are one
 * decision, and two files would eventually disagree about it.
 *
 * **The minimum is the feature.** Ten minutes is short enough for a first
 * attempt and long enough that the room going dark means something. Anything
 * under it defeats the point of the thing: a two-minute session is not focus,
 * it is a light switch with extra steps, and offering one would turn the
 * creature's sleep into a toggle people flick.
 *
 * The maximum is not a rule about attention spans — it is a guard on a number
 * that a client controls. Four hours is longer than anyone should sit, and
 * short enough that a typo cannot lock somebody's room out for a week.
 */

/** The lengths the buttons offer. */
export const FOCUS_PRESETS = [25, 45, 60, 90] as const;

export const MIN_FOCUS_MINUTES = 10;
export const MAX_FOCUS_MINUTES = 240;

/** What the user is told when they ask for something shorter than the minimum. */
export const TOO_SHORT_MESSAGE =
  `Give it at least ${MIN_FOCUS_MINUTES} minutes. Anything shorter and the lights ` +
  'barely have time to go out.';

/** What the user is told when a session is already running. */
export const ALREADY_FOCUSING_MESSAGE =
  'Something is already being worked on. Finish it, or step away from it, before ' +
  'starting something else.';

/**
 * What the user is told when they try to start one from a park.
 *
 * Says where they are and what to do about it, because there is exactly one
 * thing to do about it. A message that only reported the refusal would leave
 * somebody pressing the same button in the same park.
 */
export const IN_A_PARK_MESSAGE =
  'You are still out in a park. Come home first — an hour with the lights off is ' +
  'not much use somewhere people can walk up to you.';
