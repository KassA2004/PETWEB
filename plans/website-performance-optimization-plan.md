# Execution plan — website performance optimization

Source requirements: `/Docs/website-performance-optimization-instructions.md`.
Rules that still apply: `/Docs/AGENTS.md` (including the new
**Performance Rules** section added alongside this plan).

You are executing this plan. **Every decision has already been made below.**
Do not substitute your own approach, do not add tasks, do not skip tasks. If a
step's premise turns out to be false when you get there (a file moved, a
measurement disagrees with what is recorded here), **stop that task, write what
you found into the results file, and move to the next task** — do not improvise
a different optimization.

---

## 0. Read this first — the "240 requests" is a development-server artifact

This was measured on the running app before the plan was written. It is the
single most important fact in this document, and it changes what the work is.

**Measured on the Vite dev server (`http://localhost:5173`, 2026-08-28):**

| | |
|---|---:|
| Total requests | **222** |
| `script` requests | 220 |
| Transferred | **16.0 MB** |
| DOMContentLoaded | 733 ms |
| Load | 734 ms |
| TTFB | 5 ms |

Broken down by what those 220 scripts actually are:

```text
  186   /src/*.ts, /src/*.tsx      one HTTP request per source file
   30   /node_modules/.vite/deps/  Vite's pre-bundled dependency chunks
    1   /@vite/client              204 KB — the HMR client
    1   /@react-refresh            112 KB — React Fast Refresh
    1   /api/auth/get-session      the only real API call on the signed-out page
```

The largest "resources" on that page are `pixi__js.js` (3.1 MB),
`react-dom_client.js` (2.8 MB) and `zod.js` (1.6 MB) — all unminified,
unbundled development builds.

**Measured on the production build (`npx vite build`, same commit):**

| | |
|---|---:|
| Files emitted | **14** |
| Main JS chunk | **820.04 kB → 256.03 kB gzip** |
| CSS | 48.04 kB → 8.83 kB gzip |
| PixiJS split chunks | 8 files, ~354 kB raw |
| Total | ~1.23 MB raw / ~373 kB gzip |
| Modules transformed | 1032 |

**Conclusion, and the reframe this plan is built on:**

> Vite serves unbundled ES modules in development — one request per module, by
> design, so that HMR can replace a single file. Those 222 requests do not
> exist in production; the same page ships as **14 files**. Optimizing the
> number 222 is optimizing a number that is already zero in the environment
> users see.
>
> The real, production-visible problems are: **one 820 kB JavaScript chunk with
> no code splitting**, a **three-deep request waterfall** before the room can
> draw, **uncompressed API responses**, and **redundant database work per
> request**. Those are what this plan fixes.

`/Docs/website-performance-optimization-instructions.md` §21 says exactly this:
*"Do not optimize for the number 240 by itself. Optimize the entire delivery
pipeline."* This plan obeys that.

### What you must tell the user in the final report

The final report (Task 19) must open by stating that the 240-request figure was
a dev-server measurement, must give the production request count before and
after, and must **not** claim a reduction from 240 to anything. Reporting
"240 → 14" would be a fabricated improvement, which §19 of the instructions
forbids ("Do not fabricate improvements").

---

## 1. Ground rules for every task

### 1.1 Never
- Never delete a feature, an asset, a sound, a customization option, an object
  type or a visual detail to make a metric move.
- Never lower render resolution, antialiasing, physics fidelity, animation rate,
  or the number of catalog options.
- Never replace real data with stale or approximate data.
- Never introduce a new runtime dependency. `/Docs/AGENTS.md` — "Do not
  introduce technologies not specified in TECH_STACK.md without approval." The
  one exception is explicitly named and justified in Task 15.
- Never change the API contract of an existing endpoint. Adding a new endpoint
  is allowed where this plan says so; changing the shape of an existing response
  is allowed only where this plan says so.
- Never cache a user-specific response in a shared or public cache.
- Never commit. Leave changes in the working tree.

### 1.2 Do not touch these — they are already correct

Verified during planning. Leave them exactly as they are.

| File | Why it is already right |
|---|---|
| `frontend/src/lib/preview.ts` | One shared offscreen WebGL context, keyed cache capped at 400, in-flight de-duplication via a `pending` map. This is the correct design. |
| `frontend/src/features/pets/renderPortrait.ts` | Same pattern, own cache, capped. |
| `frontend/src/lib/audio/*` | There are no audio files. Every sound is synthesised. Zero network cost. |
| `frontend/src/features/habitat/useRoomObjects.ts` — the **save** path | Eager snapshot + 900 ms debounce + `same()` equality check. The comments explain why the snapshot is taken early; that reasoning is correct and load-bearing. |
| `frontend/src/features/habitat/useRoomStyle.ts` — the **save** path | 700 ms debounce + `sameRoomStyle` guard + teardown flush. Correct. |
| `Backend/src/main.ts:55-63` — `useStaticAssets` for `/uploads` | Already `maxAge: '1y', immutable: true`. Correct. |
| All `@@index` declarations in `Backend/prisma/*.prisma` | Reviewed against every query on the load path. They cover it. Task 14 verifies with `EXPLAIN`; it does not add indexes speculatively. |
| `frontend/public/favicon.svg`, `icons.svg` | Two files, 14.5 kB total. Not a problem. |

### 1.3 There are no images, fonts or third-party scripts to optimize

Verified during planning:

- **Images:** zero raster assets in `frontend/public/` and zero image imports in
  `frontend/src/`. All artwork is procedural PixiJS. Sections §7.1 and §7.2 of
  the instructions have no work in this codebase.
- **Fonts:** `frontend/src/index.css` declares
  `--font-sans: ui-rounded, 'Nunito', 'Segoe UI', system-ui, Roboto, sans-serif`
  and there is **no `@font-face` and no Google Fonts link**. Every family is a
  system font. Section §7.3 has no work — **do not add a webfont**.
- **Third-party scripts / analytics / tracking:** none. Section §11 has no work.

Record all three as "N/A — verified, nothing to do" in the results file. Do not
invent work here.

### 1.4 After every task

1. `cd frontend && npx tsc -b --noEmit` must pass (or
   `cd Backend && npx tsc -p tsconfig.json --noEmit` for backend tasks).
2. Run the task's own **Verify** block.
3. Append the result to `plans/performance-results.md` (created in Task 1).
4. If a task cannot be completed, write down why and move on. Do not block.

---

## 2. Task order

Do them in this order. Later tasks depend on measurements taken by earlier ones.

```text
  Phase 1  Baseline          Task 1   measurement harness + frontend baseline
                             Task 2   API + database baseline

  Phase 2  Bundle            Task 3   remove two unused dependencies
                             Task 4   split the auth screen out of the main chunk
                             Task 5   split the customizer (and Splide) out
                             Task 6   split the memories panel out
                             Task 7   verify chunking, fix the page <title>

  Phase 3  Waterfall         Task 8   kill the third request hop
                             Task 9   warm the API connection

  Phase 4  API / services    Task 10  stop re-reading the session from the DB
                             Task 11  stop re-querying what was just written
                             Task 12  stop over-fetching the pet library
                             Task 13  stop reading affection four times per completion

  Phase 5  Database          Task 14  EXPLAIN the load-path queries

  Phase 6  Transport         Task 15  enable response compression
                             Task 16  static asset cache headers + deploy note

  Phase 7  Rendering         Task 17  profile re-renders, fix only what profiles badly

  Phase 8  Regression        Task 18  full manual feature pass

  Phase 9  Benchmark         Task 19  before/after table + written report
```

---

# PHASE 1 — BASELINE

## Task 1 — Measurement harness and frontend baseline

### Why
`/Docs/website-performance-optimization-instructions.md` §2.2: measure before
changing. Nothing after this task may be justified by anything but a number.

### 1a. Create the results file

Create `plans/performance-results.md` with exactly this skeleton:

```markdown
# Performance results

All figures measured on the **production build** unless a row says "dev".

## Baseline (before)
_(filled by Task 1 and Task 2)_

## Per-task notes
_(appended by every task)_

## Final comparison
_(filled by Task 19)_
```

### 1b. Build and serve production

```bash
cd frontend && npx vite build
```

Record from the build output, verbatim: every emitted filename, its raw size and
its gzip size, and the total module count. Then serve it:

```bash
cd frontend && npx vite preview --port 4173
```

Use `vite preview`, **not** `npm run dev`. Every number in this plan after Task 1
is a production number. If you measure the dev server again you will measure the
artifact described in §0.

### 1c. Record the signed-out baseline

Load `http://localhost:4173` and run this in the page console:

```js
(() => {
  const res = performance.getEntriesByType('resource');
  const nav = performance.getEntriesByType('navigation')[0];
  let transfer = 0, decoded = 0;
  const byType = {};
  for (const e of res) {
    const t = e.initiatorType || 'other';
    byType[t] = byType[t] || { count: 0, transfer: 0 };
    byType[t].count++; byType[t].transfer += e.transferSize || 0;
    transfer += e.transferSize || 0; decoded += e.decodedBodySize || 0;
  }
  return JSON.stringify({
    totalRequests: res.length + 1, byType,
    transferredKB: Math.round(transfer / 1024),
    resourceKB: Math.round(decoded / 1024),
    ttfb: Math.round(nav.responseStart - nav.requestStart),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
    load: Math.round(nav.loadEventEnd),
  }, null, 2);
})();
```

### 1d. Record the signed-in baseline — this is the one that matters

Start the backend (`cd Backend && npm run start:dev`), sign in, and let the
dashboard fully settle. Then re-run the snippet from 1c **and** capture the API
call list separately:

```js
(() => performance.getEntriesByType('resource')
  .filter(e => e.name.includes('/api/'))
  .map(e => ({
    url: new URL(e.name).pathname,
    start: Math.round(e.startTime),
    end: Math.round(e.responseEnd),
    ms: Math.round(e.duration),
    bytes: e.transferSize || 0,
  }))
  .sort((a, b) => a.start - b.start))();
```

**Draw the waterfall in the results file.** It is the input to Task 8, and
Task 8's success is judged against it.

### 1e. Record Core Web Vitals

In the same signed-in session:

```js
new PerformanceObserver(l => {
  for (const e of l.getEntries()) console.log('LCP', Math.round(e.startTime), e.element);
}).observe({ type: 'largest-contentful-paint', buffered: true });

let cls = 0;
new PerformanceObserver(l => {
  for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value;
  console.log('CLS', cls.toFixed(4));
}).observe({ type: 'layout-shift', buffered: true });
```

For **INP**: switch tabs Goals → Memories → Pet → Room, open the pet customizer,
drag one slider. Record the worst interaction latency from the browser's
Performance panel. If INP cannot be measured reliably, write
"not measurable in this environment" — do not guess a number.

### Verify
`plans/performance-results.md` contains: the full build manifest, signed-out
totals, signed-in totals, the sorted API waterfall, LCP, CLS, and either an INP
figure or an explicit note that it was not measurable.

---

## Task 2 — API and database baseline

### Why
§5.1: profile actual queries; optimize measured impact, not guesses. Tasks 10–14
are only allowed to claim a win against these numbers.

### 2a. Turn on Prisma query logging

Edit `Backend/src/prisma/prisma.service.ts`. The class currently extends
`PrismaClient` with no constructor. Add one that enables query logging **only
when an environment variable asks for it**, so this is a diagnostic and not a
permanent production cost:

```ts
constructor() {
  super(
    process.env.PRISMA_LOG_QUERIES === '1'
      ? { log: [{ emit: 'event', level: 'query' }] }
      : {},
  );
}
```

Then in `onModuleInit`, when the flag is on, subscribe and log:

```ts
if (process.env.PRISMA_LOG_QUERIES === '1') {
  // @ts-expect-error Prisma's event typing does not narrow on the log config
  this.$on('query', (event: { query: string; duration: number }) => {
    this.logger.debug(`${event.duration}ms ${event.query}`);
  });
}
```

**This instrumentation stays in the codebase permanently** — it is off by
default, and §17 of the instructions asks for observability. Do not remove it in
a later task.

### 2b. Count queries per page load

Start the backend with `PRISMA_LOG_QUERIES=1`, clear the log, load the signed-in
dashboard once, and record:

- total queries for one page load,
- queries per endpoint (group the log by the request that caused them),
- the slowest five queries by duration,
- how many of the total are auth queries (Better Auth's session lookup plus the
  `User.findUnique` in `Backend/src/auth/auth.guard.ts:47`).

### 2c. Record API response sizes

From the Task 1d capture, record the byte size of each of:
`/api/auth/get-session`, `/api/v1/pets`, `/api/v1/environments/current`,
`/api/v1/environments/:id/objects`, `/api/v1/goals`, `/api/v1/focus`.

Note whether **any** response carries a `content-encoding` header. Expected
answer, from planning: **none of them do.** That is Task 15.

### Verify
Results file contains the per-load query count, the per-endpoint breakdown, the
five slowest queries, and the six response sizes with their encoding status.

---

# PHASE 2 — FRONTEND BUNDLE

## Task 3 — Remove two unused dependencies

### The finding
Verified by grep across all of `frontend/src`: **zero imports** of either.

| Package | Imports found |
|---|---|
| `@pixi/react` | none |
| `lucide-react` | none |

These are not in the production bundle (nothing imports them, so tree-shaking
already drops them), but they are installed, they are pre-bundled by Vite in
development, and they are a maintenance liability. §6.1: "Remove unused
dependencies and imports."

### Files
- `frontend/package.json`

### Steps
1. Confirm the finding yourself before deleting anything:
   ```bash
   cd frontend && grep -rn "@pixi/react\|lucide-react" src/
   ```
   This **must** print nothing. If it prints anything, skip this task entirely
   and record why.
2. Delete the `"@pixi/react"` and `"lucide-react"` lines from `dependencies`.
3. `cd frontend && npm install` to update the lockfile.

### Do not remove these — they are used
- `@radix-ui/react-slot` → `src/components/ui/button.tsx`
- `@radix-ui/react-label` → `src/components/ui/label.tsx`
- `class-variance-authority` → `src/components/ui/button.tsx`
- `clsx`, `tailwind-merge` → `src/lib/utils.ts`
- `@splidejs/splide` → `src/components/ui/carousel.tsx` (handled in Task 5)
- `zod` → `src/features/auth/schemas.ts` (handled in Task 4)

### Verify
`npx vite build` succeeds. Main chunk size is unchanged — **expected**, because
they were never bundled. Record that "unchanged" result honestly; the win here is
install size and dev pre-bundling, not the production bundle.

---

## Task 4 — Split the auth screen out of the main chunk

### Why this is the biggest single win
`frontend/src/App.tsx` renders `<AuthGate>` around `<Dashboard>`. Both are
**static** imports, so the 820 kB chunk contains, in one file:

- the auth screen and its `zod` schemas,
- the entire dashboard,
- `PetHabitat` → `PetRoom` (129 kB of source alone),
- the physics engine, the navigation grid, `PetBrain` (65 kB),
- every pet customization catalog and every object renderer.

A signed-out visitor downloads the whole creature simulation to look at a login
form. `zod` appears ~300 times in the built chunk and exists only to validate
three fields on two forms (`frontend/src/features/auth/schemas.ts`).

Splitting on the auth boundary means: signed-out users get a small chunk;
signed-in users fetch the dashboard chunk **in parallel with** the
`get-session` request they were already waiting for, so it costs them nothing.

### Files
- `frontend/src/App.tsx`
- `frontend/src/features/auth/AuthGate.tsx`

### 4a. Make `AuthGate` decide, and lazy-load both branches

`AuthGate` currently imports `AuthScreen` statically and takes `children`.
Change it so it lazy-loads **both** sides. Rewrite
`frontend/src/features/auth/AuthGate.tsx` to:

```tsx
import { lazy, Suspense } from 'react';
import { useSession } from '../../lib/auth-client';

const AuthScreen = lazy(() =>
  import('./AuthScreen').then((m) => ({ default: m.AuthScreen })),
);
const Dashboard = lazy(() =>
  import('../dashboard/Dashboard').then((m) => ({ default: m.Dashboard })),
);

/** The one full-frame message this app shows while it is deciding. */
function Waiting() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

/**
 * The single place the app decides between the landing screen and the world.
 * `GET /api/auth/get-session` returns `200` with `null` rather than `401` for
 * "no session" specifically so this can be a plain data check, not error
 * handling (01-auth-endpoints.md §4).
 *
 * Both branches are code-split. The dashboard carries PixiJS, the physics
 * engine and every customization catalog; a visitor looking at a login form has
 * no use for any of it, and a signed-in user fetches it while `get-session` is
 * still in flight — so the split costs them nothing and saves the other case
 * most of the bundle.
 */
export function AuthGate() {
  const { data: session, isPending, refetch } = useSession();

  if (isPending) return <Waiting />;

  return (
    <Suspense fallback={<Waiting />}>
      {session ? <Dashboard /> : <AuthScreen onAuthenticated={() => void refetch()} />}
    </Suspense>
  );
}
```

`AuthGate` no longer takes `children`. Remove the `AuthGateProps` interface and
the `ReactNode` import.

### 4b. Simplify `App.tsx`

```tsx
import { AuthGate } from './features/auth/AuthGate';

/**
 * The app is a page with a creature living in it.
 *
 * Everything below this line is ordinary React; the PixiJS world is mounted
 * inside one framed component (`PetHabitat`) and never shares a tree with the
 * interface (/Docs/project-overview.md §10).
 */
function App() {
  return <AuthGate />;
}

export default App;
```

### The loading fallback must not regress the experience
`AuthGate` already showed a full-frame `Loading…` during `isPending`. The
`Suspense` fallback reuses **the same markup**, so a signed-in user sees one
continuous "Loading…" that never flickers between two different placeholders.
This is required by §2.1 ("Do not introduce client-visible loading
regressions") — do not invent a different spinner.

### Verify
1. `npx vite build`. There must now be **at least two new chunks**, one
   containing the auth screen, one containing the dashboard. Record every chunk
   name and size.
2. Confirm `zod` is **no longer in the entry chunk**:
   ```bash
   cd frontend/dist/assets && for f in *.js; do printf "%-40s zod:%s\n" "$f" "$(grep -o 'zod' "$f" | wc -l)"; done
   ```
   The entry chunk (the one referenced by `<script>` in `dist/index.html`) must
   score 0 or near-0; the auth chunk carries it now.
3. `npx vite preview`, load signed-out, record the new transferred-byte total.
4. Sign in. **The room must render exactly as before.** Check: creature draws,
   objects restore, room style restores, tabs work.

---

## Task 5 — Split the customizer and Splide out of the dashboard chunk

### Why
`@splidejs/splide` (≈305 kB unbundled) is imported by
`frontend/src/components/ui/carousel.tsx`, which is used only by the
customization UI. `CustomizerPanel.tsx` is 20 kB of source and pulls in the pet
part catalogs. None of it is needed to draw the room — it is needed when the
user opens the **Pet** tab, which is not the default tab
(`Dashboard.tsx` starts on `useState<TabValue>('goals')`).

§6.2 lists "heavy editors" as a lazy-load candidate. This is that.

### Files
- `frontend/src/features/dashboard/Dashboard.tsx`

### Steps
1. In `Dashboard.tsx`, remove the static import:
   ```tsx
   import { CustomizerPanel } from '../customization/CustomizerPanel';
   ```
   and declare it lazily at module scope beneath the remaining imports:
   ```tsx
   /**
    * The editor, and Splide with it, fetched when the Pet tab is opened.
    *
    * Not on the load path: the dashboard opens on Goals, and nothing in the
    * room needs the part catalogs to draw. This is the largest thing behind a
    * tab the user may never press.
    */
   const CustomizerPanel = lazy(() =>
     import('../customization/CustomizerPanel').then((m) => ({
       default: m.CustomizerPanel,
     })),
   );
   ```
2. Add `lazy` and `Suspense` to the existing `react` import at the top of the
   file.
3. Wrap **only** the `CustomizerPanel` element in the `shownTab === 'pet'`
   branch. `PetLibraryPanel` and `AffectionMeter` stay eager — they are small
   and they are what the tab shows first:
   ```tsx
   <Suspense
     fallback={
       <p className="px-1 py-3 text-sm text-muted-foreground">
         Opening the editor…
       </p>
     }
   >
     <CustomizerPanel
       appearance={appearance}
       onChange={updateAppearance}
       petName={petName}
       onPetNameChange={setPetName}
     />
   </Suspense>
   ```

### Do not lazy-load these
- `PetHabitat` — it is the primary content and the LCP element. §6.2: "Do not
  lazy-load critical content in a way that makes the initial experience slower."
- `GoalsPanel` — it is the default tab.
- `RoomStylePanel` — it is small and it is how the user reaches the room.

### Verify
1. Build. A new chunk containing Splide must exist, and the dashboard chunk must
   shrink by roughly Splide's minified size. Record both numbers.
2. Preview, sign in, click the **Pet** tab. The customizer must appear. Every
   part category must still be listed, every preview thumbnail must still draw,
   and the carousel must still page.
3. Drag a slider. The creature in the room must update live, as before.

---

## Task 6 — Split the memories panel out, and reserve its image box

### Why
`MemoriesPanel` is a secondary tab that renders uploaded images. It is not on
the load path.

### Files
- `frontend/src/features/dashboard/Dashboard.tsx`
- `frontend/src/features/memories/MemoriesPanel.tsx`

### 6a. Lazy-load the panel
1. Replace the static `MemoriesPanel` import with a `lazy(...)` declaration in
   the same style as Task 5.
2. Wrap the `shownTab === 'memories'` element in a `Suspense` whose fallback is:
   ```tsx
   <p className="px-1 py-3 text-sm text-muted-foreground">Opening the book…</p>
   ```

### 6b. Reserve the image box

`MemoriesPanel.tsx` renders:

```tsx
<img
  src={imageSrc(memory.imageUrl)}
  alt=""
  loading="lazy"
  className="max-h-48 w-full object-cover"
/>
```

`loading="lazy"` is already correct — **keep it**. But the element has no
reserved height, so every image that arrives pushes the list down. §9.3 forbids
exactly this. Wrap the image in a fixed-height box so the space exists before
the bytes land:

```tsx
<div className="h-48 w-full overflow-hidden bg-muted">
  <img
    src={imageSrc(memory.imageUrl)}
    alt=""
    loading="lazy"
    decoding="async"
    className="h-full w-full object-cover"
  />
</div>
```

`object-cover` on a fixed-height box crops exactly as `max-h-48 object-cover`
did, so **the visual result is unchanged** — only the reflow is gone.

### Verify
1. Build; a memories chunk exists.
2. Sign in, complete a goal with a photo attached, open **Memories**. The image
   must render identically to before.
3. Re-run the Task 1e CLS snippet on the Memories tab. It must be lower than or
   equal to the baseline. Record both.

---

## Task 7 — Verify the chunk graph, and fix the page title

### 7a. Confirm the split actually helped

```bash
cd frontend && npx vite build
```

Write the full manifest into the results file and compare against Task 1b. The
entry chunk **must** be meaningfully smaller than 820 kB. If it is not, the lazy
boundaries did not take — most likely because something still imports a lazy
module statically. Find it with:

```bash
cd frontend && grep -rn "from '.*CustomizerPanel'\|from '.*MemoriesPanel'\|from '.*Dashboard'\|from '.*AuthScreen'" src/
```

Every remaining hit must be inside an `import(...)` call or a type-only import
(`import type`). A type-only import is fine — it is erased at build time.

### 7b. Do not hand-write `manualChunks`

Vite/Rolldown already splits PixiJS into eight chunks that load in parallel via
`modulepreload`. That is good behaviour, not a problem. §3.1: "Do not blindly
chase a low request count. A single enormous request can be worse than several
small, cacheable requests." **Leave the PixiJS chunking alone.**

### 7c. Fix the document title and add a description

`frontend/index.html` still ships `<title>frontend</title>`. It is the scaffold
default and it is what a user sees in their tab and their bookmarks.

Change:
```html
<title>frontend</title>
```
to:
```html
<title>Digital Pet World</title>
<meta name="description" content="A small creature lives here. Be nice to it." />
```

Both strings are taken verbatim from the existing header in
`frontend/src/features/dashboard/Dashboard.tsx`, so nothing new is invented.

### Verify
Build, preview, confirm the browser tab reads "Digital Pet World". Record the
final chunk manifest.

---

# PHASE 3 — REQUEST WATERFALL

## Task 8 — Remove the third hop before the room can draw

### The measured waterfall
From reading the code — confirm against your Task 1d capture:

```text
  document
   └─ entry chunk
        └─ GET /api/auth/get-session          ← AuthGate blocks on this
             └─ Dashboard mounts, four hooks fire in parallel:
                  ├─ GET /pets                      (usePetLibrary)
                  ├─ GET /environments/current      (useRoomStyle)
                  ├─ GET /goals                     (useGoals)
                  └─ GET /focus                     (useFocus)
                       └─ GET /environments/:id/objects   ← THE THIRD HOP
```

`useRoomObjects` cannot start until `useRoomStyle` has returned an
`environmentId` — the load effect in
`frontend/src/features/habitat/useRoomObjects.ts` guards on
`if (!environmentId) return`. So the user's furniture is one full round-trip
behind everything else, and furniture is the slowest thing to appear in the room.

§3.3: "Where dependencies do not actually exist, initiate independent requests
concurrently." The dependency here is not real. The server already knows which
environment is the user's current one — `EnvironmentsService.current()` resolves
it from `ownerId` alone. The client only needs the id because the *route* asks
for it.

### The decision: add one narrow endpoint
Add `GET /api/v1/environments/current/objects`. It resolves the current
environment server-side and returns the same `PlacedObjectView[]` the existing
route returns.

This is deliberately **not** a `/bootstrap` endpoint returning everything. §3.4:
"Avoid creating giant generic endpoints that return the entire database object
graph." One route, one purpose, same response shape as its sibling.

**The existing `GET /environments/:environmentId/objects` route stays.** It is
documented, and the save path still uses the id-bearing `PUT`.

### Files
- `Backend/src/environments/environments.service.ts`
- `Backend/src/environments/environments.controller.ts`
- `frontend/src/features/habitat/api.ts`
- `frontend/src/features/habitat/useRoomObjects.ts`
- `Docs/API-endpoints/04-environment-endpoints.md`

### 8a. Backend — resolve the current environment id once

In `Backend/src/environments/environments.service.ts`, add a public method
directly after `current()`:

```ts
/**
 * The id of the room the user is living in, and nothing else.
 *
 * Exists so `GET /environments/current/objects` can answer without the client
 * first fetching the room to learn its id — that round trip was the last hop of
 * a three-deep waterfall, and the dependency was never real: the server has
 * always been able to resolve "the current room" from the owner alone.
 *
 * Creates one if the account somehow has none, for the same reason `current()`
 * does: an account without a room cannot render anything.
 */
async currentId(ownerId: string): Promise<string> {
  const existing = await this.prisma.environment.findFirst({
    where: { ownerId },
    orderBy: { name: 'asc' },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await this.prisma.environment.create({
    data: { ownerId, name: 'Room' },
    select: { id: true },
  });

  return created.id;
}
```

### 8b. Backend — the controller route

In `Backend/src/environments/environments.controller.ts`, add this **directly
after the existing `@Get('current')` handler and before `@Get(':environmentId')`**.
Route order matters here for the same reason the file's own comment says it
does — a literal segment declared after a UUID param gets swallowed.

```ts
/**
 * What is standing in the room, without having to know which room it is.
 *
 * The same list as `GET /environments/:id/objects`, resolved from the session
 * instead of from a path parameter, so the client can ask for its furniture in
 * parallel with everything else rather than one round trip behind the room.
 */
@Get('current/objects')
async listCurrentObjects(
  @CurrentUser() user: SessionUser,
): Promise<PlacedObjectView[]> {
  const environmentId = await this.environments.currentId(user.id);
  return this.objects.list(user.id, environmentId);
}
```

### 8c. Frontend — the client function

In `frontend/src/features/habitat/api.ts`, add beside `fetchRoomObjects`:

```ts
/**
 * The furniture, without knowing which room it is in.
 *
 * Lets the arrangement load in parallel with `/environments/current` instead of
 * waiting on it for an id the server can resolve itself.
 */
export function fetchCurrentRoomObjects(
  signal?: AbortSignal,
): Promise<PlacedObject[]> {
  return apiRequest<PlacedObject[]>('/environments/current/objects', { signal });
}
```

Keep `fetchRoomObjects` — it is still exported and still correct.

### 8d. Frontend — load early, save late

In `frontend/src/features/habitat/useRoomObjects.ts`, change **only the load
effect**. Replace the whole effect that currently begins
`useEffect(() => { if (!environmentId) return;` with:

```ts
// Loads immediately, without waiting for `useRoomStyle` to hand over an id:
// the server resolves the current room itself. The id is still needed to
// *save*, but a save is debounced by 900 ms and only ever follows a user
// action, so it is always in hand long before the first write.
useEffect(() => {
  const controller = new AbortController();

  void (async () => {
    try {
      const objects = await fetchCurrentRoomObjects(controller.signal);
      if (controller.signal.aborted) return;

      persisted.current = objects;
      onLoadedRef.current(objects);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (!(cause instanceof ApiError && cause.isUnauthorized)) {
        setError(messageFor(cause));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  })();

  return () => controller.abort();
}, []);
```

Update the import at the top of the file from `fetchRoomObjects` to
`fetchCurrentRoomObjects`.

**Change nothing else in this file.** The `write()` path still reads
`environmentRef.current` and still returns early when it is null — that guard is
now doing real work and must stay.

### 8e. The `environmentId` prop stays

`useRoomObjects` still receives `environmentId` and still mirrors it into
`environmentRef`. Do not remove the option or the effect that syncs it. Saving
depends on it.

### 8f. Document the new route

Append a section to `Docs/API-endpoints/04-environment-endpoints.md` describing
`GET /environments/current/objects`: auth required, no parameters, returns
`PlacedObjectView[]` identical to `GET /environments/:environmentId/objects`,
and the one-line reason it exists (removing a load-path round trip).

### Verify
1. Both `tsc` checks pass.
2. Sign in with a room that has furniture in it. **Every object must come back
   in the right cell**, exactly as before.
3. Re-run the Task 1d API capture. `/environments/current/objects` must now
   start at roughly the same time as `/pets` and `/goals`, not after
   `/environments/current` finishes. Record both waterfalls side by side.
4. Move a chair, wait two seconds, reload. The move must persist — this proves
   the save path still has its `environmentId`.
5. Sign out and back in. The room must restore.

---

## Task 9 — Warm the API connection

### Why
The API is a different origin from the app in this project
(`VITE_API_URL`, default `http://localhost:3000`). The very first request to it
— `get-session`, which blocks the entire dashboard — pays DNS + TCP + TLS before
a byte moves. §13 asks for efficient connection reuse.

### What to do, and what not to do
Add a `preconnect` hint. **Do not** speculatively fetch dashboard data before
the session resolves — signed-out visitors would get a burst of 401s, which §16
("Do not introduce a performance optimization that creates … stale
authorization") and §2.1 both rule out.

### Files
- `frontend/index.html`

### Steps
Add to `<head>`, after the `viewport` meta:

```html
<!--
  The API is a different origin, and `get-session` is the request the whole
  dashboard waits behind. Opening the connection while the entry chunk is still
  parsing takes DNS, TCP and TLS off that critical path.
  Update this host if VITE_API_URL changes.
-->
<link rel="preconnect" href="http://localhost:3000" crossorigin />
```

`crossorigin` is required: the auth request sends credentials, and a preconnect
without it opens a connection in the wrong credentials mode, which the browser
will not reuse.

### If the API is same-origin in production
If the deployment serves the API and the app from one origin, this hint is
useless — a same-origin preconnect is a no-op. In that case **delete the tag
instead of shipping it** and record that decision in the results file.

### Verify
Load the production preview and measure:

```js
(() => performance.getEntriesByType('resource')
  .filter(e => e.name.includes('get-session'))
  .map(e => ({
    connect: Math.round(e.connectEnd - e.connectStart),
    ttfb: Math.round(e.responseStart - e.requestStart),
  })))();
```

Record `connect` before and after. It should fall to zero.

---

# PHASE 4 — API / SERVICE LAYER

## Task 10 — Stop re-reading the session from the database on every request

### The finding
`Backend/src/auth/auth.guard.ts` runs on **every** authenticated request and
does two things:

```ts
const session = await auth.api.getSession({ headers: ... });   // line 39 — DB read
const user = await this.prisma.user.findUnique({ ... });       // line 47 — DB read
```

With five API calls on a signed-in page load, that is **ten database
round-trips of pure auth overhead** before any handler does its own work. Your
Task 2b number will confirm the exact figure.

### The decision: enable Better Auth's cookie cache. Nothing else.
Better Auth signs a short-lived copy of the session into the cookie, so
`getSession` can answer without touching the database until the cache expires.
It is a first-class feature of the library already in use — **no new dependency,
no hand-rolled cache, no shared cache server.**

**Do not** cache the domain `User` lookup on line 47. It is a primary-key hit on
an indexed column, and caching an authorization row is exactly the "stale
authorization" §16 forbids.

### The trade-off you must accept and record
A revoked or expired session stays usable for up to the cache TTL. That is why
the TTL is **five minutes and not longer**. Write this trade-off into the
results file explicitly. If the product later needs instant revocation, this
setting is the thing to turn off.

### Files
- `Backend/src/auth/auth.ts`

### Steps
In the `betterAuth({...})` call, add a `session` block beside the existing
`emailAndPassword` block:

```ts
/**
 * A signed copy of the session in the cookie, refreshed every five minutes.
 *
 * `AuthGuard` runs on every request, and without this every request began with
 * a session read from Postgres — five of them on one dashboard load, before any
 * handler had done its own work.
 *
 * Five minutes, and not longer, because this is the window in which a revoked
 * session still works. The domain `User` lookup in `auth.guard.ts` is
 * deliberately NOT cached: that row is the authorization decision, and it is a
 * primary-key hit.
 */
session: {
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60,
  },
},
```

### Verify
1. `cd Backend && npx tsc -p tsconfig.json --noEmit`.
2. With `PRISMA_LOG_QUERIES=1`, reload the signed-in dashboard **twice**. On the
   second load the session-lookup queries must be gone. Record the query count
   for load 1 and load 2 against the Task 2b baseline.
3. **Authorization must still be correct.** Sign out in one tab; the other tab
   must be signed out within five minutes and immediately on any hard reload
   that revalidates. Confirm a signed-out request to `/api/v1/goals` still
   returns 401.
4. Sign in as a second user in a private window. Confirm you see **that user's**
   goals, room and pets — never the first user's. This is the cache-isolation
   check from §20 and it is not optional.

---

## Task 11 — Stop re-querying what was just written

### The finding
`Backend/src/environments/environment-objects.service.ts`, `replace()`:

```ts
async replace(...) {
  await this.ownedEnvironment(ownerId, environmentId);   // query 1
  ...
  await this.prisma.$transaction([ deleteMany, createMany, environment.update ]);
  return this.list(ownerId, environmentId);              // queries 5 AND 6
}
```

`list()` re-runs `ownedEnvironment` (already proven one line earlier) and then
re-reads every row that was just inserted from the exact array the method is
holding. §4.1: "Data fetched and then immediately discarded" and "Queries
repeated within a single request."

The room is saved on a 900 ms debounce during rearranging, so this fires
repeatedly while a user is decorating.

### Files
- `Backend/src/environments/environment-objects.service.ts`

### Steps
Replace the final line of `replace()`:

```ts
return this.list(ownerId, environmentId);
```

with a response built from the rows that were just written:

```ts
// Built from the rows just written rather than read back. Ownership was proven
// at the top of this method and the transaction has committed, so a second
// SELECT would return exactly this array — plus a redundant ownership check.
// Sorted to match `list()` byte for byte, because the client compares the
// confirmed arrangement against its pending one (`useRoomObjects.same`) and an
// order change would look like a change.
return rows
  .map((row) => ({
    key: row.key,
    type: row.type,
    col: row.col,
    row: row.row,
    definition: row.definitionData,
  }))
  .sort((a, b) => (a.row - b.row) || (a.col - b.col));
```

### The ordering detail is not optional
`list()` uses `orderBy: [{ row: 'asc' }, { col: 'asc' }]`. The client's `same()`
in `useRoomObjects.ts` sorts its own keys before comparing, so a mismatch would
not corrupt anything — but matching the order keeps the two paths returning
identical documents, which is what makes them interchangeable. Sort exactly as
written above.

### Verify
1. `tsc` passes.
2. With query logging on, drag one object and wait for the save. Count the
   queries for `PUT /environments/:id/objects` before and after. Expect **two
   fewer**.
3. Rearrange three objects, wait, reload. The room must come back identical.
4. Delete an object by dragging it out, wait, reload. It must stay deleted.

---

## Task 12 — Stop over-fetching the pet library

### The finding
`Backend/src/pets/pets.service.ts:77` `list()` returns full `Pet` rows —
including `personalityData` and `stateData`, both JSON documents — for **every
saved preset the user owns**.

Verified by grep across the whole frontend: the only fields ever read from a
library entry are `id`, `name`, `species` and `appearance`.
`personalityData`, `stateData`, `ageDays`, `ownerId`, `environmentId`,
`createdAt` and `updatedAt` are **never read** from the list response.

§3.5 and §5.3: do not return entire entities when a few fields are needed; use
explicit projections.

### The decision: narrow the list, leave the detail routes alone
- `GET /pets` (the library) → narrow projection.
- `GET /pets/:petId`, `GET /pets/active`, and every write route → **unchanged**.
  They return one pet, they are documented as returning the whole record, and
  they are not on the load path.

### Files
- `Backend/src/pets/pets.service.ts`
- `frontend/src/features/pets/api.ts`
- `Docs/API-endpoints/03-pet-endpoints.md`

### 12a. Backend — a list view that carries only what the library shows

Add a type beside `PetView` in `pets.service.ts`:

```ts
/**
 * A preset as the library grid shows it: a name, a species and a rig to draw.
 *
 * Narrower than `PetView` on purpose. `personalityData` and `stateData` are
 * documents nobody on the client reads, and the library returns one row per
 * saved preset — so they were bytes serialised, transferred and parsed on every
 * page load to be thrown away (§3.5).
 */
export interface PetSummaryView {
  id: string;
  name: string;
  species: string;
  appearanceData: unknown;
  updatedAt: string;
}

export interface PetLibraryView {
  pets: PetSummaryView[];
  activePetId: string | null;
}
```

Change `list()` to project:

```ts
async list(ownerId: string): Promise<PetLibraryView> {
  const [pets, user] = await Promise.all([
    this.prisma.pet.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        species: true,
        appearanceData: true,
        updatedAt: true,
      },
    }),
    this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { activePetId: true },
    }),
  ]);

  return {
    pets: pets.map((pet) => ({
      id: pet.id,
      name: pet.name,
      species: pet.species,
      appearanceData: pet.appearanceData,
      updatedAt: pet.updatedAt.toISOString(),
    })),
    activePetId: user?.activePetId ?? null,
  };
}
```

The existing `Promise.all` is already correct — §4.2 parallelism. Keep it.

### 12b. Frontend — narrow the type to match

In `frontend/src/features/pets/api.ts`:

1. Add a `PetSummary` interface mirroring the new server shape, and change
   `SavedPet` to be built from it:

```ts
/** A preset as the library returns it — only what the grid and the room need. */
export interface PetSummary {
  id: string;
  name: string;
  species: string;
  appearanceData: unknown;
  updatedAt: string;
}

/** A saved pet with its appearance already resolved into a renderable one. */
export interface SavedPet extends Omit<PetSummary, 'appearanceData'> {
  appearance: PetAppearance;
}
```

2. `toSavedPet` currently takes a `PetRecord`. Make it take
   `PetSummary | PetRecord` — both carry every field `SavedPet` needs, so the
   body does not change:

```ts
function toSavedPet(record: PetSummary | PetRecord): SavedPet {
  return {
    id: record.id,
    name: record.name,
    species: record.species,
    updatedAt: record.updatedAt,
    appearance: createPetAppearance(
      (record.appearanceData ?? {}) as Partial<PetAppearance>,
    ),
  };
}
```

3. `RawLibrary.pets` becomes `PetSummary[]`.
4. **Keep `PetRecord` exactly as it is.** `fetchActivePet`, `createPet`,
   `updatePetAppearance` and `renamePet` all still receive full records from
   their unchanged endpoints.

### 12c. Document the change
Note in `Docs/API-endpoints/03-pet-endpoints.md` that `GET /pets` returns a
summary projection rather than full pet records, list the exact fields, and say
that the single-pet routes are unchanged.

### Verify
1. Both `tsc` checks pass. **If the frontend fails to compile, that is the check
   working** — it means something did read a dropped field. In that case, revert
   this entire task and record which field was needed.
2. Sign in with several saved presets. The library grid must show every preset,
   every portrait must draw, `title` tooltips must still read
   `"<name> — <species>"`.
3. Switch presets, rename one, save a new one, delete one. All four must behave
   exactly as before.
4. Record the `GET /pets` response size before and after.

---

## Task 13 — Stop reading affection four times to complete one goal

### The finding
`Backend/src/goals/goals.service.ts` `complete()` triggers this chain:

```text
  notMidSession()  → focus.activeGoalId()  → focus.current()
                                               ├─ focusSession.findFirst
                                               └─ affection.read()        ← read 1
  affection.read()  (captures `before`)                                   ← read 2
  transaction { goal.update, memory.create?, affection.apply, findUnique }
  affection.read()  (the final value)                                     ← read 3
```

Each `affection.read()` is a `User.findUnique` **and can issue a
`User.update`** — `AffectionService.read()` writes back the decayed value when
it has moved. So completing one goal can perform three user reads and up to
three user writes for a number that only changes once.

### The decision — two narrow changes, no redesign
`AffectionService` is the sole writer of the affection columns and that design
is correct. Do not restructure it. Make exactly these two changes.

### Files
- `Backend/src/goals/goals.service.ts`
- `Backend/src/focus/focus.service.ts`

### 13a. Let `activeGoalId` skip the affection read entirely

`focus.current()` builds a full `FocusStateView` including affection, but
`activeGoalId()` uses only the goal id. In `Backend/src/focus/focus.service.ts`,
rewrite `activeGoalId` so it does not go through `current()`:

```ts
/**
 * The goal a session is running against right now, or null.
 *
 * Deliberately does not go through `current()`. That method builds the room's
 * whole picture — including an affection read that can write back a settled
 * value — and the only caller of this one wants a goal id. A session whose time
 * ran out is *not* active, which is the same answer `current()` gives, reached
 * without touching the user row.
 */
async activeGoalId(ownerId: string, now = new Date()): Promise<string | null> {
  const running = await this.prisma.focusSession.findFirst({
    where: { ownerId, status: 'active' },
    orderBy: { startedAt: 'desc' },
    select: { goalId: true, startedAt: true, durationMinutes: true },
  });

  if (!running) return null;

  // Expired but not yet sealed: `current()` will seal it on the next read. It
  // is not blocking anything in the meantime.
  const deadline = new Date(
    running.startedAt.getTime() + running.durationMinutes * 60_000,
  );
  if (deadline.getTime() <= now.getTime()) return null;

  return running.goalId;
}
```

**Check the file's existing `deadlineOf` helper first.** If it accepts a partial
session, call it instead of recomputing the deadline inline — do not duplicate
that arithmetic.

### 13b. Derive the final affection instead of re-reading it

In `goals.service.ts` `complete()`, `affection.apply()` already **returns** the
new `AffectionView` from inside the transaction. Capture it instead of issuing a
third read.

Change the transaction body so it returns both:

```ts
const { goal: completed, affection } = await this.prisma.$transaction(async (tx) => {
  const goal = await tx.goal.update({
    where: { id: goalId },
    data: { status: 'completed', completedAt: new Date() },
  });

  if (input.memory) {
    await tx.memory.create({ /* unchanged */ });
  }

  // The largest single thing that happens to the relationship, and it belongs
  // in this transaction rather than after it: a completion the creature did not
  // notice is a completion the product did not record.
  //
  // Its return value is the new value. Reading it again after the transaction
  // was a third `User.findUnique` for a number this call already produced.
  const applied = await this.affection.apply(tx, ownerId, GOAL_DELTA, {
    followedThrough: true,
  });

  return {
    goal: await tx.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: { memory: true },
    }),
    affection: applied,
  };
});

return {
  ...toView(completed),
  affection,
  affectionGained: Math.max(0, Math.round((affection.value - before) * 100)),
};
```

Delete the `const affection = await this.affection.read(ownerId);` line that
followed the transaction.

### Leave these alone
- The `before` read stays. The delta genuinely needs the pre-transaction value.
- The already-completed early return keeps its `affection.read()`. It runs no
  transaction, so it has nothing to derive from.
- `reopen()` and the focus service's own read paths are unchanged.

### Verify
1. `tsc` passes.
2. With query logging on, complete one goal. Count the queries before and after.
   Expect **at least two fewer**.
3. **The number shown in the celebration must be identical.** Complete a goal on
   a fresh account and note the "+N Happiness" figure; it must match what the
   pre-change code produced for the same starting affection.
4. Complete a goal with a photo memory. The memory must appear in the book.
5. Complete the same goal twice (retry the request). It must return the first
   result with `affectionGained: 0` and must not create a second memory.
6. Start a focus session on a goal, then try to complete that goal. It must
   still be refused with `FOCUS_IN_PROGRESS`. **This is the test for 13a** — do
   not skip it.
7. Let a session's time run out with the tab closed, come back, and complete
   that goal. It must be allowed.

---

# PHASE 5 — DATABASE

## Task 14 — EXPLAIN the load-path queries; add an index only if one is missing

### Why this task is deliberately small
Every index the load path needs already exists. Verified during planning against
`Backend/prisma/*.prisma`:

| Query | Index that serves it |
|---|---|
| `focusSession.findFirst({ ownerId, status })` | `@@index([ownerId, status])` |
| `focusSession.count({ ownerId, status, endedAt })` | `@@index([ownerId, startedAt])` + `[ownerId, status]` |
| `goal.findMany({ ownerId, status })` and the cap count | `@@index([ownerId, status])` |
| `memory.findMany({ ownerId }, orderBy createdAt desc)` | `@@index([ownerId, createdAt])` |
| `pet.findMany({ ownerId })` | `@@index([ownerId])` |
| `environment.findFirst({ ownerId })` | `@@index([ownerId])` |
| `environmentObject.findMany({ environmentId })` | `@@index([environmentId])` |
| session lookup by cookie token | `token String @unique` |

§5.4: "Do not blindly add indexes to every column." **This task confirms; it
does not add.**

### Steps
1. Take the five slowest queries from your Task 2b log.
2. For each, run `EXPLAIN ANALYZE` against the dev database with a realistic
   parameter. Example:
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM "Goal" WHERE "ownerId" = '<a real uuid>' AND "status" = 'open';
   ```
3. Record the plan node type for each — `Index Scan`, `Bitmap Index Scan` or
   `Seq Scan`.
4. **A `Seq Scan` on a small dev table is normal and is not a finding.**
   Postgres correctly prefers a sequential scan under a few hundred rows. Only
   treat it as a finding if the row estimate is large *and* the filtered column
   has no supporting index.
5. If — and only if — you find a filtered or sorted column with no index, add
   one `@@index` to the relevant `.prisma` file, run
   `npx prisma migrate dev --name <descriptive_name>`, and record the plan
   before and after.

### 14b. Confirm pagination and bounds
Check and record, do not change:
- `MemoriesService.list` — `take: Math.min(Math.max(limit, 1), 100)`, default 50.
  **Bounded. Correct.**
- `GoalsService.list` — unbounded, but capped at six open goals by product rule,
  plus completed ones. Record the number of goals a heavy account would have. If
  it can exceed ~200, note it as a **future** pagination task in the results
  file. **Do not implement pagination now** — it would change the API contract
  and the six-goal cap means it is not a real bound today.
- `PetsService.list` — unbounded. Same treatment: record, do not change.
- `EnvironmentObjectsService.list` — bounded by the floor grid. Fine.

### 14c. Connection pooling
Read `Backend/.env` and record the `DATABASE_URL`. If it carries no
`connection_limit` parameter, Prisma's default applies
(`num_physical_cpus * 2 + 1`), which is correct for a single-instance Node
server. §14: "Do not increase pool size blindly."

**Record the current setting and change nothing** unless Task 2b showed queries
queueing on connection acquisition. If it did, write the evidence into the
results file and stop — a pool change is a deployment decision, not yours.

### Verify
Results file contains a plan-node line for each of the five slowest queries, the
pagination audit, and the pooling note. If no index was added, say so
explicitly — "no index was needed" is a valid and expected outcome.

---

# PHASE 6 — TRANSPORT AND CACHING

## Task 15 — Enable response compression

### The finding
`Backend/src/main.ts` registers `express.json()` at line 44 and no compression
middleware anywhere. Every JSON response — the pet library with its appearance
documents, the room's `sceneData`, the goal list — ships uncompressed. JSON
compresses extremely well; this is the single cheapest byte reduction available.

§13: "Verify that compression is actually active rather than assuming the server
has developed manners on its own."

### The one approved new dependency
This task adds `compression` to `Backend/package.json`. It is the standard
Express middleware, it is what NestJS's own documentation prescribes, and there
is no way to gzip Express responses without it. Record this in the results file
as a deliberate, plan-sanctioned exception to §1.1.

### Files
- `Backend/package.json`
- `Backend/src/main.ts`

### Steps
1. Install:
   ```bash
   cd Backend && npm install compression && npm install --save-dev @types/compression
   ```
2. In `Backend/src/main.ts`, import it at the top beside the `express` import:
   ```ts
   import compression from 'compression';
   ```
3. Register it **immediately after `app.enableCors(...)` and before the Better
   Auth mount**. Placement is not cosmetic: Express runs middleware in
   registration order, and the auth handler is mounted straight onto the Express
   instance, so middleware registered after it never runs for `/api/auth/*` —
   the same trap the CORS comment in this file already warns about.

   ```ts
   // Gzip on the way out. Registered here, before the raw Better Auth mount,
   // for the same reason CORS is: Express runs middleware in registration
   // order, and anything added after that mount never runs for /api/auth/*.
   //
   // JSON is the only thing this application sends in bulk and it compresses
   // very well. Uploaded images are already compressed formats, and the
   // `filter` below leaves them alone rather than spending CPU to make them
   // very slightly larger.
   app.use(
     compression({
       filter: (req, res) => {
         const type = res.getHeader('Content-Type');
         if (typeof type === 'string' && /^(image|video|audio)\//.test(type)) {
           return false;
         }
         return compression.filter(req, res);
       },
     }),
   );
   ```

### On Brotli
§13 mentions Brotli. Express's `compression` does not implement it, and adding a
second compression library to gain a few percent over gzip is not justified
here. **Brotli belongs at the reverse proxy or CDN, not in the Node process.**
Record that as the recommendation in the results file and do not install a
Brotli package.

### Verify
1. Restart the backend. Reload the signed-in dashboard.
2. Every JSON API response must now carry `content-encoding: gzip`:
   ```js
   (async () => {
     const r = await fetch('http://localhost:3000/api/v1/goals', { credentials: 'include' });
     return r.headers.get('content-encoding');
   })();
   ```
3. Record the transferred size of all six load-path API responses before and
   after. This is the headline number for §12.
4. Upload an image to a memory and confirm it still displays. Confirm the
   `/uploads/...` response is **not** gzipped (the filter above).
5. Sign in and out. Auth must still work — this proves the middleware ordering
   is right.

---

## Task 16 — Static asset caching, and write down the deploy requirement

### 16a. What is already correct
`Backend/src/main.ts:55-63` serves `/uploads` with `maxAge: '1y'`,
`immutable: true`, `index: false`, `dotfiles: 'deny'`. Filenames contain a uuid,
so content at a path never changes. **This is exactly right. Do not touch it.**

### 16b. What is missing — and it is not a code change
Vite emits content-hashed filenames (`index-Dk8r47ls.js`). Those are safe to
cache forever. `index.html` must never be cached, or users are pinned to an old
build. Nothing in this repository serves `frontend/dist` — that is the
deployment's job, and there is no deployment config in the repo to edit.

So this task **documents the requirement** rather than implementing it. Do not
invent a Dockerfile, an nginx config, or a hosting provider — none exists and
guessing one would be speculative work.

### Steps
Create `plans/deployment-caching.md` containing:

```markdown
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
  only — see Task 15).
- HTTP/2 or HTTP/3, so the parallel PixiJS chunks multiplex on one connection.
- Keep-alive enabled.
```

### 16c. Confirm no source maps ship
```bash
cd frontend && ls dist/assets/*.map 2>/dev/null || echo "no source maps — correct"
```
Vite defaults `build.sourcemap` to `false`, so none should exist (§7.4). If any
do, find and remove the `sourcemap` setting in `vite.config.ts`. Record the
result either way.

### 16d. Confirm the dev-only bits stay out of production
Confirm these are not in the production graph:
- `frontend/vite.config.ts` → `devSnapshotPlugin` is registered only via
  `configureServer`, so it does not exist in a build. Confirm by reading it.
- `frontend/app-preview.html`, `panel-preview.html`, `room-preview.html` and
  their `src/app-preview.tsx`, `src/panel-preview.tsx`, `src/room-preview.ts`
  entries. Vite builds only `index.html` unless told otherwise, so these should
  be absent from `dist/`. Confirm:
  ```bash
  cd frontend && ls dist/ && grep -rn "preview" dist/index.html || echo "clean"
  ```

**Do not delete the preview files.** They are the project's visual-verification
harness. Confirming they do not ship is the whole task.

### Verify
`plans/deployment-caching.md` exists. The source-map check and the dev-entry
check are both recorded with their actual output.

---

# PHASE 7 — RENDERING

## Task 17 — Profile re-renders, then fix only what profiles badly

### The rule for this task
§9.1: "Do not add `useMemo`, `useCallback`, or `memo` everywhere without
evidence that they help." **You may not add a single memoization in this task
without a profiler recording that justifies it.** If the profiler shows nothing,
the correct outcome is to change no code and record that.

### 17a. Take the recording
Run the dev server (React DevTools needs the development build — this is the one
task that legitimately measures in dev). Open the React Profiler and record:

1. **A focus session running.** `useFocus` ticks a `setInterval` every 500 ms
   that calls `setRemaining`. `Dashboard` owns that hook and renders
   `<PetHabitat>`, which is not memoized
   (`frontend/src/features/habitat/PetHabitat.tsx:158` — a bare `forwardRef`).
   This is the **primary suspect**: a two-per-second re-render of the entire
   dashboard tree for one changing number.
2. **Dragging a customizer slider.** `updateAppearance` rebuilds the appearance
   object on every input event.
3. **Switching tabs.**

For each, record: which components re-rendered, how many times, and the total
committed duration.

### 17b. Act only on what the recording shows

**If `PetHabitat` re-renders on every focus tick and its render is measurably
expensive**, wrap the export in `memo`:

```tsx
export const PetHabitat = memo(
  forwardRef<PetHabitatHandle, PetHabitatProps>(function PetHabitat(...) {
    // body unchanged
  }),
);
```

Then check every prop it receives from `Dashboard`. `memo` only helps if the
props are referentially stable. `appearance`, `placements` and `roomStyle` are
state objects and are stable between ticks. The callbacks that come from
`useCallback` are stable. **`onRoomStyleChange={room.update}` and
`onArrangementChange={roomObjects.changed}` are already `useCallback`-wrapped —
verify each one before assuming.** If any prop is a fresh object or arrow
function created inline in `Dashboard`'s JSX, `memo` will do nothing; either
stabilise that prop or skip the change and record why.

**If the recording shows PetHabitat's render is cheap** (it delegates to PixiJS
via refs and effects; its React render may genuinely be trivial), **do not add
`memo`.** Record the measured render time and move on. That is a successful
outcome of this task.

**If the timer render is the only cost**, the alternative — moving `remaining`
into a small leaf component so only the countdown text re-renders — is a larger
refactor of `useFocus`'s public shape. **Do not do it.** Record it as a
follow-up option with the measured cost that would justify it.

### 17c. Virtualization: check, then confirm it is not needed
§9.2. Count the largest list this UI can render:
- Goals: capped at six open, plus completed. Small.
- Memories: capped at 100 by the server. Small.
- Pet presets: unbounded but realistically a handful.
- Customizer options: paged by the Splide carousel, so only one page mounts.

**Expected conclusion: no virtualization needed.** Record the counts and that
conclusion. Do not add a virtualization library.

### Verify
The results file contains the three profiler recordings with real numbers, and
either (a) a memoization added with the before/after commit duration that
justifies it, or (b) an explicit statement that the profiler showed no
justification and no code was changed.

---

# PHASE 8 — REGRESSION TESTING

## Task 18 — Full manual feature pass

### Why
§18 Phase 8 and §20. Every change in this plan touched either a load path, a
bundle boundary or a service method. Nothing here is covered by an automated
test — this project has no test runner — so the pass is manual and it is
mandatory.

### How to run it
Against the **production build** (`npx vite build && npx vite preview`) with the
backend running. Walk the list in order. Mark each item pass or fail in the
results file. **A single failure blocks Task 19.**

### The list

**Auth**
- [ ] Signed-out visitor sees the auth screen, not a blank page or a stuck spinner.
- [ ] Register a new account. It succeeds and lands in the room.
- [ ] The new account gets a room and can immediately place an object.
- [ ] Sign out. Sign back in. The session persists across a hard reload.
- [ ] Validation still fires: username under 3 chars, bad email, password under 8.
  These are the `zod` schemas that moved into the auth chunk in Task 4.

**The room**
- [ ] The creature renders, animates and blinks.
- [ ] Saved furniture returns in the correct cells after reload. *(Task 8)*
- [ ] Room style — hour, tint, wall material, floor, window view — all restore.
- [ ] Place a new object from the Room tab. It drops in and settles.
- [ ] Drag an object. Reload. The new position persisted. *(Task 11)*
- [ ] Drag an object out of the room to delete it. Reload. It stays deleted.
- [ ] Drag a wall decoration from the palette onto the wall. It hangs and persists.
- [ ] Throw a toy. Physics behaves. The creature reacts.
- [ ] Audio plays on first interaction and channel levels sound unchanged.

**Pets**
- [ ] Pet tab opens; the customizer loads behind its fallback. *(Task 5)*
- [ ] Every part category lists its options and every thumbnail draws. *(preview cache untouched)*
- [ ] Dragging a slider updates the creature in the room live.
- [ ] Save a new preset. It appears in the library and becomes active.
- [ ] Switch presets. The room's creature changes.
- [ ] Rename a preset. Delete a preset. *(Task 12)*
- [ ] Portrait thumbnails render for every preset.

**Goals**
- [ ] Add a goal. Add six. The seventh is refused with the cap message.
- [ ] Complete a goal. The celebration shows the correct "+N Happiness". *(Task 13)*
- [ ] Complete a goal with a photo. The memory appears in the book with its image.
- [ ] Reopen a completed goal. Delete a goal.

**Focus**
- [ ] Start a session. The room darkens, the creature settles, the tabs collapse to "Focus".
- [ ] The countdown ticks down correctly.
- [ ] Reload mid-session. The timer resumes at the right value.
- [ ] Abort a session. The creature sulks.
- [ ] Try to delete or complete the goal a session is running on. Both refused. *(Task 13a)*
- [ ] Let a session finish. The room brightens and the creature greets.

**Memories**
- [ ] Memories tab opens behind its fallback. *(Task 6)*
- [ ] Images display, sized identically to before, with no layout shift. *(Task 6b)*
- [ ] Delete a memory. It goes, and its image goes with it.

**Cross-cutting**
- [ ] Two different users in two browsers see only their own data. *(Task 10)*
- [ ] Every error path still shows its message: stop the backend and confirm the
      "Your room is not being saved" and "Cannot reach the server" notices appear.
- [ ] Resize to a phone viewport. The compact layout still works.
- [ ] Browser console is free of errors and warnings on a full session.

---

# PHASE 9 — BENCHMARK AND REPORT

## Task 19 — The before/after table and the written report

### 19a. Re-measure everything

Repeat **Task 1 and Task 2 exactly**, on the final build, in the same
environment, with the same steps. Any measurement taken differently from the
baseline is not a comparison.

### 19b. Fill in the table

Complete the §19 table in `plans/performance-results.md`. Use production numbers
throughout.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Total requests (prod, signed in) | | | |
| Transferred bytes | | | |
| Total resource size | | | |
| TTFB | | | |
| LCP | | | |
| INP | | | |
| CLS | | | |
| API requests per load | | | |
| API bytes per load | | | |
| DB queries per page load | | | |
| DB query P95 | | | |
| Entry JS chunk (raw / gzip) | 820.04 kB / 256.03 kB | | |
| Total JS shipped on first paint | | | |

Add a second, clearly separated row group for the **development** numbers
(222 requests / 16.0 MB before), labelled as such, so the original 240 figure is
accounted for and explained rather than ignored.

### 19c. Rules for the report

- **Every number is measured.** If something could not be measured, write "not
  measured" — never estimate. §19: "Do not fabricate improvements."
- **If a metric got worse, report it and explain why.** Lazy-loading the
  customizer makes the first Pet-tab open slower by one chunk fetch. That is a
  real trade and it belongs in the table.
- **State the dev-vs-prod distinction first**, per §0 of this plan.
- List every change made, with its measured effect.
- List everything found and **deliberately not changed**, with the reason: the
  preview cache, the audio system, the existing indexes, the `/uploads` headers,
  images, fonts, third-party scripts.

### 19d. Walk the §20 validation checklist

Reproduce the full checklist from
`/Docs/website-performance-optimization-instructions.md` §20 in the results
file, and tick each line with the evidence that supports it. A line you cannot
support with evidence stays unticked with a note.

---

## Documentation to update when the plan is finished

| File | What to add |
|---|---|
| `Docs/API-endpoints/04-environment-endpoints.md` | `GET /environments/current/objects` *(Task 8f)* |
| `Docs/API-endpoints/03-pet-endpoints.md` | `GET /pets` returns a summary projection *(Task 12c)* |
| `Docs/Architecture-and-layers.md` | The code-split boundaries: auth / dashboard / customizer / memories |
| `Docs/techStack.md` | `compression` added to the backend; `@pixi/react` and `lucide-react` removed from the frontend |
| `Docs/AGENTS.md` | Already updated with the **Performance Rules** section that ships with this plan. Read it before starting. |
| `plans/performance-results.md` | Every measurement |
| `plans/deployment-caching.md` | Created in Task 16 |

---

## Definition of done

- [ ] All 19 tasks attempted, each with a recorded outcome (including "no change needed").
- [ ] `cd frontend && npx tsc -b --noEmit` passes.
- [ ] `cd Backend && npx tsc -p tsconfig.json --noEmit` passes.
- [ ] `cd frontend && npx vite build` succeeds with no new warnings.
- [ ] Every box in Task 18 is ticked.
- [ ] `plans/performance-results.md` has real before/after numbers for every row it can support.
- [ ] The report states plainly that 240 was a dev-server figure.
- [ ] No feature removed, no visual quality reduced, no asset deleted.
- [ ] Documentation updated per the table above.
- [ ] Nothing committed. All changes left in the working tree for review.
