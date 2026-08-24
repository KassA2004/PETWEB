# 12 — FOCUS ENDPOINTS

**Base path:** `/api/v1/focus`
**Module:** `FocusModule` (+ `AffectionModule`)
**Tables:** `FocusSession`, `User.affection`

The loop this package exists for:

```text
choose one thing → drag it into Focus → commit to a length
      → the lights go out, the creature sleeps, the room locks
      → work
      → come back → the creature reacts to how you have been following through
      → the relationship shifts, over days
```

It is deliberately **not** a productivity feature with a pet attached
(`project-overview.md` §6). There is no history route, no statistics, no streak
and no score, because nothing in the product shows a user a table of their own
hours. The rows exist so the creature can have an opinion.

---

## 1. A session is not a goal

The single most important distinction in this package, and the one everything
else follows from:

| | means | ends when |
|---|---|---|
| **focus session** | "I did the time" | the committed minutes elapse, or the user stops early |
| **goal** | "I am done" | the user says so, deliberately (`07-goal-endpoints.md` §4) |

A goal can outlive any number of sessions. Finishing a session never completes a
goal, and completing a goal never needs a session to have happened. They are two
different sentences and the product must never conflate them — including in its
sounds, where finishing a goal keeps the fanfare and finishing a session gets
something visibly smaller (`audio-and-feedback.md` §3).

---

## 2. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `GET` | `/focus` | `[MVP]` | What is running, what just finished, how the creature feels |
| 2 | `POST` | `/focus/sessions` | `[MVP]` | Commit to a length |
| 3 | `POST` | `/focus/sessions/:sessionId/complete` | `[MVP]` | The time is up |
| 4 | `POST` | `/focus/sessions/:sessionId/abort` | `[MVP]` | Stop early |

Singular `/focus` on purpose: there is one slot, and an interface that could
show two answers at once would be answering a different question.

---

## 3. `GET /focus` `[MVP]`

The recovery endpoint. Called on load, on reconnect and when the tab comes back,
and it is the only request the client needs to put a half-finished session back
together.

`200`

```json
{
  "active": {
    "id": "f-01",
    "goalId": "g-01",
    "durationMinutes": 45,
    "status": "active",
    "startedAt": "2026-08-24T15:00:00.000Z",
    "endsAt": "2026-08-24T15:45:00.000Z",
    "endedAt": null,
    "remainingSeconds": 1732
  },
  "justFinished": null,
  "affection": { "value": 0.62, "level": "happy" },
  "presets": [25, 45, 60, 90],
  "minMinutes": 10,
  "maxMinutes": 240
}
```

**This route may write.** A `GET` that changes data is unusual and it is the
right call here: an active session whose time ran out while the app was closed
is resolved as `completed` on the next read, and returned once as
`justFinished` so the room can wake the creature rather than quietly resetting
itself. The alternative is a timer that lies until somebody presses something.

`presets`, `minMinutes` and `maxMinutes` come from the server so the buttons and
the rule that validates them cannot drift (`focus/durations.ts`).

---

## 4. `POST /focus/sessions` `[MVP]`

```json
{ "goalId": "g-01", "durationMinutes": 45 }
```

| Field | Rules |
|-------|-------|
| `goalId` | UUID, must be the session user's, must be `open` |
| `durationMinutes` | integer, 10–240 |

`200` → `{ "session": …, "affection": … }`

| Refusal | Code | Status |
|---|---|---|
| a session is already running | `FOCUS_IN_PROGRESS` | 409 |
| shorter than the minimum | `VALIDATION_FAILED` | 422 |
| the goal is already finished | `CONFLICT` | 409 |
| the goal is not yours | `NOT_FOUND` | 404 |

**Ten minutes is the floor, and the floor is the feature.** Anything shorter
defeats the point: a two-minute session is not focus, it is a light switch with
extra steps, and offering one would turn the creature's sleep into a toggle.

**A repeat of the same request is not a second session.** Starting a session for
the goal that is already running returns the running one, which is what a
double-clicked confirm and a retried request both look like. Starting a
*different* one is refused.

**One slot is counted inside the transaction that inserts**, exactly like the
six-goal cap (`goals/goal-limit.ts`). Not a partial unique index, though
Postgres would express it in a line: Prisma cannot declare one, so the next
`migrate dev` would generate a migration dropping it again.

---

## 5. The clock

> **`startedAt + durationMinutes` is the timer. Nothing else is.**

No countdown is stored, and the client's clock is never consulted. Every
response carries `remainingSeconds`, computed on the server; the client records
that number and the instant it arrived, and derives the display from the
difference between two readings of its own monotonic-enough clock.

Three things fall out of that:

```text
  a wrong system clock   never consulted — the browser measures an interval,
                         which it is good at, rather than comparing timestamps,
                         which it is not
  a sleeping tab         timers are throttled to nothing in a background tab;
                         an anchored countdown recomputes rather than decrements
  a refresh mid-session  is just another GET. There is no state to restore
```

### `POST /focus/sessions/:sessionId/complete` `[MVP]`

The client says the countdown reached zero. The server **checks** rather than
believes it.

| Case | Response |
|---|---|
| the time really has elapsed | `200`, status `completed`, `endedAt` = the deadline |
| it has not | `409 FOCUS_NOT_FINISHED`, message carries the true remaining seconds |
| already completed or aborted | `200`, unchanged |

`FOCUS_NOT_FINISHED` is not an error the user should ever see. It means the
browser was early; the client re-reads `/focus` and carries on waiting.

`endedAt` is **the deadline, not the moment the request arrived**. The time was
finished when it was finished, and a session resolved four hours late must not
read as a four-hour session.

### `POST /focus/sessions/:sessionId/abort` `[MVP]`

Stopping early. Always allowed, never interrogated, no confirmation dialog. The
session is recorded `aborted`, `endedAt` is now, and affection dips slightly.

---

## 6. Affection

Persistent, on `User` (see `11-schema-additions.md` §6 for why not on `Pet`).
Six bands over `0..1`:

```text
  very-low   low   neutral   happy   affectionate   very-affectionate
   0.00     0.20    0.38     0.56       0.74             0.90
```

### What moves it

| Event | Delta | Follow-through? |
|---|---|---|
| start a session | `+0.012` | no — promising is not doing |
| complete a session | `+0.03 … +0.06`, by length | yes |
| complete a goal | `+0.09` | yes |
| reopen a completed goal | `−0.09` | no |
| abort a session | `−0.03`, worse if repeated within 3 days | no |
| ten days of silence | `−0.02` per day, floor `0.22` | — |

Every delta is scaled by how much room is left in its direction
(`affection.ts:applyDelta`), so the curve approaches both ends without reaching
either: a creature can always be won back, and can never be finished with. It
also means a complete/reopen cycle costs a fraction of a percent rather than
paying — churning slowly loses.

**Nothing here rewards attendance.** There is no event for opening the page,
clicking the creature or decorating the room. Every one of the five is something
the user committed to and then did, or did not, do.

**A break is not neglect.** Decay does not start for ten days, and bottoms out
at "low" rather than at zero. Somebody who goes on holiday comes back to a
creature that is a bit reserved, not one that hates them — the difference
between "you were away" and "you kept promising and leaving", which is what the
abort window is for.

### Decay is lazy

Nothing ticks and no job runs. `affectionAt` and `lastFollowThroughAt` are
enough to settle the value on the next read or write, which means a user who
does not visit for a month costs the product nothing and still comes back to a
creature that noticed.

### How it is shown

**By the creature.** It is not a number anywhere in the interface — no
percentage, no bar, no `+3`. The moment a relationship has a score, following
through stops being the point and the score becomes it.

| Level | What the room does |
|---|---|
| low | keeps its distance from the cursor, walks away when it comes close, declines to start games, a slight droop on the resting face |
| high | crosses the room to your hand now and then, watches it, starts games, is generally busier |

Both are *weights on the behaviours that already exist* (`PetBrain.chooseAmbient`,
`pickToy`, `avoidPointer`, `approachPointer`), never a mode. A creature that
came to the cursor every time it was free would be a cursor-follower rather than
a pet — hence the cooldowns and the coin flip on top of them.

One caption is allowed, in the goals panel, in the same grey as everything else:
*"Blorb has been keeping to itself lately."* It describes the creature. It never
asks for anything, and the bottom of the scale is sad in the way a cartoon is
sad — never disgust, never blame.

---

## 7. What a session does to the room

All of it through systems that already existed. There is no "focus mode" in the
scene or in the brain.

```text
  PetRoom.setFocus(true)
      ├─ effective lighting = style.lightsOn AND NOT focused
      │      → the same path the lamp uses → PetBrain.lightsChanged(false)
      │      → the creature goes and finds somewhere to sleep (§41)
      └─ pointerDown / pickWallDecorAt / wallDragStart all refuse
```

**The user's room is not modified.** `RoomStyle.lightsOn` is what *they* chose
and is what gets saved; `lit` is what is true right now. Conflating them would
mean a session quietly rewriting somebody's room, and an hour later restoring it
to whatever the last write happened to be.

**The lock lives in the scene, not in React.** The habitat, the wall palette and
the canvas all arrive through those three methods, and a lock in a component is
a lock the next entry point forgets about.

---

## 8. Goals under a running session

`GoalsService` refuses to complete, reopen or delete a goal that is currently
being worked on (`409 FOCUS_IN_PROGRESS`). Not tidiness: the room is dark and
the creature asleep *because of that goal*, and deleting it would leave the user
in a room they cannot turn the lights back on in.

The check goes through `FocusService.activeGoalId`, whose `current` resolves
expired sessions first — so a goal whose session ran out last night is not
mid-session and can be finished the moment the user comes back.

`FocusSession.goalId` is nullable with `ON DELETE SET NULL`, for the same reason
`Memory.goalId` is: an afternoon somebody actually spent survives the task it
was spent on.
