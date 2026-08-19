# 05 — OBJECT ENDPOINTS

**Base path:** `/api/v1/objects`
**Module:** `ObjectModule`
**Table:** `ObjectDefinition` (`id`, `type`, `appearanceData`)

`ObjectDefinition` is the **global catalog** — what an object fundamentally is,
independent of who owns it or where it sits (`InitialDB-plan.md`). It is the only table
in the system that is not owned by a user.

Three concepts must not be confused:

```text
ObjectDefinition   "Moon Lamp"          — what it is        (this document)
InventoryItem      "kass owns 3"        — who has it        (06)
EnvironmentObject  "one at x420 y780"   — where it is       (04)
```

---

## 1. Endpoints

| # | Method | Path | Auth | Scope | Description |
|---|--------|------|------|-------|-------------|
| 1 | `GET` | `/objects` | public | `[MVP]` | List/filter catalog definitions |
| 2 | `GET` | `/objects/:objectId` | public | `[MVP]` | One definition |
| 3 | `POST` | `/objects` | admin | `[LATER]` | Create a definition |
| 4 | `PATCH` | `/objects/:objectId` | admin | `[LATER]` | Edit a definition |
| 5 | `DELETE` | `/objects/:objectId` | admin | `[LATER]` | Retire a definition |

The catalog is **seeded** in the MVP (a Prisma seed script), not authored through the
API. Endpoints 3–5 are specified so a future admin tool has a defined shape; they must
be guarded by an admin role that does not exist yet.

---

## 2. `GET /objects` `[MVP]`

Read-only and unauthenticated: the catalog is static game data with nothing
user-specific in it, and the pet creator / shop UI reads it before the world loads.

Query params:

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | `furniture` \| `decoration` \| `toy` \| `plant` \| `light` \| `food` |
| `search` | string | substring match on `type` |
| `tag` | string | repeatable, matches `behaviorTags` |
| `limit`, `cursor`, `order` | — | see `00-conventions.md` §6 |

`200`

```json
{
  "items": [
    {
      "id": "def-moon-lamp",
      "type": "Moon Lamp",
      "category": "light",
      "appearanceData": {
        "shape": "sphere",
        "glow": true,
        "palette": ["#F5E1C0", "#9FB8DA"],
        "footprint": { "width": 64, "height": 96 }
      },
      "interactive": true,
      "behaviorTags": ["light", "comfort"],
      "rarity": "common"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

`category`, `interactive`, `behaviorTags` and `rarity` are proposed additions to
`ObjectDefinition` — see `11-schema-additions.md`. They are separated out of
`appearanceData` because the simulation and the reward system query them, and querying
inside a JSON column for gameplay logic gets expensive fast.

---

## 3. `appearanceData` contract

Object visuals stay **code-generated/procedural** (`AGENTS.md` — Visual Rules), so
`appearanceData` holds drawing *parameters*, never an image URL:

```json
{
  "shape": "sphere",
  "glow": true,
  "palette": ["#F5E1C0", "#9FB8DA"],
  "footprint": { "width": 64, "height": 96 },
  "anchor": { "x": 0.5, "y": 1.0 },
  "layers": [
    { "kind": "ellipse", "fill": 0, "offset": [0, -40], "size": [64, 64] },
    { "kind": "glow",    "fill": 1, "radius": 80, "alpha": 0.35 }
  ]
}
```

`anchor.y = 1.0` means objects are anchored at their base, which is what makes
`zIndex = y` depth sorting correct in the room.

---

## 4. `behaviorTags` and the simulation

`behaviorTags` is the contract between the catalog and the pet simulation
(`techStack.md` — Pet Simulation): the pet decides what to do with an object from its
tags, not from its name.

| Tag | Pet behaviour it enables |
|-----|--------------------------|
| `sit` | pet can sit on it |
| `sleep` | pet can sleep on it |
| `play` | pet can play with it |
| `food` | pet can eat from it |
| `light` | affects room mood / comfort |
| `comfort` | raises comfort while nearby |
| `curiosity` | attracts investigation behaviour |

Tags are read client-side from the scene payload (`04-environment-endpoints.md` §4);
no extra request is needed.

---

## 5. `GET /objects/:objectId` `[MVP]`

`200` → a single definition in the shape above. `404 OBJECT_NOT_FOUND` if unknown.

---

## 6. Admin endpoints `[LATER]`

`POST` / `PATCH` / `DELETE` mirror the read shape. Rules for whenever they are built:

- `DELETE` must **soft-retire** (`retiredAt`), never hard-delete — existing
  `InventoryItem` and `EnvironmentObject` rows reference the definition, and hard
  deletion would break every room containing it.
- Editing `appearanceData` changes every already-placed instance. That is intended
  (procedural assets improve globally), but it makes edits high-impact.
