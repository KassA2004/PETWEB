# 00 — API CONVENTIONS

Rules that apply to **every** endpoint in this folder. Individual package documents
only describe what deviates from or extends this document.

---

## 1. Base URL & versioning

```text
http://localhost:3000/api/v1/...
```

- Better Auth is mounted **outside** the version prefix at `/api/auth/*`
  (it owns its own route table — see `01-auth-endpoints.md`).
- All application routes are versioned with NestJS URI versioning (`v1`).
- Static uploaded files are served from `/uploads/*` (see `09-media-endpoints.md`).

---

## 2. Authentication

- Session-cookie based, issued and validated by **Better Auth**.
- The frontend sends `credentials: "include"`; no `Authorization` header is used.
- A global `AuthGuard` protects everything except:
  - `/api/auth/*`
  - `GET /api/v1/objects` and `GET /api/v1/objects/:objectId`
  - `GET /health`
- Routes are opted out with `@Public()`.

Resolved session shape injected into handlers:

```ts
interface SessionUser {
  id: string;        // User.id (UUID)
  email: string;
  username: string;
}
```

---

## 3. Identifiers

- All IDs are **UUID v4** strings, matching `InitialDB-plan.md`.
- Path params are always named `<resource>Id` (`petId`, `environmentId`, `goalId`).
- An ID that does not exist **or belongs to another user** returns `404 NOT_FOUND`.

---

## 4. Request/response format

- Content type is `application/json` except uploads (`multipart/form-data`).
- `DateTime` values are ISO-8601 UTC strings: `2026-08-19T14:03:11.000Z`.
- Responses return the resource object directly (no `{ data: ... }` envelope) for
  single resources; list endpoints use the pagination envelope below.
- Unknown body fields are stripped, not rejected (`whitelist: true`).

---

## 5. Validation

- **Zod** schemas are the single source of truth, shared between frontend and backend
  (`techStack.md` lists Zod on the frontend; the same schemas back the NestJS pipes).
- JSON columns (`appearanceData`, `personalityData`, `stateData`) are validated against
  the parameter shapes in `pet-anatomy.md` §7 — they are **not** free-form JSON.
- Validation failure → `422 VALIDATION_FAILED` with per-field details.

---

## 6. Pagination

List endpoints that can grow unbounded (`memories`, `goals`, `objects`) use cursor pagination.

Query params:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | `20` | max `100` |
| `cursor` | string | — | opaque; the `id` of the last item of the previous page |
| `order` | `asc` \| `desc` | `desc` | by `createdAt` |

Response envelope:

```json
{
  "items": [],
  "nextCursor": "0f9a...c21",
  "hasMore": true
}
```

Short, naturally bounded lists (`pets`, `environments`, `inventory`) return a plain array.

---

## 7. Status codes

| Code | Used for |
|------|----------|
| `200 OK` | successful read / update |
| `201 Created` | resource created |
| `204 No Content` | successful delete |
| `400 BAD_REQUEST` | malformed request, business-rule violation |
| `401 UNAUTHORIZED` | no or expired session |
| `404 NOT_FOUND` | missing resource, or not owned by the session user |
| `409 CONFLICT` | uniqueness / state conflict (e.g. completing a completed goal) |
| `413 PAYLOAD_TOO_LARGE` | upload exceeds limit |
| `422 VALIDATION_FAILED` | schema validation failed |
| `429 TOO_MANY_REQUESTS` | rate limit hit |
| `500 INTERNAL_ERROR` | unhandled failure |

---

## 8. Error shape

A single global exception filter produces:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Pet name must be between 1 and 32 characters.",
    "details": [
      { "path": "name", "message": "String must contain at most 32 character(s)" }
    ],
    "requestId": "c1f0e6a2-9c1f-4a67-b0c2-9c3f4a1b7e55"
  }
}
```

`code` is a stable machine-readable enum; `message` is user-displayable.

---

## 9. Rate limiting

| Group | Limit |
|-------|-------|
| `/api/auth/sign-in`, `/sign-up` | 10 / 15 min / IP |
| `PATCH /pets/:petId/state` | 60 / min / user (state snapshots are debounced client-side) |
| `POST /media/uploads` | 20 / hour / user |
| everything else | 300 / min / user |

---

## 10. Persistent vs runtime state

`animation-approach.md` §4 splits pet state in two. The API honours that split:

| Kind | Examples | Transport |
|------|----------|-----------|
| Persistent | appearance, personality, name, age, relationships | REST, written on change |
| Runtime | energy, mood, currentBehavior, movement, animation frame | **client-side simulation**, snapshotted periodically via `PATCH /pets/:petId/state` |

The backend never receives per-frame data. PostgreSQL stores snapshots, not animation
(`project-overview.md` §10).

---

## 11. Naming

- Paths are plural, kebab-cased nouns: `/environments/:environmentId/objects`.
- Non-CRUD operations are sub-resources with a verb-noun, POST-only:
  `POST /goals/:goalId/complete`, `POST /pets/:petId/interactions`.
- No RPC-style endpoints (`/doThing`).

---

## 12. Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | public | Liveness + DB connectivity. Returns `{ "status": "ok", "db": "up" }`. |
