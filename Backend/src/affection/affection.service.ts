import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { progressUpdate } from '../progress/progress';
import type { ProgressDelta } from '../progress/progress';
import {
  DEFAULT_AFFECTION,
  abortWindowStart,
  applyDelta,
  clampAffection,
  decayed,
  levelOf,
} from './affection';
import type { AffectionLevel } from './affection';

/** What the API hands back. The number is for the room; the band is for words. */
export interface AffectionView {
  /** 0..1. Drives how the creature behaves, and is never shown as a number. */
  value: number;
  level: AffectionLevel;
}

/** The columns this service owns, on whichever client or transaction is passed. */
type Client = PrismaService | Prisma.TransactionClient;

/**
 * The relationship, and the only thing allowed to write it.
 *
 * `affection.ts` next door holds the arithmetic and knows nothing about a
 * database; this holds the database and knows nothing about why 0.09 is the
 * right number for a finished goal. Keeping them apart is what lets the rules
 * be exercised in a script with a fake clock.
 *
 * Two things worth naming.
 *
 * **Decay is lazy, not scheduled.** Nothing ticks. The value is brought up to
 * date on the next read or write, from `affectionAt` and `lastFollowThroughAt`
 * — which means a user who does not visit for a month costs the product nothing
 * and still comes back to a creature that noticed.
 *
 * **Every mutation takes a transaction client.** Affection changes are always a
 * consequence of something else — a session ending, a goal being finished — and
 * they belong in that thing's transaction. A completion that recorded the
 * session but lost the feeling would be the worst kind of half-success.
 */
@Injectable()
export class AffectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The current value, with any decay settled first.
   *
   * Writes back when the value actually moved, so the next read has less to
   * work out — but never inside a read-only request's critical path in a way
   * the caller has to care about: if the write fails, the user still gets the
   * right number.
   */
  async read(ownerId: string, now = new Date()): Promise<AffectionView> {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { affection: true, affectionAt: true, lastFollowThroughAt: true },
    });

    if (!user) return view(DEFAULT_AFFECTION);

    const settled = decayed(
      user.affection,
      user.lastFollowThroughAt,
      user.affectionAt,
      now,
    );

    if (settled !== clampAffection(user.affection)) {
      await this.prisma.user.update({
        where: { id: ownerId },
        data: { affection: settled, affectionAt: now },
      });
    }

    return view(settled);
  }

  /**
   * Move it, inside somebody else's transaction.
   *
   * Decay is settled first, so a user coming back after a month gets the drift
   * *and then* the credit for what they just did, in that order. Doing it the
   * other way round would hand out a reward and immediately erode it.
   *
   * @param followedThrough true for the events that mean "I did the thing" —
   *   they reset the silence clock. Starting a session does not; promising is
   *   not doing, and a user who started six sessions and finished none has not
   *   followed through on anything.
   * @param progress what the same event did to the user's counters.
   *
   *   Carried here rather than written separately because every event that
   *   moves a counter already moves affection, in this transaction, against
   *   this row — so folding it into the same UPDATE is one statement instead of
   *   two, and makes "the session was counted but the creature did not notice"
   *   an impossible outcome rather than a rare one. See `progress/progress.ts`
   *   for the longer version of that argument.
   */
  async apply(
    tx: Client,
    ownerId: string,
    delta: number,
    options: {
      followedThrough?: boolean;
      now?: Date;
      progress?: ProgressDelta;
    } = {},
  ): Promise<AffectionView> {
    const now = options.now ?? new Date();

    const user = await tx.user.findUnique({
      where: { id: ownerId },
      select: { affection: true, affectionAt: true, lastFollowThroughAt: true },
    });

    if (!user) return view(DEFAULT_AFFECTION);

    const settled = decayed(
      user.affection,
      user.lastFollowThroughAt,
      user.affectionAt,
      now,
    );
    const next = applyDelta(settled, delta);

    await tx.user.update({
      where: { id: ownerId },
      data: {
        affection: next,
        affectionAt: now,
        ...(options.followedThrough ? { lastFollowThroughAt: now } : {}),
        ...progressUpdate(options.progress ?? {}),
      },
    });

    return view(next);
  }

  /**
   * How many sessions this user has walked away from lately.
   *
   * The input to `abortDelta`, and the whole of "accumulates if repeated". Read
   * inside the aborting transaction so two tabs cannot both see zero.
   */
  async recentAborts(tx: Client, ownerId: string, now = new Date()): Promise<number> {
    return tx.focusSession.count({
      where: {
        ownerId,
        status: 'aborted',
        endedAt: { gte: abortWindowStart(now) },
      },
    });
  }
}

function view(value: number): AffectionView {
  const clamped = clampAffection(value);
  return { value: clamped, level: levelOf(clamped) };
}
