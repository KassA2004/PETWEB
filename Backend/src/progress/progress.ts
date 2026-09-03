/**
 * Progress — what a user has actually done, as three numbers.
 *
 * The rewarding system used to be one thing: the creature likes you more when
 * you follow through and less when you do not. That is a *feeling*, it is
 * deliberately never shown as a number (`affection.ts`), and it cannot be the
 * whole of a reward system for the same reason a mood cannot be a receipt —
 * nothing about it accumulates, so nothing about it can be spent.
 *
 * These three accumulate:
 *
 * ```text
 *   focusMinutes    minutes served. Written by FocusService.seal
 *   goalsCompleted  goals finished. Written by GoalsService.complete/reopen
 *   memoriesShared  memories public right now. Written by MemoriesService,
 *                   and by GoalsService.complete when a completion publishes
 * ```
 *
 * This module is the vocabulary and nothing else: the shape a stat block has,
 * the columns it is read from, and the one function that turns "the user did
 * another 45 minutes" into a Prisma update fragment. It holds no service and
 * touches no client, so the four places that write a counter all write it the
 * same way, and the two places that read one read the same columns.
 *
 * ## Why there is no ProgressService
 *
 * Every one of these numbers changes as a *consequence* of something else, and
 * therefore belongs in that thing's transaction — exactly the argument
 * `AffectionService.apply` is built on. A service of its own would either be a
 * second `user.update` in transactions that already have one (two writes to one
 * row, for one event), or a wrapper somebody would eventually call outside the
 * transaction. So the increments ride along with the affection write that is
 * already happening, and `AffectionService.apply` takes a `progress` patch.
 *
 * The two writes that are *not* about affection — a memory being published or
 * taken back — go through `progressUpdate` directly, because nothing about
 * sharing a photograph should move how the creature feels about you.
 */

import type { Prisma } from '@prisma/client';

/**
 * The metrics an unlock can be measured against.
 *
 * The client has the same three names in `lib/progress.ts`, and that is the
 * one thing duplicated between the two sides. It is a vocabulary rather than a
 * rule: the *thresholds* live only in the client's object catalog (see the note
 * on `ObjectTraits.unlock`), and the *values* live only here.
 */
export const PROGRESS_METRICS = [
  'focusMinutes',
  'goalsCompleted',
  'memoriesShared',
] as const;

export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

/**
 * What a user has done, as the API hands it back.
 *
 * Shown to the user on their own room panel, and to anybody who visits them on
 * the stats tab — the same three numbers either way, which is the point. There
 * is nothing private in here: how long somebody has focused is the kind of fact
 * this product is *about*, and a stat that could not be shown to a visitor
 * would have no business gating a chair either.
 */
export type UserProgress = Record<ProgressMetric, number>;

/** The columns a stat block is read from. One place, so no read forgets one. */
export const PROGRESS_SELECT = {
  focusMinutes: true,
  goalsCompleted: true,
  memoriesShared: true,
} as const;

/** How much each counter moves. Absent means "leave that one alone". */
export type ProgressDelta = Partial<Record<ProgressMetric, number>>;

/**
 * A progress patch, as Prisma update data.
 *
 * `increment` rather than a read-then-write, and that is the entire concurrency
 * story: two tabs finishing two different goals at the same instant both add
 * one, because the arithmetic happens in the database rather than in whichever
 * process read the row first.
 *
 * Zeroes are dropped rather than written, so a caller can hand this an empty
 * delta and get an empty patch — which is what lets `AffectionService.apply`
 * spread it unconditionally.
 */
export function progressUpdate(delta: ProgressDelta): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};

  for (const metric of PROGRESS_METRICS) {
    const by = delta[metric];
    if (by) data[metric] = { increment: by };
  }

  return data;
}

/**
 * Whatever came out of the row, as three numbers.
 *
 * Clamped at zero on the way out rather than trusting the column. The one
 * counter that can be decremented is `goalsCompleted`, and `decrement` has no
 * floor in SQL — a row that somehow went negative should read as zero to a
 * visitor rather than as a bug on somebody's profile.
 */
export function toProgress(row: UserProgress): UserProgress {
  return {
    focusMinutes: Math.max(0, row.focusMinutes),
    goalsCompleted: Math.max(0, row.goalsCompleted),
    memoriesShared: Math.max(0, row.memoriesShared),
  };
}
