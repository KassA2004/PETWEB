/**
 * What a socket is allowed to say, and what it means.
 *
 * Hand-written narrow readers rather than class-validator DTOs, matching
 * `environments/room-style.ts` and `pets/pet-appearance.ts` — the same idiom
 * the project already uses at every other trust boundary where a document
 * arrives from a client.
 *
 * The reason it is hand-written *here* specifically is that WebSocket payloads
 * never pass through Nest's global `ValidationPipe`. A DTO with decorators on
 * it would look validated and would not be: `whitelist: true` strips unknown
 * fields on the HTTP path only, so a gateway handler that trusted a decorated
 * class would be trusting whatever JSON the socket sent.
 *
 * Every function below returns a *new object built field by field*, never the
 * input narrowed. Nothing a client sends can survive into the server's state
 * except by being copied out explicitly, which is what makes prototype
 * pollution, extra fields and hostile types uninteresting rather than
 * dangerous.
 *
 * The one rule the numbers follow, borrowed from `PlacedObjectDto`: bounds are
 * **generous and absolute**, not the frontend's actual room. The park's grid
 * belongs to the renderer (`world/FloorGrid.ts`), and a backend that hard-coded
 * a tile size would need redeploying to change one. What is enforced here is
 * that a coordinate is a finite number inside a box no room will ever exceed —
 * enough that nothing absurd reaches another client's physics, and not so
 * specific that it becomes a second copy of the room's dimensions.
 */

/** The far edge of any room the product will draw. See the note above. */
const MAX_X = 4096;
const MAX_Z = 2048;

/** The states a client may claim its creature is in. */
export const PET_SYNC_STATES = [
  'idle',
  'walk',
  'run',
  'sit',
  'sleep',
  'play',
  'notice',
] as const;

export type PetSyncState = (typeof PET_SYNC_STATES)[number];

/** The things one creature may do to another. */
export const INTERACTION_KINDS = ['greet', 'play', 'nuzzle', 'copy'] as const;

export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/** Where somebody's creature is, and what it is doing. */
export interface PetTransform {
  x: number;
  z: number;
  /** -1 facing left, 1 facing right. Nothing else. */
  facing: -1 | 1;
  state: PetSyncState;
}

export interface JoinPayload {
  parkId: string;
  passcode: string | null;
}

export interface SayPayload {
  body: string;
}

export interface InteractPayload {
  targetUserId: string;
  kind: InteractionKind;
}

export interface DirectSendPayload {
  toUserId: string;
  body: string;
}

/** Thrown when a payload is not one. The gateway turns it into an error reply. */
export class BadPayload extends Error {}

export function readJoin(value: unknown): JoinPayload {
  const raw = asObject(value);

  return {
    parkId: readUuid(raw.parkId, 'parkId'),
    // Trimmed here rather than in the service, so the "no passcode" case is one
    // value (null) everywhere downstream instead of three (undefined, '', '  ').
    passcode: typeof raw.passcode === 'string' && raw.passcode.trim() ? raw.passcode : null,
  };
}

/**
 * A position update.
 *
 * The hottest path in the product — roughly ten of these per second per person
 * in a park — so it is written to allocate one small object and do no work
 * beyond clamping. `Math.min`/`Math.max` rather than a throw, because a
 * coordinate slightly outside the room is a client whose physics ran a frame
 * ahead, not an attack, and disconnecting it would be absurd.
 */
export function readTransform(value: unknown): PetTransform {
  const raw = asObject(value);

  return {
    x: clamp(readNumber(raw.x, 'x'), 0, MAX_X),
    z: clamp(readNumber(raw.z, 'z'), 0, MAX_Z),
    facing: raw.facing === -1 ? -1 : 1,
    state: PET_SYNC_STATES.includes(raw.state as PetSyncState)
      ? (raw.state as PetSyncState)
      : 'idle',
  };
}

/**
 * A host removing somebody from their own park.
 *
 * One field, and pointedly *not* a park id: which park is a fact about the
 * socket asking (`connection.parkId`), and taking it from the payload would let
 * a host of one park remove people from another they merely knew the id of.
 */
export function readKick(value: unknown): { userId: string } {
  const raw = asObject(value);
  return { userId: readUuid(raw.userId, 'userId') };
}

export function readSay(value: unknown): SayPayload {
  const raw = asObject(value);
  const body = readString(raw.body, 'body');

  if (!body.trim()) throw new BadPayload('Nothing to say.');
  return { body };
}

export function readInteract(value: unknown): InteractPayload {
  const raw = asObject(value);

  if (!INTERACTION_KINDS.includes(raw.kind as InteractionKind)) {
    throw new BadPayload('Unknown interaction.');
  }

  return {
    targetUserId: readUuid(raw.targetUserId, 'targetUserId'),
    kind: raw.kind as InteractionKind,
  };
}

export function readDirectSend(value: unknown): DirectSendPayload {
  const raw = asObject(value);
  const body = readString(raw.body, 'body');

  if (!body.trim()) throw new BadPayload('Nothing to send.');
  return { toUserId: readUuid(raw.toUserId, 'toUserId'), body };
}

// --- The primitives -------------------------------------------------------

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadPayload('Expected an object.');
  }

  return value as Record<string, unknown>;
}

function readUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BadPayload(`${field} must be an id.`);
  }

  return value.toLowerCase();
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadPayload(`${field} must be a number.`);
  }

  return value;
}

/**
 * A string, capped hard before anything else looks at it.
 *
 * The cap is here as well as in the service because this is the first thing
 * that touches the value: a megabyte of text should be truncated before it is
 * trimmed, matched or logged, not after.
 */
function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new BadPayload(`${field} must be text.`);
  return value.slice(0, 4000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
