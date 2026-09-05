# AGENT RULES

## Before Coding

1. Read all documentation in `/docs`.
2. Read `PROJECT_OVERVIEW.md`.
3. Read `TECH_STACK.md`.
4. Read the relevant technical specification.
5. Inspect the existing implementation before modifying anything.

## Architecture Rules

- Do not introduce technologies not specified in TECH_STACK.md without approval.
- Do not replace Prisma.
- Do not replace PixiJS.
- Do not redesign the database without documenting the change.
- Do not create duplicate systems when an existing system can be extended.

## Visual Rules

- Follow `pet-anatomy.md`.
- Follow `animation-approach.md`.
- Follow `theme-and-design.md`.
- Follow `room-and-objects.md` for anything in the room: the grid, placement,
  object sizing, object shading, affordances and the saved room style.
- Follow `audio-and-feedback.md` for anything that makes a noise or animates a
  control.
- Pets must use the standardized blob rig.
- Visual assets should remain code-generated/procedural.

## Room Rules

- An object's size is its grid footprint. Nothing may author a width, a depth or
  a collider extent beside it.
- Never clamp a placement after snapping it. If a clamp seems necessary, the
  footprint is wrong.
- The drag guide, the status line and the drop must all call `snapFootprint`.
- Anything the user can choose about the room belongs in `RoomStyle`, and is
  therefore saved. Room appearance must never live in React state.
- Adding an object is one catalog row, one renderer and one line in the renderer
  map. If it needs a conditional anywhere else, the catalog row is missing a
  field.

## Layout Rules

- Any container that clips (`overflow-hidden`/`overflow-y-auto`) must
  establish a containing block — give it `position: relative` (or another
  property that establishes one) — or an absolutely positioned descendant
  (Tailwind's `sr-only`, a popover, a badge) escapes it entirely. Without a
  positioned ancestor, the descendant's containing block is the *initial*
  one: it lays out against `<html>` at its static offset and grows the
  document, and `overflow: hidden` on the static ancestor does nothing to
  stop it. See `components/ui/controls.tsx`'s `SwatchRow` for the bug this
  prevents recurring.

## Audio Rules

- No component constructs audio. It reports an event; `lib/audio` decides what
  that sounds like and whether there is room for it.
- Recordings where a recording is better, synthesis where it is not, and the
  synthesised voice is never deleted — it is what plays until the file arrives
  and if it never does. `lib/audio/library.ts` argues the split; the short
  version is that the world is recorded and the interface is not.
- Audio files are never dropped into `public/audio` by hand. They are pinned in
  `tools/audio/sources.json` and fetched by `tools/audio/fetch.mjs`, which also
  normalises levels and writes the credits. Provenance is the licence.
- Every repeating sound has a throttle key and a cooldown. Physics must never be
  able to spam the mixer.
- Channel levels live in one table (`AudioBus.DEFAULT_LEVELS`) and are tuned by
  measurement, not by ear alone.
- Audio starts only from a user gesture, and `unlock()` is idempotent.

## Persistence Rules

- Anything the user decides belongs to the user, and is saved: the room's
  appearance (`Environment.sceneData`), what is standing in it
  (`EnvironmentObject`), their goals and their memories.
- Ownership is always derived from the session. No handler takes an owner id
  from a request body, and someone else's row is a 404 rather than a 403.
- Rules that protect data are enforced on the server. A disabled button is a
  courtesy; the six-goal cap is counted inside the transaction that inserts.
- Never save on a timer that runs per frame. Placement saves are debounced and
  triggered by *settled* changes only.
- PostgreSQL stores the path to an uploaded file, never the bytes.

## Performance Rules

These apply to **every** task, not only to work labelled "optimization". A
change that quietly adds a request, a query or a bundle is a change that made
the product slower, whoever wrote it.

### Measure before you claim
- Never report a performance improvement you did not measure. An estimate
  presented as a result is a fabricated number.
- Take the before and after readings the same way, in the same environment, or
  they are not a comparison.
- **Benchmark the production build, never the dev server.** Vite serves one HTTP
  request per source module in development by design; that number is an artifact
  of HMR and it does not exist in `vite build` output. Anyone quoting a
  request count from `npm run dev` is quoting the wrong number.
- Use `npx vite preview` for frontend measurements and
  `PRISMA_LOG_QUERIES=1` for database ones.

### Never trade quality for a metric
- Do not remove a feature, an object type, a customization option, an animation
  or a sound because it costs something. The cost is the product.
- Do not lower render resolution, antialiasing, physics fidelity or catalog
  breadth to move a number.
- Do not replace accurate data with stale or approximate data.
- Do not introduce a client-visible loading regression. A new `Suspense`
  boundary must reuse the placeholder that was already there.
- A page with 100 large, blocking, sequential requests is slower than one with
  200 small cacheable ones. Optimize the pipeline, not the count.
- Customizer option previews render against a frozen base appearance, never
  the live one being edited. The base is re-taken only when the user adopts a
  different saved creature (`features/customization/PreviewBase.tsx`) — never
  on a slider, colour or part change. This is what keeps a drag from
  rebuilding every visible preview tile on every frame; the live creature in
  the room is unaffected, since it is driven separately
  (`PetHabitat` → `PetRoom.setAppearance`).

### Requests
- Before adding a fetch, check whether something already fetches it. Two
  components asking for the same resource is a bug, not a coincidence.
- Never chain a request behind another one for data the server could resolve
  itself. If a client only needs an id in order to ask the next question, the
  server should answer the question directly.
- Independent requests start together. Sequential requests must have a real
  dependency, and the dependency must be stated in a comment.
- Debounce anything driven by a slider, a drag or a simulation. Never save per
  frame.

### Services and queries
- Never re-read what you just wrote. If a method holds the rows it inserted,
  build the response from them.
- Never repeat an ownership or authorization check inside one request.
- Independent I/O in a service method runs under `Promise.all`. Ordered or
  racing work does not.
- No N+1. One query for the list, one for the details — never one per item.
- `select` only the columns the caller reads. A response field nobody consumes
  is bytes serialised, transferred and parsed to be thrown away.
- Every list query has a bound. An unbounded `findMany` is a full-table scan
  waiting for the account that gets popular.
- Add an index because a query plan asked for one, never because a column looked
  important. Indexes cost writes and storage.

### Caching
- Every cache needs: an invalidation rule, a TTL, a correct authorization
  boundary, and a defined behaviour when it is unavailable. A cache missing any
  of the four is a bug with good latency.
- User-specific responses are `private` and never enter a shared cache. Cache
  keys must isolate users — verify with two accounts, not by reading the code.
- Caching an authorization row is stale authorization. Do not.
- Fingerprinted assets get `max-age=31536000, immutable`. `index.html` gets
  `no-cache` — it is the manifest that points at the hashed files.

### Bundles and assets
- Code that the first screen does not need is lazy-loaded. Code that it does
  need is not.
- A dependency imported by one panel must not sit in the entry chunk.
- Delete unused dependencies when you find them. Verify with a grep across
  `src/` before deleting, and paste the empty result into the task notes.
- Do not hand-write `manualChunks` to fight the bundler's own splitting.
- **This project has no images, no webfonts and no third-party scripts.** All
  artwork is procedural, all sound is synthesised, and every font in the stack
  is a system font. Do not add any of the three to "optimize" something.
- Source maps do not ship to production.

### Rendering
- `memo`, `useMemo` and `useCallback` require a profiler recording that
  justifies them. Sprinkling them is a cost with no evidence of a benefit.
- Anything that loads late gets its space reserved first. An image without a
  reserved box is a layout shift.
- A callback handed to a PixiJS scene must have a stable identity — the scene is
  built once and will hold the first one forever.

### Reliability comes first
- An optimization that can corrupt data, stale an authorization, or silently
  drop a write is not an optimization. Failure handling, timeouts, cache
  failure, partial failure and concurrent requests are part of the change, not a
  follow-up.
- Any change to a load path is followed by a manual pass over the features on
  that path. This project has no test runner; the pass is how correctness is
  established.

## Implementation Rules

- Work on one task at a time.
- Keep changes scoped.
- Do not implement future features unless explicitly requested.
- Test changes before marking a task complete.
- Update documentation when architecture changes.

## Completion

A task is complete only when:

- Implementation exists
- TypeScript compiles
- Tests pass where applicable
- No unrelated files were modified
- Documentation is updated if necessary
- No request, query or bundle regression was introduced (Performance Rules)
- Any performance claim is backed by a before/after measurement
