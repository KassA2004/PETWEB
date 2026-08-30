import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Park } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { PublicPetView } from '../users/users.service';
import {
  EMPTY_PARK_GRACE_MS,
  MESSAGE_MAX_LENGTH,
  PARK_CAPACITY_MESSAGE,
  PARK_MAX_AGE_MS,
  PARK_MAX_CAPACITY,
  PARK_MIN_CAPACITY,
  PARTICIPANT_STALE_MS,
  SWEEP_INTERVAL_MS,
} from './park-limits';
import { hashPasscode, verifyPasscode } from './passcode';

/**
 * A park in a list.
 *
 * Built field by field. **There is no code path that spreads a `Park` row into
 * a response**, which is what guarantees `passcodeHash` cannot appear in one by
 * being forgotten about when a column is added later.
 */
export interface ParkView {
  id: string;
  name: string;
  hostId: string;
  hostUsername: string;
  capacity: number;
  /** True when a passcode is needed. Never *which* passcode. */
  isPrivate: boolean;
  /** How many creatures are in it right now. Counted, never claimed. */
  occupancy: number;
  createdAt: string;
}

/** Somebody in a park, as everybody else in it sees them. */
export interface ParkMemberView {
  userId: string;
  username: string;
  pet: PublicPetView | null;
  joinedAt: string;
}

/** One line of a park's chat. */
export interface ParkMessageView {
  id: string;
  parkId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: string;
}

/** What a successful join hands back. */
export interface ParkAdmission {
  park: ParkView;
  members: ParkMemberView[];
}

/** How many parks the list returns. Bounded, per the Performance Rules. */
const LIST_LIMIT = 40;

/** How many messages of history one request may ask for. */
const HISTORY_LIMIT = 50;

/**
 * Parks — temporary shared spaces, and the rules about getting into one.
 *
 * The four things this service exists to be the only answer to:
 *
 *   **capacity**   counted inside a transaction that has already taken a row
 *                  lock on the park (`joinPark`). This is the one piece of
 *                  concurrency in the feature that a naive implementation gets
 *                  wrong every time: count, see room, insert — and two requests
 *                  that both counted the second-to-last slot both insert.
 *
 *   **the passcode** a scrypt hash, verified here, never sent anywhere. A
 *                  client is told *that* a park is private and never anything
 *                  about its credential.
 *
 *   **membership** a row, not a socket. A socket is how you talk to a park; the
 *                  row is what says you are allowed to. The gateway asks this
 *                  service, and the service asks Postgres.
 *
 *   **the end**    `sweep()`. A park is over when nobody is in it, and "nobody
 *                  is in it" is decided by heartbeats going quiet rather than
 *                  by anyone remembering to say goodbye.
 */
@Injectable()
export class ParksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParksService.name);
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Sweep on boot, then on an interval.
   *
   * On boot specifically, and this is not decoration: a process that restarted
   * left every socket it was holding on the floor, so every participant row it
   * had is stale by definition. Without a boot sweep the first thing a
   * returning user sees is a list of parks that look busy and are empty.
   *
   * `unref()` so a sweeper cannot hold the process open at shutdown.
   */
  onModuleInit(): void {
    void this.sweep().catch((error) => this.logger.warn(`Boot sweep failed: ${error}`));

    this.sweeper = setInterval(() => {
      void this.sweep().catch((error) => this.logger.warn(`Sweep failed: ${error}`));
    }, SWEEP_INTERVAL_MS);

    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  // --- Discovery ------------------------------------------------------------

  /**
   * What is open.
   *
   * Private parks are listed — by name, host and occupancy, never by
   * credential — because a private park you cannot see is a private park you
   * cannot be invited into by somebody saying "it's called Tuesday".
   *
   * Empty parks inside their grace window are hidden rather than shown as
   * "0/6": a park whose host has not arrived yet is not somewhere to join.
   */
  async list(): Promise<ParkView[]> {
    const fresh = new Date(Date.now() - PARTICIPANT_STALE_MS);

    const parks = await this.prisma.park.findMany({
      where: { participants: { some: { lastSeenAt: { gte: fresh } } } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        name: true,
        hostId: true,
        capacity: true,
        visibility: true,
        createdAt: true,
        host: { select: { username: true } },
        _count: { select: { participants: true } },
      },
    });

    return parks.map((park) => ({
      id: park.id,
      name: park.name,
      hostId: park.hostId,
      hostUsername: park.host.username,
      capacity: park.capacity,
      isPrivate: park.visibility === 'private',
      occupancy: park._count.participants,
      createdAt: park.createdAt.toISOString(),
    }));
  }

  // --- Opening one ----------------------------------------------------------

  /**
   * Open a park.
   *
   * The row is created without a participant: joining is the socket's job, and
   * a park whose only membership was written by a REST call would show as
   * occupied by somebody who never connected. `EMPTY_PARK_GRACE_MS` is the
   * window that gap is allowed to take.
   *
   * A private park without a passcode is refused rather than silently made
   * public — a user who ticked "private" and lost their passcode to a
   * validation gap would have published a room they meant to close.
   */
  async create(
    hostId: string,
    input: { name: string; capacity: number; isPrivate: boolean; passcode?: string },
  ): Promise<ParkView> {
    const capacity = Math.trunc(input.capacity);

    if (capacity < PARK_MIN_CAPACITY || capacity > PARK_MAX_CAPACITY) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        PARK_CAPACITY_MESSAGE,
      );
    }

    if (input.isPrivate && !input.passcode?.trim()) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'A private park needs a passcode.',
      );
    }

    // Hashed before the insert, so a failure to hash never leaves a row whose
    // credential column is null and whose visibility says private — which is a
    // park anybody can walk into.
    const passcodeHash = input.isPrivate
      ? await hashPasscode(input.passcode!.trim())
      : null;

    const park = await this.prisma.park.create({
      data: {
        hostId,
        name: input.name.trim(),
        capacity,
        visibility: input.isPrivate ? 'private' : 'public',
        passcodeHash,
      },
      select: {
        id: true,
        name: true,
        hostId: true,
        capacity: true,
        visibility: true,
        createdAt: true,
        host: { select: { username: true } },
      },
    });

    return {
      id: park.id,
      name: park.name,
      hostId: park.hostId,
      hostUsername: park.host.username,
      capacity: park.capacity,
      isPrivate: park.visibility === 'private',
      occupancy: 0,
      createdAt: park.createdAt.toISOString(),
    };
  }

  // --- Getting in -----------------------------------------------------------

  /**
   * Take a slot in a park, or be told why not.
   *
   * **The concurrency-correct part, and the reason this is not three separate
   * queries.** Everything below happens inside one transaction that begins by
   * taking a row lock on the park:
   *
   * ```sql
   *   SELECT id, capacity, visibility, "passcodeHash" FROM "Park"
   *    WHERE id = $1 FOR UPDATE
   * ```
   *
   * That `FOR UPDATE` serializes every concurrent join *of this park* — and of
   * this park only, so two people entering two different parks never wait for
   * each other. Inside the lock, counting and inserting are safe, because no
   * other joiner can be between its own count and its own insert.
   *
   * Without the lock the sequence is: A counts 5 of 6, B counts 5 of 6, both
   * insert, and the park holds 7. That is not a rare interleaving — it is what
   * happens whenever two people click Join on the same nearly-full park, which
   * is precisely when they both would.
   *
   * The passcode is verified *outside* the transaction and before it, because
   * scrypt takes ~100 ms by design and holding a row lock across it would let
   * one wrong guess block everybody else's join. Verifying first is also
   * strictly safer: a wrong passcode never reaches the lock at all.
   *
   * Re-joining is not an error. A refresh, a reconnect and a second tab all
   * arrive here, and all of them should end up in the park they were already
   * in rather than being told it is full of themselves — hence the upsert on
   * `(parkId, userId)` in `takeSlot`, and the fact that a seat the caller
   * already holds is not counted against the capacity check beside it.
   *
   * The `existing` lookup below is **not** what makes that safe; it is only
   * what skips the passcode for somebody who has already satisfied it. Two
   * concurrent joins by the same user both read `null` here, which is why the
   * insert itself has to tolerate the collision rather than the read
   * preventing it.
   */
  async join(
    userId: string,
    parkId: string,
    passcode?: string,
  ): Promise<ParkAdmission> {
    const park = await this.prisma.park.findUnique({ where: { id: parkId } });
    if (!park) throw this.closed();

    // Already in it: a reconnect must not have to re-type a passcode it
    // already satisfied, and must not be refused by a capacity check that
    // counts the seat it is already sitting in.
    const existing = await this.prisma.parkParticipant.findUnique({
      where: { parkId_userId: { parkId, userId } },
      select: { id: true },
    });

    if (!existing) {
      await this.checkPasscode(park, passcode);
      await this.takeSlot(userId, park);
    }

    await this.touch(userId, parkId);

    return {
      park: await this.view(parkId),
      members: await this.members(parkId),
    };
  }

  /**
   * Take a slot, under the park's own row lock.
   *
   * Split out of `join` so the lock's scope is exactly the statements that need
   * it, and so the comment above it is about one thing.
   */
  private async takeSlot(userId: string, park: Park): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // The lock. Everything after this line is serialized per park.
      const locked = await tx.$queryRaw<{ id: string; capacity: number }[]>`
        SELECT "id", "capacity" FROM "Park" WHERE "id" = ${park.id}::uuid FOR UPDATE
      `;

      // Swept out from under us between the read above and this lock.
      if (locked.length === 0) throw this.closed();

      const [occupied, mine] = await Promise.all([
        tx.parkParticipant.count({ where: { parkId: park.id } }),
        tx.parkParticipant.findUnique({
          where: { parkId_userId: { parkId: park.id, userId } },
          select: { id: true },
        }),
      ]);

      // A seat this user already holds is not one they have to take again, so
      // it is not counted against them. Without this, somebody rejoining a full
      // park — a reconnect, a second tab — would be refused entry to a park
      // they are standing in, by a count that includes themselves.
      if (!mine && occupied >= locked[0].capacity) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.PARK_FULL,
          'That park is full. Try another, or open one of your own.',
        );
      }

      /*
       * An upsert, and it has to be one.
       *
       * The check outside this transaction ("are they already in?") and the
       * insert inside it are two statements with a gap between them, and the
       * same user can be in that gap twice at once: React's StrictMode runs an
       * effect twice on mount, a reconnect can race a reload, and two tabs are
       * two sockets. Both attempts saw no row; both inserted; the second got
       * `Unique constraint failed on (parkId, userId)` and the user was told
       * "Something went wrong" while standing in the park.
       *
       * `ON CONFLICT DO UPDATE` makes re-entry idempotent instead of a
       * collision, and the update doubles as a heartbeat — a client that has
       * just re-announced itself is unambiguously still there, so the sweeper
       * should not be counting down on it.
       */
      await tx.parkParticipant.upsert({
        where: { parkId_userId: { parkId: park.id, userId } },
        create: { parkId: park.id, userId },
        update: { lastSeenAt: new Date() },
      });
    });
  }

  /**
   * Verify a private park's passcode.
   *
   * Deliberately runs the KDF even when no passcode was supplied for a private
   * park? No — the opposite. A missing passcode is refused immediately, because
   * there is nothing to compare and the refusal reveals only what the list
   * already said (`isPrivate: true`). What is *not* revealed anywhere is
   * whether a supplied passcode was close, which is `verifyPasscode`'s
   * `timingSafeEqual`.
   */
  private async checkPasscode(park: Park, passcode?: string): Promise<void> {
    if (park.visibility !== 'private') return;

    const supplied = passcode?.trim();

    if (!supplied || !park.passcodeHash) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.PARK_PASSCODE_REQUIRED,
        'That park needs a passcode.',
      );
    }

    if (!(await verifyPasscode(supplied, park.passcodeHash))) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.PARK_PASSCODE_REQUIRED,
        "That passcode doesn't open this park.",
      );
    }
  }

  /**
   * Leave.
   *
   * `deleteMany` rather than `delete`, so leaving a park you are not in is a
   * no-op instead of an error — which is the common case, because this is
   * called on every disconnect including the ones where the socket had already
   * been swept.
   *
   * Returns whether anything was actually removed, and whether the park is now
   * empty — both so the gateway can act without a second query. `removed` is
   * false for the second of two calls about the same departure, which happens
   * routinely: the panel's Leave button and the component's unmount both say
   * goodbye, and a park should not announce one person leaving twice.
   */
  async leave(
    userId: string,
    parkId: string,
  ): Promise<{ removed: boolean; empty: boolean }> {
    const gone = await this.prisma.parkParticipant.deleteMany({
      where: { parkId, userId },
    });

    const remaining = await this.prisma.parkParticipant.count({ where: { parkId } });
    if (remaining > 0) return { removed: gone.count > 0, empty: false };

    // The last person out. The park goes with them — messages cascade — but
    // only if it is old enough to have been joined at all, so a host who is
    // still connecting does not lose the park they just made.
    await this.prisma.park.deleteMany({
      where: { id: parkId, createdAt: { lt: new Date(Date.now() - EMPTY_PARK_GRACE_MS) } },
    });

    return { removed: gone.count > 0, empty: true };
  }

  /** Keep a participant's heartbeat alive. Called by the gateway on a timer. */
  async touch(userId: string, parkId: string): Promise<void> {
    await this.prisma.parkParticipant.updateMany({
      where: { parkId, userId },
      data: { lastSeenAt: new Date() },
    });
  }

  /**
   * Is this user allowed to speak here, right now?
   *
   * Asked before every message and every interaction, and asked of the
   * database rather than of a set the gateway is holding — a socket that
   * remembers it joined is a socket that keeps talking after it was swept.
   */
  async isMember(userId: string, parkId: string): Promise<boolean> {
    const found = await this.prisma.parkParticipant.findUnique({
      where: { parkId_userId: { parkId, userId } },
      select: { id: true },
    });

    return found !== null;
  }

  /** Everybody currently in a park, with the creature each of them brought. */
  async members(parkId: string): Promise<ParkMemberView[]> {
    const rows = await this.prisma.parkParticipant.findMany({
      where: { parkId },
      orderBy: { joinedAt: 'asc' },
      take: PARK_MAX_CAPACITY,
      select: { userId: true, joinedAt: true },
    });

    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.userId);
    const [names, pets] = await Promise.all([
      this.users.namesOf(ids),
      this.users.petsOf(ids),
    ]);

    return rows.flatMap((row) => {
      const username = names.get(row.userId);
      if (!username) return [];

      return [
        {
          userId: row.userId,
          username,
          pet: pets.get(row.userId) ?? null,
          joinedAt: row.joinedAt.toISOString(),
        },
      ];
    });
  }

  /** One park, as the list shows it. */
  async view(parkId: string): Promise<ParkView> {
    const park = await this.prisma.park.findUnique({
      where: { id: parkId },
      select: {
        id: true,
        name: true,
        hostId: true,
        capacity: true,
        visibility: true,
        createdAt: true,
        host: { select: { username: true } },
        _count: { select: { participants: true } },
      },
    });

    if (!park) throw this.closed();

    return {
      id: park.id,
      name: park.name,
      hostId: park.hostId,
      hostUsername: park.host.username,
      capacity: park.capacity,
      isPrivate: park.visibility === 'private',
      occupancy: park._count.participants,
      createdAt: park.createdAt.toISOString(),
    };
  }

  // --- What was said --------------------------------------------------------

  /**
   * Say something in a park.
   *
   * Membership is checked here rather than trusted from the socket, the body is
   * trimmed and capped here rather than in the client, and the row is written
   * before anything is broadcast — so what everybody sees is what is stored,
   * and a reconnecting client asking for history gets the same conversation
   * rather than a shorter one.
   */
  async say(userId: string, parkId: string, body: string): Promise<ParkMessageView> {
    const text = body.trim().slice(0, MESSAGE_MAX_LENGTH);
    if (!text) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'Nothing to say.',
      );
    }

    if (!(await this.isMember(userId, parkId))) {
      throw new NotFoundException('You are not in that park.');
    }

    const message = await this.prisma.parkMessage.create({
      data: { parkId, senderId: userId, body: text },
      select: {
        id: true,
        parkId: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { username: true } },
      },
    });

    return {
      id: message.id,
      parkId: message.parkId,
      senderId: message.senderId,
      senderUsername: message.sender.username,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /**
   * What was said before you got here, or while you were disconnected.
   *
   * Newest-first from the database and reversed on the way out, so the caller
   * gets them in reading order without the database having to sort ascending
   * over the whole table. `before` is a cursor by id: pass the oldest message
   * you already have to get the page before it.
   *
   * Members only. A park's conversation is not public, and a park id is a uuid
   * somebody could have been given after leaving.
   */
  async history(
    userId: string,
    parkId: string,
    before?: string,
  ): Promise<ParkMessageView[]> {
    if (!(await this.isMember(userId, parkId))) {
      throw new NotFoundException('You are not in that park.');
    }

    const cursor = before
      ? await this.prisma.parkMessage.findFirst({
          where: { id: before, parkId },
          select: { createdAt: true },
        })
      : null;

    const rows = await this.prisma.parkMessage.findMany({
      where: {
        parkId,
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        parkId: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { username: true } },
      },
    });

    return rows
      .map((row) => ({
        id: row.id,
        parkId: row.parkId,
        senderId: row.senderId,
        senderUsername: row.sender.username,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      }))
      .reverse();
  }

  // --- The end --------------------------------------------------------------

  /**
   * Collect what has stopped breathing.
   *
   * Three deletes, in this order and for these reasons:
   *
   *   1. **stale participants** — rows whose heartbeat went quiet. This is the
   *      only definition of "gone" that survives a closed laptop, a killed tab
   *      and a dead wifi connection, none of which send a leave event.
   *
   *   2. **empty parks past the grace window** — a park with nobody in it is
   *      over. The window exists because a park is created by one request and
   *      joined by the next, and deleting it in between would delete it out
   *      from under its own host.
   *
   *   3. **very old parks** — a backstop. A park somebody left a tab open in
   *      for a day is not a park; it is a leak with a heartbeat, and half a day
   *      is longer than any real session.
   *
   * `ParkMessage` cascades with its park, so there is no fourth delete and no
   * orphaned conversation. Nothing here can strand a row: every one of the six
   * social tables either cascades from `Park` or from `User`.
   *
   * Deliberately idempotent and safe to run concurrently with itself — two
   * processes sweeping at once delete overlapping sets, and `deleteMany` on an
   * already-deleted row is zero rows rather than an error.
   */
  async sweep(): Promise<{ participants: number; parks: number }> {
    const now = Date.now();

    const participants = await this.prisma.parkParticipant.deleteMany({
      where: { lastSeenAt: { lt: new Date(now - PARTICIPANT_STALE_MS) } },
    });

    const parks = await this.prisma.park.deleteMany({
      where: {
        OR: [
          {
            participants: { none: {} },
            createdAt: { lt: new Date(now - EMPTY_PARK_GRACE_MS) },
          },
          { createdAt: { lt: new Date(now - PARK_MAX_AGE_MS) } },
        ],
      },
    });

    if (participants.count > 0 || parks.count > 0) {
      this.logger.log(
        `Swept ${participants.count} stale participant(s) and ${parks.count} park(s).`,
      );
    }

    return { participants: participants.count, parks: parks.count };
  }

  /** The park stopped existing. One sentence, one code, used everywhere. */
  private closed(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      ErrorCode.PARK_CLOSED,
      'That park has closed.',
    );
  }
}
