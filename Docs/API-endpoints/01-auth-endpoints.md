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

> **Email verification is removed, on request, until further notice.** Two more
> routes lived here (`/email-otp/send-verification-otp` and
> `/email-otp/verify-email`), sign-up returned no session, and an address had to
> be proved before it could be signed in to. None of that is true now: sign-up
> returns a session and a cookie, nothing is emailed, and `someone@example.com`
> is a usable account. The `emailOTP` plugin configuration, the mailer and the
> `VerifyForm` are in the history — see `Backend/src/auth/email-address.ts` for
> where to look.

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

Errors: `409 EMAIL_TAKEN`, `422 VALIDATION_FAILED`, `429 TOO_MANY_REQUESTS`,
`400 INVALID_EMAIL`.

**Signing up signs you in**: the response carries `token` and the session
cookie, so the client goes straight to the world.

### The address is checked for shape, and nothing else

`Backend/src/auth/email-address.ts`, run from a `hooks.before` middleware on
this route so a refusal is a clean `400` with a sentence in it rather than a
failed insert. One regex: one `@`, something before it, a dotted domain after
it, no spaces, at most 254 characters. The address is lowercased and trimmed on
the way through, so `Sam@…` and `sam@…` collide on the unique index instead of
becoming two accounts.

It does **not** ask whether the domain exists or can receive mail, which is why
`someone@example.com` is a perfectly good account. Anything this waves through
that is not real simply fails to be signed in to by anybody.

Rate limited to twenty per five minutes — deliberately loose, because with no
verification the limit is the only cost of an account, and it is also what a
developer making test accounts runs into.

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

`POST /api/auth/sign-out` → `200 { "success": true }`, cookie cleared and the
`AuthSession` row deleted. Replaying the old cookie afterwards gets `null` from
get-session and `401` from any guarded route.

### The session is more than the cookie

Ending it is one client-side routine, `frontend/src/lib/session.ts`, in this
order and for these reasons:

```text
1  teardowns   while the cookie is still valid — a socket has to be able to say
               "I am leaving the park" before its credential dies. They unwind
               in reverse registration order, which is dependency order
2  audio       stop the room immediately, not after a round trip
3  storage     forget this tab's whereabouts (`petweb.park`) and the returning
               hint (`petweb.returning`)
4  sign out    the request above. This is the step that revokes anything
5  reload      `location.replace('/')` — a new document, so no WebGL context,
               world, socket or module singleton can outlive the session
```

Steps 3 and 5 are not tidiness. Without 3, the next account signed into that tab
was walked straight into the previous user's park; without 5, the `AudioContext`
kept playing the room to a signed-out browser. Both were reported.

### And on the server

`databaseHooks.session.delete.after` announces the end through
`Backend/src/auth/session-events.ts`, and `SocialGateway` closes every socket
that session authenticated. Hooking the *row* rather than the route means this
covers `/sign-out`, revoking one session and revoking all of them, without
anybody having to remember to.

Measured: 71 ms from the request to `io server disconnect`, against a
`REVALIDATE_MS` backstop of ten minutes.

### Session lifetime

Thirty days, slid at most once a day (`session.updateAge`), with a one-day
`freshAge` before Better Auth will accept a password or email change. The
`cookieCache` window stays at five minutes — the exposure for a session revoked
*elsewhere*, which is what the socket teardown above bounds.

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
