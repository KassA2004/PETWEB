# API ENDPOINTS — INDEX

This folder specifies the complete REST surface of the **Digital Pet World** backend.

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
| 10 | [Realtime](./10-realtime-events.md) | `ws://…/world` | `RealtimeModule` | — (future) |
| 11 | [Schema additions](./11-schema-additions.md) | — | — | proposed DB deltas |

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
| **Total** | **50** | **16** | **66** |
