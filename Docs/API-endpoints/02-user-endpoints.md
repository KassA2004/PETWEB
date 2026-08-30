# 02 — USER ENDPOINTS

**Base path:** `/api/v1/users`
**Module:** `UserModule`
**Table:** `User` (`id`, `username`, `email`)

Profile data only. Credentials and sessions belong to `01-auth-endpoints.md`.

---

## 1. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `GET` | `/users/me` | `[MVP]` | Current user profile |
| 2 | `PATCH` | `/users/me` | `[MVP]` | Update username |
| 3 | `GET` | `/users/me/bootstrap` | `[MVP]` | Single-call app boot payload |
| 4 | `DELETE` | `/users/me` | `[LATER]` | Delete account and all owned data |
| 5 | `GET` | `/users/:userId` | **built** | What a visitor may know: `13-social-endpoints.md` §2.3 |
| 6 | `GET` | `/users/:userId/environments` | **built, as `/users/:userId/room`** | See below |
| 7 | `GET` | `/users/search?q=` | **built** | Prefix search by username |
| 8 | `GET` | `/users/:userId/memories` | **built** | Their public memories only |

**Status.** 1, 2, 5, 6, 7 and 8 exist. 3 (`/users/me/bootstrap`) and 4 do not —
see §4 and §5.

---

## 2. `GET /users/me`

`200`

```json
{
  "id": "b1e2c3d4-...",
  "username": "kass",
  "email": "kass@example.com",
  "createdAt": "2026-08-19T14:03:11.000Z"
}
```

---

## 3. `PATCH /users/me`

```json
{ "username": "kassowary" }
```

| Field | Type | Rules |
|-------|------|-------|
| `username` | string | 3–24 chars, `[a-zA-Z0-9_-]`, unique |

`200` → updated user. Errors: `409 USERNAME_TAKEN`, `422 VALIDATION_FAILED`.

Email changes go through Better Auth, not here.

---

## 4. `GET /users/me/bootstrap` — **specified, not built**

One request that gives the client everything needed to render the world on load,
avoiding a waterfall of five calls before the first frame.

**It was never built, and the waterfall it was designed against does not exist.**
`Dashboard` fires its five loads *in parallel* (`usePetLibrary`, `useRoomStyle`,
`useGoals`, `useFocus`, `useRoomObjects`), and the one real dependency that was
in that chain — needing the environment's id before its objects could be asked
for — was removed by giving the server a route that resolves it itself
(`GET /environments/current/objects`). Building this now would be one more
endpoint to keep correct in exchange for nothing measurable.

The design below stands for the day the load path grows a dependency that
genuinely cannot be resolved server-side.

`200`

```json
{
  "user": { "id": "b1e2...", "username": "kass" },
  "activePet": {
    "id": "9a1f...",
    "name": "Blorb",
    "species": "blob",
    "environmentId": "77c2..."
  },
  "activeEnvironmentId": "77c2...",
  "counts": {
    "pets": 1,
    "environments": 1,
    "inventoryItems": 6,
    "openGoals": 2,
    "memories": 4
  },
  "hasCompletedOnboarding": true
}
```

`activePet` is `null` for a user who has not run the pet creator yet — that is the
signal for the client to route to the creator instead of the world.

`hasCompletedOnboarding` is derived (`pets > 0`), not stored.

---

## 5. `DELETE /users/me` `[LATER]`

Cascades: pets → memories, environments → environment objects, inventory, goals,
and uploaded media files. Requires password re-entry through Better Auth first.
`204 No Content`.

---

## 6. Social endpoints — **built**

See [`13-social-endpoints.md`](./13-social-endpoints.md) §2 for the whole
surface. Two deviations from the sketch above, both deliberate:

**`/users/:userId/environments` became `/users/:userId/room`.** A user has one
room and the product has no way to make a second; a list endpoint would have
returned an array of length one and made the client pick from it. The route
returns what a visit actually needs: the room's style, what is standing in it,
and the creature living there — the same three things the owner's own client
draws from, so a visit renders through `PetHabitat` rather than through a
second, simplified viewer.

**"never memories" became "never *private* memories".** The constraint above was
written when a memory had no visibility. It has one now, so
`GET /users/:userId/memories` returns the ones the owner chose to share and the
filter is in the query rather than in the response mapping — the private rows
are never read, not fetched-and-hidden.

The rest of the rule holds exactly: username and public pet appearance, never
email, never goals. `PublicUserView` is built field by field precisely so that a
widened query cannot add one.
