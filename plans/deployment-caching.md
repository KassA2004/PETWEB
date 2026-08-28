# Static asset caching requirements

`frontend/dist` is built with content-hashed filenames. Whatever serves it must
apply these headers, or the fingerprinting buys nothing.

| Path | Header | Why |
|---|---|---|
| `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` | Filenames contain a content hash. A changed file gets a new name, so the old one can be cached forever. |
| `/index.html` | `Cache-Control: no-cache` | The only unhashed file. It is the manifest that points at the hashed ones; a cached copy pins users to a dead build. |
| `/favicon.svg`, `/icons.svg` | `Cache-Control: public, max-age=86400` | Unhashed but stable and tiny. |
| `/api/v1/*` | `Cache-Control: private, no-store` | Every response is user-specific. Must never enter a shared cache. |
| `/uploads/*` | already set in `Backend/src/main.ts` — 1 year, immutable | Filenames contain a uuid. |

Also required at the proxy or CDN layer:
- Brotli for text responses, gzip as the fallback (the Node process does gzip
  only — see Task 15 of `Docs/plans/website-performance-optimization-plan.md`).
- HTTP/2 or HTTP/3, so the parallel PixiJS chunks multiplex on one connection.
- Keep-alive enabled.

## Verified during Task 16 of the performance optimization plan

- **No source maps ship.** `frontend/dist/assets/*.map` — none exist.
  `vite.config.ts` sets no `build.sourcemap` option, so Vite's default
  (`false`) applies.
- **Dev-only entries do not reach the build.** `frontend/dist/` contains only
  `assets/`, `favicon.svg`, `icons.svg` and `index.html` — no
  `app-preview.html`, `panel-preview.html` or `room-preview.html`, and
  `index.html` has zero references to any of them. Vite builds only the entry
  named in its default input (`index.html`) unless configured otherwise, and
  this project has no such configuration.
- **The dev snapshot plugin does not ship either.**
  `devSnapshotPlugin()` in `vite.config.ts` registers its `/__snapshot`
  middleware only inside the `configureServer` hook, which Vite invokes for
  `vite dev`/`vite preview`'s dev server only — never for `vite build`'s
  output.
- **`Backend/src/main.ts`'s existing `/uploads` static handler is already
  correct** (`maxAge: '1y', immutable: true, index: false, dotfiles: 'deny'`)
  and was left untouched.

This file documents a deployment requirement rather than a code change,
because nothing in this repository currently serves `frontend/dist` in
production — that is the hosting/deployment layer's job, and no such
configuration exists in the repo to edit.
