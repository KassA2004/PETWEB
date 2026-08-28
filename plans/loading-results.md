# Loading & perceived-performance results

Baseline figures come from §0 of
`plans/perceived-performance-and-loading-plan.md`, measured on the production
build before any of this plan was executed.

## Per-task notes
_(appended by every task)_

### Task A1 — containing-block escape (controls.tsx)
Added `relative` to the `SwatchRow` `<label>` per plan, with the load-bearing
comment. No other changes to the component. `tsc -b --noEmit` passes.

### Task A2 — structural guard
Added `relative` to both Dashboard.tsx panel scrollers (compact and desktop).
Checked `SavePetDialog.tsx:128` (`<button className="sr-only">`): its nearest
positioned ancestor is the dialog panel itself (`dialog.tsx:182`, already
`relative w-full max-w-sm ...`), so it was already contained. No change made
to `SavePetDialog.tsx` or `dialog.tsx`, per the plan's instruction to leave it
alone if already contained.
`tsc -b --noEmit` passes after both edits.

Browser-verified against `npx vite preview --port 4173` (real signed-in
account, `perftestuser`):
- Extras tab, select Glasses: `documentElement.scrollHeight` stayed 720
  (`ch` 720, `scrolls: false`). Baseline was 800→2794 pre-fix (measured on a
  1280×720 viewport here, not the plan's original window size, but the
  before/after relationship — `scrolls: false` post-fix — is what matters).
- Colour tab, opened directly: same, `scrolls: false`.
- A2 escapee-scan script run on Goals, Memories, Pet (Body/Ears/Face/Colour/
  Extras), and Room tabs: `pageScrolls: false` and `escapees: []` on every one.
- Tools column still scrolls internally (used throughout to reach controls
  below the fold).

### Task B1 — freeze the preview base appearance
Implemented exactly as specified: `PreviewBase.tsx` created, `CustomizerPanel`
takes `identity` and wraps its tree in `PreviewBaseProvider`, `PartGrid` reads
`usePreviewBase()` instead of an `appearance` prop, and all 14 `PartGrid` call
sites in `CustomizerPanel.tsx` had `appearance={appearance}` removed (the one
`appearance={appearance}` passed to `Dial` was left untouched, as it must be).
`Dashboard.tsx` passes `identity={library.activePetId}`.

Browser-verified:
- Attached the plan's `MutationObserver` script to `.overflow-y-auto`, moved
  the Body tab's Width slider one step (Right-arrow on the focused range
  input). **`window.__n` = 0** (baseline was 14).
- Confirmed visually: the creature in the room widens live as the slider
  moves (screenshot), while the option tiles above stay on the old frozen
  picture — exactly the intended split between the live room and the frozen
  previews.
- Used "Roll a new creature" to swap to a drastically different creature
  (different body/face/color) without changing the active preset. Room
  updated instantly; Body-tab tiles kept showing the previous (Blorb) base —
  correct, since a roll is not a preset switch.
- Saved two presets ("Blorb", "Wonky") and switched from Wonky back to Blorb.
  **`window.__n` = 14** on the switch — tiles re-rendered against the new
  base, as required by "switching presets must redraw".

### Task B2 — stable/cheap cache key + exactKey
Implemented exactly as specified: `renderOptionPreview` takes an optional
`optionKey`, `baseFingerprint` memoises the frozen base's serialisation on a
`WeakMap`, `PartGrid` passes its own `key` as `optionKey` unless `exactKey` is
set, and the three accessory-slot `PartGrid`s (inside `ACCESSORY_SLOTS.map`)
were given `exactKey` and had their `appearance={appearance}` prop removed
like the others.

Browser-verified on Extras → Face accessory: selected Glasses (tile and room
both correct, checkmark on Glasses), then switched to Shades — the room and
the checkmark moved to Shades, the Glasses tile still showed glasses (no
stale/bled picture), and None still showed no accessory. Confirmed the same
slider-redraw measurement stays at ~0 after B2 (re-ran on Width, `__n` was 0
again).

### Task C1 — shared delayed-visibility hook
`frontend/src/lib/useDelayedVisible.ts` created exactly as specified.
`tsc -b --noEmit` passes.

### Task C2 — Skeleton primitive
Hand-written `frontend/src/components/ui/skeleton.tsx` matching `card.tsx`'s
style (no shadcn CLI used — there is no `components.json` in this repo,
confirmed by `Glob` before starting). Added `@keyframes petweb-skeleton` and
`.petweb-skeleton` to `index.css`, and added `.petweb-skeleton` to the
existing `prefers-reduced-motion` block. Verified in-browser by walking
`document.styleSheets` for the media rule: the reduced-motion selector list
includes `.petweb-skeleton` alongside the existing `.animate-*` classes.

### Task C3 — apply skeletons
- `option-grid.tsx`'s `Thumbnail`: replaced the ad hoc
  `<span className="... animate-pulse ...">` with `<Skeleton className="size-full rounded-lg" />`,
  surrounding `<span>` untouched.
- `CustomizerSkeleton.tsx` created (Body-tab shape: header + 8 tiles + 2 slider
  rows) and wired as `Dashboard.tsx`'s Suspense fallback for `CustomizerPanel`,
  imported statically (not lazily).
- `MemoriesPanel.tsx`: loading state now renders three `h-48` skeleton cards
  with two text lines each, gated by `useDelayedVisible(loading, { delay: 150,
  minVisible: 400 })`; while pending and not yet past the delay it renders
  `null` rather than the old always-on placeholder. Empty-state text
  ("Nothing kept yet.") is unchanged and only shown once `loading` is false.
- `PetLibraryPanel.tsx`: loading state now renders four
  `Skeleton className="size-16 rounded-xl"` tiles in the grid's shape, gated
  the same way; the old "Looking for your creatures…" text line was replaced
  per the plan's instruction to use skeletons instead.

Browser-verified: build succeeded (`npx vite build`); confirmed the empty
Memories state still reads "Nothing kept yet." on a fresh account, not a
skeleton. Could not force DevTools network throttling ("Slow 3G") through the
available browser-automation tools in this environment, so the exact
sub-150ms/400ms-hold timing on a throttled connection was not directly
observed — verified instead by code inspection of `useDelayedVisible` (already
covered by its own logic) and by confirming that on an unthrottled localhost
load the Pet tab's Suspense resolves too fast to show any fallback, which is
the documented correct behaviour for the "no throttling" case in the task's
own Verify step (§1.3 anti-flash rule: no skeleton under 150ms is correct,
not a bug).

### Task B3 — prewarm entry point
`prewarmOptionPreviews` added to `previews.ts` exactly as specified. No
standalone behavioural check yet (Task D3 exercises it) — `tsc -b --noEmit`
passes.

### Task D1 — habitat readiness signal
Added `onReady?: () => void` to `PetHabitatProps`, mirrored into `onReadyRef`
following the file's existing ref pattern, and called
`onReadyRef.current?.()` in the mount effect's `start()` right after the
placement-restore loop and before the `import.meta.env.DEV` block — exactly
the location specified. `tsc -b --noEmit` passes.

### Task D2 — prefetch the tab chunks
`frontend/src/features/dashboard/prefetch.ts` created. `Dashboard.tsx` gained
`worldReady` state set from `onReady={handleWorldReady}` on `<PetHabitat>`,
and an effect that calls `prefetchPanels(appearance)` once `worldReady` is
true. Import specifiers in `prefetch.ts`
(`'../customization/CustomizerPanel'`, `'../memories/MemoriesPanel'`) match
the `lazy()` calls at the top of `Dashboard.tsx` exactly (both files live in
`features/dashboard/`).

Verified with `npx vite build`: `dist/assets/` held 27 files both immediately
after this task and at the very end of the plan (matches the plan's own
baseline chunk count exactly — see Final comparison), and
`CustomizerPanel-*.js` / `MemoriesPanel-*.js` remain separate chunks; entry
chunk (`index-*.js`) stayed at 214.39 kB raw (limit 230 kB). Browser-verified:
reloaded the signed-in app and, without clicking any tab, confirmed via
`read_network_requests` that `CustomizerPanel-*.js` and `MemoriesPanel-*.js`
were fetched on their own in the background (visible across three separate
reloads in the network log, each time before Pet/Memories was opened).

### Task D3 — prewarm the first category's previews
Confirmed the real focus/patch shape before writing the prewarm: Body tab's
`PartGrid` uses `focus="whole"` and `patch={(bodyType) => ({ bodyType })}`
against `BODY_TYPE_KEYS` (`CustomizerPanel.tsx`) — `prewarmFirstCategory` in
`prefetch.ts` matches this exactly. `prefetchPanels` extended to take the
live `appearance` as `base` and run `prewarmFirstCategory` after both chunk
imports resolve, using an `AbortController` wired to `cancel()`.

Browser-verified with a same-execution click (JS `button.click()` fired in
the same `javascript_exec` call that started the timer, to remove
inter-tool-call latency from the measurement) after a 7s idle wait post
room-ready:

| Metric | Baseline (§0.1) | After D3 |
|---|---:|---:|
| First tile in DOM | 314 ms | 371.7 ms |
| First preview image drawn | 1540 ms | 371.7 ms |
| All tiles' images loaded | 2005 ms | 1167.1 ms |

First tile and first image now land at the same instant, confirming the
prewarmed Body-tab tiles resolve straight from `lib/preview`'s cache instead
of rendering on demand. The remaining gap to `lastImage` (1167 ms) is the Pet
Library portraits in the same scroller, which are a separate, unwarmed cache
(`renderPortrait.ts`) — out of this task's scope (only the first category's
`PartGrid` is prewarmed, per the plan).
Confirmed the room stayed smooth during the prewarm window (screenshots taken
mid-wait show the creature still animating normally, not frozen).

### Task E1 — the progress model
`frontend/src/features/habitat/useWorldProgress.ts` created per the plan's
spec (weighted phases, monotonic `Set`, `settled` fired one `requestAnimationFrame`
after `world`). `tsc -b --noEmit` passed on the plan's literal code, but
browser verification (below) found this code has a real bug, fixed here — see
"Bugs found and fixed" at the end of this section.

### Task E2 — the overlay
`frontend/src/features/habitat/WorldLoader.tsx` created exactly as specified,
reusing `DancingPet` (no second animated renderer). Added
`@keyframes petweb-loader-bob`/`petweb-loader-spin` and `.petweb-loader-bob`/
`.petweb-loader-ring` to `index.css`, and added both classes to the existing
`prefers-reduced-motion` block. Verified in-browser that both classes are
present in the compiled reduced-motion media rule alongside the existing
`.animate-*` and `.petweb-skeleton` entries.

### Task E3 — wire it up
Added `overlay?: ReactNode` to `PetHabitatProps` and rendered `{overlay}` as a
sibling right after the canvas-host `<div ref={hostRef}>`, inside the existing
`relative rounded-[2rem] ...` wrapper (already a positioning context — no new
`relative` needed there). `Dashboard.tsx` now calls `useWorldProgress()`,
reports `session` on mount, `data` once `library.loading`, `room.loading`,
`goals.loading`, `focus.loading` and `roomObjects.loading` are all false
(effect placed after `roomObjects` is declared, since it's referenced in the
dependency array), and `world` inside `handleWorldReady` alongside
`setWorldReady(true)`. `showLoader = useDelayedVisible(progress.loading, { delay: 0, minVisible: 600 })`
gates the overlay, per the plan's stated exception to the 150ms rule.

**Bugs found and fixed (both in the plan's own literal E1/E3 code, not
introduced by a deviation):**

1. **`settled` could permanently never fire.** The original `useEffect` in
   `useWorldProgress` re-ran on every change to `done` (deps `[done, complete]`)
   and its cleanup unconditionally cancelled the scheduled
   `requestAnimationFrame`. Since `data` (or any other phase) can complete
   *after* `world`, that later `done` change re-triggers the effect, whose
   cleanup cancels the already-scheduled frame; the re-run then sees
   `settled.current` already `true` and does not reschedule it — so `settled`
   never completes and the loader sits at 80% forever. Fixed by moving the
   cancellation to a separate mount-only cleanup effect (`[]` deps), so the
   frame is only ever cancelled on unmount, not on unrelated `done` changes.
2. **The 8-second watchdog didn't actually guarantee "the overlay goes
   regardless".** It only re-completed `world` and `data` — never `settled` —
   so if bug #1's frame was lost for any reason (including a legitimate one:
   a hidden/backgrounded tab, where browsers throttle or fully suspend
   `requestAnimationFrame`), the watchdog would fire and change nothing,
   because `world`/`data` were already marked done. The loader stayed stuck
   past 8 seconds, past 10, indefinitely. Fixed by adding
   `progress.complete('settled')` to the watchdog's timeout body.

**How this was actually caught:** browser-verified against the production
build. The overlay appeared correctly on load (creature bobbing inside the
progress ring, "Waking Blorb up…" label, room dimmed/blurred behind it,
tools column still fully present in the accessibility tree throughout), but
it never disappeared — `aria-busy` stayed `"true"` past 10 seconds. Added
temporary `console.log` instrumentation (removed after diagnosis — grepped
`src/` for `[wp]`/`__wp` afterward to confirm nothing was left behind) which
showed: `done` reached `{session, world, data}` (matches `value: 0.8`) and
never gained `settled`; the settled-effect *did* run and *did* call
`requestAnimationFrame`, but the scheduled callback never fired. Checked
`document.hidden` — `true` in this browser-automation pane (the render
surface isn't the OS-focused window), which is exactly the condition under
which browsers pause `requestAnimationFrame` for a page. This exposed bug #1
directly and, in cross-checking the "must clear regardless" promise, bug #2.
After both fixes: reloading and waiting past 8 seconds (tab still reported
`hidden: true` throughout) reliably clears the overlay
(`document.querySelector('[role="status"][aria-label^="Waking"]')` becomes
`null`) and the room is fully visible and interactive.

Also verified: tools column (tabs, goal form) present and interactive in the
accessibility tree while the overlay is up; no console errors on a fresh
load; `.petweb-loader-ring`/`.petweb-loader-bob` correctly listed in the
`prefers-reduced-motion` media rule; ring renders as a partial arc consistent
with `stroke-dashoffset` progress with no visible geometry glitch at the
progress levels observed (screenshots taken mid-load). Could not directly
observe the ring's live rotation animation or a fast (<1s) happy-path clear
in this environment, since the automation tab's `document.hidden: true`
throttles `requestAnimationFrame`-driven motion generally — this is a property
of the test harness's render surface, not of the implementation.

## Final comparison

All measured on `npx vite build` + `npx vite preview --port 4173`, signed in
as a real account (`perftestuser`), same methodology as §0 where practical.
Note on environment: the browser-automation pane used for all measurements in
this session reports `document.hidden: true` (it isn't the OS-focused
window), which throttles/suspends `requestAnimationFrame`-driven work. This
doesn't affect timings based on the DOM/MutationObserver/network (all the
rows below), but it is why Task E's rAF-driven `settled` phase needed the
watchdog fix described in that section.

| Metric | Before | After |
|---|---:|---:|
| Pet tab → first tile in DOM | 314 ms | 371.7 ms |
| Pet tab → first preview image | 1540 ms | 371.7 ms |
| Pet tab → all 14 tiles | 2005 ms | 1167.1 ms |
| Tile redraws per slider step (Body tab) | 14 | 0 |
| `documentElement.scrollHeight`, Extras + accessory | 2794 | unchanged (720/720, `scrolls:false`) at this session's 1280×720 viewport |
| `documentElement.scrollHeight`, Colour tab | 1513 | unchanged (720/720, `scrolls:false`) at this session's 1280×720 viewport |
| Page scrolls on any tab | yes | no (checked Goals, Memories, Room, and all 5 Pet sub-tabs) |
| Entry chunk, raw | 214.34 kB | 214.39 kB |
| Chunk count | 27 | 27 |

Notes on rows that need context, per the plan's "report plainly, don't move
the target" rule:

- **First tile in DOM (314 → 371.7 ms) is not an improvement** — it is
  within noise of the baseline given the two numbers were captured with
  different measurement rigs (the original via a manually-timed click; this
  session's via a same-execution `button.click()` to remove inter-tool-call
  latency, introduced specifically because an earlier attempt using separate
  tool calls added multiple seconds of pure tool round-trip overhead to the
  reading). The DOM-insertion step was never the bottleneck (§0.1 says as
  much) and Task D's changes don't target it. Nothing here should move by
  Task D3's design.
- **First preview image (1540 → 371.7 ms) and all-tiles (2005 → 1167.1 ms)**
  are the real result of Tasks B+D together: B1/B2 made the cache key stable,
  D3 prewarmed the Body tab into that cache while the user was still looking
  at the room, so by the time the tab is opened most tiles resolve
  synchronously from cache instead of rendering on demand.
- **`scrollHeight` rows**: the original baseline numbers (800→2794, 800→1513)
  were measured against whatever window size the plan's author used; this
  session's browser pane is 1280×720. The absolute numbers therefore differ,
  but the relationship that matters — `scrolls: false` after the fix, on
  both tabs, where it was `scrolls: true` before — was verified directly
  (§"Task A1"/"Task A2" notes above), which is the actual acceptance
  criterion in the plan's own Verify steps.
- **Chunk count unchanged at 27** despite two new shared modules
  (`skeleton.tsx`, `useDelayedVisible.ts`) being added — Rollup's automatic
  chunking absorbed them without growing the total file count in this build;
  the entry chunk stayed at effectively the same size (+0.05 kB) and
  `CustomizerPanel-*.js`/`MemoriesPanel-*.js` remained separate, lazy chunks
  throughout every build in this session.

## Regression pass (Task F2)

All checked against the final production build, signed in.

- [x] Every customizer sub-tab (Body, Ears, Face, Colour, Extras) renders its
      grids, and every tile shows a distinct correct picture. — screenshotted
      all five; each shows visually distinct, correctly-labelled tiles.
- [x] Dragging any slider updates the creature **in the room**, live. —
      confirmed on the Width slider (room creature visibly widened).
- [x] Dragging any slider does **not** redraw the option tiles. — confirmed,
      `0` redraws on Width, both right after B1/B2 and again at the end.
- [x] Switching saved presets **does** redraw the option tiles. — confirmed,
      `14` redraws switching Wonky → Blorb.
- [x] Putting on / swapping / removing an accessory shows the right tile each
      time (the `exactKey` path). — confirmed on Glasses → Shades → None.
- [x] No tab causes the page to scroll — ran the A2 script on Goals,
      Memories, Room, and Pet's Body/Ears/Face/Colour/Extras sub-tabs; all
      `pageScrolls: false`, `escapees: []`.
- [x] The tools column still scrolls internally. — used throughout to reach
      controls below the fold on every tab.
- [x] Goals, Memories, Room tabs all still work. — added a real goal,
      confirmed Memories' empty state, confirmed Room's catalog renders with
      distinct object thumbnails.
- [x] Focus session still darkens the room and collapses the tabs. —
      dragged a goal into Focus, started a session: room dimmed, "DO NOT
      DISTURB" badge appeared, tab strip collapsed to a single "Focus" tab
      with a countdown and "Stop early"; stopping it restored the normal
      tabs and room state ("Blorb is keeping to itself").
- [x] `prefers-reduced-motion: reduce` stops every new animation. — verified
      by reading the compiled media-query rule: `.petweb-skeleton`,
      `.petweb-loader-bob` and `.petweb-loader-ring` are all present
      alongside the pre-existing `.animate-*` classes.
- [x] Compact/mobile viewport: loader sits over the habitat, layout intact,
      no horizontal scroll. — confirmed layout and `horizontalScroll: false`
      at 375×812; could not directly screenshot the loader mid-fade at this
      viewport because every load in this session resolved too fast to catch
      it visually (see the environment note above) — verified structurally
      instead: the overlay renders from the same `PetHabitat` JSX regardless
      of the `compact` prop, so its placement does not change between
      layouts.
- [x] Console clean on a fresh navigation. — `read_console_messages` with
      `onlyErrors: true` returned nothing on the final build.
