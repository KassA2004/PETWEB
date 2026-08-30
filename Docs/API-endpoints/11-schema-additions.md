# 11 — PROPOSED SCHEMA ADDITIONS

`AGENTS.md` requires that any database change be documented rather than made silently.
Several endpoints in this folder need columns that `InitialDB-plan.md` does not define.

This document lists every such delta. **Nothing here is approved yet** — it is the
change request that must be accepted (and merged back into `InitialDB-plan.md`) before
the corresponding endpoints are built.

Nothing here replaces Prisma, redesigns relationships, or introduces a new technology.
All deltas are additive columns on existing tables, plus one new table in the deferred
social section.

---

## 0. Better Auth tables — required for the MVP, **implemented**

`01-auth-endpoints.md` §6 says Better Auth "owns its own `user`/`session`/`account`
tables" separate from the domain `User` table. `InitialDB-plan.md` never named these
because they belong to the auth library, not to application data — but they are real
tables that must exist in the same database, so they are documented here.

Four new tables, one Prisma file each (matching the "one table, one file" convention),
named with an `Auth` prefix so they can never be confused with the domain `User` model:

| Table | Purpose | Key fields |
|-------|---------|------------|
| `AuthUser` | Better Auth's own identity record | `id`, `email` (unique), `emailVerified`, `name`, `image`, `createdAt`, `updatedAt` |
| `AuthSession` | active sessions | `id`, `token` (unique), `userId` → `AuthUser`, `expiresAt`, `ipAddress`, `userAgent` |
| `AuthAccount` | credential storage (password hash lives here, not on `AuthUser`) | `id`, `userId` → `AuthUser`, `providerId`, `accountId`, `password` |
| `AuthVerification` | email verification / reset tokens | `id`, `identifier`, `value`, `expiresAt` |

Relationship to the domain `User` table: **no foreign key**. `AuthUser.id` and
`User.id` hold the same UUID by convention — Better Auth generates the id (patched to
`crypto.randomUUID()` so it matches the UUID v4 format `InitialDB-plan.md` requires
everywhere else), and a `databaseHooks.user.create.after` hook creates the matching
`User` row with that same id immediately afterward, inside the sign-up request. This
is the "maps to it 1:1 by id" relationship `01-auth-endpoints.md` §6 describes — kept
as a convention rather than a DB-level FK because the two tables are owned by two
different systems (the auth library vs. application code) and Better Auth manages
`AuthUser`'s lifecycle itself.

**Scope note:** the sign-up bootstrap in `01-auth-endpoints.md` §2 also calls for
granting starter `InventoryItem`s from seeded `ObjectDefinition`s. No `ObjectDefinition`
seed data exists yet (that is package 05 work), so the hook currently creates the `User`
row and the default `Environment` only. Starter items are a follow-up once a catalog
exists to grant from.

**Severity: blocking.** Nothing in the application can authenticate without these
tables. Already implemented — see `Backend/prisma/auth-user.prisma`,
`auth-session.prisma`, `auth-account.prisma`, `auth-verification.prisma`.

---

## 1. `Goal` — required for the MVP

`InitialDB-plan.md` defines `Goal` as `id`, `ownerId`, `description` only. The goal
loop in `project-overview.md` §7 cannot work without completion tracking.

| Column | Type | Default | Needed by |
|--------|------|---------|-----------|
| `title` | String | — | `POST /goals`, memory titles |
| `status` | Enum(`open`,`completed`) | `open` | `GET /goals?status=` |
| `completedAt` | DateTime? | `null` | `POST /goals/:goalId/complete` |
| `dueAt` | DateTime? | `null` | goal list sorting |
| `rewardClaimed` | Boolean | `false` | prevents reward farming via reopen |
| `createdAt` | DateTime | `now()` | ordering |

Index: `(ownerId, status, createdAt)`.

**Severity: blocking.** Package 07 cannot be implemented without this.

---

## 2. `ObjectDefinition` — required for the MVP

| Column | Type | Default | Needed by |
|--------|------|---------|-----------|
| `category` | String | — | `GET /objects?category=`, inventory grouping |
| `rarity` | Enum(`common`,`uncommon`,`rare`) | `common` | reward rolling (07 §4) |
| `interactive` | Boolean | `false` | simulation target selection |
| `behaviorTags` | String[] | `[]` | pet behaviour decisions (05 §4) |
| `retiredAt` | DateTime? | `null` | soft-retire instead of delete |

Rationale for keeping these **out** of `appearanceData`: they are queried by the
catalog, the reward roller and the simulation. Filtering inside a JSON column for
gameplay logic is both slow and untypeable. `appearanceData` stays purely visual.

**Severity: blocking** for reward rolling and catalog filtering.

---

## 3. `Environment` — required for the MVP, **implemented (revised)**

| Column | Type | Default | Needed by |
|--------|------|---------|-----------|
| `sceneData` | Json | `{}` | `GET /environments/current`, `PUT /environments/:id/scene` |
| `createdAt` | DateTime | `now()` | ordering |
| `updatedAt` | DateTime | `now()` `@updatedAt` | "saved a moment ago" |

**This replaces the `backgroundKey` / `width` / `height` / `floorY` proposal
that was originally in this section.** The deviation is deliberate and is
recorded here rather than made silently, per `AGENTS.md`.

Why the original four columns were dropped:

- `width`, `height`, `floorY` — the room's dimensions are a property of the
  *camera*, not of the data. Every room is the same box seen from the same place
  (`frontend/src/world/Projection.ts`); an environment is allowed to vary what is
  in it and what it is made of, never where the viewer stands. Storing bounds
  per-environment would let the database contradict the renderer, and the
  renderer would win.
- `backgroundKey` — one string cannot express an hour, a paint colour, a floor
  material, a wall material, a window view and a list of wall decorations. The
  room gained four customization axes in one change and will gain more.

Why one JSON column rather than a column per setting: none of these values is
ever queried, filtered or sorted on. They are read whole, by exactly one
consumer, to draw a picture. That is the same reasoning that keeps
`Pet.appearanceData` a JSON document (§2 above, on what belongs *outside*
`appearanceData`), and the same trust boundary applies:

```text
client  ->  assertStorableRoomStyle()  ->  column  ->  normalizeRoomStyle()  ->  render
            Backend/src/environments/       Json      frontend/src/world/
            room-style.ts                             RoomStyle.ts
```

The backend checks that the document is *storable* — a JSON object, named
fields only, right primitive types, under 4 KB, at most 12 wall decorations. It
deliberately does **not** check that `wall` names a texture that exists: the
renderer owns that list, the renderer is in the frontend, and the client
normalizes again on the way in so an unknown value costs one setting rather than
the room. A backend that policed the catalog would need redeploying every time
somebody drew a new wallpaper.

The column never contains code. Only configuration — the same guarantee
`ObjectDefinition` gives.

**Severity: blocking** for room persistence, which is why it is implemented. See
`Backend/prisma/environment.prisma` and migration
`20260823134915_environment_scene_data`.

**Proof this shape earns its keep:** `RoomStyle` later grew a `removed: string[]`
field — the ids of the environment's own starting furniture a user has deleted
(`room-and-objects.md` §7c). It shipped as a whitelist entry in
`assertStorableRoomStyle`/`normalizeRoomStyle` and nothing else — **no Prisma
migration, no new column, no schema change of any kind.** That is exactly the
bet this section made: a JSON document read whole by one consumer can grow an
axis the day the product needs one, at the cost of one function on each side of
the trust boundary rather than a migration.

---

## 4. `InventoryItem` — nice to have

| Column | Type | Default | Needed by |
|--------|------|---------|-----------|
| `acquiredAt` | DateTime | `now()` | "new item" badge, sorting |
| `totalEverAcquired` | Int | `0` | collection stats |

Unique constraint `(ownerId, objectId)` — one row per definition per user, with
`quantity` as the counter. This is implied by `InitialDB-plan.md` but not stated, and
must be enforced or the atomic increments in `06-inventory-endpoints.md` §5 break.

**Severity: the unique constraint is blocking; the columns are optional.**

---

## 5. `Pet` and `Memory` — no changes needed

Both tables as defined in `InitialDB-plan.md` fully support their endpoints.
`ageDays`, `secondsSinceUpdate`, `zIndex`, `placedCount` and `hasCompletedOnboarding`
are all **derived at read time** and must not be stored.

One clarification, not a change: `Pet.stateData` needs an `updatedAt` to answer
`secondsSinceUpdate`. Prisma's `@updatedAt` on the `Pet` row covers it, provided state
snapshots are the only frequent write to that row.

---

## 6. Social / realtime — **requested, approved, implemented**

This section used to read *"do not build"*. Social features were then actually
requested, the expansion was proposed in
[`13-social-endpoints.md`](./13-social-endpoints.md), and it shipped as
migration `20260829120000_social_layer`.

The proposal above was three lines long and two of them turned out to be wrong.
Recorded here rather than quietly replaced, because the difference is the useful
part:

| Proposed | Built | Why |
|---|---|---|
| `Environment.visibility` Enum | **nothing** | A room does not need one. Visiting somebody's room shows their creature and their arrangement, which is what the product already treats as public; what carries visibility is a *memory*, one at a time (`Memory.visibility`). A room-level flag would have been an access-control axis nobody asked for, guarding data that was never private |
| `Friendship(requesterId, addresseeId, status, createdAt)` | **as proposed**, plus `updatedAt` and `acceptedAt` | Correct first time. One row per relationship rather than a request table and a friend table — see 13 §3.1 |
| `User.displayName`, `User.avatarKey` | **neither** | Both exist to build a profile page, and there is no profile page. The product's answer to "who is this" is their creature (`project-overview.md` §16), so the public view carries a pet, not an avatar. `username` is the display name |

### 6.1 What was actually added

Two altered tables and six new ones. Every foreign key to `User` is
`ON DELETE CASCADE`, matching `Goal` and `Memory`: deleting an account takes its
side of every relationship with it.

| Table | Change | Severity |
|---|---|---|
| `User` | `+ usernameKey TEXT NOT NULL UNIQUE` | blocking — the whole discovery model |
| `Memory` | `+ visibility TEXT NOT NULL DEFAULT 'private'`, `+ index (ownerId, visibility, createdAt)` | blocking for public memories |
| `Friendship` | new | blocking for friends |
| `Park` | new | blocking for parks |
| `ParkParticipant` | new | blocking — capacity and presence |
| `ParkMessage` | new | blocking for park chat |
| `Conversation` | new | blocking for direct messages |
| `DirectMessage` | new | blocking for direct messages |

### 6.2 `User.usernameKey` — two columns for one fact

Deliberate, and the argument is the same one §6 of this document makes about
`FocusSession`'s missing partial index.

Uniqueness has to be **case-insensitive**: `Kass` and `kass` naming two accounts
is the same failure as two `kass`es. The natural expression is a unique index on
`lower(username)` — which **Prisma cannot declare**, so the next
`prisma migrate dev` would generate a migration dropping it again. That is not a
trap worth walking into for the one column the entire social layer is keyed on.

So `username` holds what the owner typed and `usernameKey` holds it lowercased,
with the constraint on the second. A plain column Prisma understands cannot be
dropped behind our backs, and it makes the lookup an index hit rather than a
`mode: 'insensitive'` scan. `UsersService.setUsername` is the only writer.

### 6.3 `Memory.visibility` — the backfill is the decision

`DEFAULT 'private'`, and the migration lets **every existing row take that
default**. A visibility system that ships by publishing what people wrote before
it existed is a leak with a changelog entry. Nobody's memory becomes visible to
anybody until its owner says so, one memory at a time.

The default is repeated in the DTO and in the service as well as in the column,
because this is the one setting in the product that must never fail open.

### 6.4 The migration is safe on a populated database

`usernameKey` is the only column added `NOT NULL` without a default, and it is
**backfilled before the constraint is applied**:

```sql
ALTER TABLE "User" ADD COLUMN "usernameKey" TEXT;
UPDATE "User" SET "usernameKey" = lower("username") WHERE "usernameKey" IS NULL;
ALTER TABLE "User" ALTER COLUMN "usernameKey" SET NOT NULL;
CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");
```

If two accounts already differ only in case, the index creation fails and the
migration stops — which is the right outcome. That is a collision a person has
to resolve, not one to silently pick a winner for.

---

## 7. Summary

| Priority | Change | Blocks |
|----------|--------|--------|
| 0 | Better Auth tables (`AuthUser`/`AuthSession`/`AuthAccount`/`AuthVerification`) | everything — **implemented** |
| 1 | `Goal` completion columns | package 07 (the whole reward loop) |
| 2 | `ObjectDefinition` category/rarity/tags | packages 05, 06, 07 |
| 3 | `Environment` bounds + background | package 04 |
| 4 | `InventoryItem` unique `(ownerId, objectId)` | package 06 correctness |
| 5 | Social tables (`Friendship`, `Park`, `ParkParticipant`, `ParkMessage`, `Conversation`, `DirectMessage`, `User.usernameKey`, `Memory.visibility`) | package 13 — **implemented** |

Once approved, `InitialDB-plan.md` should be updated in the same change so the two
documents do not diverge.

---

## Applied: `20260824120000_goals_memories_and_placed_objects`

Three tables that existed as placeholders became tables the product writes to.
All three held **zero rows** when the migration was written — verified against
the database, not assumed — which is what makes the `NOT NULL` columns added
without defaults and the four dropped columns safe here and only here. Any later
change to these must backfill instead.

### `Goal`

| Column | Change | Why |
|---|---|---|
| `title` | added, `TEXT NOT NULL` | `InitialDB-plan.md` gave a goal only `description`; a list you can complete needs a line to show |
| `status` | added, default `'open'` | a string, not a Postgres enum: the set is two values today and an enum costs a migration every time that changes |
| `createdAt`, `updatedAt` | added | ordering, and "done today" |
| `completedAt` | added, nullable | |
| `description` | default `''` | kept rather than renamed, so nothing referring to it had to change |
| index | `(ownerId, status)` replaces `(ownerId)` | the index the six-goal cap is counted on |

### `Memory`

| Column | Change | Why |
|---|---|---|
| `goalId` | added, nullable, **UNIQUE**, `ON DELETE SET NULL` | the duplicate-memory defence: a retried completion cannot make a second one, because the database will not hold two rows for one goal |
| `petId` | now nullable | a memory of finishing a goal belongs to the user's day; an account can complete one before naming a creature |
| `imageUrl` | now nullable | keeping a picture is optional at every step |
| index | `(ownerId, createdAt)` replaces `(ownerId)` | the memory book is newest-first |

### `EnvironmentObject`

Restructured. It was shaped for a catalog that was never built, and it now
records what the user actually decided.

| Column | Change | Why |
|---|---|---|
| `key` | added, `@@unique([environmentId, key])` | the client's own id for the object in the scene. A save has to find the row a dragged object belongs to without renumbering the room |
| `type` | added | the catalog is procedural code (`ObjectCatalog.ts`), not rows, so the type key is the whole reference — as `Pet.appearanceData` is authoritative over any future appearance catalog |
| `col`, `row` | added | **cells, not pixels.** Placement snaps to whole cells, so the cell *is* the decision and a float would only record the rounding. It also survives a change to the tile size |
| `definitionData` | added, `Json` | seed and three colours. Validated by `environments/object-definition.ts` |
| `x`, `y`, `rotation`, `scale` | **dropped** | superseded by `col`/`row`; and a per-instance `scale` is exactly the thing `AGENTS.md` (Room Rules) forbids — an object's size is its footprint |
| `objectId` | now **nullable** | reserved for the `ObjectDefinition` catalog (`05-object-endpoints.md`), which does not exist yet. Nullable so the arrangement can be saved now without inventing catalog rows to point at |
| `environmentId` FK | now `ON DELETE CASCADE` | deleting a room takes its contents |

`Goal.ownerId` and `Memory.ownerId` also gained `ON DELETE CASCADE`, matching
`Pet`.

---

## 6. `FocusSession` and `User.affection` — required for focus sessions

`InitialDB-plan.md` has no table for "an hour somebody committed to", and no
column for how the creature feels about the person watching. Both are needed by
`12-focus-endpoints.md`.

**Severity: blocking for package 12.** Implemented —
`Backend/prisma/focus-session.prisma`, migration
`20260824155651_focus_sessions_and_affection`.

### `FocusSession` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `ownerId` | UUID → `User`, `ON DELETE CASCADE` | never taken from a request body |
| `goalId` | UUID? → `Goal`, **`ON DELETE SET NULL`** | an afternoon somebody spent survives the task it was spent on — the same argument as `Memory.goalId`. An *active* session always has one; the service refuses to delete a goal out from under a running session |
| `durationMinutes` | Int | what was committed to, not what elapsed |
| `status` | String, default `'active'` | `active` \| `completed` \| `aborted`. A string, not a Postgres enum, matching `Goal.status` |
| `startedAt` | DateTime, default `now()` | **this column plus `durationMinutes` is the timer.** No countdown is stored and no client clock is consulted |
| `endedAt` | DateTime? | for a completion this is `startedAt + duration` — the moment the time was served, not the moment the browser said so |

Indexes: `(ownerId, status)` answers "is one running?" on every request;
`(ownerId, startedAt)` is what the affection system's abort window reads.

**No partial unique index enforcing one active session per user**, deliberately.
Postgres would express it in a line, and Prisma cannot declare it — so the next
`prisma migrate dev` would generate a migration dropping it again. The rule is
counted inside the transaction that inserts instead, exactly like the six-goal
cap.

### `User` — three added columns

| Column | Type | Default | Why |
|---|---|---|---|
| `affection` | Float | `0.5` | 0..1. Neutral is where a relationship that has not happened yet honestly sits |
| `affectionAt` | DateTime | `now()` | when the value was last settled. Decay is *computed*, not ticked — this is why no scheduled job exists |
| `lastFollowThroughAt` | DateTime? | `null` | the last session served or goal finished. NULL reads as "nothing to decay from", not "never turned up" |

All three are additive and defaulted, so existing rows need no backfill.

**On `User`, not on `Pet` — a deviation from the obvious place, recorded here
because it is deliberate.** `Pet` rows are saved *presets* the creature editor
writes to (`pets.service.ts` documents that deviation too): a user may have none
of them, may keep several, and may delete any of them. Affection is not a fact
about a rig. It is the state of a relationship built out of goals kept and hours
served, and hanging it off a preset would mean it reset when somebody re-saved
their creature with different ears — or had nowhere to live at all for the very
common case of an account that has never pressed Save.

`AffectionService` is the only writer, and it only ever moves the value by a few
hundredths at a time inside somebody else's transaction. No route accepts an
affection value.
