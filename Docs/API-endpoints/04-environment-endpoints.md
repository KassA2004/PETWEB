# 04 — ENVIRONMENT ENDPOINTS

**Base path:** `/api/v1/environments`
**Module:** `EnvironmentModule`
**Tables:** `Environment` (`id`, `ownerId`, `name`), `EnvironmentObject` (`id`, `environmentId`, `objectId`, `x`, `y`, `rotation`, `scale`)

An environment is the room the pet lives in. Placed objects are **instances** of an
`ObjectDefinition` (see `05-object-endpoints.md`), so the same "Mushroom Chair"
definition can be placed many times with different transforms.

---

## 1. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `GET` | `/environments` | `[MVP]` | List the user's environments |
| 2 | `POST` | `/environments` | `[LATER]` | Create an additional environment |
| 3 | `GET` | `/environments/:environmentId` | `[MVP]` | Environment metadata |
| 4 | `PATCH` | `/environments/:environmentId` | `[MVP]` | Rename / change background |
| 5 | `DELETE` | `/environments/:environmentId` | `[LATER]` | Delete an environment |
| 6 | `GET` | `/environments/:environmentId/scene` | `[MVP]` | Full render payload for PixiJS |
| 7 | `GET` | `/environments/:environmentId/objects` | `[MVP]` | Placed object instances |
| 8 | `POST` | `/environments/:environmentId/objects` | `[MVP]` | Place an object from inventory |
| 9 | `GET` | `/environments/:environmentId/objects/:instanceId` | `[MVP]` | One placed instance |
| 10 | `PATCH` | `/environments/:environmentId/objects/:instanceId` | `[MVP]` | Move / rotate / scale |
| 11 | `PATCH` | `/environments/:environmentId/objects` | `[MVP]` | Bulk transform save |
| 12 | `DELETE` | `/environments/:environmentId/objects/:instanceId` | `[MVP]` | Pick up (return to inventory) |

The MVP ships **one environment per user** (`project-overview.md` §7), created during
sign-up bootstrap. Endpoints 2 and 5 are specified but not built yet.

---

## 2. `GET /environments` `[MVP]`

`200`

```json
[
  {
    "id": "77c2...",
    "ownerId": "b1e2...",
    "name": "Kass's Room",
    "objectCount": 7
  }
]
```

---

## 3. `PATCH /environments/:environmentId` `[MVP]`

```json
{ "name": "The Quiet Room", "backgroundKey": "dusk_window" }
```

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | 1–48 chars |
| `backgroundKey` | string | must exist in the seeded background catalog |

`backgroundKey` is a proposed addition to the `Environment` table — see
`11-schema-additions.md`.

---

## 4. `GET /environments/:environmentId/scene` `[MVP]`

The single most important read in the application: everything PixiJS needs to draw the
world in one request. Without it the client would need three round-trips before the
first frame.

`200`

```json
{
  "environment": {
    "id": "77c2...",
    "name": "Kass's Room",
    "backgroundKey": "dusk_window",
    "bounds": { "width": 1920, "height": 1080 },
    "floorY": 760
  },
  "objects": [
    {
      "id": "a11c...",
      "objectId": "def-moon-lamp",
      "x": 420.5,
      "y": 780.0,
      "rotation": 0,
      "scale": 1.0,
      "zIndex": 780,
      "definition": {
        "type": "Moon Lamp",
        "appearanceData": { "shape": "sphere", "glow": true, "palette": ["#F5E1C0"] },
        "interactive": true,
        "behaviorTags": ["light", "comfort"]
      }
    }
  ],
  "pet": {
    "id": "9a1f...",
    "name": "Blorb",
    "appearanceData": { "...": "rig parameters" },
    "stateData": { "mood": "happy", "energy": 72, "activity": "idle" }
  }
}
```

Notes:

- Object definitions are **embedded**, not referenced, so the renderer does not need a
  second lookup per object.
- `zIndex` is derived from `y` (painter's order for a 2D room), not stored.
- `bounds` and `floorY` are room constants used for pathing and clamping placement.
- `pet` is `null` when no pet lives in this environment.

---

## 5. `POST /environments/:environmentId/objects` `[MVP]`

Places an object from the user's inventory into the room. This is the write side of the
"receive item → place item" MVP flow.

```json
{ "objectId": "def-moon-lamp", "x": 420.5, "y": 780.0, "rotation": 0, "scale": 1.0 }
```

| Field | Type | Rules |
|-------|------|-------|
| `objectId` | UUID | an `ObjectDefinition` the user owns at least one of |
| `x`, `y` | float | must fall inside `environment.bounds` |
| `rotation` | float | radians, default `0` |
| `scale` | float | `0.5`–`2.0`, default `1.0` |

Transactional behaviour:

```text
POST /environments/:id/objects
        ↓
check InventoryItem.quantity >= 1
        ↓
decrement InventoryItem.quantity
        ↓
create EnvironmentObject
```

Both writes happen in one Prisma transaction. If the user owns none of that definition
the request fails with `409 ITEM_NOT_IN_INVENTORY` and nothing is written.

`201` → the created instance, with `definition` embedded.

---

## 6. `PATCH /environments/:environmentId/objects/:instanceId` `[MVP]`

```json
{ "x": 512.0, "y": 800.0, "rotation": 0.25, "scale": 1.2 }
```

All fields optional. Used while dragging finishes — **not** during the drag itself; the
client updates the Pixi stage locally and persists on drop.

---

## 7. `PATCH /environments/:environmentId/objects` (bulk) `[MVP]`

Saves a whole room rearrangement in one request, so an editing session is one write
rather than twenty.

```json
{
  "updates": [
    { "id": "a11c...", "x": 512.0, "y": 800.0 },
    { "id": "b22d...", "x": 140.0, "y": 690.0, "rotation": 0.1 }
  ]
}
```

Applied in a single transaction — all succeed or none do. Max 100 updates per request.

`200` → the full updated object list.

---

## 8. `DELETE /environments/:environmentId/objects/:instanceId` `[MVP]`

Picking an object up returns it to the inventory rather than destroying it:

```text
DELETE instance
        ↓
delete EnvironmentObject row
        ↓
increment (or create) InventoryItem for that definition
```

`200`

```json
{ "removed": "a11c...", "returnedToInventory": { "objectId": "def-moon-lamp", "quantity": 3 } }
```

Query param `?destroy=true` skips the inventory return — reserved for a future
"discard item" action, not used in the MVP.

---

## 9. `POST /environments` and `DELETE /environments/:environmentId` `[LATER]`

Multiple rooms per user are out of MVP scope. When implemented:

- creation must seed `backgroundKey` and default bounds;
- deletion must refuse while a pet lives there (`409 ENVIRONMENT_OCCUPIED`), and must
  return every placed object to the inventory.
