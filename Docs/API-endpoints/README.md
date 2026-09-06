# API ENDPOINTS — INDEX

This folder specifies the complete REST surface of the **Pocus** backend.

It is a *specification*, not an implementation report. No backend code exists yet
(`/Backend` is empty), so every endpoint listed here is planned work.

Source documents this spec is derived from:

- `../project-overview.md` — MVP scope and system responsibilities
- `../techStack.md` — NestJS + Prisma + PostgreSQL + Better Auth + REST/WebSockets
- `../InitialDB-plan.md` — tables, fields and relationships
- `../pet-anatomy.md` — `appearanceData` parameter shape
- `../animation-approach.md` — persistent vs runtime pet state
- `../AGENTS.md` — architecture rules this spec must not violate

---

## 1. Packages

Each package maps 1:1 to a **NestJS module** and owns a single resource group.

| # | Package | Base path | Module | Primary tables |
|---|---------|-----------|--------|----------------|
| 00 | [Conventions](./00-conventions.md) | — | — | — |
| 01 | [Auth](./01-auth-endpoints.md) | `/api/auth` | `AuthModule` | Better Auth tables |
| 02 | [User](./02-user-endpoints.md) | `/api/v1/users` | `UserModule` | `User` |
| 03 | [Pet](./03-pet-endpoints.md) | `/api/v1/pets` | `PetModule` | `Pet` |
| 04 | [Environment](./04-environment-endpoints.md) | `/api/v1/environments` | `EnvironmentModule` | `Environment`, `EnvironmentObject` |
| 05 | [Object](./05-object-endpoints.md) | `/api/v1/objects` | `ObjectModule` | `ObjectDefinition` |
| 06 | [Inventory](./06-inventory-endpoints.md) | `/api/v1/inventory` | `InventoryModule` | `InventoryItem` |
| 07 | [Goal](./07-goal-endpoints.md) | `/api/v1/goals` | `GoalModule` | `Goal` |
| 08 | [Memory](./08-memory-endpoints.md) | `/api/v1/memories` | `MemoryModule` | `Memory` |
| 09 | [Media](./09-media-endpoints.md) | `/api/v1/media` | `MediaModule` | file storage |
| 10 | [Realtime](./10-realtime-events.md) | — | — | *superseded by 13* |
| 11 | [Schema additions](./11-schema-additions.md) | — | — | proposed DB deltas |
| 12 | [Focus](./12-focus-endpoints.md) | `/api/v1/focus` | `FocusModule` | `FocusSession`, `User.affection` |
| 13 | [Social](./13-social-endpoints.md) | `/api/v1/users`, `/friends`, `/parks`, `/chat` + `ws://…/social` | `UsersModule`, `FriendsModule`, `ParksModule`, `ChatModule`, `RealtimeModule` | `User`, `Friendship`, `Park`, `ParkParticipant`, `ParkMessage`, `Conversation`, `DirectMessage`, `Memory.visibility` |

---

## 2. Ownership rules

- Every table except `ObjectDefinition` is owned by a `User`.
- `ObjectDefinition` is **global catalog data** — read-only for end users, seeded by the backend.
- Every request is scoped to the session user. A resource belonging to another user
  returns `404`, never `403`, so IDs cannot be enumerated.

---

## 3. MVP vs later

Endpoints are tagged in each document:

- **`[MVP]`** — required for the MVP loop in `project-overview.md` §7.
- **`[LATER]`** — specified for completeness, not to be implemented now.
  Per `AGENTS.md`: *"Do not implement future features unless explicitly requested."*

The MVP loop only needs:

```text
Auth → User(me) → Pet(create/customize/state) → Environment(scene/objects)
     → Inventory → Goal(create/complete) → Memory
```

Focus (12) sits inside that loop rather than beside it: a session is committed
to a `Goal` and moves `User.affection`, and finishing a goal still runs through
`Goal`+`Memory` exactly as before. "I did the time" and "I am done" are
different sentences — see `12-focus-endpoints.md` §1.

Social (13) sits *outside* it, and deliberately: nothing in the MVP loop needs a
second person. It extends the loop at one point only — a memory made by
finishing a goal can now be shared — and otherwise adds a place to go rather
than a step to take. That is why the whole surface is behind one lazy boundary
and opens no connection until somebody asks for it.

---

## 4. Endpoint count

| Package | MVP | Later | Total |
|---------|-----|-------|-------|
| Auth | 5 | 4 | 9 |
| User | 3 | 3 | 6 |
| Pet | 11 | 1 | 12 |
| Environment | 10 | 2 | 12 |
| Object | 2 | 3 | 5 |
| Inventory | 3 | 1 | 4 |
| Goal | 7 | 1 | 8 |
| Memory | 6 | 1 | 7 |
| Media | 3 | 0 | 3 |
| Focus | 4 | 0 | 4 |
| Social | 14 | 0 | 14 |
| **Total** | **68** | **16** | **84** |

Social's fourteen are REST only. Joining a park, moving a creature, saying
something in one and two creatures interacting are socket events, not endpoints
— see `13-social-endpoints.md` §8 for why joining in particular is not a
request.
