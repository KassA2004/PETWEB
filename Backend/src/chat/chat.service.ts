import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { DIRECT_MESSAGE_MAX_LENGTH } from '../parks/park-limits';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { UsersService } from '../users/users.service';
import type { PublicPetView } from '../users/users.service';

/** A thread in the conversation list. */
export interface ConversationView {
  id: string;
  /** The other person. A conversation is never listed from its own side. */
  userId: string;
  username: string;
  pet: PublicPetView | null;
  lastMessageAt: string;
  /** The last thing said, for the list. Null for a thread with no messages. */
  preview: string | null;
}

/** One message. */
export interface DirectMessageView {
  id: string;
  conversationId: string;
  senderId: string;
  /** Who it is with — the *other* person, whichever way it was sent. */
  withUserId: string;
  body: string;
  createdAt: string;
}

const HISTORY_LIMIT = 50;
const CONVERSATION_LIMIT = 50;

/**
 * Direct messages between friends.
 *
 * Three decisions, and they are the whole design:
 *
 * **Friends only.** `areFriends` is asked before a row is written, every time,
 * of the database rather than of anything the client said. The product has no
 * blocking model and no report queue, and "anyone may message anyone" without
 * either of those is not a feature, it is an inbox somebody has to moderate.
 * A friendship is the consent.
 *
 * **The thread is a row, and the pair on it is ordered.** `Conversation`
 * stores the smaller uuid in `userAId`, so A messaging B and B messaging A at
 * the same instant resolve to the same row rather than to two threads neither
 * person can see the other half of (`conversation.prisma`).
 *
 * **History is REST, delivery is a socket.** Nothing here polls, and nothing
 * here is the source of truth for what was said — the rows are. A client that
 * was offline asks for the page it missed; a client that is connected is
 * pushed the row that was just written. Same data, two ways of arriving, one
 * place it lives.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly users: UsersService,
  ) {}

  /**
   * Every thread this user has, newest activity first.
   *
   * One query for the threads, one for the last message of each, one for the
   * people — three queries for the whole list rather than three per row.
   */
  async conversations(userId: string): Promise<ConversationView[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { lastMessageAt: 'desc' },
      take: CONVERSATION_LIMIT,
      select: {
        id: true,
        userAId: true,
        userBId: true,
        lastMessageAt: true,
        // The last line, for the list. `take: 1` per row is Prisma's own
        // batched relation load — one extra query for the page, not one per
        // conversation.
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true },
        },
      },
    });

    if (rows.length === 0) return [];

    const others = rows.map((row) => (row.userAId === userId ? row.userBId : row.userAId));
    const [names, pets] = await Promise.all([
      this.users.namesOf(others),
      this.users.petsOf(others),
    ]);

    return rows.flatMap((row) => {
      const other = row.userAId === userId ? row.userBId : row.userAId;
      const username = names.get(other);
      if (!username) return [];

      return [
        {
          id: row.id,
          userId: other,
          username,
          pet: pets.get(other) ?? null,
          lastMessageAt: row.lastMessageAt.toISOString(),
          preview: row.messages[0]?.body ?? null,
        },
      ];
    });
  }

  /**
   * What was said with one person.
   *
   * Authorization is the *pair*, resolved from the session user and the person
   * named in the path — there is no conversation id in the request at all, so
   * there is nothing to guess at and nothing to check afterwards. A thread that
   * does not exist yet is an empty list rather than a 404: opening a chat with
   * a friend you have never messaged is the ordinary case.
   */
  async history(
    userId: string,
    otherId: string,
    before?: string,
  ): Promise<DirectMessageView[]> {
    if (!(await this.friends.areFriends(userId, otherId))) {
      throw new NotFoundException('No conversation with that user.');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { userAId_userBId: pairKey(userId, otherId) },
      select: { id: true },
    });

    if (!conversation) return [];

    const cursor = before
      ? await this.prisma.directMessage.findFirst({
          where: { id: before, conversationId: conversation.id },
          select: { createdAt: true },
        })
      : null;

    const rows = await this.prisma.directMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { id: true, senderId: true, body: true, createdAt: true },
    });

    return rows
      .map((row) => ({
        id: row.id,
        conversationId: conversation.id,
        senderId: row.senderId,
        withUserId: otherId,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      }))
      .reverse();
  }

  /**
   * Send a message.
   *
   * The friendship check, the thread lookup-or-create and the insert are one
   * transaction, so two people messaging each other for the first time at the
   * same instant cannot make two threads — and if they race past it anyway, the
   * unique constraint on the ordered pair refuses the second, which is retried
   * as a plain insert into the winner's thread.
   *
   * Returns the stored row, not the text that came in. What the sender sees
   * echoed back is what everybody else will read out of the database, including
   * the trim and the cap.
   */
  async send(
    senderId: string,
    recipientId: string,
    body: string,
  ): Promise<DirectMessageView> {
    const text = body.trim().slice(0, DIRECT_MESSAGE_MAX_LENGTH);

    if (!text) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'Nothing to send.',
      );
    }

    if (senderId === recipientId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.FRIENDSHIP_INVALID,
        'You cannot message yourself.',
      );
    }

    // Asked of the database, before anything is written, every time. A socket
    // that was connected while a friendship was ended must not keep talking
    // through it.
    if (!(await this.friends.areFriends(senderId, recipientId))) {
      throw new NotFoundException('No conversation with that user.');
    }

    const key = pairKey(senderId, recipientId);
    const now = new Date();

    // The upsert returns the thread it settled on, and the insert is built
    // from that — never a third query asking which thread we just used
    // (Performance Rules: "never re-read what you just wrote").
    const { conversationId, message } = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { userAId_userBId: key },
        create: { ...key, lastMessageAt: now },
        update: { lastMessageAt: now },
        select: { id: true },
      });

      return {
        conversationId: conversation.id,
        message: await tx.directMessage.create({
          data: { conversationId: conversation.id, senderId, body: text },
          select: { id: true, senderId: true, body: true, createdAt: true },
        }),
      };
    });

    return {
      id: message.id,
      conversationId,
      senderId: message.senderId,
      withUserId: recipientId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

/**
 * The ordered pair a conversation is keyed by.
 *
 * Lexicographic on the uuid, which is arbitrary and that is exactly the point:
 * any total order works, and what matters is that both callers compute the same
 * one. This function is the only place the order is decided.
 */
function pairKey(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}
