# Execution plan — perceived performance, loading system, and the customizer

Companion to `plans/website-performance-optimization-plan.md`, which is already
executed (see `plans/performance-results.md`). That plan made the app ship
fewer bytes. **This plan makes it feel fast**, which is a different problem and
in places pulls in the opposite direction — one of its tasks deliberately
*adds* eager work back.

Rules that still apply: `/Docs/AGENTS.md`, including the **Performance Rules**
section.

You are executing this plan. **Every decision has already been made below.**
Do not substitute your own approach, do not add tasks, do not skip tasks. If a
step's premise turns out to be false when you get there, **stop that task,
write what you found into the results file, and move to the next task** — do
not improvise a different fix.

---

## 0. What is actually wrong — measured, not assumed

Every number below was measured on the running production build
(`vite build` + `vite preview --port 4173`) against a real signed-in account
before this plan was written. Read this section before touching anything: two
of the five reported problems have a different root cause than they appear to,
and one of them is worse than reported.

### 0.1 The Pet tab takes 2 seconds, and the lazy chunk is not why

Clicking the **Pet** tab, cold, timed with a `MutationObserver`:

| Milestone | Time after click |
|---|---:|
| First tile appears in the DOM | **314 ms** |
| First preview image actually drawn | **1540 ms** |
| All 14 tiles filled | **2005 ms** |

Chunk fetch cost, from the Resource Timing API:
`CustomizerPanel-*.js` **11 ms**, `tabs-*.js` (Splide) **59 ms**.

**So the lazy chunk accounts for roughly 60–314 ms of a 2005 ms wait. The other
~1.7 seconds is PixiJS rendering 14 preview thumbnails.** Prefetching the
chunk — the obvious reading of the request — fixes at most 15% of the problem.
The rest is Task B.

This is why the task order below is what it is, and why you must not reorder it.

### 0.2 One slider nudge re-renders every visible tile

Measured with a `MutationObserver` on the panel subtree, dragging the **Width**
slider one step on the Body tab:

```text
  tile images re-rendered after ONE slider change ...... 14
  distinct new data-URL sources ........................ 13
  tiles on screen ...................................... 14
```

The cause is in `frontend/src/features/customization/previews.ts`. The cache
key is built from the **live** appearance:

```ts
renderPreview(`pet:${focus}:${JSON.stringify(shown)}`, ...)
```

`shown` is `neutralise(appearance) + patch`, so the moment `appearance`
changes every key changes, every lookup misses, and every visible tile rebuilds
a full `PetRenderer` rig and extracts a canvas. `PartGrid`'s own doc comment
already states this outright ("dragging the body width slider legitimately
redraws all forty tiles") — it was a known, accepted cost. It is no longer
accepted.

A real drag fires `input` continuously, so this is 14 rig builds *per frame of
the drag*, not per drag.

**Crucially: the creature in the room does not depend on this.**
`PetHabitat.tsx:454-457` pushes appearance edits straight into the live scene
via `PetRoom.setAppearance`. That path is completely separate from the preview
tiles. Making previews static therefore **cannot** stop the user seeing their
edits live — verify this yourself before you start Task B.

### 0.3 The scrollbar bug is a CSS containing-block escape, and it is not
### limited to the Extras tab

Reproduced exactly as reported. Selecting **Glasses** in Extras:

| | Before | After |
|---|---:|---:|
| `documentElement.scrollHeight` | 800 | **2794** |
| Page actually scrolls (`window.scrollTo(0,1000)` succeeds) | no | **yes** |

The whole containment chain is *intact* — every ancestor holds at ≤800px with
`overflow: hidden` and `scrollHeight === clientHeight`. Yet the document grows.

The escaping element, found by scanning for positioned elements past the
viewport:

```text
  <input type="color" class="sr-only">
  position:     absolute
  top:          2793.72px
  offsetParent: BODY          ← the tell
  rect.bottom:  2794          ← exactly documentElement.scrollHeight
```

**The mechanism.** Tailwind's `sr-only` sets `position: absolute` with no
`top`/`left`. An absolutely positioned element is only clipped by an ancestor
that *establishes a containing block* — one with `position: relative/absolute/
fixed`, a transform, a filter, or containment. Every `overflow-hidden` wrapper
in `Dashboard.tsx` is `position: static`. So this input's containing block is
the **initial containing block**, it is laid out against `<html>` at its static
y-offset (~2793px, deep inside the scrolled column), and **`overflow: hidden`
on a static ancestor does not clip it.** The document grows to contain it.

Source: `frontend/src/components/ui/controls.tsx:130-138`, the native colour
picker inside `SwatchRow`.

**It is not an Extras-tab bug.** The **Colour** tab renders four `SwatchRow`s
and is already broken on open:

```text
  Colour tab: 4 × input.sr-only, all offsetParent = BODY
  deepest rect.bottom = 1513  ==  documentElement.scrollHeight = 1513
  page scrolls: yes
```

Extras is simply where selecting an item *adds* a `SwatchRow` dynamically, so
the break is visible as a before/after. Scope the fix accordingly.

**Two fixes verified live**, each returning `documentElement.scrollHeight` to
800 and each reverting cleanly:

| Fix | Result |
|---|---:|
| `position: relative` on the parent `<label>` | 800 |
| `position: relative` on the panels scroller | 800 |
| (control) revert both | 2794 again |

Task A applies both — one as the root fix, one as a structural guard.

### 0.4 What already exists that you must not rebuild

| Thing | Where | Status |
|---|---|---|
| Shared offscreen preview renderer, keyed cache (cap 400), in-flight dedup | `src/lib/preview.ts` | Correct. Do not touch. |
| Portrait renderer, own cache (cap 64) | `src/features/pets/renderPortrait.ts` | Correct. Do not touch. |
| An animated creature on a shared WebGL context | `src/features/pets/DancingPet.tsx` | **Reuse this for the loading screen.** Do not write a second one. |
| Animation utilities + `prefers-reduced-motion` block | `src/index.css:130-231`, `:271-281` | Extend this, do not start a parallel system. |
| `cn()` helper, shadcn-style components | `src/lib/utils.ts`, `src/components/ui/*` | Match these conventions. |

**There is no `components.json`.** shadcn is used *as a convention* in this
project, not via its CLI. **Do not run `npx shadcn init` or `npx shadcn add`** —
it would want to write config, rewrite `index.css`, and possibly change the
`components/ui` layout. Hand-write the Skeleton component to shadcn's canonical
implementation, matching `card.tsx`'s style. This is stated again in Task C.

---

## 1. Ground rules

### 1.1 Never
- Never remove a customization option, an animation, a sound, or a feature.
- Never lower render resolution, antialiasing, or catalog breadth.
- Never introduce a new runtime dependency. Everything in this plan is built
  from React, Tailwind, PixiJS and code already in the repository.
- Never undo the code-splitting from the previous plan. Task D makes the
  chunks arrive *earlier*; it must not merge them back into the entry bundle.
  If the entry chunk grows past **230 kB raw**, you have done Task D wrong.
- Never let a loading state cause layout shift. Every skeleton must occupy the
  exact box its real content will occupy.
- Never commit. Leave everything in the working tree.

### 1.2 Motion and accessibility, on every task that adds animation
- Every new animation must be disabled under
  `@media (prefers-reduced-motion: reduce)`, added to the existing block at
  `index.css:271`. A new animation that is not in that list is an incomplete
  task.
- Loading overlays must not trap focus and must not be announced repeatedly.
  Use `aria-busy` on the region and a single polite `role="status"`.
- Skeletons are decorative: `aria-hidden="true"`, with the real loading state
  announced once by a `role="status"` sibling.

### 1.3 The anti-flash rule (applies to Tasks C and E)
A loading indicator that appears for 80 ms is worse than none — it reads as a
flicker, not as progress. Every loading UI in this plan obeys:

- **Do not show** until the work has been pending for **150 ms**.
- **Once shown, stay** for a minimum of **400 ms** before hiding, even if the
  work finished at 160 ms.
- Fade out over **200 ms**; never disappear on a single frame.

Implement this once, as a shared hook (Task C1), and use it everywhere. Do not
re-implement the timing per component.

### 1.4 After every task
1. `cd frontend && npx tsc -b --noEmit` must pass.
2. Run the task's own **Verify** block.
3. Append the result to `plans/loading-results.md` (created in Task A0).
4. If a task cannot be completed, write down why and move on. Do not block.

---

## 2. Task order

Do them in this order. B must come before D and E, because a stable preview
cache is what makes prewarming possible at all.

```text
  Phase A  Layout          A0  results file
                           A1  fix the containing-block escape (the scrollbar)
                           A2  structural guard + a regression check

  Phase B  Previews        B1  freeze the preview base appearance
                           B2  make the cache key stable and cheap
                           B3  prewarm API for a category

  Phase C  Skeletons       C1  the shared delayed-visibility hook
                           C2  the Skeleton primitive (hand-written)
                           C3  apply to tiles, customizer, memories, library

  Phase D  Prefetch        D1  habitat readiness signal
                           D2  background chunk prefetch
                           D3  background preview prewarm

  Phase E  Loading system  E1  the progress model
                           E2  the WorldLoader overlay + creature + progress ring
                           E3  wire it to the habitat

  Phase F  Verification    F1  re-measure everything in §0
                           F2  regression pass
```

---

# PHASE A — THE LAYOUT BUG

Do this first. It is the smallest change in the plan and the most severe
symptom, and it is independent of everything else.

## Task A0 — Results file

Create `plans/loading-results.md`:

```markdown
# Loading & perceived-performance results

Baseline figures come from §0 of
`plans/perceived-performance-and-loading-plan.md`, measured on the production
build before any of this plan was executed.

## Per-task notes
_(appended by every task)_

## Final comparison
_(filled by Task F1)_
```

## Task A1 — Fix the containing-block escape

### Files
- `frontend/src/components/ui/controls.tsx`

### Step
In `SwatchRow`, the `<label>` at line ~121 currently reads:

```tsx
<label
  htmlFor={id}
  className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
>
```

Add `relative` as the first class, and a comment explaining why — this is a
non-obvious one-word fix and the next person to tidy the class list will delete
it otherwise:

```tsx
{/*
  `relative` is load-bearing, not cosmetic.

  The colour input below is `sr-only`, which is `position: absolute` with no
  offsets. An absolutely positioned element is clipped only by an ancestor
  that establishes a containing block — and every `overflow-hidden` wrapper
  in the dashboard is `position: static`. Without `relative` here the input's
  containing block is the *initial* one: it lays out against <html> at its
  static offset (~2800px down a scrolled panel), escapes every clip, and
  grows the document until the whole page scrolls. Measured: 800px -> 2794px.
*/}
<label
  htmlFor={id}
  className="relative flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
>
```

**Change nothing else in this component.** Do not replace `sr-only` with
opacity tricks, do not restructure the label, do not move the input. The
one-word fix is verified; anything more is unrequested risk.

### Verify
1. `npx tsc -b --noEmit`.
2. Build, preview, sign in, open **Pet → Extras**, select any accessory
   (e.g. Glasses under "Face accessory"). Then in the console:
   ```js
   (() => { const d = document.documentElement;
     return JSON.stringify({ sh: d.scrollHeight, ch: d.clientHeight,
       scrolls: d.scrollHeight > d.clientHeight }); })()
   ```
   Must report `scrolls: false` and `sh === ch`.
3. Repeat on the **Colour** tab, which was independently broken. Same result
   required.
4. Confirm the picker still works: click the "Custom" swatch, confirm the
   native colour dialog opens and choosing a colour changes the creature.

## Task A2 — Structural guard and a regression check

### Why both
A1 fixes the one component that has this bug today. A2 makes the *class* of bug
impossible in the tools column, so the next `sr-only` or absolutely positioned
descendant cannot reintroduce it.

### Files
- `frontend/src/features/dashboard/Dashboard.tsx`

### Step
There are two panel scrollers — the compact one and the desktop one. Add
`relative` to both.

Compact (currently `-mr-1 min-h-0 flex-1 overflow-y-auto pr-1 pb-6`):
```tsx
<div className="relative -mr-1 min-h-0 flex-1 overflow-y-auto pr-1 pb-6">{panels}</div>
```

Desktop (currently `-mr-1 min-h-0 flex-1 overflow-y-auto pr-1`):
```tsx
{/*
  `relative` makes this column a containing block, so an absolutely
  positioned descendant (Tailwind's `sr-only`, a popover, a badge) is clipped
  by this scroller instead of escaping to <html> and growing the page. See
  `controls.tsx` SwatchRow for the bug this prevents recurring.
*/}
<div className="relative -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">{panels}</div>
```

### Also check, do not assume
`grep -rn "sr-only" frontend/src` returns one other hit:
`features/pets/SavePetDialog.tsx:128`, a `<button className="sr-only">`.
Open that file and check whether its nearest positioned ancestor is the dialog
surface. If the dialog root is `fixed` or `relative`, it is already contained —
record that and change nothing. If it is not, add `relative` to the dialog's
own content wrapper and record it. Do not change the button.

### Verify
1. `npx tsc -b --noEmit`.
2. Add this to the results file as a reusable check, and run it on the Goals,
   Memories, Pet (all five sub-tabs) and Room tabs:
   ```js
   (() => {
     const d = document.documentElement;
     const escapees = [...document.querySelectorAll('*')].filter(el => {
       const cs = getComputedStyle(el);
       return (cs.position === 'absolute') && el.offsetParent === document.body;
     }).map(el => el.tagName + '.' + (el.className||'').toString().slice(0,30));
     return JSON.stringify({ pageScrolls: d.scrollHeight > d.clientHeight, escapees });
   })()
   ```
   **`pageScrolls` must be `false` and `escapees` must be empty on every tab.**
3. Confirm the tools column still scrolls internally (it must — that is the one
   region allowed to scroll).

---

# PHASE B — THE PREVIEW ARCHITECTURE

This is the largest perceived-performance win in the plan and it unblocks
Phase D. Do not start it until Phase A verifies.

## Task B1 — Freeze the preview base appearance

### The decision, made
Option previews stop rendering against the **live** appearance and start
rendering against a **frozen base**, captured once and changed only
deliberately.

**Which base:** the appearance the user's creature had when the editor was
opened — "the one already made upon log in", per the request. Not the library
default. This preserves the existing design intent (a preview shows the option
on *your* creature, which is what `previews.ts`'s whole doc comment defends)
while removing the per-keystroke invalidation.

**When it re-freezes:** only when the user switches to a different saved preset
— i.e. when `activePetId` changes. **Not** on slider moves, colour changes,
part swaps, or the "Roll a creature" dials.

**Why this is safe:** the live creature in the room is driven by a separate
path (`PetHabitat.tsx:454-457` → `PetRoom.setAppearance`). The user continues
to see every edit instantly on the actual creature. Only the small option
thumbnails become stable. Confirm this yourself by reading those lines before
you change anything.

### Files
- `frontend/src/features/customization/previews.ts`
- `frontend/src/features/customization/PartGrid.tsx`
- `frontend/src/features/customization/CustomizerPanel.tsx`

### B1a. A React context holding the frozen base

Create `frontend/src/features/customization/PreviewBase.tsx`:

```tsx
import { createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';

/**
 * The creature every option tile is drawn on.
 *
 * Deliberately *not* the appearance being edited. Previews used to render
 * against the live value, which meant the cache key changed on every slider
 * frame and all fourteen visible tiles rebuilt a full rig — measured, on one
 * slider nudge: 14 tiles redrawn. During a drag that is fourteen rig builds a
 * frame.
 *
 * Frozen instead, and re-taken only when the user switches to a different
 * saved preset. The tiles still look like *their* creature (which is the whole
 * point of drawing previews rather than shipping icons) and the cache now
 * survives an editing session intact — which is also what makes prewarming
 * possible at all (`features/dashboard/prefetch.ts`).
 *
 * The creature in the room is unaffected: that is driven straight from the
 * live appearance by `PetHabitat` -> `PetRoom.setAppearance`, and still
 * updates on every frame of every drag.
 */
const PreviewBaseContext = createContext<PetAppearance | null>(null);

interface PreviewBaseProviderProps {
  /** The live appearance. Read once per `identity`, then ignored. */
  appearance: PetAppearance;
  /**
   * Changes only when the user adopts a different creature — the active preset
   * id, or `null` before one is chosen. A new value re-takes the snapshot.
   */
  identity: string | null;
  children: ReactNode;
}

export function PreviewBaseProvider({
  appearance,
  identity,
  children,
}: PreviewBaseProviderProps) {
  const frozen = useRef<{ identity: string | null; value: PetAppearance } | null>(null);

  const base = useMemo(() => {
    if (!frozen.current || frozen.current.identity !== identity) {
      frozen.current = { identity, value: createPetAppearance({ ...appearance }) };
    }
    return frozen.current.value;
    // `appearance` is read on purpose only when `identity` changes; listing it
    // would re-freeze on every edit, which is the bug this exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  return <PreviewBaseContext.Provider value={base}>{children}</PreviewBaseContext.Provider>;
}

/** The frozen preview base. Falls back to the default creature outside a provider. */
export function usePreviewBase(): PetAppearance {
  const base = useContext(PreviewBaseContext);
  const fallback = useMemo(() => createPetAppearance(), []);
  return base ?? fallback;
}
```

### B1b. Wrap the customizer

In `CustomizerPanel.tsx`, the component currently takes `appearance` and passes
it down to every `PartGrid`. Add an `identity` prop and wrap the returned tree.

1. Add to `CustomizerPanelProps`:
   ```ts
   /**
    * Which saved creature this is. Changing it re-takes the preview base
    * snapshot; editing the current one does not.
    */
   identity: string | null;
   ```
2. Destructure `identity` in the component signature.
3. Wrap the outermost returned `<div className="space-y-4">` in
   `<PreviewBaseProvider appearance={appearance} identity={identity}>` … and
   import it.

In `Dashboard.tsx`, pass it — `usePetLibrary()` already exposes `activePetId`:

```tsx
<CustomizerPanel
  appearance={appearance}
  onChange={updateAppearance}
  petName={petName}
  onPetNameChange={setPetName}
  identity={library.activePetId}
/>
```

`library` is already in scope in `Dashboard.tsx` (`const library = usePetLibrary()`).

### B1c. Make `PartGrid` read the frozen base

In `PartGrid.tsx`:

1. Import `usePreviewBase` from `./PreviewBase`.
2. **Delete the `appearance` prop** from `PartGridProps` and from the
   destructured signature.
3. Inside the component: `const base = usePreviewBase();`
4. Change the memo to use `base`, and replace the stale doc comment:

```tsx
/**
 * Rebuilt when the *base* creature changes — a preset switch — and only then.
 *
 * Not when the appearance is edited. Previews are drawn on a frozen snapshot
 * (`PreviewBase`), so dragging a slider no longer invalidates every tile's
 * cache key. That was measured at 14 rig rebuilds per slider step.
 */
const options = useMemo<GridOption<T>[]>(
  () =>
    keys.map((key) => ({
      value: key,
      label: table[key].label,
      hint: table[key].hint,
      preview: () => renderOptionPreview(base, patch(key), focus),
    })),
  // `patch` is defined inline by every call site and would defeat the memo;
  // it is a pure function of `key`, so the base is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [keys, table, focus, base],
);
```

5. In `CustomizerPanel.tsx`, **remove `appearance={appearance}` from every
   `PartGrid` call site.** There are many — find them all with
   `grep -n "appearance={appearance}" frontend/src/features/customization/CustomizerPanel.tsx`
   and remove only the ones on `PartGrid` elements. `tsc` will catch any you
   miss, and will also catch any you removed from the wrong component.

### The one call site that needs care
The accessory grids pass `patch={(value) => accessoryPatch(appearance, slot, value)}`.
That closes over the **live** `appearance`, which is correct and must stay:
choosing an accessory has to merge into the user's *current* accessories, not
the frozen snapshot. Leave `accessoryPatch(appearance, ...)` exactly as it is.
Only the `appearance` **prop** on `PartGrid` is removed.

### Verify
1. `npx tsc -b --noEmit` — this is a real check here: it will fail loudly if a
   `PartGrid` call site still passes `appearance`.
2. Build, preview, sign in, open **Pet → Body**.
3. Re-run the §0.2 measurement, verbatim:
   ```js
   // attach first
   window.__n = 0;
   window.__o = new MutationObserver(ms => { for (const m of ms) {
     if (m.type === 'attributes' && m.target.tagName === 'IMG') window.__n++;
     for (const n of m.addedNodes || []) if (n.nodeType === 1)
       (n.tagName === 'IMG' ? [n] : [...(n.querySelectorAll?.('img')||[])]).forEach(() => window.__n++);
   }});
   window.__o.observe(document.querySelector('.overflow-y-auto'),
     { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
   ```
   Then move the **Width** slider one step and wait 3s.
   **`window.__n` must be 0 or very close to it.** Baseline was 14.
4. **The creature in the room must still change as you drag.** This is the
   non-negotiable behavioural check for this task. If it does not, you have
   wired the frozen base into the habitat by mistake — revert and re-read
   `PetHabitat.tsx:454-457`.
5. Switch to a different saved preset in the Pet Library. The tiles **must**
   re-render to show the new creature. If they do not, `identity` is not wired.

## Task B2 — Make the cache key stable and cheap

### Why
Even with a frozen base, the key is `JSON.stringify(shown)` — a full appearance
serialisation per tile per render. With the base now stable, the key can be
built from the thing that actually varies.

### Files
- `frontend/src/features/customization/previews.ts`

### Step
`renderOptionPreview` currently signs the whole resulting appearance. Add an
explicit key argument so callers name what varies, and keep the full-serialise
path as the fallback for anything that does not supply one.

Change the signature and the key:

```ts
export function renderOptionPreview(
  appearance: PetAppearance,
  patch: Partial<PetAppearance>,
  focus: PreviewFocus,
  size = 76,
  /**
   * What makes this tile different from its neighbours, when the caller knows.
   *
   * The key used to be the whole resulting appearance, serialised per tile.
   * With the base frozen (`PreviewBase`) the base contributes one stable
   * fingerprint and the option contributes the rest, so a grid of forty tiles
   * costs one serialisation instead of forty.
   */
  optionKey?: string,
): Promise<string> {
  const shown = createPetAppearance({ ...neutralise(appearance), ...patch });

  const key =
    optionKey === undefined
      ? `pet:${focus}:${JSON.stringify(shown)}`
      : `pet:${focus}:${size}:${baseFingerprint(appearance)}:${optionKey}`;

  return renderPreview(key, () => new PetRenderer(shown).root, {
    size,
    fill: TILE_FILL,
    focus: (subject) => regionFor(subject, focus),
  });
}
```

Add the fingerprint helper above it, memoised on identity so a stable base
serialises once for the whole session:

```ts
/**
 * A cheap, stable id for the creature previews are drawn on.
 *
 * Memoised on object identity: the base is frozen for the whole editing
 * session (`PreviewBase`), so this serialises once rather than once per tile
 * per render.
 */
const fingerprints = new WeakMap<object, string>();

function baseFingerprint(appearance: PetAppearance): string {
  const hit = fingerprints.get(appearance);
  if (hit !== undefined) return hit;

  const value = JSON.stringify(neutralise(appearance));
  fingerprints.set(appearance, value);
  return value;
}
```

Then in `PartGrid.tsx`, pass the option key — it is simply the option's own key:

```ts
preview: () => renderOptionPreview(base, patch(key), focus, undefined, key),
```

Note `undefined` for `size` so the default (76) still applies; do not hard-code
a size at the call site.

### The correctness trap you must not fall into
The accessory grids' patch depends on the **live** `appearance` (see B1). Two
different live accessory states could therefore produce two different pictures
for the same `optionKey`. Guard against a stale tile by making the accessory
grids opt out of the short key — they keep the full-serialise path.

In `CustomizerPanel.tsx`, `PartGrid` needs a way to say so. Add an optional
prop to `PartGridProps`:

```ts
/**
 * Skip the short cache key and sign the whole resulting appearance.
 *
 * For categories whose patch depends on live state (the accessory slots merge
 * into the wearer's current accessories), where the option key alone does not
 * identify the picture.
 */
exactKey?: boolean;
```

and in the memo:

```ts
preview: () =>
  renderOptionPreview(base, patch(key), focus, undefined, exactKey ? undefined : key),
```

Then set `exactKey` on the three accessory `PartGrid`s inside the
`ACCESSORY_SLOTS.map(...)` block only:

```tsx
<PartGrid
  keys={slotKeys}
  table={slotTable}
  patch={(value) => accessoryPatch(appearance, slot, value)}
  focus={slot === 'neck' ? 'whole' : 'head'}
  value={worn?.type ?? 'none'}
  onChange={(value) => setAccessory(slot, value)}
  exactKey
/>
```

### Verify
1. `npx tsc -b --noEmit`.
2. Open **Pet → Body**, confirm every tile still draws a *distinct, correct*
   picture (a contact-sheet check: the body options must look like different
   bodies, not fourteen copies).
3. Open **Pet → Extras**, put a hat on, take it off, put a different one on.
   The "None" tile and each hat tile must show the right thing each time — this
   is the `exactKey` path.
4. Re-run the B1 slider measurement. Still ~0 redraws.

## Task B3 — A prewarm entry point

### Why
Phase D needs to fill the preview cache in the background. That needs a
function that renders a category's tiles without mounting any UI.

### Files
- `frontend/src/features/customization/previews.ts`

### Step
Append:

```ts
/**
 * Draw a set of options into the cache, ahead of anybody looking at them.
 *
 * Called from the dashboard's background prefetch after the room is up
 * (`features/dashboard/prefetch.ts`), so that opening the Pet tab finds the
 * tiles already rendered instead of spending ~1.5s drawing them. Measured
 * cold, before this existed: first tile image at 1540ms, all fourteen at
 * 2005ms.
 *
 * Sequential on purpose, and yielding between tiles. These all share one
 * offscreen WebGL context (`lib/preview`); firing them in parallel does not
 * make the GPU faster, it just makes the main thread unresponsive while the
 * user is trying to look at their room.
 *
 * @param signal aborts between tiles. A user who opens the Pet tab mid-prewarm
 *   should not be racing their own background work.
 */
export async function prewarmOptionPreviews(
  appearance: PetAppearance,
  options: readonly { patch: Partial<PetAppearance>; focus: PreviewFocus; key: string }[],
  signal?: AbortSignal,
): Promise<void> {
  for (const option of options) {
    if (signal?.aborted) return;

    try {
      await renderOptionPreview(appearance, option.patch, option.focus, undefined, option.key);
    } catch {
      // A prewarm that fails is a tile that draws on demand later. Never let
      // background work surface an error to somebody who did not ask for it.
    }

    // Yield, so a long prewarm cannot hold a frame hostage.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
```

### Verify
`npx tsc -b --noEmit`. No behavioural check yet — Task D3 calls this.

---

# PHASE C — SKELETONS

## Task C1 — The shared delayed-visibility hook

### Why
§1.3's anti-flash rule, implemented once.

### Files
- `frontend/src/lib/useDelayedVisible.ts` (new)

### Step

```ts
import { useEffect, useRef, useState } from 'react';

/**
 * Whether a loading indicator should be on screen right now.
 *
 * Two thresholds, and both exist because of how loading UI actually fails:
 *
 * ```text
 *   appearing too eagerly   work that finishes in 90ms flashes a skeleton for
 *                           three frames, which reads as a glitch rather than
 *                           as progress
 *   disappearing too fast   a skeleton shown for 40ms before the content lands
 *                           is a flicker in the other direction
 * ```
 *
 * So: nothing is shown until the work has been pending for `delay`, and once
 * shown it stays for at least `minVisible` however fast the work finishes.
 *
 * @param pending whether the work is still in flight
 */
export function useDelayedVisible(
  pending: boolean,
  { delay = 150, minVisible = 400 }: { delay?: number; minVisible?: number } = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;

    if (pending) {
      if (visible) return;
      timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
    } else if (visible) {
      const elapsed = Date.now() - (shownAt.current ?? 0);
      const remaining = Math.max(0, minVisible - elapsed);
      timer = window.setTimeout(() => {
        shownAt.current = null;
        setVisible(false);
      }, remaining);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pending, visible, delay, minVisible]);

  return visible;
}
```

### Verify
`npx tsc -b --noEmit`.

## Task C2 — The Skeleton primitive

### Do not use the shadcn CLI
Stated in §0.4 and repeated here because it is the likely instinct: there is no
`components.json`, and `npx shadcn init` would rewrite configuration this
project maintains by hand. **Hand-write the component**, matching `card.tsx`.

### Files
- `frontend/src/components/ui/skeleton.tsx` (new)
- `frontend/src/index.css`

### C2a. The component

```tsx
import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A placeholder the exact shape of the thing that is coming.
 *
 * shadcn/ui's Skeleton, hand-written: this project uses shadcn as a convention
 * rather than through its CLI (there is no `components.json`), so components
 * live here and are styled with the same tokens as everything else.
 *
 * The rule that makes a skeleton worth having: it must occupy the box its real
 * content will occupy. A placeholder of the wrong size is a layout shift with
 * extra steps, and this product already pays close attention to not moving
 * things around under the user (`Docs/theme-and-design.md`).
 *
 * Decorative by default — `aria-hidden`, with the loading state announced once
 * by whatever `role="status"` sits beside it, not by twelve pulsing boxes.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('petweb-skeleton rounded-lg bg-muted/60', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
```

### C2b. The shimmer, and its reduced-motion opt-out

Tailwind's `animate-pulse` exists, but this project keeps its motion in one
place (`index.css:125-231`) with a single `prefers-reduced-motion` block, and a
skeleton that keeps pulsing when everything else has stopped is exactly the
inconsistency that block exists to prevent.

Add beside the other keyframes in `index.css`:

```css
@keyframes petweb-skeleton {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 0.85;
  }
}

/*
 * Placeholders breathe rather than sweep. A moving gradient reads as a
 * progress bar — it implies the thing is nearly here, which a skeleton has no
 * way of knowing.
 */
.petweb-skeleton {
  animation: petweb-skeleton 1.6s ease-in-out infinite;
}
```

Then add `.petweb-skeleton` to the existing `prefers-reduced-motion` list at
`index.css:271`, alongside `.animate-pop-in` and the rest. **A skeleton not in
that list is an incomplete task.**

### Verify
1. `npx tsc -b --noEmit`, build.
2. In DevTools, emulate `prefers-reduced-motion: reduce` and confirm the
   skeleton stops animating while remaining visible.

## Task C3 — Apply skeletons

### Files
- `frontend/src/components/ui/option-grid.tsx`
- `frontend/src/features/customization/CustomizerSkeleton.tsx` (new)
- `frontend/src/features/dashboard/Dashboard.tsx`
- `frontend/src/features/memories/MemoriesPanel.tsx`
- `frontend/src/features/pets/PetLibraryPanel.tsx`

### C3a. Tile thumbnails
`option-grid.tsx`'s `Thumbnail` already renders a crude placeholder:
`<span className="size-full animate-pulse rounded-lg bg-muted/60" />`.
Replace it with the primitive so every placeholder in the product breathes at
the same rate:

```tsx
{src ? (
  <img … />
) : (
  <Skeleton className="size-full rounded-lg" />
)}
```

Import `Skeleton`. **Do not change the surrounding `<span>`** — it is what
holds the square aspect ratio and prevents the shift.

### C3b. The customizer's Suspense fallback
Create `CustomizerSkeleton.tsx`. It must approximate the panel's real first
screen so the swap is not a jump: a section header, a grid of eight square
tiles, and two slider rows.

```tsx
import { Skeleton } from '../../components/ui/skeleton';

/**
 * The shape of the editor, before the editor.
 *
 * Deliberately the *Body* tab's layout — the tab the panel opens on — because
 * a skeleton that resolves into a differently shaped panel is a layout shift
 * announced in advance.
 */
export function CustomizerSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading the editor">
      <section className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="mx-auto h-2 w-10" />
            </div>
          ))}
        </div>
        <Skeleton className="h-6 w-full rounded-full" />
        <Skeleton className="h-6 w-full rounded-full" />
      </section>
    </div>
  );
}
```

In `Dashboard.tsx`, replace the customizer's Suspense fallback — currently the
text `Opening the editor…` — with `<CustomizerSkeleton />`. Import it
statically (it is tiny and must be present *before* the lazy chunk arrives; a
lazily-loaded skeleton is a contradiction).

### C3c. Memories and library
- `MemoriesPanel`: while its first fetch is in flight, render three skeleton
  cards each `h-48` — matching the reserved image box added by the previous
  plan — with two text lines under each. Gate with `useDelayedVisible`.
- `PetLibraryPanel`: while `library.loading`, render four
  `Skeleton className="size-16 rounded-xl"` tiles in the grid's shape. Gate
  with `useDelayedVisible`.

Both must keep their existing empty-state text for the *loaded but empty* case.
A skeleton must never be what an empty account sees.

### Verify
1. `npx tsc -b --noEmit`, build, preview.
2. Throttle the network to "Slow 3G" in DevTools, reload, open each of
   Pet / Memories. Skeletons must appear, hold, and swap without the layout
   jumping. Measure CLS-by-eye: the section boxes must not resize on swap.
3. With **no** throttling, open the Pet tab. Because of §1.3, if the content is
   ready in under 150 ms you should see **no** skeleton at all — that is
   correct behaviour, not a bug.
4. Confirm an empty account still sees "Nothing kept yet." on Memories, not a
   permanent skeleton.

---

# PHASE D — BACKGROUND PREFETCH

The request: *"instead of completely lazy loading the tabs which are important
we background load them."* Phase D does exactly that, and does **not** revert
the code splitting.

## Task D1 — A readiness signal from the habitat

### Why
Prefetch must start *after* the room is up, or it competes with the thing the
user is actually looking at. The habitat currently reports nothing when its
world finishes mounting.

### Files
- `frontend/src/features/habitat/PetHabitat.tsx`

### Step
1. Add to `PetHabitatProps`:
   ```ts
   /**
    * The world exists and has drawn. Fired once per mount, after the scene is
    * on the stage and the saved arrangement has been placed.
    *
    * The dashboard uses it to start background work (`prefetch.ts`) only once
    * the thing the user is actually looking at is finished.
    */
   onReady?: () => void;
   ```
2. Destructure `onReady` in the signature.
3. Mirror it into a ref beside the existing `onRoomStyleChangeRef` /
   `onArrangementChangeRef` refs, following the same pattern already in the
   file:
   ```ts
   const onReadyRef = useRef(onReady);
   useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
   ```
4. In the mount effect's `start()`, **after** the placement-restore loop and
   before the `import.meta.env.DEV` block, add:
   ```ts
   // The world is on the stage and the saved room is in it. Anything the
   // dashboard wants to do in the background can start now, and not before —
   // the room is what the user is looking at.
   onReadyRef.current?.();
   ```

**Do not** call it earlier (e.g. right after `init`), and do not call it from
the cleanup path.

### Verify
`npx tsc -b --noEmit`. Temporarily pass
`onReady={() => console.log('habitat ready', performance.now())}` from
`Dashboard.tsx`, confirm it logs **exactly once** on a normal load, then
remove the temporary logging.

## Task D2 — Prefetch the tab chunks

### Files
- `frontend/src/features/dashboard/prefetch.ts` (new)
- `frontend/src/features/dashboard/Dashboard.tsx`

### D2a. The module

```ts
/**
 * Work the dashboard does when nobody is waiting for it.
 *
 * The Pet and Memories panels are code-split, which is right — a signed-out
 * visitor should not download the customizer. But a *signed-in* user is going
 * to open the Pet tab, and making them wait for a network round trip at the
 * moment they click is the code splitting leaking into the experience.
 *
 * So the chunks are fetched in the background once the room is up. The split
 * is unchanged; only the timing moves. `import()` is idempotent and the module
 * registry is shared, so the click later resolves from cache instantly.
 *
 * Ordered, never parallel: these share a main thread with a running PixiJS
 * scene, and three chunks parsing at once is a dropped frame in the room.
 */

export interface PrefetchHandle {
  cancel: () => void;
}

/** Run `task` when the browser is idle, or after `timeout` if it never is. */
function whenIdle(task: () => void, timeout = 2000): () => void {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  }).requestIdleCallback;

  if (typeof ric === 'function') {
    const handle = ric(task, { timeout });
    return () => (window as unknown as { cancelIdleCallback?: (h: number) => void })
      .cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(task, Math.min(timeout, 600));
  return () => window.clearTimeout(timer);
}

/**
 * Warm the lazy panels.
 *
 * Returns a handle so a teardown can stop it — a user who signs out mid-warm
 * should not still be downloading a customizer.
 */
export function prefetchPanels(): PrefetchHandle {
  let cancelled = false;

  const stopIdle = whenIdle(() => {
    if (cancelled) return;

    void (async () => {
      try {
        // The Pet tab first: it is the one with the visible cost, and the one
        // this whole exercise is about.
        await import('../customization/CustomizerPanel');
        if (cancelled) return;
        await import('../memories/MemoriesPanel');
      } catch {
        // A failed prefetch costs nothing: the lazy boundary will fetch it for
        // real when the tab is opened. Never surface this.
      }
    })();
  });

  return {
    cancel: () => {
      cancelled = true;
      stopIdle();
    },
  };
}
```

### D2b. Wire it

In `Dashboard.tsx`, add state for readiness and an effect:

```tsx
/** True once the room has drawn. Gates background work. */
const [worldReady, setWorldReady] = useState(false);
const handleWorldReady = useCallback(() => setWorldReady(true), []);
```

Pass `onReady={handleWorldReady}` to `<PetHabitat …>`.

Then:

```tsx
// Background-load the tabs the user is most likely to open next, once the room
// they are actually looking at has finished. See `prefetch.ts`.
useEffect(() => {
  if (!worldReady) return;
  const handle = prefetchPanels();
  return () => handle.cancel();
}, [worldReady]);
```

### The constraint you must not violate
`prefetchPanels` uses the **same specifiers** as the `lazy()` calls at the top
of `Dashboard.tsx` — `'../customization/CustomizerPanel'` and
`'../memories/MemoriesPanel'`. They must match exactly, or the bundler emits a
second copy of each chunk and you have doubled the download instead of
prefetching it. After building, confirm the chunk count and names are
unchanged from the pre-task build.

### Verify
1. `npx tsc -b --noEmit`.
2. `npx vite build`. **The chunk list must be the same as before this task** —
   same names, same count, `CustomizerPanel-*.js` and `MemoriesPanel-*.js`
   still separate, entry chunk still ≤230 kB raw. Record the manifest.
3. Preview, sign in, and **without clicking anything** watch the Network panel.
   `CustomizerPanel-*.js` must be requested on its own, a second or two after
   the room appears.
4. *Then* click the Pet tab and re-run the §0.1 timing. `firstTileDOM` should
   fall substantially (the chunk is already there).

## Task D3 — Prewarm the first category's previews

### Why
§0.1 again: the chunk was never the main cost. This is where the 1.5 seconds
actually goes.

### Files
- `frontend/src/features/dashboard/prefetch.ts`
- `frontend/src/features/dashboard/Dashboard.tsx`

### Step
The customizer opens on the **Body** tab, whose first grid is `BODY_TYPE_KEYS`.
Prewarm exactly that, and nothing else — prewarming all five sub-tabs would be
minutes of GPU work for tabs most users never open.

Add to `prefetch.ts`:

```ts
import { BODY_TYPE_KEYS } from '../../assets/pets/customization/BodyTypes';
import { prewarmOptionPreviews } from '../customization/previews';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';

/**
 * Draw the Body tab's tiles before anybody opens the Pet tab.
 *
 * The measured cost of *not* doing this: first tile image 1540ms after the
 * click, all fourteen at 2005ms. The chunk was only ~60ms of that; the rest is
 * this work, and it can happen while the user is looking at their room.
 *
 * Only the first grid of the first tab. Prewarming every category would be
 * hundreds of rig builds for tabs most people never open — which is the
 * opposite of the point.
 */
export function prewarmFirstCategory(
  base: PetAppearance,
  signal: AbortSignal,
): Promise<void> {
  return prewarmOptionPreviews(
    base,
    BODY_TYPE_KEYS.map((key) => ({
      patch: { bodyType: key },
      focus: 'whole' as const,
      key,
    })),
    signal,
  );
}
```

**Check the real focus value before you write it.** Open
`CustomizerPanel.tsx`, find the `PartGrid` for `BODY_TYPE_KEYS`, and use
*that* `focus` and *that* `patch` shape. If it is not `'whole'` / `bodyType`,
use what is actually there. A prewarm keyed differently from the live call is a
cache that never hits — the worst outcome, because it costs the work twice and
looks like it is working.

Extend `prefetchPanels` to accept the base and run the prewarm after the
imports resolve:

```ts
export function prefetchPanels(base: PetAppearance): PrefetchHandle {
  let cancelled = false;
  const controller = new AbortController();

  const stopIdle = whenIdle(() => {
    if (cancelled) return;

    void (async () => {
      try {
        await import('../customization/CustomizerPanel');
        if (cancelled) return;
        await import('../memories/MemoriesPanel');
        if (cancelled) return;
        await prewarmFirstCategory(base, controller.signal);
      } catch {
        /* see above */
      }
    })();
  });

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
      stopIdle();
    },
  };
}
```

In `Dashboard.tsx`, the base handed in **must be the same object the customizer
will freeze** — otherwise the fingerprints differ and nothing hits. Since
`PreviewBaseProvider` freezes `appearance` at the current `activePetId`, and
the dashboard owns both, pass `appearance` and add `library.activePetId` to the
effect's dependencies:

```tsx
useEffect(() => {
  if (!worldReady) return;
  const handle = prefetchPanels(appearance);
  return () => handle.cancel();
  // Re-warms when the user adopts a different creature, which is exactly when
  // the frozen preview base is re-taken (`PreviewBase`).
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [worldReady, library.activePetId]);
```

### Honest expectation
`baseFingerprint` is a `WeakMap` on object identity, so a prewarm and a later
live render only share a cache entry if they are handed the **same object** or
two objects that serialise identically. `createPetAppearance` produces a fresh
object with fixed key order, so the *serialised* fingerprints will match even
across different object instances — the WeakMap is a speed optimisation, not
the correctness mechanism. Confirm the hit in the Verify step rather than
assuming it.

### Verify
1. `npx tsc -b --noEmit`, build, preview.
2. Sign in. Wait 5 seconds **without clicking**. Then open the Pet tab and
   re-run the §0.1 timing script.
   **Target: `allImages` well under the 2005 ms baseline** — most tiles should
   appear immediately because they are cached.
3. Record the actual before/after numbers. If `allImages` did **not** improve,
   the cache is not hitting: log the key produced by `prewarmFirstCategory` and
   the key produced by the live `PartGrid` render and compare them character by
   character. Write down what you find, whether or not you fix it.
4. Confirm the room stays smooth *while* prewarming — watch the creature move
   during those 5 seconds. If it stutters, the yield in
   `prewarmOptionPreviews` is not working; record it.

---

# PHASE E — THE LOADING SYSTEM

## Task E1 — The progress model

### The decision, made
Progress is **discrete and weighted**, not a fake timer and not a byte count.
Four phases, chosen because they are the four things that actually gate the
room appearing, with weights reflecting their measured share of the wait:

| Phase | Weight | Complete when |
|---|---:|---|
| `session` | 15 | `AuthGate` has a session and `Dashboard` has mounted |
| `data` | 20 | `/pets`, `/environments/current`, `/goals`, `/focus`, `/environments/current/objects` have all settled |
| `world` | 45 | `PetHabitat` fires `onReady` |
| `settled` | 20 | one animation frame after `world` |

Progress only ever moves **forward** — a phase completing can never lower the
bar. If a phase fails (a request 401s, the world throws), it counts as complete
for progress purposes; the loader's job is to get out of the way, not to block
on an error the panels already report.

### Files
- `frontend/src/features/habitat/useWorldProgress.ts` (new)

### Step

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type LoadPhase = 'session' | 'data' | 'world' | 'settled';

const WEIGHTS: Record<LoadPhase, number> = {
  session: 15,
  data: 20,
  world: 45,
  settled: 20,
};

const TOTAL = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0);

export interface WorldProgress {
  /** 0..1, monotonic. */
  value: number;
  /** True until every phase has reported. */
  loading: boolean;
  /** Mark a phase done. Safe to call more than once. */
  complete: (phase: LoadPhase) => void;
}

/**
 * How far along the room is.
 *
 * Weighted phases rather than a timer, because a timer that guesses is a
 * progress bar that lies — and this one is on screen while the product's first
 * impression is forming.
 *
 * Monotonic by construction: `done` is a Set, so a phase reporting twice
 * cannot move the bar backwards, and a failed phase still counts. The loader
 * exists to get out of the way; the panels report real errors themselves.
 */
export function useWorldProgress(): WorldProgress {
  const [done, setDone] = useState<ReadonlySet<LoadPhase>>(() => new Set());
  const settled = useRef(false);

  const complete = useCallback((phase: LoadPhase) => {
    setDone((current) => {
      if (current.has(phase)) return current;
      const next = new Set(current);
      next.add(phase);
      return next;
    });
  }, []);

  // `settled` is one frame after the world, so the first drawn frame is on
  // screen before the overlay starts leaving.
  useEffect(() => {
    if (!done.has('world') || settled.current) return;
    settled.current = true;
    const frame = requestAnimationFrame(() => complete('settled'));
    return () => cancelAnimationFrame(frame);
  }, [done, complete]);

  const value = useMemo(() => {
    let earned = 0;
    for (const phase of Object.keys(WEIGHTS) as LoadPhase[]) {
      if (done.has(phase)) earned += WEIGHTS[phase];
    }
    return earned / TOTAL;
  }, [done]);

  return { value, loading: value < 1, complete };
}
```

### Verify
`npx tsc -b --noEmit`.

## Task E2 — The overlay

### The decision, made
- **It lives inside the habitat frame**, not over the whole page. The tools
  column is usable immediately; covering it would make the app feel *slower*.
- **The creature is the loading asset**, per the request. Reuse `DancingPet` —
  §0.4 — do not write a second animated renderer.
- **The progress indicator is a ring around the creature**, not a bar. The
  request explicitly allows this ("the bar can be unique not necessary a filled
  line/rect"), and a ring reads as "the world is assembling around it" rather
  than as a file download.

### Files
- `frontend/src/features/habitat/WorldLoader.tsx` (new)
- `frontend/src/index.css`

### Step

```tsx
import { DancingPet } from '../pets/DancingPet';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { cn } from '../../lib/utils';

interface WorldLoaderProps {
  appearance: PetAppearance;
  /** 0..1. */
  progress: number;
  /** Drives the fade-out; the element stays mounted through it. */
  leaving: boolean;
  petName: string;
}

/** Ring geometry. One source of truth so the dash maths cannot drift. */
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The room, assembling.
 *
 * Inside the habitat frame only — the tools beside it are usable from the
 * first paint, and covering them would make the product feel slower than it
 * is while claiming to make it feel faster.
 *
 * The creature is the loading animation, which is the one thing this product
 * has that a spinner does not. The ring around it is the progress: an arc
 * closing on itself reads as "this is being built" where a filling bar reads
 * as "this is being downloaded", and the second one is a lie about what is
 * happening (`useWorldProgress` — the phases are render work, not bytes).
 */
export function WorldLoader({ appearance, progress, leaving, petName }: WorldLoaderProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      role="status"
      aria-busy={!leaving}
      aria-label={`Waking ${petName} up`}
      className={cn(
        'absolute inset-0 z-10 grid place-items-center rounded-xl',
        'bg-card/80 backdrop-blur-[2px]',
        'transition-opacity duration-200 ease-out',
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
    >
      <div className="relative grid place-items-center">
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="petweb-loader-ring absolute size-[132px] -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-border"
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-primary transition-[stroke-dashoffset] duration-300 ease-out"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          />
        </svg>

        <div className="petweb-loader-bob">
          <DancingPet appearance={appearance} size={96} />
        </div>
      </div>

      <p className="absolute bottom-6 text-xs text-muted-foreground">
        {clamped < 0.99 ? `Waking ${petName} up…` : 'Almost there…'}
      </p>
    </div>
  );
}
```

Add to `index.css`, beside the other keyframes:

```css
@keyframes petweb-loader-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

/* The creature waits the way it idles in the room, so the loader and the
   thing it resolves into feel like the same character. */
.petweb-loader-bob {
  animation: petweb-loader-bob 2.4s ease-in-out infinite;
}

/* A slow drift, so a stalled load still looks alive without implying
   progress that is not happening. */
.petweb-loader-ring {
  animation: petweb-loader-spin 9s linear infinite;
}

@keyframes petweb-loader-spin {
  to {
    transform: rotate(270deg);
  }
}
```

Note the ring already carries `-rotate-90` as a Tailwind class; the keyframe
above animates from that start to `270deg`. **Verify visually** that the ring
does not jump when the animation starts — if it does, drop the `-rotate-90`
class and set the start of the keyframe to `rotate(-90deg)` explicitly.

Add `.petweb-loader-bob` and `.petweb-loader-ring` to the
`prefers-reduced-motion` list at `index.css:271`.

### Verify
1. `npx tsc -b --noEmit`, build.
2. Visual check at several fixed progress values by temporarily hard-coding
   `progress={0}`, `0.5`, `1`: the arc must be empty, half, and closed.
3. Reduced-motion: creature and ring stop animating; the arc still reflects
   progress.

## Task E3 — Wire it up

### Files
- `frontend/src/features/habitat/PetHabitat.tsx`
- `frontend/src/features/dashboard/Dashboard.tsx`

### Step
1. In `Dashboard.tsx`, call `useWorldProgress()`.
2. Report the phases:
   - `session` — in a mount effect (`useEffect(() => complete('session'), [])`).
   - `data` — an effect watching the existing hook flags:
     ```tsx
     useEffect(() => {
       if (library.loading || room.loading || goals.loading || focus.loading) return;
       progress.complete('data');
     }, [library.loading, room.loading, goals.loading, focus.loading, progress]);
     ```
     Check each hook's real flag name first — `useRoomObjects` also exposes
     `loading`; include it if it is in scope.
   - `world` — inside `handleWorldReady`, alongside `setWorldReady(true)`.
3. Render the loader **inside the habitat's own frame**. `PetHabitat` already
   owns a positioned frame; add an optional `overlay?: ReactNode` prop to it
   and render `{overlay}` inside the element that wraps the canvas host — the
   one that already establishes a positioning context. **Read the JSX and put
   it in the element whose parent has `relative`**; if none does, add `relative`
   to the canvas wrapper (not to the outer card).
4. In `Dashboard.tsx`, pass it, gated so it unmounts after the fade:
   ```tsx
   const showLoader = useDelayedVisible(progress.loading, { delay: 0, minVisible: 600 });
   ```
   `delay: 0` is deliberate and is the one exception to §1.3's 150 ms rule:
   this loader covers the *first* paint of the room, where there is no prior
   content to flicker away from — it is the initial state, not an interruption.
   `minVisible: 600` still prevents a flash on a warm cache.

   ```tsx
   overlay={
     showLoader ? (
       <WorldLoader
         appearance={appearance}
         progress={progress.value}
         leaving={!progress.loading}
         petName={petName}
       />
     ) : null
   }
   ```

### The failure mode you must handle
If `onReady` never fires — a WebGL failure, a browser with no GPU — the loader
would sit there forever. Add a hard timeout in `Dashboard.tsx`:

```tsx
// A world that never reports ready must not leave the user staring at a
// creature on a veil. After eight seconds the overlay goes regardless; if the
// canvas really did fail, the room behind it shows that honestly.
useEffect(() => {
  const timer = window.setTimeout(() => {
    progress.complete('world');
    progress.complete('data');
  }, 8000);
  return () => window.clearTimeout(timer);
}, [progress]);
```

### Verify
1. `npx tsc -b --noEmit`, build, preview.
2. Sign in. The loader must appear over the room frame only — **the tools
   column on the right must be visible and clickable throughout**.
3. The ring must fill in visible steps and the overlay must fade, not vanish.
4. Hard-reload with the cache disabled and network throttled: the loader should
   be on screen long enough to read.
5. Reload with a warm cache: the loader must still not flash — `minVisible`
   holds it for 600 ms.
6. Simulate the failure path: temporarily comment out the `onReadyRef.current?.()`
   call, reload, and confirm the overlay clears itself after 8 seconds.
   Restore the call afterwards.

---

# PHASE F — VERIFICATION

## Task F1 — Re-measure §0

Re-run every measurement in §0, the same way, and fill in
`plans/loading-results.md`:

| Metric | Before | After |
|---|---:|---:|
| Pet tab → first tile in DOM | 314 ms | |
| Pet tab → first preview image | 1540 ms | |
| Pet tab → all 14 tiles | 2005 ms | |
| Tile redraws per slider step (Body tab) | 14 | |
| `documentElement.scrollHeight`, Extras + accessory | 2794 | |
| `documentElement.scrollHeight`, Colour tab | 1513 | |
| Page scrolls on any tab | yes | |
| Entry chunk, raw | 214.34 kB | |
| Chunk count | 27 | |

Rules, the same as the previous plan's: **every number measured, none
estimated**. If something got worse, report it and explain why. If a target was
missed, say so plainly rather than moving the target.

## Task F2 — Regression pass

Against the production build, signed in. This plan touched the customizer, the
dashboard shell, the habitat and shared UI primitives, so re-check:

- [ ] Every customizer sub-tab (Body, Ears, Face, Colour, Extras) renders its
      grids, and every tile shows a distinct correct picture.
- [ ] Dragging any slider updates the creature **in the room**, live.
- [ ] Dragging any slider does **not** redraw the option tiles.
- [ ] Switching saved presets **does** redraw the option tiles.
- [ ] Putting on / swapping / removing an accessory shows the right tile each
      time (the `exactKey` path).
- [ ] No tab causes the page to scroll — run the A2 script on all of them.
- [ ] The tools column still scrolls internally.
- [ ] Goals, Memories, Room tabs all still work.
- [ ] Focus session still darkens the room and collapses the tabs.
- [ ] `prefers-reduced-motion: reduce` stops every new animation.
- [ ] Compact/mobile viewport: loader sits over the habitat, layout intact, no
      horizontal scroll.
- [ ] Console clean on a fresh navigation.

---

## Documentation to update when finished

| File | What |
|---|---|
| `Docs/Architecture-and-layers.md` | The prefetch strategy, and that the split is unchanged |
| `Docs/theme-and-design.md` | The loader, the progress ring, the skeleton convention |
| `Docs/AGENTS.md` | Under **Performance Rules**, add: *previews render against a frozen base, never the live appearance*; and under a new **Layout Rules** heading, add: *any container that clips must establish a containing block (`relative`), or absolutely positioned descendants escape it* |
| `plans/loading-results.md` | Every measurement |

## Definition of done

- [ ] All tasks attempted, each with a recorded outcome (including "no change needed").
- [ ] `cd frontend && npx tsc -b --noEmit` passes.
- [ ] `npx vite build` succeeds, entry chunk ≤230 kB raw, chunk count unchanged.
- [ ] Every box in F2 ticked.
- [ ] `plans/loading-results.md` has real before/after numbers.
- [ ] No feature removed, no visual quality reduced.
- [ ] Nothing committed.
