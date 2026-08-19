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
| 5 | `GET` | `/users/:userId` | `[LATER]` | Public profile (social) |
| 6 | `GET` | `/users/:userId/environments` | `[LATER]` | Visitable environments (social) |

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

## 4. `GET /users/me/bootstrap`

One request that gives the client everything needed to render the world on load,
avoiding a waterfall of five calls before the first frame.

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

## 6. Social endpoints `[LATER]`

`GET /users/:userId` and `GET /users/:userId/environments` exist only to support the
future shared-world feature (`project-overview.md` §12). They must expose username and
public pet appearance only — never email, goals, or memories.
