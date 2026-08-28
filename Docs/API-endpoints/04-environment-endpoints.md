# 04 — ENVIRONMENT ENDPOINTS

**Base path:** `/api/v1/environments`
**Module:** `EnvironmentsModule` — `Backend/src/environments/`
**Tables:** `Environment` (`id`, `ownerId`, `name`, `sceneData`, `createdAt`, `updatedAt`), `EnvironmentObject` (`id`, `environmentId`, `objectId`, `x`, `y`, `rotation`, `scale`)

An environment is the room the pet lives in. Placed objects are **instances** of an
`ObjectDefinition` (see `05-object-endpoints.md`), so the same "Mushroom Chair"
definition can be placed many times with different transforms.

---

## 1. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `GET` | `/environments` | `[MVP]` | List the user's environments |
| 1b | `GET` | `/environments/current` | `[MVP]` | The room the creature is living in |
| 1c | `GET` | `/environments/current/objects` | `[MVP]` | Placed objects, without knowing the room id first |
| 2 | `POST` | `/environments` | `[LATER]` | Create an additional environment |
| 3 | `GET` | `/environments/:environmentId` | `[MVP]` | Environment metadata |
| 4 | `PATCH` | `/environments/:environmentId` | `[MVP]` | Rename and/or restyle |
| 4b | `PUT` | `/environments/:environmentId/style` | `[MVP]` | Replace the room's appearance |
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

**Implemented so far:** 1, 1b, 1c, 3, 4, 4b, and the objects routes (§7, §13)
listed under "Implemented: the objects in a room" below. Everything else about
*placed objects* (8–12, the inventory-backed placement flow) is still
specified-only; objects currently live in the client's own catalog rather than
an inventory. What is built is the half the room could not do without:
remembering what it looks like and what is standing in it.

`/environments/current` exists because the MVP has one room per user and the
client should not have to know its id to load it — the same reasoning behind
`/pets/active`. It is declared before `/environments/:environmentId` in the
controller so the literal segment is not swallowed as a UUID param
(`03-pet-endpoints.md` §2).

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
{ "name": "The Quiet Room", "sceneData": { "ambience": "evening" } }
```

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | 1–48 chars |
| `sceneData` | object | a room style — see §7 |

Both fields are optional; whichever is present is written.

**Deviation from the original spec, recorded deliberately:** this used to take a
`backgroundKey` string. One string cannot express an hour, a paint colour, two
surface materials, a window view and a list of wall decorations, so it is
replaced by the `sceneData` document. See `11-schema-additions.md` §3 for the
full reasoning and for why the proposed `width` / `height` / `floorY` columns
were dropped rather than added.

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

---

## 10. `GET /environments/current` `[MVP]`

The room the creature is living in, without the client having to know its id.
The MVP ships one room per user, created during sign-up bootstrap; if an account
somehow has none, one is created rather than the request failing — an account
without a room cannot render anything, and erroring would leave the user staring
at a bootstrap detail they did not cause.

`200`

```json
{
  "id": "77c2...",
  "ownerId": "b1e2...",
  "name": "Kass's Room",
  "sceneData": {
    "ambience": "evening",
    "tint": 15238490,
    "floor": "boards",
    "wall": "panelled",
    "window": "mountains",
    "decor": [
      { "id": "decor-painting-4-2", "kind": "painting", "col": 4, "row": 2 },
      { "id": "decor-shelf-8-1", "kind": "shelf", "col": 8, "row": 1 }
    ],
    "removed": [],
    "lightsOn": true
  },
  "objectCount": 0,
  "updatedAt": "2026-08-23T14:02:11.000Z"
}
```

`sceneData` is `{}` for a room nobody has decorated yet, and the client fills in
its own defaults — which is why sign-up does not have to know what a room looks
like.

---

## 11. `PUT /environments/:environmentId/style` `[MVP]`

Replace the room's appearance.

```json
{
  "sceneData": {
    "ambience": "night",
    "tint": 8228730,
    "floor": "checker",
    "wall": "brick",
    "window": "dungeon",
    "decor": [{ "id": "d1", "kind": "hole", "col": 7, "row": 0 }],
    "removed": ["prop-chair"],
    "lightsOn": false
  }
}
```

`200` — the updated environment, in the shape above.

**Why `/style` and not `/scene`:** `GET /environments/:id/scene` (§4) is the full
render payload — environment, objects and pet in one read. This writes only the
room's appearance. Two different things that happen to share a column.

**Why PUT and not PATCH:** the room editor always knows the room's complete
appearance, so a partial write would only ever be a chance to lose a setting. It
is a separate route from §3 for the same reason `PUT /pets/:id/appearance` is
separate from a rename: a rename must never be able to clobber a room.

### What is validated, and what deliberately is not

`Backend/src/environments/room-style.ts` checks that the document is *storable*:

| Rule | |
|---|---|
| shape | a JSON object, not an array or a scalar |
| fields | `ambience`, `floor`, `wall`, `window` (slugs), `tint` (24-bit int), `decor` (array), `removed` (array of strings), `lightsOn` (bool). Unknown fields are **dropped**, not rejected |
| slugs | 1–32 chars, `[A-Za-z0-9_-]` only |
| decor | at most 12 items, each with a `kind` and numeric `col`/`row` |
| removed | at most 64 ids, each a non-empty string of at most 64 characters — the ids of the environment's own starting furniture the user has deleted (see `room-and-objects.md` §7c). Deduplicated on the way in |
| size | at most 4096 characters of JSON |

It does **not** check that `wall` names a texture that exists. The renderer owns
that list, the renderer lives in the frontend forever, and the client normalizes
the document again on the way in (`frontend/src/world/RoomStyle.ts`) so an
unknown value costs one setting rather than the room.

Dropping unknown fields rather than rejecting them is what lets a newer client
save a setting an older backend has never heard of: the field simply does not
survive the round trip until the backend learns about it. For a cosmetic setting
that is the right failure.

`422` on a malformed document, with the reason in the error envelope
(`00-conventions.md` §5).

---

## 12. Client contract

The room's appearance is a document, exactly like the creature's
(`03-pet-endpoints.md`). The server stores it and validates that it is
*storable*; the client decides what it *means*. Neither half knows the other's
catalog of wall textures, which is why adding a wallpaper is a frontend change
with no migration.

See `../room-and-objects.md` §7 for what each field does and
`11-schema-additions.md` §3 for why this is one column rather than six.

---

## Implemented: the objects in a room

Two routes were added to `EnvironmentsModule` alongside `/style`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/environments/:environmentId/objects` | what is standing in the room |
| `PUT` | `/environments/:environmentId/objects` | replace the whole arrangement |

`PUT` and whole-document, for the same reason `/style` is. The client is a
physics scene that always holds a complete, settled arrangement; asking it to
work out which objects are dirty would invent a synchronisation problem across a
simulation that moves things nobody asked it to move. One transaction —
`deleteMany` then `createMany` — so a save that fails half way cannot leave a
room with the furniture from one arrangement and the toys from another.

Ownership is checked by looking the environment up as `(id, ownerId)` **before**
any object is read or written, so somebody else's room is a 404 before it is
anything else.

Capped at 100 objects per request. A hundred pieces of furniture is not a room
anybody is enjoying, and the cap is what stops one request writing an unbounded
number of rows.

See `room-and-objects.md` §7b for the client half and for the four bugs that
shaped it.

---

## 13. `GET /environments/current/objects` `[MVP]`

What is standing in the room, resolved from the session instead of a path
parameter — the same list `GET /environments/:environmentId/objects` returns,
for whichever environment `GET /environments/current` would resolve to.

Auth required. No parameters, no body.

`200` → `PlacedObjectView[]`, identical shape to §7's response.

**Why this exists:** without it, the client had to load `/environments/current`
first to learn the environment id before it could ask for the objects in it —
one full round trip of latency on the load path, behind everything else the
dashboard needed. The server has always been able to resolve "the user's
current room" from the session alone (`EnvironmentsService.current` already
does this), so the id was never a real dependency; it was only a dependency
because the *route* required it. This route lets the client fetch its
furniture in parallel with `/pets`, `/environments/current`, `/goals` and
`/focus` instead of one hop behind them
(`Docs/plans/website-performance-optimization-plan.md`, Task 8).

The id-bearing route (§7) is unchanged and still exists — the save path
(`PUT /environments/:environmentId/objects`) still needs an id to write to,
and `GET /environments/:environmentId/objects` is still the correct route for
loading a *specific, already-known* room.
