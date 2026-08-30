import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { PublicPetView } from '../users/users.service';

/** A friend, as the list shows them: a name and the creature they look after. */
export interface FriendView {
  userId: string;
  username: string;
  pet: PublicPetView | null;
  /** When the friendship started. */
  since: string;
}

/** A request that has not been answered yet. */
export interface FriendRequestView {
  id: string;
  /** The other person — the one who asked, or the one who was asked. */
  userId: string;
  username: string;
  pet: PublicPetView | null;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface FriendsView {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

/**
 * How many friendships one account may hold.
 *
 * A bound rather than a feature: every list query in this file is `take`-ed,
 * per the Performance Rules ("every list query has a bound"), and an
 * unbounded friend list is the query that gets slow first for exactly the
 * accounts you least want to be slow for.
 */
const FRIEND_LIMIT = 200;

/**
 * Friendships.
 *
 * One row, two people, three states (`friendship.prisma`). Everything
 * interesting about this service is what it refuses:
 *
 *   yourself            a self-friendship is a row that breaks every query
 *                       written as "the other one"
 *   a duplicate         the unique constraint refuses it; this service turns
 *                       that refusal into a sentence
 *   the same request    twice — pending stays pending rather than becoming two
 *   somebody else's     accepting a request needs to be the *addressee*, and
 *   accept              the check is in the `where`, not after the read
 *   a re-ask after no   the declined row survives, which is what stops a
 *                       refusal being a thing you can send again every minute
 *
 * The one behaviour worth reading twice is the crossing case: A asks B while B
 * is asking A. Two rows would exist and neither would be a friendship. So
 * `request` looks for the opposite direction *first*, and if it finds a pending
 * one it accepts it — which is also what both people meant.
 */
@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Everything about who this user knows, in one call.
   *
   * One query for the rows and one for the people on them — never one per row.
   * The interface needs all three lists at once (friends, who is waiting for
   * an answer, who has not answered yet), so splitting them into three
   * endpoints would only make the client fire three requests to draw one panel.
   */
  async list(userId: string): Promise<FriendsView> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: { in: ['pending', 'accepted'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: FRIEND_LIMIT,
      select: {
        id: true,
        requesterId: true,
        addresseeId: true,
        status: true,
        createdAt: true,
        acceptedAt: true,
      },
    });

    if (rows.length === 0) return { friends: [], incoming: [], outgoing: [] };

    const others = rows.map((row) =>
      row.requesterId === userId ? row.addresseeId : row.requesterId,
    );

    // One query for every person on every row, rather than a join per row.
    const [names, pets] = await Promise.all([
      this.users.namesOf(others),
      this.users.petsOf(others),
    ]);

    const view: FriendsView = { friends: [], incoming: [], outgoing: [] };

    for (const row of rows) {
      const other = row.requesterId === userId ? row.addresseeId : row.requesterId;
      const username = names.get(other);
      // An account deleted between the two queries. Skipping it is better than
      // rendering a friend with no name.
      if (!username) continue;

      const pet = pets.get(other) ?? null;

      if (row.status === 'accepted') {
        view.friends.push({
          userId: other,
          username,
          pet,
          since: (row.acceptedAt ?? row.createdAt).toISOString(),
        });
        continue;
      }

      const request: FriendRequestView = {
        id: row.id,
        userId: other,
        username,
        pet,
        direction: row.requesterId === userId ? 'outgoing' : 'incoming',
        createdAt: row.createdAt.toISOString(),
      };

      if (request.direction === 'incoming') view.incoming.push(request);
      else view.outgoing.push(request);
    }

    view.friends.sort((a, b) => a.username.localeCompare(b.username));
    return view;
  }

  /**
   * Ask somebody to be friends.
   *
   * Takes a *username*, because that is what the person asking actually has —
   * they typed it into a search box. Resolving it here rather than accepting an
   * id from the client is also the safer shape: there is no id to guess at.
   */
  async requestByUsername(userId: string, username: string): Promise<FriendsView> {
    return this.request(userId, await this.users.idForUsername(username));
  }

  /**
   * Ask somebody to be friends, by id.
   *
   * Five outcomes, and the order they are checked in is the design:
   *
   *   1. yourself                     refused
   *   2. they already asked me        accept theirs — which is what we both meant
   *   3. we are already friends       nothing to do, reported as such
   *   4. I already asked              nothing to do; a second press is not a
   *                                   second request
   *   5. otherwise                    a new pending row
   *
   * The whole thing runs in one transaction, so two tabs pressing Add at the
   * same instant cannot make two rows — and if they somehow race past the
   * transaction, the unique constraint refuses the second one anyway and the
   * `P2002` is translated into "already asked" rather than a 500.
   */
  async request(userId: string, targetId: string): Promise<FriendsView> {
    if (userId === targetId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.FRIENDSHIP_INVALID,
        'You are already your own best friend.',
      );
    }

    // Confirms the account exists before writing a row that points at it.
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.friendship.findFirst({
          where: {
            OR: [
              { requesterId: userId, addresseeId: targetId },
              { requesterId: targetId, addresseeId: userId },
            ],
          },
        });

        if (!existing) {
          await tx.friendship.create({
            data: { requesterId: userId, addresseeId: targetId },
          });
          return;
        }

        if (existing.status === 'accepted') return;

        const theirs = existing.requesterId === targetId;

        if (existing.status === 'pending') {
          // They asked first and we are answering by asking back. Accepting is
          // both correct and what the user expects to happen.
          if (theirs) {
            await tx.friendship.update({
              where: { id: existing.id },
              data: { status: 'accepted', acceptedAt: new Date() },
            });
          }
          // Ours already: a second press changes nothing.
          return;
        }

        // Declined. Whose refusal it was decides what happens now.
        if (theirs) {
          // *They* asked, *we* said no, and now we are asking. Reusing the row
          // in our direction is the honest record of that.
          await tx.friendship.update({
            where: { id: existing.id },
            data: {
              requesterId: userId,
              addresseeId: targetId,
              status: 'pending',
              acceptedAt: null,
            },
          });
          return;
        }

        // We asked, they said no. That answer stands.
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.FRIENDSHIP_INVALID,
          'That request was already answered.',
        );
      });
    } catch (error) {
      // Two requests racing past the transaction into the unique constraint.
      // The second one is not an error the user caused, and the state they
      // wanted is the state they now have.
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!duplicate) throw error;
    }

    return this.list(userId);
  }

  /**
   * Say yes.
   *
   * Scoped in the `where` rather than fetched-and-checked: only the addressee
   * of a *pending* row can accept it, so a request that is not yours, or is not
   * pending any more, updates nothing and is reported as gone. There is no
   * version of this that forgets the check.
   */
  async accept(userId: string, friendshipId: string): Promise<FriendsView> {
    const updated = await this.prisma.friendship.updateMany({
      where: { id: friendshipId, addresseeId: userId, status: 'pending' },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    if (updated.count === 0) {
      throw new NotFoundException('That request is no longer waiting for an answer.');
    }

    return this.list(userId);
  }

  /** Say no. Same scoping as `accept`; the row survives, refused. */
  async decline(userId: string, friendshipId: string): Promise<FriendsView> {
    const updated = await this.prisma.friendship.updateMany({
      where: { id: friendshipId, addresseeId: userId, status: 'pending' },
      data: { status: 'declined', acceptedAt: null },
    });

    if (updated.count === 0) {
      throw new NotFoundException('That request is no longer waiting for an answer.');
    }

    return this.list(userId);
  }

  /**
   * Take a request back, or end a friendship.
   *
   * Deleted rather than marked, and this is the one place a row goes away. A
   * friendship somebody ended is not a refusal — there is nothing to protect
   * anybody from by remembering it — and either of them may ask again later,
   * which a surviving `declined` row would prevent.
   */
  async remove(userId: string, otherId: string): Promise<FriendsView> {
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
    });

    return this.list(userId);
  }

  /**
   * Are these two friends?
   *
   * The authorization question behind every direct message. One indexed read,
   * asked on the way in rather than trusted from a client that says "we are
   * friends, let me through".
   */
  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) return false;

    const found = await this.prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
      select: { id: true },
    });

    return found !== null;
  }

  /** Everybody this user is friends with, as ids. For presence fan-out. */
  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      take: FRIEND_LIMIT,
      select: { requesterId: true, addresseeId: true },
    });

    return rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));
  }
}
