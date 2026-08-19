# 09 — MEDIA ENDPOINTS

**Base path:** `/api/v1/media`
**Module:** `MediaModule`
**Storage:** local filesystem via NestJS + Multer (`techStack.md` — Storage)

The only binary data in the product is user-supplied imagery (memory snapshots and
photos). Pets, objects and environments are **procedural** — they are never uploaded
assets (`AGENTS.md` — Visual Rules).

---

## 1. Endpoints

| # | Method | Path | Scope | Description |
|---|--------|------|-------|-------------|
| 1 | `POST` | `/media/uploads` | `[MVP]` | Upload an image, get back a path |
| 2 | `DELETE` | `/media/uploads/:fileId` | `[MVP]` | Delete an unreferenced upload |
| 3 | `GET` | `/uploads/*` | `[MVP]` | Static file serving (not a controller) |

---

## 2. `POST /media/uploads` `[MVP]`

`multipart/form-data`

| Field | Type | Rules |
|-------|------|-------|
| `file` | binary | `image/png`, `image/jpeg`, `image/webp`; max 5 MB |
| `purpose` | string | `memory` (only value in the MVP) |

`201`

```json
{
  "fileId": "8f2a...",
  "url": "/uploads/memories/2026/08/8f2a-snapshot.webp",
  "mimeType": "image/webp",
  "sizeBytes": 184320,
  "width": 1280,
  "height": 720,
  "createdAt": "2026-08-19T18:39:44.000Z"
}
```

Processing on upload:

1. Validate real MIME by magic bytes, not by the client-supplied header or extension.
2. Strip EXIF (removes GPS and camera metadata).
3. Re-encode to WebP, max 1920 px on the long edge.
4. Store under `uploads/<purpose>/<yyyy>/<mm>/<fileId>-<slug>.webp`.
5. Generate a `-thumb` variant at 320 px for the memory book grid.

The stored `url` is what gets written into `Memory.imageUrl`
(`08-memory-endpoints.md`). PostgreSQL stores the path, never the bytes.

Errors: `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `429 TOO_MANY_REQUESTS`
(20/hour/user).

---

## 3. `DELETE /media/uploads/:fileId` `[MVP]`

Deletes an upload that is not referenced by any memory. Returns `409 FILE_IN_USE` if a
`Memory` still points at it — deleting the memory is the way to remove a referenced
file.

`204 No Content`.

---

## 4. Static serving `/uploads/*` `[MVP]`

Served by NestJS `ServeStaticModule` from the local uploads directory.

- Filenames contain a random `fileId`, so paths are unguessable.
- The MVP serves these publicly (no per-request ownership check) — acceptable because
  the paths are unguessable and single-user, but it is **not** true access control.
  Before any social feature ships, this must move behind a guarded streaming
  controller.
- Cache header: `Cache-Control: public, max-age=31536000, immutable` (content is
  immutable per `fileId`).

---

## 5. Orphan cleanup

Uploads that are never attached to a memory would accumulate forever. A scheduled task
deletes files older than 24 hours with no referencing row. Written as a NestJS
scheduled job — no new infrastructure, no queue.

---

## 6. MinIO `[LATER]`

`techStack.md` allows MinIO as an alternative to local disk. Keep all filesystem access
behind a `StorageService` interface (`put`, `get`, `delete`, `url`) so swapping the
implementation touches one file and no endpoint contract changes.
