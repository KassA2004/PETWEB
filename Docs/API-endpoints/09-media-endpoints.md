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

---

## Implementation notes

**Module:** `Backend/src/media/` · **Client:** `frontend/src/features/media/api.ts`

Implemented: `POST /media/uploads`, `DELETE /media/uploads`, static serving of
`/uploads/*`, and the orphan sweep.

```text
  bytes ─→ size check ─→ magic-byte sniff ─→ metadata strip ─→ disk
                                                                 ↓
   PostgreSQL stores  "/uploads/memory/2026/08/<32 hex>.png"  ←──┘
```

- **Held in memory, not streamed to a temp file.** The cap is 5 MB and the bytes
  have to be inspected before they are trusted anyway; a file that turns out not
  to be an image should never have touched the disk.
- **Type comes from the first bytes**, never from `Content-Type` or the
  extension. Verified: an HTML file offered as `cat.png` is refused `415`.
- **`DELETE` takes the path in a body**, not an id in the URL — the one
  deviation from §3. Looking a file up by a bare id means taking a
  caller-supplied fragment and searching a filesystem with it, which is how
  traversal bugs are born. `storedFilePath()` returns `null` for anything that
  is not a path this service issued, and `..` cannot match `[0-9a-f]{32}`.
- **Orphan sweep** is an hourly `setInterval` cleared on module destroy, rather
  than a scheduled-job package, for a job that runs hourly and does not care
  exactly when.

### What is NOT implemented, and what it needs

The processing steps in §2 that require an image codec:

| Step | Status |
|---|---|
| 1. real MIME by magic bytes | **done** |
| 2. strip EXIF | **done for JPEG** — APPn/COM segments removed in pure Node (`image-bytes.ts`). Verified against a real JPEG: GPS and JFIF records gone, output decodes pixel-identical. **PNG/WebP metadata chunks are not stripped.** |
| 3. re-encode to WebP, max 1920 px | **not done** — needs `sharp` |
| 4. store under `<purpose>/<yyyy>/<mm>/…` | **done** |
| 5. `-thumb` variant at 320 px | **not done** — needs `sharp` |

`sharp` is not in `techStack.md`, so adding it is an approval, not a decision.
The integration point is one function — `MediaService.store` already owns the
whole pipeline, and steps 3 and 5 go between `cleanImage` and `writeFile`.

### The client prepares the picture before it sends it

`frontend/src/features/media/prepare.ts`, added Sept 2026 with the camera
button. Not a substitute for any of the above — the server still sniffs, still
strips, still caps — but the browser is where the picture is still whole, and
three things are much easier to fix there:

```text
  4032 x 3024, 4.8 MB, EXIF Orientation = 6
             ↓  createImageBitmap({ imageOrientation: 'from-image' }) → canvas
  1600 x 1200 JPEG, ~300 kB, no metadata, the right way up
```

- **Orientation.** This is a *correctness* fix, not an optimisation, and it is
  the direct consequence of step 2 above. Stripping APP1 removes the EXIF
  Orientation tag along with the GPS record, so a portrait photograph — stored
  landscape with a "turn me" flag, which is what every phone camera produces —
  arrives at the server as a landscape photograph with no flag, and is sideways
  for ever. Baking the rotation into the pixels first is what makes the strip
  harmless.
- **Size.** The 5 MB cap and a modern phone camera are on a collision course;
  "that picture is over 5 MB" is a true sentence the user can do nothing about.
- **Format.** iOS shoots HEIC, which §2 does not accept. A browser that can
  decode one can re-encode it as JPEG.

Two rules it keeps. **It never loses a picture**: if the browser cannot decode
the file or cannot produce a blob, the original goes up untouched and the
server's own validation answers. And **it does not re-encode what does not need
it** — a small PNG or WebP, or a JPEG with no EXIF block at all, passes through
byte for byte. Whether a JPEG carries EXIF is read from the marker stream rather
than inferred from decoding it twice: measured in Chrome, `imageOrientation:
'none'` returns the *oriented* bitmap too, so the two decodes always agree and a
sideways photograph would sail straight through.

This does **not** make steps 3 and 5 unnecessary. Anything that does not come
through the memory picker — a future import, another client, a direct API
call — still arrives unprocessed, and a thumbnail is still a thumbnail.

**The access-control posture is unchanged and still not access control.** Files
are served publicly from unguessable paths (§4). Before anything social ships
this must move behind a guarded streaming controller.
