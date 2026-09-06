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
| 10 | `POST` | `/api/auth/email-otp/send-verification-otp` | public | `[MVP]` | Mail a fresh six-digit code |
| 11 | `POST` | `/api/auth/email-otp/verify-email` | public | `[MVP]` | Prove the address; creates the session |

Rows 10 and 11 come from the `emailOTP` plugin (`better-auth/plugins/email-otp`),
mounted in `Backend/src/auth/auth.ts`.

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
`400 EMAIL_NOT_DELIVERABLE`.

**Signing up does not sign you in.** `token` is `null` and no cookie is set:
`emailAndPassword.requireEmailVerification` is on, so the account exists and
cannot be entered until its address has been proved. The session comes from
§2b.

### The address has to be real

Two layers, in increasing cost, and only the second is a guarantee.

**Before the row** — `Backend/src/auth/email-address.ts`, run from a
`hooks.before` middleware on this route, so a refusal is a clean `400` with a
sentence rather than a failed insert:

```text
shape        one @, a dotted domain, sane lengths
reputation   not an RFC-reserved name, not a known throwaway-inbox provider
existence    the domain publishes an MX (or an A/AAAA, which RFC 5321 §5.1
             still allows) — "no such domain" refuses; a resolver that cannot
             answer passes, because a DNS outage is our problem, not the user's
```

It deliberately does not probe the *mailbox*. Most receiving servers refuse to
answer, and the ones that answer honestly are an account-enumeration oracle.

**The guarantee** is §2b: a code is sent to the address and has to come back.

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

This runs *before* verification, on purpose: a username has to be reserved at
the moment it is chosen or two people can pick the same one and only find out
ten minutes later, and the room has to exist before the first session because
verification signs the user straight into it. An account nobody verifies is a
row nobody can sign in to.

A **Pet is not auto-created** — the MVP loop starts at the pet creator
(`project-overview.md` §8).

---

## 2b. Verifying the address

A **code, not a link**. A link has to survive being copied between devices,
rewritten by a mail client and opened in a browser that did not start the
sign-up, and when any of that goes wrong the user is on a dead page with
nothing to do. Six digits typed into the form already open works when the mail
is read on a phone and the account is being made on a laptop.

`POST /api/auth/email-otp/verify-email`

```json
{ "email": "kass@example.com", "otp": "418205" }
```

`200` → `{ "status": true, "token": "...", "user": { ..., "emailVerified": true } }`
plus the session cookie. `emailVerification.autoSignInAfterVerification` is what
puts the user inside the product rather than back at a login form typing the
password they chose ninety seconds ago.

Errors: `400 INVALID_OTP`, `400 OTP_EXPIRED`, `429 TOO_MANY_REQUESTS`.

`POST /api/auth/email-otp/send-verification-otp` with
`{ "email": "...", "type": "email-verification" }` sends another. Rate limited
to two a minute by the plugin and four in five minutes by the route rule.

The parameters, all in `auth.ts`: six digits, ten minutes, five attempts,
**hashed at rest** (`storeOTP: 'hashed'` — a table of live codes in plaintext is
a table of live credentials). 10^6 with five guesses inside ten minutes is not a
space anybody walks.

Delivery is `Backend/src/auth/mailer.ts`: nodemailer over `SMTP_URL`, one
template, a plain-text twin and no images. With no `SMTP_URL` configured the
code is written to the server log with a warning — a development affordance
that `MAIL_REQUIRED=1` turns off, and every deployment should set it.

### Signing in before verifying

`POST /api/auth/sign-in/email` answers `403 EMAIL_NOT_VERIFIED` **and sends a
fresh code**. That is not an error state for the client to render: it is the
rest of a sign-up somebody abandoned, so `LoginForm` hands it straight to the
same verification step the register form uses.

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
