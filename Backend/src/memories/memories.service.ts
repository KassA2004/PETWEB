import { rm } from 'node:fs/promises';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Memory } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { isStoredMediaPath, storedFilePath } from '../media/media-paths';
import { PrismaService } from '../prisma/prisma.service';

/** `private` | `public` — who else may see a memory. */
export type MemoryVisibility = 'private' | 'public';

export const MEMORY_VISIBILITIES: readonly MemoryVisibility[] = ['private', 'public'];

/** Whatever is in the column, as one of the two values the product knows. */
export function readVisibility(value: string): MemoryVisibility {
  return value === 'public' ? 'public' : 'private';
}

/** What the API hands back for a memory. */
export interface MemoryView {
  id: string;
  type: string;
  title: string;
  description: string;
  imageUrl: string | null;
  /** The goal this came from, when it came from one. */
  goalId: string | null;
  /**
   * Who else may see it.
   *
   * Present on the owner's own list — it is a thing they decided and can
   * change — and equally present on a visitor's, where it is always `public`
   * by construction because nothing else was fetched.
   */
  visibility: MemoryVisibility;
  createdAt: string;
}

function toView(memory: Memory): MemoryView {
  return {
    id: memory.id,
    type: memory.type,
    title: memory.title,
    description: memory.description,
    imageUrl: memory.imageUrl,
    goalId: memory.goalId,
    visibility: readVisibility(memory.visibility),
    createdAt: memory.createdAt.toISOString(),
  };
}

/** How many the book returns when nobody says. */
const DEFAULT_LIMIT = 50;

/**
 * Memories — the user's history with their creature.
 *
 * Most of them arrive by finishing something: `GoalsService.complete` writes
 * the `goal_completed` ones inside its own transaction rather than calling this
 * service, because a memory that could fail separately from the thing it
 * records is a memory you cannot trust. This package owns reading them back,
 * and the handful the user writes directly.
 *
 * Scoped exactly like goals and pets: owner comes from the session, and
 * somebody else's memory is a 404.
 */
@Injectable()
export class MemoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, limit = DEFAULT_LIMIT): Promise<MemoryView[]> {
    const memories = await this.prisma.memory.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return memories.map(toView);
  }

  async create(
    ownerId: string,
    input: {
      type: string;
      title: string;
      description?: string;
      imageUrl?: string;
      visibility?: MemoryVisibility;
    },
  ): Promise<MemoryView> {
    if (input.imageUrl !== undefined && !isStoredMediaPath(input.imageUrl)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'imageUrl must be a path returned by the media endpoints.',
      );
    }

    const memory = await this.prisma.memory.create({
      data: {
        ownerId,
        type: input.type,
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        imageUrl: input.imageUrl ?? null,
        // Private unless the user said otherwise, here and in the column's
        // default and in the migration's backfill. Three places agreeing is
        // not redundancy: it is the one direction this setting must never fail
        // open in.
        visibility: input.visibility ?? 'private',
      },
    });

    return toView(memory);
  }

  /**
   * Edit a memory, including whether anybody else may see it.
   *
   * Making one public later — or taking it back — is the same request as
   * renaming it, and it goes through the same ownership check: `owned` scopes
   * by `ownerId` in the query, so there is no version of this that can publish
   * somebody else's memory.
   */
  async update(
    ownerId: string,
    memoryId: string,
    input: { title?: string; description?: string; visibility?: MemoryVisibility },
  ): Promise<MemoryView> {
    await this.owned(ownerId, memoryId);

    const updated = await this.prisma.memory.update({
      where: { id: memoryId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      },
    });

    return toView(updated);
  }

  /**
   * Somebody else's memories — the ones they chose to show.
   *
   * **The filter is in the `where`, and that is the entire feature.** A version
   * of this that fetched everything and dropped the private ones on the way out
   * would behave identically in the interface and be a data leak, because the
   * rows would have crossed the process boundary into a response object that
   * one careless change turns back into JSON. Private memories are not fetched.
   *
   * No `ownerId` check against a viewer, because there is nothing to check: a
   * public memory is public. What it deliberately does not return is anything
   * about the owner beyond what they published.
   */
  async listPublic(ownerId: string, limit = DEFAULT_LIMIT): Promise<MemoryView[]> {
    const memories = await this.prisma.memory.findMany({
      where: { ownerId, visibility: 'public' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return memories.map(toView);
  }

  /**
   * Delete a memory, and the picture with it.
   *
   * The row goes first. If the unlink then fails — a locked file, a permission
   * change — the user still sees the memory gone, and the hourly orphan sweep
   * collects the file later. The other order would risk deleting somebody's
   * photograph and then failing to delete the row that promises it exists.
   */
  async remove(ownerId: string, memoryId: string): Promise<void> {
    const memory = await this.owned(ownerId, memoryId);

    await this.prisma.memory.delete({ where: { id: memoryId } });

    const file = memory.imageUrl ? storedFilePath(memory.imageUrl) : null;
    if (file) await rm(file, { force: true }).catch(() => undefined);
  }

  private async owned(ownerId: string, memoryId: string): Promise<Memory> {
    const memory = await this.prisma.memory.findFirst({
      where: { id: memoryId, ownerId },
    });

    if (!memory) throw new NotFoundException('Memory not found');
    return memory;
  }
}
