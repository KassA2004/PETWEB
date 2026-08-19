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
