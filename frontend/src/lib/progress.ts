/**
 * Progress, and what it unlocks.
 *
 * The vocabulary of the rewarding system, in one file with no imports, so that
 * every layer can speak it: the object catalog states requirements in it, the
 * room panel decides what is locked with it, the modal explains a lock with it,
 * and the stats tab prints somebody else's numbers with it.
 *
 * ## Why the creature liking you was not enough
 *
 * Affection was the whole of the reward, and affection is deliberately a
 * *feeling*: never shown as a number, decaying on its own, scaled so that the
 * same goal is worth less to a creature that already adores you. That is right
 * for a relationship and useless as a reward, because nothing about it
 * accumulates — a user who has focused for forty hours has exactly the same
 * creature as one who focused for four and did it recently, and there is
 * nothing anywhere in the product that says the forty happened.
 *
 * So three things now accumulate, and they buy furniture:
 *
 * ```text
 *   focusMinutes    time actually served. Abandoning a session banks nothing
 *   goalsCompleted  goals finished, less any reopened
 *   memoriesShared  memories currently public
 * ```
 *
 * All three are the server's numbers (`Backend/src/progress/progress.ts`) and
 * none of them can be moved by anything a client sends: they are written by the
 * code that seals a session, completes a goal and publishes a memory, inside
 * those transactions.
 *
 * ## Where a threshold lives
 *
 * On the object's own catalog row (`ObjectTraits.unlock`), and nowhere else —
 * the same rule the footprint follows. Adding a locked object is one field on
 * one row; there is no table of unlocks to keep in step with the catalog, and
 * therefore no way for the two to disagree about what a Bean Bag costs.
 */

/** The three things the product counts. */
export const PROGRESS_METRICS = [
  'focusMinutes',
  'goalsCompleted',
  'memoriesShared',
] as const;

export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

/** What a user has done. The server's numbers, never the client's. */
export type UserProgress = Record<ProgressMetric, number>;

/** Nothing done yet — the shape used before the first response arrives. */
export const NO_PROGRESS: UserProgress = {
  focusMinutes: 0,
  goalsCompleted: 0,
  memoriesShared: 0,
};

/** What an object asks of you before it will stand in your room. */
export interface UnlockRequirement {
  metric: ProgressMetric;
  /** How much of it. Always a whole number — these are counts and minutes. */
  amount: number;
}

interface MetricCopy {
  /** For a stats block: "Focused". */
  label: string;
  /** Reads after a number: "400 focus minutes". */
  unit: string;
  /** Reads after a number, when there is exactly one of them. */
  unitOne: string;
  /** How you get more. One sentence, shown in the locked modal. */
  how: string;
}

/**
 * The words for each metric, in one table.
 *
 * A table rather than a `switch` in each of the four places that needs words,
 * because four switches is four chances for the stats tab and the locked modal
 * to call the same number two different things.
 */
export const METRIC_COPY: Record<ProgressMetric, MetricCopy> = {
  focusMinutes: {
    label: 'Focused',
    unit: 'focus minutes',
    unitOne: 'focus minute',
    how: 'Time served in focus sessions. A session you walk away from banks nothing.',
  },
  goalsCompleted: {
    label: 'Goals done',
    unit: 'goals',
    unitOne: 'goal',
    how: 'Goals you have finished. Reopening one takes it back off the tally.',
  },
  memoriesShared: {
    label: 'Shared',
    unit: 'memories shared',
    unitOne: 'memory shared',
    how: 'Memories you have made public, so anybody visiting your room can see them.',
  },
};

/** `"400 focus minutes"`, `"1 goal"`. What a requirement asks for, in words. */
export function describeRequirement(requirement: UnlockRequirement): string {
  const copy = METRIC_COPY[requirement.metric];
  return `${requirement.amount} ${requirement.amount === 1 ? copy.unitOne : copy.unit}`;
}

/**
 * A metric's value, as a person reads it.
 *
 * Minutes become hours once there are enough of them, because "1,284" is a
 * number and "21h 24m" is an afternoon. Everything else is a count and stays
 * one — "3 goals" does not want a unit conversion.
 */
export function formatMetric(metric: ProgressMetric, value: number): string {
  if (metric !== 'focusMinutes') return String(value);
  if (value < 60) return `${value}m`;

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Whether this requirement is met. The single answer to "is it locked?". */
export function meetsRequirement(
  progress: UserProgress,
  requirement: UnlockRequirement,
): boolean {
  return progress[requirement.metric] >= requirement.amount;
}

/** How far along, 0..1, for a bar. Clamped so a met requirement reads as full. */
export function requirementFraction(
  progress: UserProgress,
  requirement: UnlockRequirement,
): number {
  if (requirement.amount <= 0) return 1;
  return Math.max(0, Math.min(1, progress[requirement.metric] / requirement.amount));
}
