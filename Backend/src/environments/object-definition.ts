import { BadRequestException } from '@nestjs/common';

/**
 * Validating the document a placed object carries.
 *
 * The third of these — `pets/pet-appearance.ts` for the creature,
 * `room-style.ts` for the room, this for the things standing in it — and it
 * follows the same rule for the same reason: the check is a **storage** rule,
 * not a rendering one.
 *
 * What an object *is* lives in `frontend/src/assets/objects/ObjectCatalog.ts`,
 * which is procedural code the backend cannot and should not mirror. What
 * survives a round trip is a seed and three colours, and the backend's only
 * legitimate interest is that whatever comes back out of the column is small,
 * shaped like an object, and contains no surprises.
 *
 * Notice what is not accepted: a `scale`. An object's size is its grid
 * footprint and nothing may author another one beside it (AGENTS.md — Room
 * Rules), so a scale arriving from a client is either a mistake or an attempt
 * to reintroduce the bug the footprint system exists to prevent. It is dropped
 * rather than rejected, because a client sending one is not an attacker and a
 * room should not fail to save over a field nobody reads.
 */

export type JsonObject = Record<string, unknown>;

/** How big one object's document may be, in characters of JSON. */
const MAX_BYTES = 512;

/** The only fields kept. Anything else is dropped on the way in. */
const NUMERIC_FIELDS = ['seed', 'color', 'secondaryColor', 'accentColor'] as const;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The storable form of an object's definition.
 *
 * Returns `{}` for anything missing, which is a legal document: the client
 * fills in a type's default colours when the stored one says nothing, exactly
 * as it does for a room whose `sceneData` is `{}`.
 */
export function assertStorableDefinition(value: unknown): JsonObject {
  if (value === undefined || value === null) return {};

  if (!isPlainObject(value)) {
    throw new BadRequestException('An object definition must be a JSON object.');
  }

  const out: JsonObject = {};

  for (const field of NUMERIC_FIELDS) {
    const candidate = value[field];
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) continue;
    // Colours are 24-bit and the seed is an ordinary small integer; one bound
    // covers both without the column ever needing to know which is which.
    out[field] = Math.max(0, Math.min(0xffffff, Math.round(candidate)));
  }

  if (JSON.stringify(out).length > MAX_BYTES) {
    throw new BadRequestException('That object definition is too large.');
  }

  return out;
}
