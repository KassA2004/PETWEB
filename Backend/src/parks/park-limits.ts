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

/* -------------------------------------------------------------------------- */
/* What one server can hold                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The ceilings, and why a feature that "scales" needs them.
 *
 * A park costs the server real work every twenty seconds whether or not
 * anybody in it does anything: a heartbeat write per participant and a roster
 * read for the park. That cost is linear in the number of *live parks*, and
 * nothing in the design bounded that number — one account in a loop could open
 * as many as it liked, and the process would go down under the weight of its
 * own timer rather than under any traffic.
 *
 * So the number is stated. Every one of these is a refusal with a sentence
 * attached rather than a queue or a degradation, because the honest answer to
 * "the server is full" is to say so: a park that is opened and then runs badly
 * for the eight people in it is worse than a park that was never opened.
 *
 * They are deliberately generous relative to what this deployment is: at
 * `MAX_LIVE_PARKS` the heartbeat is roughly 500 roster reads and 500 batched
 * writes a minute, which a single Postgres and a single Node process carry
 * without noticing. Raise them by measuring, not by guessing.
 */

/**
 * How many live parks one account may be hosting.
 *
 * Three, because there is one legitimate reason to have more than one — you
 * opened one, it emptied, you opened another before the sweeper collected the
 * first — and no legitimate reason to have four.
 */
export const PARKS_PER_HOST = 3;

/** How many parks may exist at once, across everybody. */
export const MAX_LIVE_PARKS = 500;

/**
 * How many social sockets this process will hold.
 *
 * Refused at the handshake, before the connection exists, so a server at its
 * limit stops accepting rather than accepting and then falling over. The client
 * already handles `connect_error` — it is the same path a dropped network takes
 * — and retries with backoff, which is exactly the behaviour wanted here.
 */
export const MAX_SOCKETS = 2_000;

/**
 * How many sockets one account may hold.
 *
 * Four: a laptop, a phone, and a spare tab of each. This is what stops one
 * signed-in account consuming the whole ceiling above, which is the only way a
 * single user could deny the park to everybody else.
 */
export const MAX_SOCKETS_PER_USER = 4;

/**
 * How many heartbeats apart the *repair* roster broadcast is.
 *
 * Arrivals and departures still broadcast immediately; this is only the
 * backstop that repairs a park nobody is entering or leaving (see
 * `SocialGateway.beat`). Every beat meant a roster read for every occupied park
 * three times a minute for a message that is, almost always, identical to the
 * last one. Once a minute is still far faster than anybody notices a stale
 * member list, and it is a third of the read load.
 */
export const ROSTER_REPAIR_EVERY = 3;

/**
 * How many parks the heartbeat may be reading rosters for at once.
 *
 * The burst matters more than the total. `Promise.all` over every occupied park
 * issues every query in the same tick, which at a few hundred parks exhausts
 * the connection pool and turns a heartbeat into a wave of pool timeouts —
 * which look like database failures and are really a missing bound. Eight at a
 * time finishes the same work in a shape the pool can absorb.
 */
export const ROSTER_CONCURRENCY = 8;

/**
 * How many parks' heartbeats go into one `UPDATE`.
 *
 * The heartbeat used to be one statement per *participant*, so a full server
 * was four thousand round trips every twenty seconds. It is now one statement
 * per chunk of parks, which is two orders of magnitude fewer. Chunked rather
 * than done in one statement because the `WHERE` is an `OR` per park, and a
 * five-hundred-clause `OR` is a query plan nobody should have to look at.
 */
export const TOUCH_CHUNK = 40;

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
