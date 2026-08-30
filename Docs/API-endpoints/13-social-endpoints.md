# 13 — SOCIAL ENDPOINTS

**Base paths:** `/api/v1/users`, `/api/v1/friends`, `/api/v1/parks`, `/api/v1/chat`
**Namespace:** `ws://localhost:3000/social` (WSS in production)
**Modules:** `UsersModule`, `FriendsModule`, `ParksModule`, `ChatModule`, `RealtimeModule`
**Status:** implemented

This document is the proposal `11-schema-additions.md` §6 said had to be made
before anything social could be built, and the implementation report for what
was built from it. It supersedes `10-realtime-events.md`, which was the
placeholder spec written so that this feature would not require redesigning the
REST API — and did not.

---

## 1. What the social layer is

The product's answer to "who is this person" is **their creature and the room it
lives in** (`project-overview.md` §12, §16). Everything below follows from that
and from one refusal:

> There is no profile. No bio, no follower count, no posts, no feed.

A user is discovered by username, and what you find is a pet, a room, and
whatever they chose to remember. Two people become friends; their creatures meet
in a park; the creatures interact and the people talk. The pet stays the subject
throughout, which is the difference between this and a social network with a
game attached.

```text
   search a username
          ↓
   see their creature ──▶ visit their room ──▶ read their public memories
          ↓
   become friends ──▶ message them ──▶ meet in a park
                                            ↓
                             two creatures notice each other,
                             walk over, greet, play, nuzzle
```

---

## 2. Users — `/api/v1/users`

`02-user-endpoints.md` specified this module for the MVP and it was never built;
the client took its username from the Better Auth session. The social layer is
what finally needs it, because a name other people search for is not something
the auth library owns.

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | `GET` | `/users/me` | The signed-in user: id, username, email |
| 2 | `PATCH` | `/users/me` | Change username. `409 USERNAME_TAKEN` |
| 3 | `GET` | `/users/search?q=` | Prefix search. At most 12 `PublicUserView` |
| 4 | `GET` | `/users/:userId` | One `PublicUserView` |
| 5 | `GET` | `/users/:userId/memories` | Their **public** memories only |
| 6 | `GET` | `/users/:userId/room` | Their room: style, objects, creature |

**Not built:** `GET /users/me/bootstrap`. It exists in `02-user-endpoints.md` to
collapse a five-call waterfall the client does not have — `Dashboard` already
fires its loads in parallel — so building it now would be one more endpoint to
keep correct in exchange for nothing measurable. It stays specified, unbuilt.

### 2.1 The unique username

The whole discovery model is "type somebody's username", so a username that can
name two accounts is not a way to find anyone; it is a way to visit the wrong
person's room. Enforcement is the **database's**:

```text
  User.username      what the owner typed, shown everywhere
  User.usernameKey   lowercased, UNIQUE  ← the constraint
```

Two columns for one fact, deliberately. The constraint has to be
case-insensitive — `Kass` and `kass` naming two accounts is the same failure as
two `kass`es — and the natural expression of that is a unique index on
`lower(username)`. **Prisma cannot declare a functional index**, so the next
`prisma migrate dev` would generate a migration dropping it: the same trap
recorded on `FocusSession` in `11-schema-additions.md` §6, and not one to walk
into for the column the entire social layer is keyed on. A plain column Prisma
understands cannot be dropped behind our backs, and it makes lookup an index hit
rather than a `mode: 'insensitive'` scan.

`UsersService.setUsername` is the only writer, and it writes both.

Sign-up derives a name from the display name or the email address, walks it
until it is free, and retries past a `P2002` — because between the check and the
insert another sign-up can take it (`src/auth/auth.ts`).

### 2.2 Prefix, not substring

`GET /users/search` matches the *start* of a username. Substring search over
usernames is an enumeration tool — two characters would return a page of
strangers — and the feature is "find the person whose name you know".

### 2.3 `PublicUserView`

Everything anybody may know about somebody else, produced in exactly one place:

```json
{
  "id": "…", "username": "kass",
  "pet": { "id": "…", "name": "Blorb", "species": "blob", "appearanceData": {} },
  "publicMemories": 3,
  "relationship": "none",
  "requestId": null
}
```

Built **field by field**, never by narrowing a row with `select`. A `select` that
forgets a field leaks it; an interface that has never heard of `email` cannot
start returning it because somebody widened a query.

`relationship` is one of `self | none | requested | incoming | friends |
declined`, resolved for the whole result page in one query — so a list of twelve
people costs one relationship query, not twelve.

---

## 3. Friends — `/api/v1/friends`

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | `GET` | `/friends` | Friends, incoming requests, outgoing requests |
| 2 | `POST` | `/friends/requests` | `{ userId }` or `{ username }` |
| 3 | `POST` | `/friends/requests/:id/accept` | Addressee only |
| 4 | `POST` | `/friends/requests/:id/decline` | Addressee only |
| 5 | `DELETE` | `/friends/:userId` | Unfriend, or take back a request |

**Every route returns the whole picture**, not the row that changed. Accepting a
request *moves* a row between lists, and a client handed only the accepted row
would have to reconstruct both itself — and would be wrong the moment two tabs
were open.

### 3.1 One row, two people, three states

`Friendship(requesterId, addresseeId, status)`. A request and a friendship are
the same row at two points in its life, which is why there is no
`FriendRequest` table: two tables have to be kept in step by application code,
and the bug that model always produces — a friendship that exists in one
direction only — is the bug a single row cannot have.

`@@unique([requesterId, addresseeId])` is the duplicate defence, and it is the
database's rather than the service's: two tabs pressing Add at the same moment
cannot make two rows.

### 3.2 The cases that are easy to get wrong

| Case | Behaviour |
|---|---|
| Adding yourself | `400 FRIENDSHIP_INVALID` |
| Adding twice | Nothing changes. Not an error |
| Adding somebody who is already asking you | **Accepts theirs** — which is what both people meant |
| Accepting a request that is not yours | `404`. Scoped in the `where`, not checked after a read |
| Accepting twice | `404` — it is no longer pending |
| Two requests racing | The unique constraint refuses the second; the caller gets the state they wanted |
| Asking again after being refused | Refused. `declined` rows are kept, not deleted — deleting one would let a refusal be re-sent every minute, which is the shape of harassment |
| The person who declined changing their mind | Allowed: their own request reuses the row in the other direction |
| Unfriending | The row is **deleted**. A friendship somebody ended is not a refusal, and either of them may ask again |

---

## 4. Memory visibility

The existing goal → memory flow gained one field.

```text
   complete a goal  ──▶  keep a memory?  ──▶  private (default)
                                          └─▶ public
```

| Where | What |
|---|---|
| `POST /goals/:goalId/complete` | `memory.visibility: 'private' \| 'public'` |
| `PATCH /memories/:memoryId` | `visibility` — change your mind later |
| `GET /memories` | The owner's own book. Every memory, with its visibility |
| `GET /users/:userId/memories` | **Public only** |

**Private is the default in four places** — the DTO, the service, the column and
the migration's backfill — because this is the one setting in the product that
must never fail open. Every memory written before this feature existed is
private, and stays private until its owner says otherwise.

**The filter is in the query, not in the response mapping.** A version of
`listPublic` that fetched everything and dropped the private ones on the way out
would behave identically in the interface and be a data leak: the rows would
have crossed the process boundary into an object one careless change turns back
into JSON. Private memories are never read.

Asked at the moment the memory is made rather than afterwards, because that is
the only moment the user is thinking about the thing they just finished — and
changeable afterwards from the memory book, because a decision you cannot revise
is one people are afraid to make.

---

## 5. Parks — `/api/v1/parks`

A park is a temporary shared space. Somebody opens one, other people's creatures
walk into it, and when the last person leaves it stops existing.

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | `GET` | `/parks` | What is open. Private parks by name only |
| 2 | `POST` | `/parks` | Open one: name, capacity, public/private, passcode |
| 3 | `GET` | `/parks/:parkId/messages` | Chat history. Members only |

**Joining is not REST.** It happens over the socket, and the split is deliberate:
a REST join would admit somebody who then never connects, holding a slot for a
browser that closed during the request — and the only thing that would notice is
the sweeper, minutes later. The socket *is* the presence, so the thing that
grants the slot and the thing that notices it going away are the same object.

### 5.1 Why a temporary space still gets a table

Three of a park's facts cannot be answered by a live socket, and each is a
security decision rather than a convenience:

```text
  capacity      enforced by a row lock on the Park row inside the joining
                transaction (§7)
  the passcode  a scrypt hash. A hash held only in a process's memory is a hash
                that a restart turns into "anyone may enter"
  discovery     a list has to survive the moment between one client creating a
                park and another asking what is open
```

What is **not** in the table is presence: where a creature is standing, what it
is doing and which way it is facing are per-frame facts that live in the
gateway's memory and are never written down (§8).

### 5.2 Private parks

`visibility: 'private'` plus `passcodeHash`.

**scrypt, not SHA-256**, and the difference is the point. A park passcode is a
human-chosen secret — it will be `letmein`, a birthday, or something reused from
elsewhere — so a fast digest of it is a lookup table away from being plaintext.
What is stored has to be deliberately slow to compute and salted, which is what
a password-hashing KDF is for.

scrypt specifically, rather than adding argon2 or bcrypt: it is in Node's own
`crypto`, it is memory-hard, and it costs no new dependency — a native module
would have to compile on every machine this deploys to, in exchange for a
difference nobody attacking a park passcode would notice.

The stored format carries its own parameters, so raising the cost later does not
invalidate what is already stored:

```text
  scrypt$16384$8$1$<salt base64>$<hash base64>
         N     r p
```

Verification is `timingSafeEqual`. **The hash never leaves the backend**: no
route, view or socket payload includes it, and `ParkView` is built field by
field so a column added later cannot leak by being forgotten about.

A private park is still *listed* — by name, host and occupancy — because a
private park you cannot see is one you cannot be invited into by somebody saying
"it's called Tuesday".

---

## 6. Park lifecycle

A park is over when nobody is in it, and **"nobody is in it" is decided by
heartbeats going quiet rather than by anyone remembering to say goodbye.**

```text
  ParkParticipant.lastSeenAt   touched every 20s by the gateway, per live socket
  PARTICIPANT_STALE_MS         60s — three heartbeats
  SWEEP_INTERVAL_MS            30s
  EMPTY_PARK_GRACE_MS          90s
  PARK_MAX_AGE_MS              12h
```

All five live in one file (`src/parks/park-limits.ts`) so the gateway and the
sweeper cannot disagree — a heartbeat interval the sweeper thought was longer
than the gateway did would evict people who are still standing there.

### 6.1 Three mechanisms, because one is never enough

1. **`handleDisconnect`** — the clean case, and the fast one. A closed tab, a
   navigation, a pressed Leave button all arrive here.
2. **The heartbeat** — a socket that dies without an event goes quiet rather
   than lingering. This is the only definition of "gone" that survives a closed
   laptop, a killed process and a dead wifi connection, none of which send
   anything at all.
3. **`ParksService.sweep()`** — the collector, which is what makes (2) mean
   anything. Runs on an interval **and on boot**: a process that restarted left
   every socket it was holding on the floor, so every participant row it had is
   stale by definition, and without a boot sweep the first thing a returning
   user sees is a list of parks that look busy and are empty.

### 6.2 What the sweeper deletes

```text
  1. participants whose heartbeat stopped
  2. parks with no participants, older than the grace window
  3. parks older than twelve hours, however lively
```

The grace window exists because a park is created by one request and joined by
the next; deleting an empty park instantly would delete it out from under its
own host. The twelve-hour backstop catches a park somebody left a tab open in —
that is not a park, it is a leak with a heartbeat.

`ParkMessage` cascades with its park, so there is no fourth delete and no
orphaned conversation. **Nothing in the six social tables can be stranded**:
every one cascades from `Park` or from `User`.

`sweep()` is idempotent and safe to run concurrently with itself — two processes
sweeping at once delete overlapping sets, and `deleteMany` on an already-deleted
row is zero rows rather than an error.

---

## 7. Joining, and the capacity race

This is the one piece of concurrency in the feature that a naive implementation
gets wrong every time:

```text
   A counts 5 of 6 ─┐
                    ├─ both see room, both insert, the park holds 7
   B counts 5 of 6 ─┘
```

That is not a rare interleaving. It is what happens whenever two people click
Join on the same nearly-full park, which is precisely when they both would.

The fix is a row lock, taken inside the joining transaction:

```sql
BEGIN;
  SELECT "id", "capacity" FROM "Park" WHERE "id" = $1 FOR UPDATE;
  SELECT count(*) FROM "ParkParticipant" WHERE "parkId" = $1;
  INSERT INTO "ParkParticipant" …;
COMMIT;
```

`FOR UPDATE` serializes every concurrent join **of this park**, and of this park
only — two people entering two different parks never wait for each other.

The passcode is verified *before* and *outside* the transaction: scrypt takes
about a hundred milliseconds by design, and holding a row lock across it would
let one wrong guess block everybody else's join. Verifying first is also
strictly safer — a wrong passcode never reaches the lock.

**Re-joining is not an error.** A refresh, a reconnect and a second tab all
arrive here and all should end up in the park they were already in, rather than
being told it is full of themselves. `@@unique([parkId, userId])` is also what
stops one user filling a park on their own by opening tabs.

Refusals carry the same stable codes the REST API uses, so a client handles them
identically whichever transport told it: `PARK_FULL`, `PARK_PASSCODE_REQUIRED`,
`PARK_CLOSED`, `VALIDATION_FAILED`.

---

## 8. The socket — `ws://…/social`

One namespace, one connection per signed-in client. Three namespaces would be
three handshakes, three session lookups and three reconnection state machines to
keep in step, for a separation nothing needs.

### 8.1 Authentication

A **Socket.IO middleware**, not a check inside `handleConnection`: `next(error)`
means the connection is never established, so there is no window in which an
unauthenticated socket has an id, can be in a room, or can have a handler
invoked on it. Checking after the fact leaves exactly that window.

The same two steps `AuthGuard` takes for a request, for the same reasons —
resolve the Better Auth session from the handshake cookies, then look up the
domain `User` row and fail closed if it is gone. A socket authenticated
differently from a request would be a second authentication system, and a second
authentication system is where the bug is.

**The cookie, not a token in the query string.** The session already exists as
an `HttpOnly` cookie; asking the client to hold a copy somewhere JavaScript can
read it would invent a credential that an XSS could steal. The client connects
with `withCredentials: true`, which is why the gateway's CORS origin list is the
same one the REST API uses.

Long-lived sockets are **re-validated every ten minutes**. A socket is
authenticated once and then talks for hours, so a session signed out from
another device — or one that simply expired — would otherwise keep a connection
talking. The client also closes its own socket on sign-out (`lib/teardown.ts`);
this is the backstop for when it cannot.

### 8.2 What crosses the boundary

`10-realtime-events.md` §1 drew the line and it is kept:

```text
  over the socket        a creature's POSITION and STATE, ten times a second
                         who is in a park, and when that changes
                         what was said
                         that two creatures are interacting

  never over the socket  animation frames, poses, joint angles
                         appearance data — the SERVER looks that up
                         anything the database is authoritative for
```

The simulation stays on the client (`animation-approach.md` §4), which is what
makes a park cheap: the server relays four numbers per creature per tick and
never runs a physics step.

### 8.3 Client → server

| Event | Payload | Reply |
|---|---|---|
| `park:join` | `{ parkId, passcode? }` | `{ ok, park, members, positions }` or `{ ok: false, code, message }` |
| `park:leave` | — | `{ ok: true }` |
| `park:move` | `{ x, z, facing, state }` | none — fire and forget |
| `park:say` | `{ body }` | `{ ok, message? }` |
| `park:interact` | `{ targetUserId, kind }` | `{ ok }` |
| `dm:send` | `{ toUserId, body }` | `{ ok, sent? }` |
| `park:roster` | — | `{ ok, parkId, park, members, positions }` |
| `friends:presence` | — | `{ online: string[] }` |

**There is no `park:joined` and no `park:left`.** Both existed and both
produced the same bug: an arrival announced into a Socket.IO room reaches only
the sockets already in that room, and two people entering at the same moment
join it in an order nobody controls — so each could miss the other's
announcement and stand on one lawn holding two different member lists. The
symptom is asymmetric and reads as a rendering fault: A sees B, B does not see
A.

`park:roster` replaces them with **the whole membership, read from Postgres**,
sent to the entire room on every arrival, every departure and every heartbeat.
It has no such failure mode: missing one costs nothing because the next is
equally complete, and applying one is idempotent. It is also the only thing
that repairs a participant swept for a dead heartbeat, which deletes a row and
announces nothing. The client replaces its list and reconciles the scene to it
(`usePark`'s `applyRoster`).

`state` is one of `idle | walk | run | sit | sleep | play | notice` — a small,
stable vocabulary that has to survive this codebase adding an animation state
without every other client understanding it. `kind` is one of
`greet | play | nuzzle | copy`.

### 8.4 Server → client

| Event | Payload |
|---|---|
| `park:roster` | `{ parkId, park, members, positions }` — the whole membership |
| `park:moved` | `{ userId, x, z, facing, state }` |
| `park:message` | the stored `ParkMessage` |
| `park:interaction` | `{ parkId, fromUserId, toUserId, kind, durationMs }` |
| `dm:message` | the stored `DirectMessage`, with `withUserId` per recipient |
| `friends:changed` | `{}` — a nudge to re-read `GET /friends`, never data |
| `friends:presence` | `{ userId, online }` |

### 8.5 Validation

Hand-written narrow readers (`src/realtime/park-events.ts`), matching
`environments/room-style.ts` and `pets/pet-appearance.ts` — the idiom this
project already uses at every trust boundary where a document arrives from a
client.

Hand-written **here specifically** because WebSocket payloads never pass through
Nest's global `ValidationPipe`. A DTO with decorators on it would *look*
validated and would not be: `whitelist: true` strips unknown fields on the HTTP
path only.

Every reader returns a new object built field by field, never the input
narrowed — which is what makes prototype pollution, extra fields and hostile
types uninteresting rather than dangerous. Coordinates are clamped to a
generous absolute box rather than to the actual grid, for the reason
`PlacedObjectDto` gives: the room's shape belongs to the renderer, and a backend
that hard-coded a tile size would need redeploying to change one.

### 8.6 Rate limits

A token bucket per socket per channel (`src/realtime/rate-limit.ts`). The REST
API is limited per user (`00-conventions.md` §9); a socket is a hole in that —
one HTTP request that then carries unbounded messages.

```text
  movement   20 per second   ~10 Hz is normal; a frame-rate spike must not
                             disconnect anybody
  chat        5 per 5s       a person typing: bursty, then quiet
  actions     8 per 5s
```

Over-budget messages are **dropped, not punished**. A dropped position update
costs one frame of smoothness; a disconnection costs somebody their afternoon.
The only thing that closes a socket is failing to authenticate.

---

## 9. Chat

Two kinds, two lifetimes.

| | Park chat | Direct messages |
|---|---|---|
| Table | `ParkMessage` | `Conversation` + `DirectMessage` |
| Who may read | current participants | the two people on the conversation |
| Lifetime | dies with the park (`CASCADE`) | kept |
| History | `GET /parks/:id/messages` | `GET /chat/conversations/:userId/messages` |
| Live | `park:message` | `dm:message` |

A park's conversation dying with the park is correct rather than lossy: a park
is a place that existed for an afternoon, and the conversation in it is part of
the place. A conversation meant to be kept is a direct message.

### 9.1 Persisted first, delivered second

That order is the whole of "refreshing does not erase the chat": what everybody
sees is a row that exists, so a client that reconnects and asks for history gets
exactly the conversation the others watched happen. Nothing is optimistic — the
sender sees the stored row, with its id and the server's timestamp, rather than
a copy that would then have to be reconciled.

### 9.2 Missed messages

REST, not a replay buffer. A reconnected socket is a *new* socket to the server:
it is in no rooms, it has no memory of what it failed to deliver, and the rows
do. So a client that has been offline asks for the page it missed.

### 9.3 Direct messages are friends-only

`FriendsService.areFriends` is asked of the database before a row is written,
every time — not cached on the socket, so a friendship ended mid-conversation
stops the next message rather than the next reconnect.

The product has no blocking model and no report queue, and "anyone may message
anyone" without either of those is not a feature; it is an inbox somebody has to
moderate. **A friendship is the consent.**

`Conversation` stores its pair **ordered** (`userAId` is the lexicographically
smaller uuid), which is what makes the unique constraint mean "one thread per
pair" rather than "one per pair per direction". Without it, A messaging B and B
messaging A at the same instant produce two threads and neither person sees the
other's half.

### 9.4 The REST fallback

`POST /chat/conversations/:userId/messages` exists for a client whose socket is
down. It writes the same row through the same service, then publishes on
`SocialBus` so a recipient who *is* connected still sees it arrive.

The client falls back **only for transport failures** (`OFFLINE`, `TIMEOUT`). A
refusal about the message itself — "you are not friends with them" — would get
the identical answer from REST, because both paths go through one service, so
retrying would be a second request for the same no.

---

## 10. Pets in a park

The park's promise is that two *pets* meet, not two usernames.

### 10.1 Visitors are puppets, and that is correct

A visitor's creature is being simulated on *their* machine — its brain is
deciding what it wants, its physics resolving what it bumps into. Running a
second simulation locally would produce a second, different answer that then has
to be reconciled every tenth of a second, and the result of that reconciliation
is the rubber-banding every naive multiplayer game has.

So the network says where a creature is and what it is doing, and
`scenes/room/Visitors.ts` makes four numbers arriving ten times a second look
like a living animal sixty times a second:

```text
  smoothing   eased toward the last position heard, not snapped to it
  the lean    driven from the smoothed screen velocity — the same ambient layer
              the resident creature leans with, so a visitor moves like a
              resident rather than like a sprite
  the rig     a real PetRenderer and a real PetAnimationController, which is why
              a visitor breathes, blinks and swings its ears between packets
```

Past 420 units the smoothing is abandoned and the creature jumps: a teleport is
honest about what happened, where a very long glide is a lie.

Visitors go into the **same sortable stage layer** as the furniture and the
local creature, with a `zIndex` computed the same way, so a park with six
creatures and a table in it sorts exactly as a room with one creature and a
table in it does.

### 10.2 Creatures notice each other by themselves

Nothing scripts a pet walking toward another pet. `PerceivedObject` gained one
flag — `isPet` — and `PetBrain.pickCuriosity` weights those six times higher
than a bookshelf (`ANOTHER_CREATURE`).

That one number is the entire behavioural half of the park. A creature that
wanders in finds that the most interesting things on the lawn are the other
creatures and goes to have a look at them, which reads as two animals noticing
each other. It is deliberately **not** a new behaviour: "go and see what that is"
is a decision the brain already makes well, and a `socialise` branch beside it
would be two implementations of one idea with a coin flip between them.

### 10.3 Interactions are server-arbitrated

Tapping a creature on the lawn selects it; the panel beside the room offers what
your creature can do. The server checks, in order of cost:

```text
  1. the rate limit                        (memory)
  2. the target is somebody else, here     (memory)
  3. the two are actually close together   (memory — the server's OWN copy of
                                            where everyone is)
  4. the pair is off cooldown              (memory)
  5. the sender really is a member         (the database)
```

Proximity is checked against the server's positions, never a distance the client
asserts — a client that could say "I am next to them" could nuzzle somebody from
across the park. The client's own range check exists only to grey a button out;
pressing anyway gets a polite no.

The cooldown is per **pair**, so somebody cannot spam one creature while
remaining free to greet everybody else, and it is order-independent so two
clients cannot ping-pong an interaction at full tilt.

The result is broadcast to the whole park including the sender, because an
interaction is a thing that happens *between* two creatures: both animate, and
everybody watching sees the same event at the same moment rather than each
client deciding for itself.

### 10.4 Every interaction has an animation

`animation/clips/Social.ts`. Four kinds × two roles = eight clips, because the
two halves of an interaction are different animations of one event: one creature
bows and the other bounces in reply. A single clip played by both would look
like two things happening at once rather than one thing happening between them.

They are one-shots of a server-given duration, so they end at the same moment on
every screen. The reply is deliberately a beat late — a reply that begins on the
same frame is not a reply, it is a coincidence.

### 10.5 The appearance never comes from a client

`park:join` and `park:roster` carry each member's creature as the *server* read
it from that user's own `Pet` row. A client cannot send a rig — not its own, and
certainly not somebody else's, including one crafted to break the renderer for
everyone in the park.

One consequence, surfaced rather than hidden: a creature that has never been
saved has no `Pet` row, so its owner would walk into a park invisible. The Parks
tab puts a one-button gate in front of that ("Keep Blorb") instead of letting it
happen quietly. Nothing is auto-saved behind the user's back.

---

## 11. Production

| Concern | How |
|---|---|
| HTTPS / WSS | The socket inherits the page's scheme; the session cookie's `Secure` attribute keeps it there. `VITE_API_URL` and `FRONTEND_URL` are the two values a deployment sets |
| CORS | The gateway uses `getCorsOrigins()` — the same list the REST API uses. The handshake is an ordinary HTTP request carrying the cookie, so it is subject to CORS exactly as `/api/v1` is |
| Reconnection | Socket.IO's backoff, capped at 8s. On reconnect the client **re-joins and re-reads**; it does not resume, because the server has no memory of the old socket |
| Backend restart | Every socket drops; the boot sweep clears every participant row; parks with nobody in them are deleted. A restart leaves no orphans |
| Concurrent clients | Capacity is a row lock; friendships and conversations are unique constraints; chat is append-only |
| Transport | `transports: ['websocket']` with **no polling fallback**. Polling would work, and is exactly the shape this feature is not allowed to be built on — falling back to it silently under a strict proxy would mean shipping that shape without noticing |

### 11.1 Redis

Not used, and the note in `10-realtime-events.md` §5 still holds: Redis backs
the Socket.IO adapter once **more than one backend process serves sockets**, and
a single process needs none.

What would have to change for a second process: the Socket.IO adapter (so a
broadcast reaches sockets on the other process), and nothing else. Membership,
capacity, the passcode and every message are already in Postgres precisely so
that they are not a single process's memory. The in-memory parts — last-known
positions and interaction cooldowns — are per-park ephemera that a second
process would simply hold its own copy of.

`SocialBus` (`src/realtime/social-bus.ts`) is **not** a substitute for that and
must not become one: it carries "tell these people to look again", never state,
and exists only to keep the module graph acyclic.

---

## 12. Security

| Rule | Where |
|---|---|
| Identity | The session cookie, on every request and every handshake. `userId` is attached by the server; every broadcast carries the server's copy, never a client's claim |
| Ownership | Derived from the session. No handler takes an owner id from a body |
| Somebody else's row | `404`, never `403` — ids cannot be enumerated |
| Private memories | Filtered in the query. Never fetched |
| Park membership | A row, asked of the database before every message and every interaction |
| Park capacity | A row lock (§7) |
| Private park credentials | scrypt, `timingSafeEqual`, never returned |
| Message permissions | A friendship row, checked before every write |
| Entity ids | Every id is validated as a uuid before it is used, on both transports |
| Payload shape | Narrow readers that copy field by field (§8.5) |
| Flooding | Token buckets per socket per channel (§8.6) |

### 12.1 Deliberately not built

**Item trading** (the brief's §15). The existing inventory architecture is not
mature enough to extend cleanly: `InventoryItem` points at `ObjectDefinition`,
which has **no rows** — the object catalog is procedural code
(`ObjectCatalog.ts`), not database records — and `project-overview.md` §7 records
that the inventory screen was removed because everything in it was either
furniture (which belongs in the room) or a wearable (which belongs on the
creature).

So there is no ownership to transfer. Building trading would mean first
inventing an item-ownership model, seeding a catalog, and giving the product a
reason for items to be scarce — three features, none of them social, ahead of
the one that was asked for. The brief anticipates exactly this: *"if trading
cannot be integrated cleanly with the existing architecture without compromising
the quality of the social layer, prioritize a correct social foundation."*

When there is real item ownership, trading needs: a `Trade` row with both
parties' agreement, an atomic transfer inside one transaction, a row lock on
each item so one cannot be in two trades at once, and cancellation on disconnect.
None of that is hard; all of it is meaningless without something to trade.

---

## 13. Schema

Six new tables, two altered. See `11-schema-additions.md` §6 for the approved
change request and `prisma/migrations/20260829120000_social_layer` for the SQL.

```text
  User        + usernameKey (UNIQUE)              the discovery key
  Memory      + visibility ('private' default)    backfilled private
  Friendship    one row per relationship
  Park          name, capacity, visibility, passcodeHash
  ParkParticipant  membership + lastSeenAt heartbeat
  ParkMessage   cascades with its park
  Conversation  ordered pair, unique
  DirectMessage kept
```

---

## 14. Frontend

| Piece | File |
|---|---|
| The layer | `features/social/SocialLayer.tsx` |
| The socket | `features/social/socket.ts` |
| REST | `features/social/api.ts` |
| Parks | `features/social/ParksPanel.tsx`, `ParkStage.tsx`, `usePark.ts` |
| People | `features/social/PeoplePanel.tsx`, `useFriends.ts` |
| Messages | `features/social/MessagesPanel.tsx` |
| Visiting | `features/social/VisitStage.tsx` |
| Coming back after a reload | `features/social/parkMemory.ts` |
| Other creatures | `scenes/room/Visitors.ts` |
| Their animations | `animation/clips/Social.ts` |
| The park | `world/environments/Park.ts`, `assets/environment/park/Outdoors.ts` |

The whole surface is behind one `lazy()` boundary: a visitor who never presses
the social button does not download `socket.io-client`, does not download the
park's scenery, and never opens a WebSocket. Measured — see
`Architecture-and-layers.md`. The one exception is `parkMemory.ts`, three
`sessionStorage` calls with no imports, which the dashboard reads on load to
decide whether this tab was standing in a park — asking the chunk would mean
loading the chunk to find out whether to load the chunk.

### 14.1 It is a mode of the page, not a sheet over it

The social layer used to be a 28rem panel that slid over everything with its
own small copy of the world inside it. It now **swaps the tools and borrows the
world**:

```text
  world column   the room, OR a park, OR somebody else's room — one canvas
  tools column   Goals/Memories/Pet/Room, OR Parks/People/Messages
```

Three things follow, and each fixed a real complaint:

* **A park is the size of the room.** It was a postage stamp inside a panel.
* **There is never more than one PixiJS application on the page.** The
  dashboard *unmounts* its own habitat while a place is open — hiding it would
  leave a second WebGL context ticking and resizing against a zero-height box,
  which is what the "glitching" on the way into a park was.
* **You can be in a park and still check a goal.** `SocialLayer` stays mounted
  once opened and renders into the dashboard's two slots through portals, so
  switching back to Home leaves the park running in the world column. The Pet
  and Room tabs are removed while you are out, because they are controls for a
  room that is not on screen.

A reload is not a departure either: the park id is kept in `sessionStorage` for
the tab, and the rejoin needs no passcode because the `ParkParticipant` row
outlives the socket. The passcode itself is never stored.

The social entry point is an icon to the left of Sign out (`UserBadge`), drawn
inline as one small SVG rather than pulled from an icon set: the product has no
icon set and must never grow one (`theme-and-design.md` §20.1). It is removed
during a focus session, like every other tool.
