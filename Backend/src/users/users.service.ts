import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { readStoredRoomStyle } from '../environments/room-style';
import {
  USERNAME_RULE_MESSAGE,
  isValidUsername,
  usernameKeyOf,
} from './username';

/** The signed-in user's own profile. Includes what only they may see. */
export interface MeView {
  id: string;
  username: string;
  email: string;
}

/**
 * Somebody else, as far as anybody is allowed to know them.
 *
 * Built field by field rather than by narrowing a row with `select`, and the
 * distinction matters: a `select` that forgets a field leaks it, whereas an
 * interface that has never heard of `email` cannot start returning it because
 * somebody widened a query. Everything a visitor sees about another account is
 * in this shape, and there is exactly one function that produces it.
 *
 * Deliberately not a profile. There is no bio, no follower count and no post
 * list — the product's answer to "who is this" is *their creature and the
 * room it lives in* (project-overview.md §12, §16), so that is what this
 * carries.
 */
export interface PublicUserView {
  id: string;
  username: string;
  /** Their current creature, or null if they have not saved one. */
  pet: PublicPetView | null;
  /** How many memories they have chosen to make public. */
  publicMemories: number;
  /** Where this account stands relative to the person asking. */
  relationship: RelationshipState;
  /**
   * The pending friend request between the two, when there is one.
   *
   * Carried so the interface can offer Accept rather than Add without a second
   * round trip to work out which way the request points.
   */
  requestId: string | null;
}

export interface PublicPetView {
  id: string;
  name: string;
  species: string;
  appearanceData: unknown;
}

export type RelationshipState =
  | 'self'
  | 'none'
  /** I asked them, and they have not answered. */
  | 'requested'
  /** They asked me. */
  | 'incoming'
  | 'friends'
  /** I asked and was told no. Shown as "none" would invite asking again. */
  | 'declined';

/** Somebody's room, as a visitor sees it. */
export interface VisitableRoomView {
  ownerId: string;
  username: string;
  environmentId: string;
  name: string;
  /** The saved `RoomStyle` document, validated on the way out. */
  sceneData: unknown;
  objects: {
    key: string;
    type: string;
    col: number;
    row: number;
    definition: unknown;
  }[];
  pet: PublicPetView | null;
}

/** How many results a username search returns. Bounded, per the Performance Rules. */
const SEARCH_LIMIT = 12;

/**
 * Users — profiles, the unique name, and what a visitor may see of somebody.
 *
 * This module is `02-user-endpoints.md`, finally built, plus the social reads
 * that document listed as `[LATER]` (§6) and that the social layer now needs.
 *
 * The rule that shapes every method here: **a read about somebody else returns
 * a `PublicUserView` and nothing else.** Not a `User` row with fields omitted —
 * a different type, produced in one place, which is why `email`, `affection`
 * and `activePetId` cannot appear in a response by being forgotten about.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Change the name people find you by.
   *
   * Two writes of one fact (`username` and `usernameKey`) and this is the only
   * place either happens — see `user.prisma` for why the second column exists.
   *
   * The uniqueness check is the database's, not a `findFirst` before the
   * update: a check-then-write loses the race between two sign-ups a
   * millisecond apart, and it is the constraint that has to be trusted rather
   * than the read that preceded it. `P2002` is the constraint saying no, and
   * it is translated into the sentence a user should see.
   */
  async setUsername(userId: string, requested: string): Promise<MeView> {
    const username = requested.trim();

    if (!isValidUsername(username)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        USERNAME_RULE_MESSAGE,
      );
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { username, usernameKey: usernameKeyOf(username) },
        select: { id: true, username: true, email: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.USERNAME_TAKEN,
          `"${username}" is taken. Try another.`,
        );
      }
      throw error;
    }
  }

  /**
   * Find people by username.
   *
   * A prefix search on `usernameKey`, which is what that column buys: an index
   * hit rather than the sequential scan a `mode: 'insensitive'` `contains`
   * would be over every account in the product.
   *
   * Prefix rather than substring on purpose. Substring search over usernames is
   * an enumeration tool — two characters would return a page of strangers — and
   * the feature being built is "find the person whose name you know", not
   * "browse everybody".
   *
   * The asker is excluded from their own results, and every row comes back as a
   * `PublicUserView` with the relationship already resolved, so the interface
   * can show Add / Pending / Friends without a request per row.
   */
  async search(viewerId: string, query: string): Promise<PublicUserView[]> {
    const key = usernameKeyOf(query);
    if (key.length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: { usernameKey: { startsWith: key }, id: { not: viewerId } },
      orderBy: { usernameKey: 'asc' },
      take: SEARCH_LIMIT,
      select: { id: true, username: true, activePet: PET_SELECT },
    });

    if (users.length === 0) return [];

    // Two queries for the whole page rather than two per row: the relationship
    // and the public-memory count are both looked up for every id at once.
    // (Performance Rules — "No N+1. One query for the list, one for the
    // details — never one per item.")
    const ids = users.map((user) => user.id);
    const [relationships, counts] = await Promise.all([
      this.relationshipsWith(viewerId, ids),
      this.publicMemoryCounts(ids),
    ]);

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      pet: toPublicPet(user.activePet),
      publicMemories: counts.get(user.id) ?? 0,
      relationship: relationships.get(user.id)?.state ?? 'none',
      requestId: relationships.get(user.id)?.requestId ?? null,
    }));
  }

  /** One person, as a visitor sees them. */
  async publicProfile(viewerId: string, userId: string): Promise<PublicUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, activePet: PET_SELECT },
    });

    if (!user) throw new NotFoundException('User not found');

    const [relationships, counts] = await Promise.all([
      this.relationshipsWith(viewerId, [userId]),
      this.publicMemoryCounts([userId]),
    ]);

    return {
      id: user.id,
      username: user.username,
      pet: toPublicPet(user.activePet),
      publicMemories: counts.get(userId) ?? 0,
      relationship:
        userId === viewerId ? 'self' : (relationships.get(userId)?.state ?? 'none'),
      requestId: relationships.get(userId)?.requestId ?? null,
    };
  }

  /**
   * Somebody's room, to visit.
   *
   * Everything here is already public in the product's own terms — it is what a
   * creature's home looks like — and nothing about the *user* comes with it:
   * no email, no goals, no affection, no private memories. The visitor gets the
   * same three things the owner's own client renders the room from, which is
   * what lets the visit reuse `PetHabitat` rather than needing a second,
   * simplified renderer (the brief's §3, and AGENTS.md's rule against
   * duplicate systems).
   *
   * `sceneData` goes through `readStoredRoomStyle` on the way out for the same
   * reason the owner's own room does: the column is a document, and a document
   * that has been sitting in a database since before a field existed should
   * cost one setting rather than the room.
   */
  async visitableRoom(userId: string): Promise<VisitableRoomView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, activePet: PET_SELECT },
    });

    if (!user) throw new NotFoundException('User not found');

    // The room the owner's own client would call `current` for: their first by
    // name, exactly as `EnvironmentsService.current` resolves it.
    const environment = await this.prisma.environment.findFirst({
      where: { ownerId: userId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        sceneData: true,
        objects: {
          select: { key: true, type: true, col: true, row: true, definitionData: true },
          orderBy: { key: 'asc' },
          take: 200,
        },
      },
    });

    if (!environment) throw new NotFoundException('Room not found');

    return {
      ownerId: user.id,
      username: user.username,
      environmentId: environment.id,
      name: environment.name,
      sceneData: readStoredRoomStyle(environment.sceneData),
      objects: environment.objects.map((object) => ({
        key: object.key,
        type: object.type,
        col: object.col,
        row: object.row,
        definition: object.definitionData,
      })),
      pet: toPublicPet(user.activePet),
    };
  }

  /**
   * The creature a set of users currently has selected.
   *
   * Used by the park gateway, which needs to draw everybody's pet and must not
   * take the appearance from the client that claims to own it — a client that
   * can send its own `appearanceData` is a client that can send *anybody's*,
   * including one crafted to break the renderer for everyone in the park.
   *
   * One query for the whole room.
   */
  async petsOf(userIds: string[]): Promise<Map<string, PublicPetView | null>> {
    const found = new Map<string, PublicPetView | null>();
    if (userIds.length === 0) return found;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, activePet: PET_SELECT },
    });

    for (const user of users) found.set(user.id, toPublicPet(user.activePet));
    return found;
  }

  /** Usernames for a set of ids, for the places that only need the name. */
  async namesOf(userIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (userIds.length === 0) return names;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });

    for (const user of users) names.set(user.id, user.username);
    return names;
  }

  /** Resolve a username to an id, or 404. Used where a person is named rather than linked. */
  async idForUsername(username: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { usernameKey: usernameKeyOf(username) },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('User not found');
    return user.id;
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Where the viewer stands with each of these people, in one query.
   *
   * Both directions at once: a friendship row is one row that two people are
   * on, so "did I ask them" and "did they ask me" are the same table read with
   * an OR, not two reads.
   */
  private async relationshipsWith(
    viewerId: string,
    userIds: string[],
  ): Promise<Map<string, { state: RelationshipState; requestId: string | null }>> {
    const result = new Map<string, { state: RelationshipState; requestId: string | null }>();

    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: { in: userIds } },
          { addresseeId: viewerId, requesterId: { in: userIds } },
        ],
      },
      select: {
        id: true,
        requesterId: true,
        addresseeId: true,
        status: true,
      },
    });

    for (const row of rows) {
      const other = row.requesterId === viewerId ? row.addresseeId : row.requesterId;
      const outgoing = row.requesterId === viewerId;

      const state: RelationshipState =
        row.status === 'accepted'
          ? 'friends'
          : row.status === 'declined'
            ? // Only the person who was refused is shown "declined"; from the
              // other side a request they turned down is simply not there, and
              // they may ask themselves later if they change their mind.
              outgoing
              ? 'declined'
              : 'none'
            : outgoing
              ? 'requested'
              : 'incoming';

      result.set(other, {
        state,
        requestId: state === 'incoming' || state === 'requested' ? row.id : null,
      });
    }

    return result;
  }

  /** How many public memories each of these users has. One grouped query. */
  private async publicMemoryCounts(userIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    const rows = await this.prisma.memory.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: userIds }, visibility: 'public' },
      _count: { _all: true },
    });

    for (const row of rows) counts.set(row.ownerId, row._count._all);
    return counts;
  }
}

/**
 * The only columns of a pet anybody but its owner ever sees.
 *
 * No `stateData` (runtime, and nobody else's business), no `personalityData`
 * (a document no client reads), no `ownerId` (the caller already knows whose
 * it is), no timestamps.
 */
const PET_SELECT = {
  select: { id: true, name: true, species: true, appearanceData: true },
} as const;

function toPublicPet(
  pet: { id: string; name: string; species: string; appearanceData: unknown } | null,
): PublicPetView | null {
  if (!pet) return null;

  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    appearanceData: pet.appearanceData,
  };
}
