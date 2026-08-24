import { randomBytes } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { ErrorCode } from '../common/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { cleanImage, sniffImageMime } from './image-bytes';
import {
  EXTENSION_FOR,
  MAX_UPLOAD_BYTES,
  storedFilePath,
  storedUrlFor,
  uploadRoot,
} from './media-paths';
import type { MediaPurpose } from './media-paths';

/** What an upload reports back, per 09-media-endpoints.md §2. */
export interface UploadView {
  fileId: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** How often orphaned uploads are swept, and how old they have to be. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Media — the only binary data in the product.
 *
 * Pets, objects and rooms are procedural; the one thing a user can supply that
 * is not a number is a photograph (AGENTS.md — Visual Rules). So this package
 * is small on purpose, and its shape is the one `techStack.md` (Storage) picked:
 *
 * ```text
 *   uploaded bytes
 *         ↓  sniffed, cleaned, renamed
 *   uploads/<purpose>/<yyyy>/<mm>/<fileId>.<ext>     on disk
 *         ↓
 *   "/uploads/memory/2026/08/<fileId>.png"           in PostgreSQL
 * ```
 *
 * **The database stores the path, never the file.** A row is read on every page
 * that lists memories; a five-megabyte column turns "show me my memory book"
 * into a five-megabyte query, and a backup of the goals table into a backup of
 * everybody's photo album. The filesystem is already a very good place to keep
 * files.
 *
 * The `fileId` is 128 bits of randomness, which is what makes serving these
 * publicly acceptable for now: a path nobody can guess is not access control,
 * and 09-media-endpoints.md §4 says so plainly — before anything social ships,
 * this moves behind a guarded streaming controller.
 */
@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaService.name);
  private sweep: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await mkdir(uploadRoot(), { recursive: true });

    // Files that were uploaded and never attached to anything would otherwise
    // accumulate for ever. An interval rather than a scheduled-job package:
    // one timer, cleaned up below, and no new dependency for a job that runs
    // hourly and does not care exactly when.
    this.sweep = setInterval(() => {
      void this.removeOrphans().catch((error: unknown) => {
        this.logger.warn(`Orphan sweep failed: ${String(error)}`);
      });
    }, SWEEP_INTERVAL_MS);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
  }

  /**
   * Accept a file, or explain why not.
   *
   * The order matters: size, then what the bytes actually are, then the clean,
   * then the write. Nothing touches the disk until the buffer has been proven
   * to be an image of a type we accept.
   */
  async store(purpose: MediaPurpose, buffer: Buffer): Promise<UploadView> {
    if (buffer.length === 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'The file is empty.',
      );
    }

    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new AppException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        ErrorCode.PAYLOAD_TOO_LARGE,
        'Pictures have to be under 5 MB.',
      );
    }

    const mime = sniffImageMime(buffer);
    if (!mime) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        'That file is not a PNG, JPEG or WebP image.',
      );
    }

    const cleaned = cleanImage(buffer, mime);
    const fileId = randomBytes(16).toString('hex');
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const extension = EXTENSION_FOR[mime];

    const directory = join(uploadRoot(), purpose, year, month);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${fileId}${extension}`), cleaned);

    return {
      fileId,
      url: storedUrlFor(purpose, year, month, fileId, extension),
      mimeType: mime,
      sizeBytes: cleaned.length,
      createdAt: now.toISOString(),
    };
  }

  /**
   * Delete an upload nothing points at.
   *
   * Deliberately keyed on the whole path rather than the bare id: the id alone
   * would have to be searched for across the directory tree, and a lookup that
   * takes a caller-supplied fragment and goes hunting through a filesystem is
   * how traversal bugs are born. `storedFilePath` returns null for anything
   * that is not a path this service issued.
   */
  async remove(ownerId: string, url: string): Promise<void> {
    const file = storedFilePath(url);
    if (!file) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'That is not an uploaded file path.',
      );
    }

    // Scoped to the owner: a user may only delete a file no memory of *theirs*
    // references, and the referencing check below is what makes the whole thing
    // safe for everyone else.
    const referenced = await this.prisma.memory.findFirst({
      where: { imageUrl: url },
      select: { id: true, ownerId: true },
    });

    if (referenced) {
      throw new AppException(
        referenced.ownerId === ownerId ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
        referenced.ownerId === ownerId ? ErrorCode.FILE_IN_USE : ErrorCode.NOT_FOUND,
        referenced.ownerId === ownerId
          ? 'A memory still uses this picture. Delete the memory instead.'
          : 'File not found',
      );
    }

    await rm(file, { force: true });
  }

  /**
   * Delete files older than a day that no memory refers to.
   *
   * The uploads directory is the source of truth for what exists and the
   * `Memory` table is the source of truth for what is wanted; anything in the
   * first and not the second, that has had a day to be claimed, is rubbish.
   */
  async removeOrphans(): Promise<number> {
    const root = uploadRoot();
    const files = await this.walk(root);
    if (files.length === 0) return 0;

    const referenced = new Set(
      (
        await this.prisma.memory.findMany({
          where: { imageUrl: { not: null } },
          select: { imageUrl: true },
        })
      ).flatMap((memory) => (memory.imageUrl ? [memory.imageUrl] : [])),
    );

    const cutoff = Date.now() - ORPHAN_AGE_MS;
    let removed = 0;

    for (const { absolute, url } of files) {
      if (referenced.has(url)) continue;

      const info = await stat(absolute).catch(() => null);
      if (!info || info.mtimeMs > cutoff) continue;

      await rm(absolute, { force: true });
      removed += 1;
    }

    if (removed > 0) this.logger.log(`Swept ${removed} unreferenced upload(s)`);
    return removed;
  }

  /** Every file under the upload root, with the public path it is served at. */
  private async walk(
    directory: string,
    prefix = '',
  ): Promise<{ absolute: string; url: string }[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const out: { absolute: string; url: string }[] = [];

    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const relative = `${prefix}/${entry.name}`;

      if (entry.isDirectory()) {
        out.push(...(await this.walk(absolute, relative)));
      } else if (entry.isFile()) {
        out.push({ absolute, url: `/uploads${relative}` });
      }
    }

    return out;
  }
}
