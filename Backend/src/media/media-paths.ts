import { join, resolve } from 'node:path';

/**
 * Where uploaded files live, and what a reference to one looks like.
 *
 * Its own module because two packages need the same answer and neither should
 * own it: `media` writes these paths, and `goals`/`memories` have to be able to
 * tell a path the product handed out from a string a client invented. A memory
 * whose `imageUrl` is `https://somewhere-else/tracker.png` is not a memory with
 * a picture in it, it is a hole in the product pointed at somebody else's
 * server — so the check is a shared rule rather than a regex written twice.
 */

/** The one purpose the MVP uploads for (09-media-endpoints.md §2). */
export const MEDIA_PURPOSES = ['memory'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/** Public URL prefix. Served statically — see `main.ts`. */
export const MEDIA_URL_PREFIX = '/uploads';

/** Biggest file accepted, in bytes. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** What is actually accepted, by magic bytes rather than by what the client claims. */
export const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

export const EXTENSION_FOR: Record<AcceptedMime, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/** Absolute directory the files are written under. */
export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));
}

/**
 * `/uploads/memory/2026/08/<32 hex>.png`
 *
 * Anchored at both ends and with no `.` allowed in the id, so nothing that
 * traverses out of the upload root can pass — the path is turned back into a
 * filename by `storedFilePath` below, and that is only safe because this is the
 * only shape that reaches it.
 */
const STORED_PATH =
  /^\/uploads\/(memory)\/(\d{4})\/(\d{2})\/([0-9a-f]{32})\.(png|jpg|webp)$/;

/** Whether a string is a path this product actually stored a file at. */
export function isStoredMediaPath(value: string): boolean {
  return STORED_PATH.test(value);
}

/** The file id inside a stored path, or null if it is not one. */
export function fileIdOf(value: string): string | null {
  return STORED_PATH.exec(value)?.[4] ?? null;
}

/**
 * The absolute file for a stored path.
 *
 * Returns null for anything that is not a stored path, which is the whole
 * traversal defence: `..` cannot match `[0-9a-f]{32}`.
 */
export function storedFilePath(value: string): string | null {
  if (!isStoredMediaPath(value)) return null;
  return join(uploadRoot(), value.slice(MEDIA_URL_PREFIX.length + 1));
}

/** The public path for a file, from its parts. */
export function storedUrlFor(
  purpose: MediaPurpose,
  year: string,
  month: string,
  fileId: string,
  extension: string,
): string {
  return `${MEDIA_URL_PREFIX}/${purpose}/${year}/${month}/${fileId}${extension}`;
}
