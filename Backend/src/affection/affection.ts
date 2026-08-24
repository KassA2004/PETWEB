/**
 * How the creature feels about you, as arithmetic.
 *
 * Pure functions and one table of numbers. No Prisma, no clock of its own —
 * every function takes `now`, which is what makes "what will three weeks away
 * do to this?" a question you can answer in a script instead of by waiting
 * three weeks.
 *
 * The shape of the thing, and the reasoning behind each number:
 *
 * ```text
 *   0 ─────────── 0.5 ─────────── 1
 *   wary        neutral       devoted
 *
 *   starting a session    +0.012   turning up counts, barely
 *   finishing one         +0.03..0.06 by length
 *   finishing a goal      +0.09    the only event worth a visible jump
 *   abandoning one        -0.03, worse if it keeps happening
 *   a long silence        -0.02/day after ten days, and never below 0.22
 * ```
 *
 * Three rules the numbers exist to keep, from the brief:
 *
 * **Nothing swings it hard.** The largest single event moves it by under a
 * tenth, so no one action can carry the relationship and no one mistake can
 * ruin it. Crossing a band takes several days of actually doing the thing.
 *
 * **It is driven by follow-through, not by attendance.** There is no event here
 * for opening the page, clicking the creature, or decorating the room. Every
 * one of the five is something the user *committed to and then did or did not
 * do*, which is the only signal the brief considers honest.
 *
 * **A break is not neglect.** Decay does not start for ten days and then bottoms
 * out at "low" rather than at zero. Somebody who goes on holiday comes back to a
 * creature that is a bit reserved, not to one that hates them — the difference
 * between "you were away" and "you kept promising and leaving", which is what
 * the abort rule is for.
 */

/** The bands, low to high. `from` is inclusive; the first is the floor. */
export const AFFECTION_LEVELS = [
  { id: 'very-low', from: 0 },
  { id: 'low', from: 0.2 },
  { id: 'neutral', from: 0.38 },
  { id: 'happy', from: 0.56 },
  { id: 'affectionate', from: 0.74 },
  { id: 'very-affectionate', from: 0.9 },
] as const;

export type AffectionLevel = (typeof AFFECTION_LEVELS)[number]['id'];

/** Where a new account starts: neutral, because nothing has happened yet. */
export const DEFAULT_AFFECTION = 0.5;

/** Days of silence forgiven before anything at all happens. */
const GRACE_DAYS = 10;
/** How much a day of silence costs once the grace period is over. */
const DECAY_PER_DAY = 0.02;
/** Neglect stops here. Low, never hostile — the creature is sulking, not gone. */
const DECAY_FLOOR = 0.22;

/** How far back "keeps committing and bailing" looks. */
export const ABORT_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export const clampAffection = (value: number): number =>
  !Number.isFinite(value) ? DEFAULT_AFFECTION : Math.max(0, Math.min(1, value));

/** Which band a value falls in. */
export function levelOf(value: number): AffectionLevel {
  const clamped = clampAffection(value);
  let level: AffectionLevel = AFFECTION_LEVELS[0].id;
  for (const band of AFFECTION_LEVELS) {
    if (clamped >= band.from) level = band.id;
  }
  return level;
}

/**
 * Apply a change with diminishing returns at both ends.
 *
 * A flat `+0.05` is wrong twice: near the top it makes the last stretch as easy
 * as the first, and near the bottom it makes a single bad week unrecoverable.
 * Scaling each direction by how much room is left in it gives a curve that
 * approaches both ends without reaching them — a creature can always be won
 * back, and can never be finished with.
 */
export function applyDelta(value: number, delta: number): number {
  const current = clampAffection(value);
  const room = delta > 0 ? 1 - current : current;
  return clampAffection(current + delta * (0.35 + 0.65 * room));
}

/* -------------------------------------------------------------------------- */
/* The five events                                                            */
/* -------------------------------------------------------------------------- */

/** Committing to a stretch of time. Small: the promise is not the thing. */
export const START_DELTA = 0.012;

/**
 * Serving the time you said you would.
 *
 * Scaled by the length of it, gently. Ninety minutes is worth roughly twice
 * twenty-five, not four times — the point is that you sat down, and a product
 * that paid strictly by the minute would be asking people to bid.
 */
export function completionDelta(durationMinutes: number): number {
  const minutes = Math.max(0, Math.min(240, durationMinutes));
  return 0.03 + Math.min(0.03, (minutes / 90) * 0.03);
}

/** Finishing the thing itself. The largest event in the product, and still small. */
export const GOAL_DELTA = 0.09;

/**
 * Walking away from a session.
 *
 * The first one is barely anything — stopping is allowed, and a product that
 * punished it would be teaching people not to start. What costs is the
 * *pattern*: each abort in the last few days makes the next one land harder,
 * up to a ceiling that is still smaller than finishing one goal.
 *
 * @param recentAborts how many others there have been inside ABORT_WINDOW_DAYS,
 *   not counting this one.
 */
export function abortDelta(recentAborts: number): number {
  return -Math.min(0.09, 0.03 + Math.max(0, recentAborts) * 0.015);
}

/**
 * What silence has done since the value was last settled.
 *
 * Returns the new value, unchanged when inside the grace period. Both
 * timestamps matter and they are not the same: the decay is *measured* from the
 * last follow-through (that is what makes it a response to absence) but only
 * *charged* for the days since it was last applied, so reading twice in a row
 * does not bill twice.
 */
export function decayed(
  value: number,
  lastFollowThroughAt: Date | null,
  affectionAt: Date,
  now: Date,
): number {
  const current = clampAffection(value);
  if (current <= DECAY_FLOOR) return current;

  // Nothing has ever been followed through on. There is no absence to punish —
  // a brand-new account has not let anybody down.
  if (!lastFollowThroughAt) return current;

  const silentDays = (now.getTime() - lastFollowThroughAt.getTime()) / DAY_MS;
  if (silentDays <= GRACE_DAYS) return current;

  // Only the part of the silence that is both past the grace period and not
  // already paid for.
  const chargedFrom = Math.max(
    affectionAt.getTime(),
    lastFollowThroughAt.getTime() + GRACE_DAYS * DAY_MS,
  );
  const unbilledDays = (now.getTime() - chargedFrom) / DAY_MS;
  if (unbilledDays <= 0) return current;

  return Math.max(DECAY_FLOOR, current - unbilledDays * DECAY_PER_DAY);
}

/** The window `abortDelta` counts inside, as a date. */
export function abortWindowStart(now: Date): Date {
  return new Date(now.getTime() - ABORT_WINDOW_DAYS * DAY_MS);
}
