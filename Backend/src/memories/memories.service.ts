import { rm } from 'node:fs/promises';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Memory } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { isStoredMediaPath, storedFilePath } from '../media/media-paths';
import { PrismaService } from '../prisma/prisma.service';

/** What the API hands back for a memory. */
export interface MemoryView {
  id: string;
  type: string;
  title: string;
  description: string;
  imageUrl: string | null;
  /** The goal this came from, when it came from one. */
  goalId: string | null;
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
    input: { type: string; title: string; description?: string; imageUrl?: string },
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
      },
    });

    return toView(memory);
  }

  async update(
    ownerId: string,
    memoryId: string,
    input: { title?: string; description?: string },
  ): Promise<MemoryView> {
    await this.owned(ownerId, memoryId);

    const updated = await this.prisma.memory.update({
      where: { id: memoryId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
      },
    });

    return toView(updated);
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
