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
| 11 | `GET` | `/pets/species` | `[LATER]` | Base species / rig preset catalog |
| 12 | `PUT` | `/pets/:petId/personality` | `[LATER]` | Replace personality traits |
| 13 | `GET` | `/pets/active` | `[MVP]` | The pet the user currently has selected |
| 14 | `PUT` | `/pets/active` | `[MVP]` | Select which saved pet is live |

---

## 1a. Saved presets — deviation from this document

This package originally capped a user at **one** pet. The product needs saved
**presets**: a user builds a creature in the editor, names it, keeps it, and
comes back to it later. So:

* the one-pet cap is **gone**. `409 PET_LIMIT_REACHED` is not implemented.
* `User.activePetId` records which saved pet is live
  (`/Docs/InitialDB-plan.md` §1). It is what makes a creature survive a reload
  and a fresh sign-in, which is the whole point of saving one.
* `POST /pets` **selects** the pet it just created — you pressed Save because
  this is the creature you are making.
* `DELETE /pets/:petId` returns `200` with the remaining library rather than
  `204`, because deleting can change which pet is selected and the client would
  otherwise have to guess or refetch. It also does **not** require the name
  echoed back; the client confirms in place, and a typed-name confirmation for
  a preset you can rebuild in thirty seconds is friction without a benefit.

Endpoints 8, 10 and 11 (`state`, `interactions`, `species`) are not implemented
yet — the simulation is still entirely client-side and there is no species
catalog to serve.

### `GET /pets/active`

`200` → the same full pet object as `GET /pets/:petId`, or an empty body when
the user has not chosen one.

### `PUT /pets/active`

```json
{ "petId": "9a1f..." }
```

`petId: null` clears the selection. `200` → `{ "pets": [...], "activePetId": "9a1f..." }`,
which is also the shape `GET /pets` returns.

Errors: `404 NOT_FOUND` when the pet is not the caller's — deliberately not
`403`, so the API never confirms that an id exists.

**Projection (added for load-time performance,
`Docs/plans/website-performance-optimization-plan.md` Task 12):** the `pets`
array in this shape — returned by `GET /pets`, `PUT /pets/active`, and
`DELETE /pets/:petId` alike, since all three hand back "the library" — carries
only `{ id, name, species, appearanceData, updatedAt }` per pet, not the full
pet record. `personalityData`, `stateData`, `ownerId`, `environmentId`,
`createdAt` and `ageDays` are omitted: nothing on the client reads them from
the library grid, only from a single pet fetched by `GET /pets/:petId` or
`GET /pets/active`, both of which are **unchanged** and still return the full
shape documented in §4.

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
    "description": "A soft rounded-square mass with a face on it.",
    "defaultAppearance": {
      "body":   { "type": "blob", "scale": 1.0 },
      "eyes":   { "type": "dot", "scale": 1.0, "spacing": 0.19 },
      "mouth":  { "type": "wave", "scale": 1.0 },
      "topper": { "type": "puff", "scale": 1.0 },
      "arms":   { "scale": 1.0 },
      "feet":   { "scale": 1.0 }
    }
  }
]
```

Every species must resolve to the **same standardized blob rig**
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
    "body":   { "type": "pebble", "scale": 1.2 },
    "eyes":   { "type": "sparkle", "scale": 1.4, "spacing": 0.22 },
    "mouth":  { "type": "grin", "scale": 1.1 },
    "topper": { "type": "antenna", "scale": 1.6 },
    "arms":   { "scale": 0.8 },
    "feet":   { "scale": 1.0 },
    "pattern": "spots",
    "palette": { "primary": "#FF8FB4", "secondary": "#FDEACD", "accent": "#EF5F8C" }
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
| `appearanceData` | object | see the validation note below |
| `personalityData` | object | not accepted — the backend seeds all five traits |

**Appearance validation, as built.** The rig lives entirely in the frontend, and
so does the constraint table that decides what a valid eye spacing is
(`frontend/src/assets/pets/customization/PetConstraints.ts`). Mirroring forty
field ranges into the backend would put the same rules in two places and
guarantee they drift — silently, and in the worst direction: the server would
start rejecting creatures the editor was happily drawing.

So the backend enforces the properties it is genuinely the right place to
enforce — the payload is a JSON object, under 16 KB, nested no more than four
deep, and every number in it is finite and under 1e9 — and stores it verbatim.
The client re-clamps on read, which doubles as the migration path: a preset
saved before the mouth library existed still loads, it just gets the default
mouth (`Backend/src/pets/pet-appearance.ts`).

`species` is **not** accepted either — it is derived from the appearance's body
type, because with one standardized rig (`pet-anatomy.md` §6) species is a label
rather than a structure.

`stateData` is **not** accepted on create — the backend seeds it:

```json
{ "mood": "curious", "energy": 100, "hunger": 0, "comfort": 80, "activity": "idle" }
```

`201` → full pet object.

Errors: `422 VALIDATION_FAILED` (name, or a non-object appearance),
`400 BAD_REQUEST` (an appearance that is too large, too deep, or contains a
number that is not one), `404 NOT_FOUND` (an environment that is not the
caller's). `environmentId` defaults to the user's first room, which sign-up
always creates.

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
  "body":   { "type": "tower", "scale": 1.1 },
  "eyes":   { "type": "bean", "scale": 1.9, "spacing": 0.14 },
  "mouth":  { "type": "oh", "scale": 1.0 },
  "topper": { "type": "swirl", "scale": 1.8 },
  "arms":   { "scale": 1.6 },
  "feet":   { "scale": 1.5 },
  "pattern": "patch",
  "palette": { "primary": "#9B7FD4", "secondary": "#FF8FB4", "accent": "#FDEACD" },
  "accessories": {
    "head": { "type": "topHat",  "color": "#3D2233", "scale": 1.6 },
    "face": { "type": "glasses", "color": "#3D2233", "scale": 1.0 },
    "neck": { "type": "bowtie",  "color": "#EF5F8C", "scale": 1.0 }
  }
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
