# 03 — PET ENDPOINTS

**Base path:** `/api/v1/pets`
**Module:** `PetModule`
**Table:** `Pet` (`id`, `ownerId`, `environmentId`, `name`, `species`, `appearanceData`, `personalityData`, `stateData`, `createdAt`)

The pet is the centre of the product (`project-overview.md` §16), so this package is
the most detailed. It deliberately separates **appearance**, **personality** and
**state** into distinct endpoints because they change at completely different rates:
appearance on user edit, personality almost never, state continuously.

---

## 1. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `GET` | `/pets` | `[MVP]` | List the user's pets |
| 2 | `POST` | `/pets` | `[MVP]` | Create a pet |
| 3 | `GET` | `/pets/:petId` | `[MVP]` | Full pet record |
| 4 | `PATCH` | `/pets/:petId` | `[MVP]` | Rename / move to environment |
| 5 | `DELETE` | `/pets/:petId` | `[MVP]` | Delete pet (and its memories) |
| 6 | `GET` | `/pets/:petId/appearance` | `[MVP]` | Rig parameters only |
| 7 | `PUT` | `/pets/:petId/appearance` | `[MVP]` | Replace rig parameters |
| 8 | `GET` | `/pets/:petId/state` | `[MVP]` | Last persisted state snapshot |
| 9 | `PATCH` | `/pets/:petId/state` | `[MVP]` | Persist a state snapshot |
| 10 | `POST` | `/pets/:petId/interactions` | `[MVP]` | Record a user interaction, get a reaction |
| 11 | `GET` | `/pets/species` | `[MVP]` | Base species / rig preset catalog |
| 12 | `PUT` | `/pets/:petId/personality` | `[LATER]` | Replace personality traits |

---

## 2. `GET /pets/species` `[MVP]`

Static catalog served from backend seed data — the pet creator needs it before any
pet exists.

`200`

```json
[
  {
    "key": "blob",
    "label": "Blob",
    "description": "A soft floating shape with stubby legs.",
    "defaultAppearance": {
      "body": { "width": 1.0, "height": 1.0 },
      "head": { "scale": 1.2 },
      "legs": { "length": 0.5, "width": 0.4 },
      "tail": { "length": 0.8 },
      "ears": { "size": 0.7 }
    }
  }
]
```

Every species must resolve to the **same standardized quadruped rig**
(`pet-anatomy.md` §3, `AGENTS.md` — Visual Rules). Species changes parameters and
palette, never the anatomy.

Route ordering note: `/pets/species` must be registered **before** `/pets/:petId`
so the literal segment is not captured as a UUID param.

---

## 3. `POST /pets` `[MVP]`

```json
{
  "name": "Blorb",
  "species": "blob",
  "environmentId": "77c2...",
  "appearanceData": {
    "body":  { "width": 1.4, "height": 0.9 },
    "head":  { "scale": 1.3 },
    "legs":  { "length": 0.65, "width": 0.4 },
    "tail":  { "length": 1.5 },
    "ears":  { "size": 0.8 },
    "palette": { "primary": "#E8B4C8", "secondary": "#9FB8DA", "accent": "#F5E1C0" }
  },
  "personalityData": {
    "curiosity": 0.7,
    "playfulness": 0.5,
    "affection": 0.8,
    "energyBias": 0.4,
    "shyness": 0.2
  }
}
```

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | 1–32 chars, required |
| `species` | string | must exist in `/pets/species` |
| `environmentId` | UUID | optional — defaults to the user's first environment |
| `appearanceData` | object | validated against the rig schema (`pet-anatomy.md` §7); each numeric parameter clamped to `0.25`–`3.0` |
| `personalityData` | object | five traits, each `0.0`–`1.0`; omitted traits are randomized |

`stateData` is **not** accepted on create — the backend seeds it:

```json
{ "mood": "curious", "energy": 100, "hunger": 0, "comfort": 80, "activity": "idle" }
```

`201` → full pet object.

Errors: `422 VALIDATION_FAILED`, `404 ENVIRONMENT_NOT_FOUND`, `409 PET_LIMIT_REACHED`
(the MVP caps a user at **one** pet; the cap lives in config, not in the schema).

---

## 4. `GET /pets/:petId` `[MVP]`

`200`

```json
{
  "id": "9a1f...",
  "ownerId": "b1e2...",
  "environmentId": "77c2...",
  "name": "Blorb",
  "species": "blob",
  "appearanceData": { "...": "rig parameters" },
  "personalityData": { "...": "traits" },
  "stateData": { "mood": "happy", "energy": 72, "activity": "playing" },
  "createdAt": "2026-08-19T14:03:11.000Z",
  "ageDays": 12
}
```

`ageDays` is derived from `createdAt`, not stored.

`GET /pets` returns the same shape as a plain array (no pagination — the list is
naturally tiny).

---

## 5. `PATCH /pets/:petId` `[MVP]`

```json
{ "name": "Blorb the Second", "environmentId": "77c2..." }
```

Only `name` and `environmentId` are mutable here. Appearance, personality and state
have their own endpoints so a rename cannot accidentally overwrite the rig.

---

## 6. Appearance

### `GET /pets/:petId/appearance` `[MVP]`

Returns `appearanceData` alone — the payload PixiJS needs to rebuild the rig.

### `PUT /pets/:petId/appearance` `[MVP]`

`PUT`, not `PATCH`: the pet creator always submits the complete parameter set, and a
partial merge of a rig is ambiguous.

```json
{
  "body":  { "width": 1.1, "height": 1.0 },
  "head":  { "scale": 1.4 },
  "legs":  { "length": 0.55, "width": 0.35 },
  "tail":  { "length": 2.0 },
  "ears":  { "size": 1.2 },
  "palette": { "primary": "#E8B4C8", "secondary": "#9FB8DA", "accent": "#F5E1C0" },
  "accessories": [{ "slot": "head", "key": "giant_hat", "scale": 1.6 }]
}
```

Validation must reject a payload that removes a required rig component. Absurd
proportions are **allowed** and expected (`project-overview.md` §4.3) — clamping exists
only to keep the rig renderable, not to enforce cuteness.

`200` → updated `appearanceData`.

---

## 7. State

### `GET /pets/:petId/state` `[MVP]`

`200`

```json
{
  "petId": "9a1f...",
  "stateData": {
    "mood": "happy",
    "energy": 72,
    "hunger": 34,
    "comfort": 61,
    "curiosity": 55,
    "playfulness": 48,
    "socialNeed": 20,
    "activity": "playing"
  },
  "updatedAt": "2026-08-19T15:22:04.000Z",
  "secondsSinceUpdate": 5400
}
```

`secondsSinceUpdate` lets the client apply offline decay locally on load — the backend
runs no simulation loop.

### `PATCH /pets/:petId/state` `[MVP]`

The simulation runs client-side (`techStack.md` — Pet Simulation). This endpoint
persists a **snapshot**, not a frame.

```json
{
  "mood": "sleepy",
  "energy": 41,
  "hunger": 60,
  "comfort": 55,
  "activity": "sleeping"
}
```

Rules:

- Called on a debounce (≈ every 30 s of activity) and on unmount / tab close.
- Rate limited to 60/min/user (`00-conventions.md` §9).
- `currentBehavior`, `currentTarget`, `movement`, `animation` and `temporaryEmotion`
  are runtime-only and **must not** be sent (`animation-approach.md` §4) — they are
  stripped if present.
- Numeric values are clamped `0`–`100`; `mood` and `activity` are enums.

`200` → merged `stateData`.

---

## 8. `POST /pets/:petId/interactions` `[MVP]`

Records a user-initiated interaction and returns the pet's reaction, so the reaction is
authoritative and can feed the memory system.

```json
{ "type": "pet", "targetObjectId": null }
```

| `type` | Effect |
|--------|--------|
| `pet` | `+comfort`, `-socialNeed` |
| `feed` | `-hunger`, may consume an inventory item |
| `play` | `-playfulness`, `-energy`, `+comfort` |
| `call` | draws attention, no stat change |
| `poke` | small mood swing, personality-dependent |

`targetObjectId` references an `EnvironmentObject` instance when the interaction
involves a placed object (playing with a toy, sleeping on a bed).

`200`

```json
{
  "reaction": "happy",
  "animationHint": "bounce",
  "stateData": { "mood": "happy", "energy": 68, "comfort": 74, "activity": "reacting" },
  "memoryCreated": null
}
```

`animationHint` is a **suggestion**. The client's animation state machine
(`animation-approach.md` §37) decides whether and how to play it — the backend never
drives animation directly.

`memoryCreated` is a `Memory` object when the interaction crossed a milestone
(first ever interaction, bonding threshold), otherwise `null`.

---

## 9. `DELETE /pets/:petId` `[MVP]`

`204 No Content`. Cascades to that pet's `Memory` rows.

Requires the pet name echoed back as confirmation: `DELETE /pets/:petId?confirm=Blorb`.
Errors: `400 CONFIRMATION_MISMATCH`.

---

## 10. `PUT /pets/:petId/personality` `[LATER]`

Personality is fixed at creation in the MVP. This exists for a future personality-drift
or re-roll feature and should not be implemented now
(`AGENTS.md` — *"Do not implement future features unless explicitly requested."*).
