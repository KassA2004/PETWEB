# 01 — AUTH ENDPOINTS

**Base path:** `/api/auth`
**Module:** `AuthModule`
**Provider:** Better Auth (`techStack.md` — Authentication)

Better Auth ships its own route table. The backend **mounts the Better Auth handler**
and does not hand-write these routes. They are documented here because the frontend
consumes them and because session behaviour defines the rest of the API.

> Rule: do not build a custom login/session system alongside Better Auth
> (`AGENTS.md` — *"Do not create duplicate systems when an existing system can be extended."*)

---

## 1. Endpoints

| # | Method | Path | Auth | Scope | Description |
|---|--------|------|------|-------|-------------|
| 1 | `POST` | `/api/auth/sign-up/email` | public | `[MVP]` | Register with email + password + username |
| 2 | `POST` | `/api/auth/sign-in/email` | public | `[MVP]` | Log in, sets session cookie |
| 3 | `POST` | `/api/auth/sign-out` | session | `[MVP]` | Invalidate session, clear cookie |
| 4 | `GET` | `/api/auth/get-session` | public | `[MVP]` | Current session or `null` — used on app boot |
| 5 | `POST` | `/api/auth/update-user` | session | `[MVP]` | Update auth-owned profile fields |
| 6 | `POST` | `/api/auth/change-password` | session | `[LATER]` | Change password with current password |
| 7 | `POST` | `/api/auth/forget-password` | public | `[LATER]` | Send reset token |
| 8 | `POST` | `/api/auth/reset-password` | public | `[LATER]` | Consume reset token |
| 9 | `GET` | `/api/auth/list-sessions` | session | `[LATER]` | Active sessions for the user |

---

## 2. Sign up

`POST /api/auth/sign-up/email`

```json
{
  "email": "kass@example.com",
  "password": "correct-horse-battery",
  "name": "kass"
}
```

`201`

```json
{
  "user": {
    "id": "b1e2...",
    "email": "kass@example.com",
    "name": "kass",
    "createdAt": "2026-08-19T14:03:11.000Z"
  },
  "token": "session-token"
}
```

Errors: `409 EMAIL_TAKEN`, `422 VALIDATION_FAILED`, `429 TOO_MANY_REQUESTS`.

### First-login bootstrap

Sign-up triggers a backend hook that creates the user's starting world so the client
never faces an empty state:

```text
sign-up
   ↓
create User row (InitialDB-plan: id, username, email)
   ↓
create default Environment  ("<username>'s Room")
   ↓
grant starter InventoryItems (seeded ObjectDefinitions)
```

A **Pet is not auto-created** — the MVP loop starts at the pet creator
(`project-overview.md` §8).

---

## 3. Sign in

`POST /api/auth/sign-in/email`

```json
{ "email": "kass@example.com", "password": "correct-horse-battery" }
```

`200` → same shape as sign-up, plus `Set-Cookie: better-auth.session_token=...; HttpOnly; SameSite=Lax`.

Errors: `401 INVALID_CREDENTIALS`, `429 TOO_MANY_REQUESTS`.

---

## 4. Get session

`GET /api/auth/get-session`

`200`

```json
{
  "session": { "id": "...", "expiresAt": "2026-09-19T14:03:11.000Z" },
  "user": { "id": "b1e2...", "email": "kass@example.com", "name": "kass" }
}
```

Returns `200` with `null` when there is no session (not `401`), so the client can
decide between the landing screen and the world.

---

## 5. Sign out

`POST /api/auth/sign-out` → `200 { "success": true }`, cookie cleared.

---

## 6a. Implementation note: Better Auth's actual error shape

Confirmed by testing against the running backend. Better Auth's routes are mounted
outside Nest's pipeline (see §1's intro), so they never pass through the global
`HttpExceptionFilter` — they return **Better Auth's own** error shape, not the
`{ error: { code, ... } }` envelope from `00-conventions.md` §8:

```json
{ "message": "Invalid email or password", "code": "INVALID_EMAIL_OR_PASSWORD" }
```

Observed codes differ from the illustrative ones above:

| Documented above | Actually returned |
|---|---|
| `409 EMAIL_TAKEN` | `422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` |
| `401 INVALID_CREDENTIALS` | `401 INVALID_EMAIL_OR_PASSWORD` |

Sign-up also returns `200`, not `201` — Better Auth doesn't distinguish create-vs-read
status codes on this route. The frontend should treat these as their HTTP status plus
a message to show, not rely on `code` matching the rest of the API's error codes.

`sign-out` (and any other state-changing Better Auth route) requires the request to
carry an `Origin` header matching `trustedOrigins` — normal for any real browser
`fetch`, but worth knowing if testing with a bare HTTP client.

---

## 6. Relationship to `User`

Better Auth owns its own `user`/`session`/`account` tables. The application `User`
table from `InitialDB-plan.md` maps to it 1:1 by `id`. Application profile reads and
writes go through `02-user-endpoints.md`, **not** through Better Auth — Better Auth
only owns credentials and sessions.
