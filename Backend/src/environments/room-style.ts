/**
 * Validating a room's saved appearance.
 *
 * The counterpart to `../pets/pet-appearance.ts`, and it exists for the same
 * reason and with the same limits. `class-validator` can say "this is an
 * object"; it cannot say "this is a room that will render", and mirroring the
 * frontend's catalogs into decorators would put the list of wall textures in
 * two places and guarantee they drift.
 *
 * So the rule here is deliberately narrow, and it is a *storage* rule rather
 * than a rendering one:
 *
 *   - it must be a JSON object, not an array or a scalar
 *   - the fields it may hold are named, and anything else is dropped
 *   - each field must be of the right primitive type and within sane limits
 *   - it must be small
 *
 * What it explicitly does NOT do is check that `wall` names a texture that
 * exists. The renderer owns that list, the renderer is in the frontend, and
 * the client normalizes the document again on the way in
 * (`frontend/src/world/RoomStyle.ts`) precisely so that an unknown value costs
 * one setting rather than the room. A backend that policed the catalog would
 * have to be redeployed every time somebody drew a new wallpaper.
 *
 * The database therefore holds configuration and never code — the same
 * guarantee `ObjectDefinition` gives.
 */

import { BadRequestException } from '@nestjs/common';

export type JsonObject = Record<string, unknown>;

/**
 * How big a saved room may be, in characters of JSON.
 *
 * A room is a handful of enum strings, a colour and a short list of things on
 * the wall. Four kilobytes is generous by an order of magnitude, and it is the
 * cheapest possible defence against somebody storing a novel in the column.
 */
const MAX_BYTES = 4096;

/** Wall decorations, capped. A wall with forty things on it is a jumble sale. */
const MAX_DECOR = 12;

/**
 * Environment props the user has taken out of the room, capped.
 *
 * A room cannot start with more furniture than this, so a longer list is a
 * corrupt document rather than a thorough user
 * (`frontend/src/world/RoomStyle.ts`'s `normalizeRemoved` enforces the same
 * ceiling on the way back out).
 */
const MAX_REMOVED = 64;

/** Every field a room style may carry, and how to read it. */
const STRING_FIELDS = ['ambience', 'floor', 'wall', 'window'] as const;

export class RoomStyleRejected extends BadRequestException {
  constructor(reason: string) {
    super(`Room style rejected: ${reason}`);
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A short identifier: an enum member from one of the client's catalogs. */
function readSlug(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new RoomStyleRejected(`${field} must be a string`);
  if (value.length === 0 || value.length > 32) {
    throw new RoomStyleRejected(`${field} must be 1-32 characters`);
  }
  if (!/^[a-z0-9_-]+$/i.test(value)) {
    throw new RoomStyleRejected(`${field} may only contain letters, digits, - and _`);
  }
  return value;
}

function readColor(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RoomStyleRejected('tint must be a number');
  }
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 0xffffff) {
    throw new RoomStyleRejected('tint must be a 24-bit colour');
  }
  return rounded;
}

function readDecor(value: unknown): JsonObject[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new RoomStyleRejected('decor must be an array');
  if (value.length > MAX_DECOR) {
    throw new RoomStyleRejected(`decor may hold at most ${MAX_DECOR} items`);
  }

  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new RoomStyleRejected(`decor[${index}] must be an object`);
    }

    const id = readSlug(entry.id, `decor[${index}].id`);
    const kind = readSlug(entry.kind, `decor[${index}].kind`);
    if (!kind) throw new RoomStyleRejected(`decor[${index}].kind is required`);

    const col = Number(entry.col);
    const row = Number(entry.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      throw new RoomStyleRejected(`decor[${index}] needs numeric col and row`);
    }

    return {
      id: id ?? `${kind}-${Math.round(col)}-${Math.round(row)}`,
      kind,
      // Clamped generously: the client clamps again against the wall grid it
      // is actually drawing, and the grid's shape is not this file's business.
      col: Math.max(0, Math.min(64, Math.round(col))),
      row: Math.max(0, Math.min(64, Math.round(row))),
    };
  });
}

/**
 * Ids of starting furniture the user has deleted.
 *
 * The one array-of-strings field in the document, rather than an array of
 * objects like `decor` — an id is the whole of what a tombstone is.
 */
function readRemoved(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new RoomStyleRejected('removed must be an array');
  if (value.length > MAX_REMOVED) {
    throw new RoomStyleRejected(`removed may hold at most ${MAX_REMOVED} items`);
  }

  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 64) {
      throw new RoomStyleRejected(`removed[${index}] must be a non-empty string of at most 64 characters`);
    }
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

/**
 * Check an incoming room style and return the document to store.
 *
 * Unknown fields are dropped rather than rejected, which is what lets a newer
 * client save a setting an older backend has never heard of without the write
 * failing — the field simply does not survive the round trip until the backend
 * learns about it. That is the right failure for a cosmetic setting.
 */
export function assertStorableRoomStyle(input: unknown): JsonObject {
  if (!isPlainObject(input)) {
    throw new RoomStyleRejected('expected a JSON object');
  }

  const out: JsonObject = {};

  for (const field of STRING_FIELDS) {
    const value = readSlug(input[field], field);
    if (value !== undefined) out[field] = value;
  }

  const tint = readColor(input.tint);
  if (tint !== undefined) out.tint = tint;

  const decor = readDecor(input.decor);
  if (decor !== undefined) out.decor = decor;

  const removed = readRemoved(input.removed);
  if (removed !== undefined) out.removed = removed;

  if (input.lightsOn !== undefined) {
    if (typeof input.lightsOn !== 'boolean') {
      throw new RoomStyleRejected('lightsOn must be a boolean');
    }
    out.lightsOn = input.lightsOn;
  }

  const size = JSON.stringify(out).length;
  if (size > MAX_BYTES) {
    throw new RoomStyleRejected(`document is ${size} characters, limit is ${MAX_BYTES}`);
  }

  return out;
}

/**
 * What comes back out of the column.
 *
 * Anything that is not an object — including the `{}` a freshly bootstrapped
 * room starts with — reads as "no preference", and the client fills in its own
 * defaults. That is why sign-up does not have to know what a room looks like.
 */
export function readStoredRoomStyle(value: unknown): JsonObject {
  return isPlainObject(value) ? value : {};
}
