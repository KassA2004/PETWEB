# 06 — INVENTORY ENDPOINTS

**Base path:** `/api/v1/inventory`
**Module:** `InventoryModule`
**Table:** `InventoryItem` (`id`, `ownerId`, `objectId`, `quantity`)

The inventory is the bridge between rewards and the world: goals produce items, items
get placed in the environment.

```text
Goal completed → InventoryItem granted → object placed in Environment
```

---

## 1. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `GET` | `/inventory` | `[MVP]` | All items the user owns |
| 2 | `GET` | `/inventory/:itemId` | `[MVP]` | One inventory row |
| 3 | `GET` | `/inventory/summary` | `[MVP]` | Counts for UI badges |
| 4 | `POST` | `/inventory/grants` | `[LATER]` | Admin/debug grant |

There is deliberately **no user-facing endpoint that creates inventory items**.
Quantity only changes as a side effect of:

| Cause | Effect | Owned by |
|-------|--------|----------|
| Goal completion reward | `+1` | `07-goal-endpoints.md` |
| Placing an object | `-1` | `04-environment-endpoints.md` §5 |
| Picking an object up | `+1` | `04-environment-endpoints.md` §8 |
| Sign-up bootstrap | starter set | `01-auth-endpoints.md` §2 |

Keeping mutation out of this package is what prevents a client from granting itself
items.

---

## 2. `GET /inventory` `[MVP]`

Returns a plain array — the MVP inventory is small and the UI shows it all at once.

Query params:

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | filter by definition category |
| `placeableOnly` | boolean | hide rows with `quantity = 0` |

`200`

```json
[
  {
    "id": "inv-01",
    "objectId": "def-moon-lamp",
    "quantity": 3,
    "placedCount": 1,
    "definition": {
      "type": "Moon Lamp",
      "category": "light",
      "appearanceData": { "shape": "sphere", "glow": true },
      "rarity": "common"
    },
    "acquiredAt": "2026-08-14T09:12:00.000Z"
  }
]
```

- `quantity` — how many are **unplaced** and available to place.
- `placedCount` — derived count of `EnvironmentObject` rows for this definition across
  the user's environments. It exists so the UI can say "3 available, 1 in the room"
  without a second request.
- `definition` is embedded so the inventory grid can render procedurally without
  calling `05-object-endpoints.md`.
- `acquiredAt` is a proposed column — see `11-schema-additions.md`.

Rows with `quantity = 0` are kept (not deleted) so the user's collection history stays
visible; the client can grey them out.

---

## 3. `GET /inventory/summary` `[MVP]`

`200`

```json
{
  "totalItems": 12,
  "uniqueDefinitions": 6,
  "byCategory": { "furniture": 4, "light": 3, "toy": 2, "plant": 3 },
  "newSinceLastSeen": 2
}
```

Feeds the inventory badge in the UI so the client does not download the whole
inventory just to render a number.

---

## 4. `POST /inventory/grants` `[LATER]`

Debug/admin only, behind the same unbuilt admin guard as `05-object-endpoints.md` §6.

```json
{ "objectId": "def-moon-lamp", "quantity": 1, "reason": "seed" }
```

Must never be reachable by a normal session. In production the only grant path is
goal completion.

---

## 5. Concurrency

`quantity` is mutated by placement, pickup and rewards, which can overlap. Every write
uses an atomic Prisma `increment` / `decrement` inside a transaction with a guard
(`quantity >= 1` before decrement), never a read-modify-write in application code.
A failed guard returns `409 ITEM_NOT_IN_INVENTORY`.
