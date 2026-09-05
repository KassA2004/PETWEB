# 07 — GOAL ENDPOINTS

**Base path:** `/api/v1/goals`
**Module:** `GoalModule`
**Table:** `Goal` (`id`, `ownerId`, `description`)

Goals are the link between real life and the digital world
(`project-overview.md` §2). Completing a goal is the only user action that produces
rewards, so this package owns the reward pipeline.

```text
REAL LIFE → Goal completed → Reward (item) → Memory → Pet reacts
```

---

## 1. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `GET` | `/goals` | `[MVP]` | List goals, filterable by status |
| 2 | `POST` | `/goals` | `[MVP]` | Create a goal |
| 3 | `GET` | `/goals/:goalId` | `[MVP]` | One goal |
| 4 | `PATCH` | `/goals/:goalId` | `[MVP]` | Edit title/description/due date |
| 5 | `DELETE` | `/goals/:goalId` | `[MVP]` | Delete a goal |
| 6 | `POST` | `/goals/:goalId/complete` | `[MVP]` | Complete and receive the reward |
| 7 | `POST` | `/goals/:goalId/reopen` | `[MVP]` | Undo a completion |
| 8 | `GET` | `/goals/stats` | `[LATER]` | Streaks and completion history |

`InitialDB-plan.md` gives `Goal` only `id`, `ownerId` and `description`. Status,
title and timestamps are required for endpoints 1, 6 and 7 to exist at all — proposed
in `11-schema-additions.md`.

---

## 2. `POST /goals` `[MVP]`

```json
{
  "title": "Run 5km",
  "description": "Three times this week, before work.",
  "dueAt": "2026-08-26T00:00:00.000Z"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `title` | string | 1–80 chars, required |
| `description` | string | 0–500 chars, optional |
| `dueAt` | ISO date | optional, must be in the future |

`201`

```json
{
  "id": "g-01",
  "ownerId": "b1e2...",
  "title": "Run 5km",
  "description": "Three times this week, before work.",
  "status": "open",
  "dueAt": "2026-08-26T00:00:00.000Z",
  "completedAt": null,
  "createdAt": "2026-08-19T14:03:11.000Z"
}
```

The backend deliberately does **not** model sub-tasks, recurrence, priorities or
projects. This is not a productivity application with a pet attached
(`project-overview.md` §6) — the goal system stays minimal on purpose.

---

## 3. `GET /goals` `[MVP]`

Query params:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `open` \| `completed` \| `all` | `open` | filter |
| `limit`, `cursor`, `order` | — | — | see `00-conventions.md` §6 |

`200` → paginated envelope of goal objects.

---

## 4. `POST /goals/:goalId/complete` `[MVP]`

The centre of the reward loop. One request, one transaction, three side effects.

Request body: none (or `{ "note": "finally did it" }` to seed the memory description).

```text
POST /goals/:goalId/complete
        ↓
1. mark goal completed (status, completedAt)
        ↓
2. roll a reward from the ObjectDefinition catalog  → grant InventoryItem
        ↓
3. create a Memory of type "goal_completed"
        ↓
return all three + an animation hint for the pet reaction
```

`200`

```json
{
  "goal": {
    "id": "g-01",
    "status": "completed",
    "completedAt": "2026-08-19T18:40:02.000Z"
  },
  "reward": {
    "objectId": "def-moon-lamp",
    "quantity": 1,
    "definition": { "type": "Moon Lamp", "category": "light", "rarity": "common" },
    "isNewDefinition": true
  },
  "memory": {
    "id": "m-14",
    "type": "goal_completed",
    "title": "Ran 5km",
    "createdAt": "2026-08-19T18:40:02.000Z"
  },
  "petReaction": {
    "petId": "9a1f...",
    "reaction": "excited",
    "animationHint": "happy_hop"
  }
}
```

Rules:

- All writes share one Prisma transaction; a failed reward roll must not leave the goal
  completed.
- Completing an already-completed goal → `409 GOAL_ALREADY_COMPLETED`.
- Reward selection is server-side only. The client never chooses its own reward.
- `isNewDefinition` is true the first time the user ever receives that object — the UI
  uses it for a "new discovery" moment.
- `petReaction` is `null` when the user has no pet yet.

### Reward rolling

Deterministic and boring on purpose — no gambling mechanics, no engagement loops
(`project-overview.md` §3):

| Rarity | Weight |
|--------|--------|
| `common` | 70% |
| `uncommon` | 25% |
| `rare` | 5% |

Weights live in backend config. Definitions the user does not own yet are weighted
slightly higher so collections keep growing.

---

## 5. `POST /goals/:goalId/reopen` `[MVP]`

Undo for a mis-tap. Reverts `status` to `open` and clears `completedAt`.

It does **not** revoke the granted item and does **not** delete the memory: the world
should never take things away from the user. If reopened, a later completion grants a
new reward — capped by config to prevent farming (`409 GOAL_REWARD_ALREADY_CLAIMED`
once a goal has already paid out, unless `allowRepeatRewards` is enabled).

`200` → the updated goal.

---

## 6. `DELETE /goals/:goalId` `[MVP]`

`204 No Content`. Memories created from the goal survive — they belong to the user's
history, not to the goal.

---

## 7. `GET /goals/stats` `[LATER]`

```json
{ "openCount": 3, "completedCount": 27, "currentStreakDays": 4, "longestStreakDays": 11 }
```

Deferred: streaks nudge toward daily-engagement pressure, which the product explicitly
avoids. Build only if explicitly requested.

---

## Implementation notes

**Module:** `Backend/src/goals/` · **Client:** `frontend/src/features/goals/`

Implemented: `GET /goals`, `POST /goals`, `GET/PATCH/DELETE /goals/:goalId`,
`POST /goals/:goalId/complete`, `POST /goals/:goalId/reopen`.
Not implemented: `GET /goals/stats` (`[LATER]`).

### Deviations from the spec above, and why

**A maximum of six open goals.** Not in the original spec; it is the product
saying "finish something" out loud. A list you can add to for ever becomes a
place to put things you are avoiding, and the seventh goal is almost never the
one that gets done — it is the one that makes the other six feel heavier.

- Counted **inside the transaction that inserts**, so two tabs racing cannot
  produce a seventh. Verified: two concurrent creates at six open leave six.
- `409` with code `GOAL_LIMIT_REACHED` and the user-facing message from
  `goals/goal-limit.ts`, so the wording lives in exactly one place.
- Reopening is capped too — otherwise the cap is one "Undo" away from meaningless.

**Completion produces a memory, not a reward.** The spec's three side effects
(status, `InventoryItem`, `Memory`) require an `ObjectDefinition` catalog that
does not exist (`05-object-endpoints.md`). What is implemented is the goal and
the memory, in one transaction. The reward is still granted client-side from the
mock pool in `lib/mock/world.ts` and is the last mock left in the dashboard.

**The memory is optional at every level.** No body completes the goal; a
`memory` with no `imageUrl` keeps a note; an `imageUrl` must be a path the media
endpoints handed out (`media/media-paths.ts`), never a URL the client invented.

**Completion is idempotent.** Completing an already-completed goal returns the
first result rather than erroring, and `Memory.goalId` is `UNIQUE` — so a
request the client retried after a timeout cannot produce a second memory.

**Reopening keeps the memory, unlinked.** It is a record of a day, not a
property of the task; quietly deleting somebody's picture because they unticked
a checkbox would be the worst kind of tidy. It has to lose the link, because the
unique constraint would otherwise stop the goal ever being completed again.

**A goal being worked on right now cannot be finished, reopened or deleted.**
`409 FOCUS_IN_PROGRESS`. Added with focus sessions (`12-focus-endpoints.md`),
and not for tidiness: while a session runs, the room is dark and the creature
asleep *because of that goal*, so deleting it would leave the user in a room
they cannot turn the lights back on in. The check asks `FocusService`, whose
`current` resolves sessions that expired while the app was closed — so a goal
whose session ran out last night is not mid-session.

**Completing a goal raises affection; reopening gives it back.** The largest
single event in the affection system (`+0.09`), applied inside the same
transaction that writes the status and the memory: a completion the creature did
not notice is a completion the product did not record. Reopening applies the
same delta backwards, because without it a checkbox pressed forty times is a
creature that adores you for nothing. The two do not cancel exactly — gains are
scaled by the room above and losses by the value below — so a complete/reopen
cycle costs a fraction of a percent. Churning slowly loses; doing the thing
wins.

> **Finishing a session is not finishing a goal.** "I did the time" and "I am
> done" are different sentences, and a goal may span many sessions. See
> `12-focus-endpoints.md` §1.


**Every goal carries the time served against it.** `focusedMinutes`, on every
goal the API returns, is the sum of `durationMinutes` over that goal's
`FocusSession` rows with `status: 'completed'` — so the list can say
`2h 15m focused` under a title without the client keeping a tally of its own.

```json
{
  "id": "g-01",
  "title": "Write the report",
  "status": "open",
  "focusedMinutes": 135
}
```

Four properties of it are worth stating, because each one is a decision:

- **Derived, never stored.** There is no counter on `Goal`. `FocusSession`
  already records every stretch of time against the goal it was served for, and
  a column here would be a second copy of that fact — one that can disagree with
  it. `list` pays one grouped query for the whole page, over the
  `@@index([ownerId, status])` the one-slot rule already needs.
- **Only served time counts**, the same rule `FocusService.seal` applies to
  `User.focusMinutes`: a session abandoned half way adds nothing, because the
  time was not served.
- **Finishing the goal does not clear it, and reopening does not restore it** —
  it was never affected by either. The hours happened.
- **Deleting the goal takes its total with it.** `FocusSession.goalId` is
  `ON DELETE SET NULL`, so the sessions survive and keep counting toward
  `User.focusMinutes`; they simply no longer describe any goal, and no other
  goal inherits them.
