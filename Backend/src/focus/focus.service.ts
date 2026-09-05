import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { FocusSession } from '@prisma/client';
import { AffectionService } from '../affection/affection.service';
import type { AffectionView } from '../affection/affection.service';
import { START_DELTA, abortDelta, completionDelta } from '../affection/affection';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { PARTICIPANT_STALE_MS } from '../parks/park-limits';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALREADY_FOCUSING_MESSAGE,
  IN_A_PARK_MESSAGE,
  MAX_FOCUS_MINUTES,
  MIN_FOCUS_MINUTES,
  TOO_SHORT_MESSAGE,
} from './durations';

export type FocusStatus = 'active' | 'completed' | 'aborted';

/** What the API hands back for one session. */
export interface FocusSessionView {
  id: string;
  /** Null only for a historical session whose goal has since been deleted. */
  goalId: string | null;
  durationMinutes: number;
  status: FocusStatus;
  startedAt: string;
  /** `startedAt + duration`, spelled out so no client has to do date arithmetic. */
  endsAt: string;
  endedAt: string | null;
  /**
   * How much longer, worked out here.
   *
   * The whole point of the endpoint. A browser's clock can be wrong by minutes
   * and its timers stop when the tab sleeps, so it is told a *duration from
   * now* rather than a deadline to compare its own clock against
   * (12-focus-endpoints.md section 5). Zero for anything no longer running.
   */
  remainingSeconds: number;
}

/** The room's whole picture of focus, in one request. */
export interface FocusStateView {
  /** The session still running, if there is one. */
  active: FocusSessionView | null;
  /**
   * A session that turned out to be over.
   *
   * The answer to "the laptop was shut for two hours": the server resolves it
   * as completed rather than resuming a timer that expired in the dark, and
   * hands it back here so the room can wake the creature up instead of
   * silently pretending nothing happened.
   */
  justFinished: FocusSessionView | null;
  affection: AffectionView;
}

const MINUTE_MS = 60 * 1000;

/**
 * Widened to the two fields it actually reads, rather than the full
 * `FocusSession`, so `activeGoalId` below can call it against a narrow
 * `select` instead of duplicating this arithmetic.
 */
function deadlineOf(session: Pick<FocusSession, 'startedAt' | 'durationMinutes'>): Date {
  return new Date(session.startedAt.getTime() + session.durationMinutes * MINUTE_MS);
}

const STATUSES: readonly FocusStatus[] = ['active', 'completed', 'aborted'];

function toView(session: FocusSession, now: Date): FocusSessionView {
  const endsAt = deadlineOf(session);
  const status = STATUSES.includes(session.status as FocusStatus)
    ? (session.status as FocusStatus)
    : 'aborted';

  return {
    id: session.id,
    goalId: session.goalId,
    durationMinutes: session.durationMinutes,
    status,
    startedAt: session.startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    remainingSeconds:
      status === 'active'
        ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000))
        : 0,
  };
}

/**
 * Focus sessions - the hour you said you would spend.
 *
 * Scoped like everything else here: every method takes the session user's id
 * first, nothing reads an owner from a body, and somebody else's session is a
 * 404 rather than a 403.
 *
 * Three rules live in this file because they cannot live in a browser:
 *
 * ```text
 *   the clock      startedAt + durationMinutes, read on the server, every
 *                  time. A client that says "I am done" when it is not gets
 *                  told how much is left rather than believed
 *   one slot       counted inside the transaction that inserts, exactly like
 *                  the six-goal cap. Two tabs cannot both start one
 *   the feeling    every ending moves affection in the same transaction that
 *                  records it, so a session cannot be filed without the
 *                  creature noticing
 *   nowhere else   a session cannot begin while its owner is standing in a
 *                  park. Do-not-disturb that other people can walk up to and
 *                  poke is not do-not-disturb (see `nowhereElse`)
 * ```
 */
@Injectable()
export class FocusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affection: AffectionService,
  ) {}

  /**
   * Everything the room needs to draw itself: what is running, what finished
   * while nobody was looking, and how the creature feels.
   *
   * Called on load, on reconnect and whenever the tab comes back, so it is
   * deliberately the only request the recovery path needs.
   */
  async current(ownerId: string, now = new Date()): Promise<FocusStateView> {
    const running = await this.prisma.focusSession.findFirst({
      where: { ownerId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });

    if (!running) {
      return {
        active: null,
        justFinished: null,
        affection: await this.affection.read(ownerId, now),
      };
    }

    if (deadlineOf(running).getTime() > now.getTime()) {
      return {
        active: toView(running, now),
        justFinished: null,
        affection: await this.affection.read(ownerId, now),
      };
    }

    // Its time is up. Resolve it as served rather than resuming it - the user
    // did not abandon anything, the tab was simply closed while the clock ran.
    const sealed = await this.seal(ownerId, running, now);
    return {
      active: null,
      justFinished: toView(sealed.session, now),
      affection: sealed.affection,
    };
  }

  /**
   * Commit to a stretch of time.
   *
   * The count and the insert share a transaction for the same reason the
   * six-goal cap's do: without one, a double-clicked confirm makes two sessions
   * and the room has two opinions about whether the lights are off.
   */
  async start(
    ownerId: string,
    input: { goalId: string; durationMinutes: number },
    now = new Date(),
  ): Promise<{ session: FocusSessionView; affection: AffectionView }> {
    const minutes = Math.round(input.durationMinutes);

    // Declared on the DTO as well; repeated here because the DTO protects the
    // HTTP route and this protects the rule.
    if (!Number.isFinite(minutes) || minutes < MIN_FOCUS_MINUTES) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        TOO_SHORT_MESSAGE,
      );
    }
    if (minutes > MAX_FOCUS_MINUTES) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        `A session cannot run longer than ${MAX_FOCUS_MINUTES / 60} hours.`,
      );
    }

    const goal = await this.prisma.goal.findFirst({
      where: { id: input.goalId, ownerId },
      select: { id: true, status: true },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    if (goal.status !== 'open') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'That one is already finished.',
      );
    }

    // Not from a park. Checked here as well as in the interface, because the
    // interface is one client: a second tab, a stale page or anything speaking
    // to the API directly would otherwise get a dark room it can still be
    // waved at from.
    await this.nowhereElse(ownerId, now);

    // Anything that expired while the user was away is resolved before the
    // slot is counted, or a session from last Tuesday blocks this morning's.
    await this.current(ownerId, now);

    const created = await this.prisma.$transaction(async (tx) => {
      const running = await tx.focusSession.findFirst({
        where: { ownerId, status: 'active' },
      });

      if (running) {
        // A repeat of the request that just succeeded - a double-click, or a
        // retry after a response nobody saw. Hand back the session it made
        // rather than refusing something the user did not ask for twice.
        if (running.goalId === input.goalId) return running;

        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.FOCUS_IN_PROGRESS,
          ALREADY_FOCUSING_MESSAGE,
        );
      }

      const session = await tx.focusSession.create({
        data: {
          ownerId,
          goalId: goal.id,
          durationMinutes: minutes,
          status: 'active',
          startedAt: now,
        },
      });

      // Turning up counts for a little. Not as follow-through: promising is
      // not doing, and the silence clock only resets when something is served.
      await this.affection.apply(tx, ownerId, START_DELTA, { now });

      return session;
    });

    return {
      session: toView(created, now),
      affection: await this.affection.read(ownerId, now),
    };
  }

  /**
   * The countdown reached zero.
   *
   * Checked rather than believed. If the client's clock ran fast the answer
   * carries the real remaining time, so the interface can resynchronise and
   * carry on waiting instead of showing an error for something that is not
   * wrong - the browser was simply early.
   */
  async complete(
    ownerId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<{ session: FocusSessionView; affection: AffectionView }> {
    const session = await this.owned(ownerId, sessionId);

    if (session.status !== 'active') {
      // Already filed. Retrying is fine and changes nothing.
      return {
        session: toView(session, now),
        affection: await this.affection.read(ownerId, now),
      };
    }

    const remainingMs = deadlineOf(session).getTime() - now.getTime();
    if (remainingMs > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.FOCUS_NOT_FINISHED,
        `${Math.ceil(remainingMs / 1000)} seconds still to go.`,
      );
    }

    const sealed = await this.seal(ownerId, session, now);
    return { session: toView(sealed.session, now), affection: sealed.affection };
  }

  /**
   * Stopping early.
   *
   * Deliberately not a failure state. The session is recorded as `aborted` and
   * the creature is a little put out, and that is the end of it - no warning,
   * no confirmation, and nothing kept to hold against the user beyond the
   * three-day window `abortDelta` reads.
   */
  async abort(
    ownerId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<{ session: FocusSessionView; affection: AffectionView }> {
    const session = await this.owned(ownerId, sessionId);

    if (session.status !== 'active') {
      return {
        session: toView(session, now),
        affection: await this.affection.read(ownerId, now),
      };
    }

    const stopped = await this.prisma.$transaction(async (tx) => {
      // The status guard is the whole of "this only happens once": two tabs
      // both pressing stop means one update matches and the other does not, so
      // the affection is only charged for by whichever got there first.
      const claimed = await tx.focusSession.updateMany({
        where: { id: sessionId, ownerId, status: 'active' },
        data: { status: 'aborted', endedAt: now },
      });

      if (claimed.count > 0) {
        // The row just written is inside the window and counts itself, so the
        // number handed to `abortDelta` is how many came *before* this one.
        const window = await this.affection.recentAborts(tx, ownerId, now);
        await this.affection.apply(tx, ownerId, abortDelta(Math.max(0, window - 1)), {
          now,
        });
      }

      return tx.focusSession.findUniqueOrThrow({ where: { id: sessionId } });
    });

    return {
      session: toView(stopped, now),
      affection: await this.affection.read(ownerId, now),
    };
  }

  /**
   * Which goal is being worked on right now, if any.
   *
   * Asked by `GoalsService` before it lets a goal be finished, reopened or
   * deleted. Not a courtesy: a goal deleted out from under a running session
   * leaves the room dark with nothing in the slot, and the user with no way to
   * turn the lights back on except by waiting.
   *
   * Deliberately does not go through `current()`. That method builds the room's
   * whole picture — including an affection read that can write back a settled
   * value — and the only caller of this one wants a goal id. A session whose time
   * ran out is *not* active, which is the same answer `current()` gives, reached
   * without touching the user row.
   */
  async activeGoalId(ownerId: string, now = new Date()): Promise<string | null> {
    const running = await this.prisma.focusSession.findFirst({
      where: { ownerId, status: 'active' },
      orderBy: { startedAt: 'desc' },
      select: { goalId: true, startedAt: true, durationMinutes: true },
    });

    if (!running) return null;

    // Expired but not yet sealed: `current()` will seal it on the next read. It
    // is not blocking anything in the meantime.
    if (deadlineOf(running).getTime() <= now.getTime()) return null;

    return running.goalId;
  }

  /**
   * File a session as served, and pay for it.
   *
   * `endedAt` is the deadline rather than the moment this ran: the time was
   * finished when it was finished, not when a browser got round to mentioning
   * it, and a session resolved four hours late must not read as a four-hour
   * session.
   */
  private async seal(
    ownerId: string,
    session: FocusSession,
    now: Date,
  ): Promise<{ session: FocusSession; affection: AffectionView }> {
    const endedAt = deadlineOf(session);

    const sealed = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.focusSession.updateMany({
        where: { id: session.id, ownerId, status: 'active' },
        data: { status: 'completed', endedAt },
      });

      // Somebody else got there first - two tabs, or a reload racing the
      // countdown. The session ends up completed either way; what must not
      // happen twice is the affection - nor, now, the minutes. The claim is
      // what makes both exactly-once: whichever request lost the race updated
      // zero rows and adds nothing.
      if (claimed.count > 0) {
        await this.affection.apply(
          tx,
          ownerId,
          completionDelta(session.durationMinutes),
          {
            followedThrough: true,
            now,
            // The minutes *committed to*, which for a sealed session are the
            // minutes served: `endedAt` is the deadline, not the moment the
            // browser mentioned it, so a session resolved four hours late
            // still banks the twenty-five it was.
            progress: { focusMinutes: session.durationMinutes },
          },
        );
      }

      return tx.focusSession.findUniqueOrThrow({ where: { id: session.id } });
    });

    return { session: sealed, affection: await this.affection.read(ownerId, now) };
  }

  /** Somebody's own session, or 404. Scoped in the query, never checked after. */
  /**
   * Refuse a session that would start somewhere other than the user's own room.
   *
   * The whole of the hour is that nothing can reach you: the lights go out, the
   * creature goes to bed, and the room stops answering the pointer
   * (`PetRoom.pointerDown` returns early while `focused`). A park is the one
   * place in the product where that promise cannot be kept — the world column
   * is showing a lawn with other people's creatures on it, they can be walked
   * up to and greeted, and chat keeps arriving. Beginning an hour of
   * do-not-disturb from in there is not a session; it is a dark timer over a
   * conversation.
   *
   * Membership is read with the sweeper's own staleness window rather than as a
   * bare row check, so "in a park" means the same thing here as it does to the
   * thing that empties the seats (`ParkParticipant.lastSeenAt`). A row left
   * behind by a killed tab must not lock somebody out of focusing for the two
   * minutes it takes the sweeper to notice.
   */
  private async nowhereElse(ownerId: string, now: Date): Promise<void> {
    const standing = await this.prisma.parkParticipant.findFirst({
      where: {
        userId: ownerId,
        lastSeenAt: { gt: new Date(now.getTime() - PARTICIPANT_STALE_MS) },
      },
      select: { id: true },
    });

    if (!standing) return;

    throw new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.IN_A_PARK,
      IN_A_PARK_MESSAGE,
    );
  }

  private async owned(ownerId: string, sessionId: string): Promise<FocusSession> {
    const session = await this.prisma.focusSession.findFirst({
      where: { id: sessionId, ownerId },
    });

    if (!session) throw new NotFoundException('Session not found');
    return session;
  }
}
