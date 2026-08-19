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

## 3. `Environment` — required for the MVP

| Column | Type | Default | Needed by |
|--------|------|---------|-----------|
| `backgroundKey` | String | `"default_room"` | `GET /environments/:id/scene` |
| `width` | Int | `1920` | placement bounds |
| `height` | Int | `1080` | placement bounds |
| `floorY` | Int | `760` | pet pathing, object anchoring |
| `createdAt` | DateTime | `now()` | ordering |

Without bounds the backend cannot validate that a placed object is inside the room, and
placement validation would have to move to the client.

**Severity: blocking** for placement validation.

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

## 6. Social / realtime `[LATER]` — do not build

Required before `10-realtime-events.md` can be implemented:

| Change | Purpose |
|--------|---------|
| `Environment.visibility` Enum(`private`,`friends`,`public`) | who may join |
| new table `Friendship(id, requesterId, addresseeId, status, createdAt)` | relationship model |
| `User.displayName`, `User.avatarKey` | public profile without leaking email |

This is a genuine schema expansion, not an additive tweak. It must be proposed and
approved separately when social features are actually requested.

---

## 7. Summary

| Priority | Change | Blocks |
|----------|--------|--------|
| 1 | `Goal` completion columns | package 07 (the whole reward loop) |
| 2 | `ObjectDefinition` category/rarity/tags | packages 05, 06, 07 |
| 3 | `Environment` bounds + background | package 04 |
| 4 | `InventoryItem` unique `(ownerId, objectId)` | package 06 correctness |
| 5 | Social tables | package 10 — deferred |

Once approved, `InitialDB-plan.md` should be updated in the same change so the two
documents do not diverge.
