/**
 * The numbers the park feature is built out of, in one place.
 *
 * Every one of them is a load-bearing decision rather than a tuning knob, and
 * each is written down here so the gateway, the service and the sweeper cannot
 * disagree about it — a heartbeat interval that the sweeper thinks is longer
 * than the gateway does would evict people who are still standing there.
 */

/** How many creatures may share a park. */
export const PARK_MIN_CAPACITY = 2;
export const PARK_MAX_CAPACITY = 8;
export const PARK_DEFAULT_CAPACITY = 6;

/**
 * Eight, and the ceiling is the product rather than the server.
 *
 * A park is somewhere two or three creatures notice each other. Twenty of them
 * on one lawn is a crowd, and a crowd is where the thing this feature is for —
 * *your* creature meeting *their* creature — stops being visible at all.
 */
export const PARK_CAPACITY_MESSAGE = `A park holds between ${PARK_MIN_CAPACITY} and ${PARK_MAX_CAPACITY}.`;

/** How often a live socket touches `ParkParticipant.lastSeenAt`. */
export const HEARTBEAT_MS = 20_000;

/**
 * How long a participant may go unheard before they are swept.
 *
 * Three heartbeats. Two would evict somebody whose laptop slept through one on
 * a slow connection; ten would leave a park looking full for three minutes
 * after everybody left it. Three is long enough to be certain and short enough
 * that the last person out does not lock the door behind a ghost.
 */
export const PARTICIPANT_STALE_MS = HEARTBEAT_MS * 3;

/** How often the sweeper runs. */
export const SWEEP_INTERVAL_MS = 30_000;

/**
 * How long an empty park is allowed to exist.
 *
 * Not zero, and this is the subtle one: a park is created by one request and
 * joined by the next, so a park that is deleted the instant it has no
 * participants is a park that is deleted between its host creating it and their
 * socket arriving. The grace window is the gap between those two moments, with
 * room for a slow network.
 */
export const EMPTY_PARK_GRACE_MS = 90_000;

/** Longest a park may exist at all, however lively. */
export const PARK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Chat. */
export const MESSAGE_MAX_LENGTH = 400;
export const DIRECT_MESSAGE_MAX_LENGTH = 1000;

/**
 * How fast a socket may speak, per channel.
 *
 * Movement is generous because it is the simulation talking: a client sends its
 * creature's position at roughly 10 Hz, and the allowance is twice that so a
 * frame-rate spike is not a disconnection. Chat is stingy because it is a
 * person talking, and nobody types six lines a second.
 */
export const MOVE_RATE = { tokens: 20, perMs: 1000 } as const;
export const CHAT_RATE = { tokens: 5, perMs: 5000 } as const;
export const ACTION_RATE = { tokens: 8, perMs: 5000 } as const;

/**
 * How close two creatures must be for one to interact with the other.
 *
 * In room units, checked **on the server** against its own last-known
 * positions — never against a distance the client claims. A client that could
 * assert "I am next to them" could make its creature nuzzle somebody from
 * across the park, or from outside it.
 */
export const INTERACTION_RANGE = 260;

/** How long one pet-to-pet interaction runs before it is over. */
export const INTERACTION_MS = 2600;
