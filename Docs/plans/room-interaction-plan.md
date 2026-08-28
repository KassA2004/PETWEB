# Implementation plan — room interaction, deletion, wall decor, celebration fix

You are implementing nine changes in the PetWeb repo. **Read `Docs/AGENTS.md` first
and obey it.** The rules that bite hardest here:

- Do not create parallel systems. Every change below extends something that
  already exists; each task names the existing thing.
- An object's size is its grid footprint. Never author a width/extent beside it.
- Anything the user decides about the room lives in `RoomStyle` and is therefore
  saved. Never in React state.
- Run `npx tsc -b` and `npx eslint src` from `frontend/` after every task.
  Both must be clean before you move on.

**Working directory for all frontend paths:** `frontend/src/`.

---

## How to verify anything visually (read before starting)

`computer{screenshot}` does not work here. The verification loop is:

1. `preview_start` with `http://localhost:5173/app-preview.html` — this is the
   whole Dashboard with `window.fetch` stubbed by an in-memory server
   (`src/app-preview.tsx`, backed by `sessionStorage`). `window.__store()`,
   `window.__calls` and `window.__reset()` are exposed.
2. **The preview tab is backgrounded, so `requestAnimationFrame` never fires.**
   PixiJS tickers do not advance on their own. Pump by hand:
   ```js
   const app = window.__petApp;
   let now = performance.now();
   for (let i = 0; i < 90; i++) { now += 16.67; app.ticker.update(now); }
   app.render();
   ```
   Keep each `javascript_tool` call small; a few thousand simulated frames times
   out at 30 s.
3. To *see* a frame, POST a data URL to the dev snapshot sink and `Read` the file:
   ```js
   const canvas = app.renderer.extract.canvas(app.stage);
   await fetch('/__snapshot', { method: 'POST', headers: { 'x-snapshot-name': 'name' }, body: canvas.toDataURL('image/png') });
   // then Read frontend/.snapshots/name.png
   ```
4. DEV handles on the real page: `window.__petRoom` (the `PetRoom` instance),
   `window.__petApp`, `window.__audio`. A dynamic `import()` from the console
   gets a **different module instance** — use these handles, not fresh imports,
   when you need the app's own state.

---

## Task order

Tasks 1, 2, 3 all touch `scenes/PetRoom.ts` around the same methods. Do them in
this order and typecheck between each. Tasks 4–9 are independent of each other.

1. Edit-mode gating of object dragging (+ tap-to-twitch, pet interest)
2. Delete by lifting on the Y axis (replaces the screen-edge band)
3. Persist deletion of environment props
4. Wall decor: delete by dragging up, and more wall rows
5. Wall decor: refuse placement on occupied cells
6. Clock becomes an ordinary wall decoration
7. Toys stay visible behind objects at reduced opacity
8. Remove the rug
9. Fix the goal-completion celebration

---

## Task 1 — objects only move in edit mode; tapping twitches them

### The behaviour

| state | pet | toys | everything else |
|---|---|---|---|
| edit mode **off** | draggable | draggable | **locked**; a tap twitches it and interests the creature |
| edit mode **on** | draggable | draggable | draggable |

### Files

`scenes/PetRoom.ts`, `simulation/PetBrain.ts`.

### 1a. Gate the grab

`PetRoom.pointerDown(canvasX, canvasY)` currently grabs whatever `pickAt`
returns. After the existing `const entity = this.entities.get(body.id); if
(!entity) return false;` line, insert the movability test:

```ts
const movable = this.editing || entity.id === 'pet' || entity.isToy;
```

When `movable` is false, **do not touch the physics at all** — no `world.grab`,
no `emitSound('prop-lift')`, no `grabOrigin`. Instead record a tap and return
`true` (returning true matters: it stops `PetHabitat` from falling through to
`pickWallDecorAt` and grabbing the painting hung behind a bookshelf).

Add one field beside `private grabbed: Entity | null = null;`:

```ts
/**
 * A locked object under the pointer, waiting to see whether this is a tap.
 *
 * Separate from `grabbed` because a locked object is never in the physics
 * manipulator's hands: there is nothing to release, nothing to settle and
 * nothing to snap. Reusing `grabbed` would mean every branch of `pointerUp`
 * having to ask whether this one was real.
 */
private tapped: { entity: Entity; time: number; moved: number; x: number; y: number } | null = null;
```

In `pointerDown`, the non-movable branch sets
`this.tapped = { entity, time: performance.now(), moved: 0, x: point.x, y: point.y }`
and returns `true`.

In `pointerMove`, before the existing `const entity = this.grabbed; if (!entity) return;`,
accumulate travel for a tap and bail:

```ts
if (this.tapped) {
  const point = this.root.toLocal({ x: canvasX, y: canvasY });
  this.tapped.moved += Math.abs(point.x - this.tapped.x) + Math.abs(point.y - this.tapped.y);
  this.tapped.x = point.x;
  this.tapped.y = point.y;
  return;
}
```

In `pointerUp`, before the existing `const entity = this.grabbed; if (!entity) return;`:

```ts
if (this.tapped) {
  const { entity, time, moved } = this.tapped;
  this.tapped = null;
  // The same tap test the drag path uses, so "what counts as a click" has one
  // answer in this file.
  if (performance.now() - time < CLICK_MS && moved < CLICK_DISTANCE) {
    this.handleClick(entity);
  }
  return;
}
```

`CLICK_MS` and `CLICK_DISTANCE` are existing module constants in this file —
reuse them, do not invent new ones.

Also clear `this.tapped = null` at the top of `setEditing` and `setFocus`, so a
mode change mid-gesture cannot leave a stale tap.

### 1b. Tapping already twitches — add the creature's interest

`PetRoom.handleClick(entity)` already does the twitch for props:
`entity.motion.knock(0.8, ±1)` plus `this.world.push(entity.body, { y: 240, x: ... })`.
**Do not write a new animation.** Add one line to that same branch, after the
push:

```ts
// Repeatedly prodding something is how you point at it. The brain already has
// a channel for "that thing is worth a look" — this is that channel, and the
// curiosity it adds accumulates across taps until the creature acts on it.
this.brain.noticeObject(entity.id, 0.25);
```

The lamp branch (`toggleLights`) and the pet branch (`brain.poked`) stay exactly
as they are.

### 1c. Make repeated interest actually send the creature over

`noticeObject` raises `needs.curiosity` and refreshes an entry in `interests`.
Three taps at 0.25 clears the `curiosity > 0.45` gate in `select()`. But the
creature then picks *what* to investigate via `PetBrain.pickCuriosity`, which
currently weights by distance only — so it may wander to something else.

In `PetBrain.pickCuriosity`, after `candidates` is built and before the weighting,
prefer anything the user has actually pointed at:

```ts
// Something the user has been prodding outranks whatever happens to be
// nearest. `interests` is the same list `noticeObject` writes to, so the
// preference costs no new state and expires on the same timer.
const interested = candidates.filter((object) =>
  this.interests.some((item) => item.id === object.id),
);
const pool = interested.length > 0 ? interested : candidates;
```

Then weight `pool` instead of `candidates` (the existing `weighted` map and the
roll below it are unchanged apart from the variable name).

### Verify

On the preview page, with edit mode **off**:

```js
const room = window.__petRoom;
const before = { ...room.entities.get('prop-bookshelf').body.position };
// simulate a press on the bookshelf (find its screen point first)
```
- Assert `room.grabbed === null` after a pointerdown on a prop, and that the
  prop's `body.position` is unchanged after a drag.
- Assert a pointerdown on `prop-ball` (a toy) **does** set `room.grabbed`.
- Assert a short tap on a prop raises `room.brain.needs.curiosity` (read it via
  `room.brain.needs`) and adds the id to the brain's interests.
- Turn edit mode on (`room.setEditing(true)`) and assert the prop grabs.

---

## Task 2 — delete by lifting out of the room, not by the screen edge

### Why the current one is wrong

`PetHabitat.handlePointerMove` measures the host element's rect and calls
`setDiscarding(true)` when the pointer is within `EDGE = 28` pixels of any side.
That fires when the user drags toward a **front corner** to place something
there, which is the bug being reported. Delete the whole approach.

The room already turns upward pointer travel past the back wall into height:
`PetRoom.carryTarget` returns `{ x, z, lift }`, where `lift` grows as the pointer
rises above the back wall. Height is the right signal — it is in world units, it
cannot be reached by any legal floor placement (every one of those is `lift: 0`),
and the corners are unaffected.

### Files

`scenes/PetRoom.ts`, `features/habitat/PetHabitat.tsx`.

### 2a. Move the decision into the scene

In `scenes/PetRoom.ts`, add a module constant next to the other drag constants:

```ts
/**
 * How high a carried thing has to be lifted before letting go throws it away.
 *
 * Above every row of hanging space, so it is unambiguously *out of the room*
 * rather than merely high up a wall. Derived from the wall grid rather than
 * typed as a number, so adding a row of hanging space cannot quietly put the
 * discard zone underneath the top row of pictures.
 *
 * The height is what makes this safe: a placement on the floor is `lift: 0` by
 * construction, so no amount of dragging toward a corner can reach it. The
 * screen-edge band this replaces could be, and was, hit by anyone trying to put
 * a chair in the front-left corner.
 */
const DISCARD_LIFT = WALL_TOP_Y;
```

Import `WALL_TOP_Y` from `../world/WallGrid` (the file already imports `snapWall`,
`wallCellKey`, `wallCells`, `wallQuadAt` from there — add to that import).

In `pointerMove`, after `const carry = this.carryTarget(point.x, point.y);` and
the `moveTo` call, add:

```ts
this.setDiscarding(carry.lift >= DISCARD_LIFT);
```

Change `setDiscarding`'s signature comment: it is no longer told by the page, it
is derived from the carry. Keep the method public (the guard inside it — editing,
something grabbed, not the pet — stays exactly as written).

### 2b. Delete the page-side measurement

In `features/habitat/PetHabitat.tsx`:

- Delete the `EDGE` constant and its doc comment.
- In `handlePointerMove`, delete the whole `const rect = ...` / `const outside = ...`
  / `roomRef.current?.setDiscarding(outside)` block. The handler keeps only
  `pointerHover` and `pointerMove`.

### 2c. Update the overlay wording

The overlay in `PetHabitat` reads "Drag to the edge to remove". Change the two
strings to match the new gesture:

- idle: `Lift it out of the room to remove`
- `status.discarding`: `Let go to put it away`

### Verify

- With edit mode on, grab a prop and drive the pointer to a **front corner**;
  assert `room.isDiscarding === false` throughout.
- Drive it up past the back wall until `room.world.manipulator` reports a lift
  above `WALL_TOP_Y`; assert `room.isDiscarding === true`, then release and
  assert the entity is gone from `room.entities`.

---

## Task 3 — deleting an object must survive a refresh

### The actual bug

`world/environments/Farmhouse.ts` exports `props` (`PROPS` + `WALL_PROPS`), and
`PetRoom.enterEnvironment()` runs `for (const prop of environment.props) this.addProp(prop)`
on **every** construction, unconditionally. Deleting `prop-bookshelf` removes it
from the scene and the arrangement save correctly omits it — and then the next
page load furnishes the room from the environment again and it is back.

User-added objects (ids like `object-chair-…`) do not have this problem: they
exist only as `EnvironmentObject` rows, so omitting them from the save is enough.

So the fix is a record of *deliberate removals* for environment props.

### Decision: a tombstone list on `RoomStyle`

`RoomStyle` is already "everything the user has decided about the room", already
persisted to `Environment.sceneData`, and already has a normalising trust
boundary. Adding one field is additive and needs no migration.

### Files

`world/RoomStyle.ts`, `scenes/PetRoom.ts`, `features/habitat/PetHabitat.tsx`,
`features/dashboard/Dashboard.tsx`.

### 3a. The field

In `world/RoomStyle.ts`:

```ts
/**
 * Environment props the user has taken out of the room.
 *
 * The room's starting furniture is furnished by the environment definition on
 * every load (`Farmhouse.props`), so "not in the saved arrangement" cannot mean
 * "deleted" — it also means "never moved". This is the difference, and it is the
 * only thing that makes deleting a piece of the starting furniture stick.
 *
 * Ids, not indices. They come from `PlacedProp.id` (`prop-bookshelf`, …), which
 * is stable across loads because it is derived from the type.
 */
removed: string[];
```

Add `removed: []` to `DEFAULT_ROOM_STYLE`.

In `normalizeRoomStyle`, add:

```ts
removed: normalizeRemoved(record.removed),
```

with

```ts
function normalizeRemoved(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 64) continue;
    if (out.includes(entry)) continue;
    out.push(entry);
    // A room cannot have more starting furniture than this, so a longer list is
    // a corrupt document rather than a thorough user.
    if (out.length >= 64) break;
  }
  return out;
}
```

In `sameRoomStyle`, add the comparison:

```ts
a.removed.length === b.removed.length &&
a.removed.every((id, index) => id === b.removed[index]) &&
```

### 3b. **The trap** — do not let a removal re-dress the room

`PetRoom.setStyle` computes
`const redress = !sameRoomStyle({ ...this.style, lightsOn: merged.lightsOn }, merged);`
— i.e. "anything but the light switch changed, so rebuild the scenery". Once
`removed` is part of `sameRoomStyle`, deleting a chair would tear down and
cross-fade the entire room.

`removed` is read exactly once, when the environment is furnished. Exclude it the
same way `lightsOn` is excluded:

```ts
const redress = !sameRoomStyle(
  // Neither the light switch nor the tombstone list changes what the room is
  // made of: one composes with the hour, the other was already applied when the
  // environment was furnished. Rebuilding for either is a visible cross-fade
  // for no visible reason.
  { ...this.style, lightsOn: merged.lightsOn, removed: merged.removed },
  merged,
);
```

### 3c. Skip removed props when furnishing

In `PetRoom.enterEnvironment`:

```ts
const removed = new Set(this.style.removed);
for (const prop of environment.props) {
  if (removed.has(prop.id)) continue;
  this.addProp(prop);
}
```

### 3d. Report the removal upward

Add a scene option beside `onWallDecorChange` (mirror it exactly — same shape,
same reasoning, so there is one pattern for "the room changed something the page
owns"):

```ts
/** A starting prop was taken out; the caller owns saving `RoomStyle`. */
onRemovedChange?: (removed: string[]) => void;
```

Store it as `private onRemovedChange?: (removed: string[]) => void;` and assign it
in the constructor next to `this.onWallDecorChange = options.onWallDecorChange;`.

In `PetRoom.discardObject(entity)`, after the existing `this.onObjectRemoved?.(id)`:

```ts
// Only the starting furniture needs a tombstone. Anything the user added exists
// solely as a saved row, so leaving it out of the arrangement is already enough.
const isStartingProp = this.environment.props.some((prop) => prop.id === id);
if (isStartingProp && !this.style.removed.includes(id)) {
  const removed = [...this.style.removed, id];
  this.style = { ...this.style, removed };
  this.onRemovedChange?.(removed);
}
```

Note the local `this.style` update: the scene must not wait for the round trip
through React before its own `sameRoomStyle` checks agree.

### 3e. Wire it through

`features/habitat/PetHabitat.tsx` — in the `new PetRoom(...)` options, beside
`onWallDecorChange`:

```ts
onRemovedChange: (removed) => onRoomStyleChangeRef.current({ removed }),
```

Nothing else is needed: `useRoomStyle.update` already normalises, debounces and
saves, and `Dashboard` already passes `room.update` in.

### Verify

1. `window.__reset()`, reload.
2. Enable edit mode, lift `prop-bookshelf` out of the room, release.
3. Assert `window.__store().sceneData.removed` contains `"prop-bookshelf"` (allow
   ~1 s for the debounce; `useRoomStyle`'s `SAVE_DELAY` is 700 ms).
4. Reload the page. Assert `window.__petRoom.entities.has('prop-bookshelf') === false`.
5. Delete a *user-added* object (add a chair from the Room panel first) and
   confirm after reload that it is gone **and** that `removed` did not grow.

---

## Task 4 — wall decor: delete by dragging up, and more hanging space

### 4a. More rows

`world/WallGrid.ts`: change `export const WALL_ROWS = 3;` to `4`.

**Do not use 5.** Measured on the current projection: the back wall's floor line
is at screen y = 390 in a 720-tall room image, the 3-row top is at y = 125, a
4-row top is at y = 62, and a 5-row top is at y = 0 — exactly the top edge of the
image, with no margin for pieces whose art overflows its cell (`vines`, `bunting`
hang below and above their box). 4 rows leaves 62 px of plaster above the top
row.

Update the ASCII diagram in that file's header comment (it draws three rows) and
the sentence "How many rows of hanging space there are."

Nothing else needs changing: `normalizeWallFootprint`, `clampAnchor`,
`occupiedWallCells` and `WallGuide`'s lattice loop all read `WALL_ROWS`.

`normalizeRoomStyle`'s decor clamp uses `WALL_ROWS - size.rows`, so existing
saved decor keeps its cell and simply gains headroom above it.

### 4b. Delete by dragging up

The wall drag already snaps through `snapWall`, which clamps into the grid. To
delete, detect that the pointer is above the grid **before** the clamp.

In `PetRoom.wallDragMove`, `const wall = unprojectWall(point.x, point.y);` gives
the unclamped wall-space point. Add to the drag state:

```ts
// Above every row of hanging space: the piece is being lifted off the wall
// rather than moved along it. Only meaningful for a piece that is already hung —
// dragging a new one off the top is simply a drag that never landed.
drag.discarding = drag.existingId !== null && wall.y > WALL_TOP_Y;
```

Add `discarding: boolean` to the `wallDrag` field's inline type (initialise
`false` in `wallDragStart`).

Feed it to the guide so the user can see it. `WallGuide.update` already draws the
refusal in `PALETTE.punch` when `blocked` is true and tints the preview art — pass
`blocked: drag.blocked || drag.discarding` to reuse that exact treatment rather
than inventing a second red.

In `PetRoom.wallDragEnd`, before the existing `if (!drag || !drag.anchor || drag.blocked) return;`:

```ts
if (drag?.discarding && drag.existingId) {
  const next = this.style.decor.filter((item) => item.id !== drag.existingId);
  this.emitSound('prop-place', 0.5, { x: 0, y: WALL_TOP_Y, z: 0 });
  this.onWallDecorChange?.(next);
  return;
}
```

`onWallDecorChange` already routes to `onRoomStyleChange({ decor })` in
`PetHabitat`, which saves. No new persistence path.

Import `WALL_TOP_Y` in `PetRoom.ts` (same import added in Task 2).

### Verify

- `window.__petRoom.style.decor` before/after. Pick up an existing piece with
  `pickWallDecorAt`, call `wallDragStart(kind, id)`, `wallDragMove` at a canvas
  point above the wall top, assert the guide shows blocked, `wallDragEnd`, then
  assert the piece is gone from `decor` and, after ~1 s, from
  `window.__store().sceneData.decor`.
- Assert a **new** piece from the palette dragged to the same place simply does
  nothing (no crash, no phantom delete).

---

## Task 5 — wall decor refuses occupied cells

### Current behaviour

`PetRoom.wallDragMove` sets `drag.blocked = cells.some((key) => reserved.has(key))`
— reserved means the window only. Occupied cells are shaded but a drop on them
*succeeds* and silently takes the other piece down (`placeWallDecor` resolves the
clash). The requirement is that occupied behaves like the floor: red, and refused.

### Change

In `PetRoom.wallDragMove`, compute the occupied set once and fold it in:

```ts
const occupied = occupiedWallCells(this.style.decor, drag.existingId ?? undefined);
const cells = wallCells(drag.anchor, snapped.footprint).map(wallCellKey);

// Occupied is a refusal now, not a takeover. A drop that silently removed
// somebody else's picture is the one wall interaction with no undo.
drag.blocked = cells.some((key) => reserved.has(key) || occupied.has(key));
```

and pass `occupied: new Set(occupied.keys())` to `this.wallGuide.update(...)`
(it currently recomputes `occupiedWallCells` inline for that argument — use the
one variable so the shading and the refusal can never disagree).

### Comments to correct

Two comments now describe behaviour that no longer exists. Both must change or
they become lies:

- `PetRoom.wallDragMove`: "The pieces this one would take down are shown as taken
  rather than hidden: the drop resolves the clash by removing them…" → say that
  occupied cells are refused, and that showing them is what makes the refusal
  predictable.
- `scenes/room/WallGuide.ts`, the `occupied.has(key)` branch: "Taken, but
  takeable: dropping here takes the other piece down…" → "Taken, and refused."

Leave `RoomStyle.placeWallDecor`'s clash resolution in place — it is still the
one place a drop resolves, and it is correct for a reposition that overlaps its
own old cells. Do not delete it.

### Verify

Drag a `painting` onto a cell already holding the `shelf`: assert
`room.wallDrag.blocked === true`, release, and assert `room.style.decor` is
unchanged (same length, same ids).

---

## Task 6 — the clock becomes an ordinary wall decoration

### Why it is stuck now

The clock is not wall decor at all. It is a **physics prop**: `WALL_PROPS` in
`Farmhouse.ts` places `prop-clock` with `definition: { type: 'clock' }`, and the
catalog gives `clock` a `mount: 248` so it floats. It keeps a floor-plane collider
so the wall grid can reuse the floor's columns, and four systems have special
cases for anchored bodies (`sortKeyOf` returns `-4000 + z`, `surfaceBodyAt` skips
them, `Broadphase.interesting` never pairs them, `PetHabitat` asks
`PetRoom.pointerDown` before `pickWallDecorAt`). None of that makes it draggable,
because the wall-decor drag only knows about `RoomStyle.decor`.

### The change: move it into the wall-decor system

**Do not** try to make anchored physics props draggable. Move the clock to where
the other hanging things already live.

1. `assets/environment/walls/WallDecor.ts`
   - Add `'clock'` to `WALL_DECOR_KINDS`.
   - Add a `DECOR.clock` entry: `{ kind: 'clock', label: 'Wall Clock', note: …,
     footprint: { cols: 1, rows: 1 }, fill: 0.9, draw }`.
   - The `draw(halfW, halfH, palette, seed)` body must **reuse the existing
     artwork**, not redraw it. `assets/objects/decorations/Clock.ts` already
     exports the renderer used by `renderObject({ type: 'clock' })`. Call it and
     scale/centre the result into the `halfW × halfH` box the wall grid gives.
     Read `Clock.ts` first to see what it takes (an `ObjectRenderContext`) and
     build that context from `OBJECT_COLORS.clock` plus the seed.
   - The clock's hands move (`assets/objects/ObjectLife.ts` drives them via
     `updateLife`). Wall decor is drawn once into the wall container and is not
     ticked. **This is the one real loss.** Two acceptable outcomes, pick the
     first: (a) the wall clock is drawn with static hands showing the current
     time at build time — the wall is rebuilt whenever `RoomStyle` changes, and a
     clock that is right when you look at it is enough; (b) if you want it live,
     wire `createWalls` to return the decor containers and have `PetRoom.update`
     pass them to `updateLife` — only do this if (a) is rejected in review.
     Whichever you choose, write the reason in the `draw` doc comment.

2. `world/environments/Farmhouse.ts`
   - Delete the `WALL_PROPS` array and the `prop-clock` entry entirely, and change
     `props: [...PROPS, ...WALL_PROPS]` to `props: PROPS`.
   - Delete the comment block above `WALL_PROPS` ("The clock is the one prop that
     does not stand on the floor…").

3. `world/RoomStyle.ts` — add the clock to `DEFAULT_ROOM_STYLE.decor` at the cell
   it used to occupy so a new room still has one:
   ```ts
   { id: 'decor-clock', kind: 'clock', col: 6, row: 1 },
   ```
   Check it does not collide with the existing `decor-painting` (col 4, row 2) or
   `decor-shelf` (col 8, row 1) — col 6 row 1 is clear of both.

4. `assets/objects/ObjectCatalog.ts` — remove the `clock` row from `OBJECT_TRAITS`
   and `OBJECT_COLORS`, and `'clock'` from `OBJECT_TYPES`; remove the `clock`
   entry from the renderer map in `assets/objects/ObjectRenderer.ts`. Keep
   `assets/objects/decorations/Clock.ts` — the wall-decor `draw` now imports it.
   - **Before deleting**, grep for `'clock'` across `src/` and fix every hit.
     `ObjectLife.ts` and `PetRoom.onObjectEvent` reference the clock's `chime`
     event; that path dies with the physics prop. Remove the now-unreachable
     branch in `onObjectEvent` **only if** grep proves the music box does not also
     emit `chime` — it does, so keep `onObjectEvent` and only remove clock-specific
     code.
   - Saved `EnvironmentObject` rows of type `clock` become unknown types.
     `Dashboard.isKnownType` already filters those out silently, which is the
     designed behaviour for a retired type — no migration needed.

5. If `mount` is now unused by every remaining trait, leave the field and its
   handling in place (it is a general capability, not clock-specific), but say so
   in a one-line comment on the field.

### Verify

- The clock appears on the wall on a fresh `window.__reset()` + reload.
- `pickWallDecorAt` over the clock returns `{ kind: 'clock', id: 'decor-clock' }`.
- It can be dragged to another cell and the move persists to
  `window.__store().sceneData.decor`.
- It can be dragged up and deleted (Task 4).
- Snapshot the room and `Read` it: the clock must be the same size and in the
  same place as before this task.

---

## Task 7 — toys stay visible behind objects, at lower opacity

### Requirement

A toy that has rolled behind the bed must still be locatable: drawn *over* the
occluder at reduced opacity, so its position reads without pretending it is in
front.

### Files

`scenes/PetRoom.ts` (and `scenes/room/BodyView.ts` only if you need a helper).

### Approach

`sortKeyOf` decides draw order from depth; leave it alone. Add a per-frame pass
that finds occluded toys and lifts *those* above their occluder with reduced
alpha.

Add module constants:

```ts
/** How visible a toy is when something is standing in front of it. */
const GHOST_ALPHA = 0.45;
```

Add a method:

```ts
/**
 * Toys the furniture is standing in front of, and what they have to be drawn
 * above to be seen.
 *
 * A ball that has rolled behind the bed is sorted correctly and therefore
 * invisible, which is correct perspective and a bad game: the one thing the
 * user wants from a toy is to know where it is. So an occluded toy is drawn
 * over its occluder at `GHOST_ALPHA` — present, clearly behind, findable.
 *
 * Only toys, and only against things that are actually in front of them, so the
 * cost is a few dozen rectangle tests a frame rather than a full sort.
 */
private occludedToys(): Map<string, number> {
  const ghosts = new Map<string, number>();

  for (const toy of this.entities.values()) {
    if (!toy.isToy) continue;

    const toyKey = sortKeyOf(toy.body, null);
    const toyRect = screenRectOf(toy.body);
    let cover = -Infinity;

    for (const other of this.entities.values()) {
      if (other === toy || other.id === 'pet') continue;
      // Decals and wall decor are not "in front of" anything.
      if (other.body.collider.height <= 0 || other.body.anchored) continue;

      const otherKey = sortKeyOf(other.body, null);
      if (otherKey <= toyKey) continue;
      if (!overlaps(toyRect, screenRectOf(other.body))) continue;

      cover = Math.max(cover, otherKey);
    }

    if (cover > -Infinity) ghosts.set(toy.id, cover);
  }

  return ghosts;
}
```

Add a small `overlaps(a: ScreenRect, b: ScreenRect): boolean` helper in
`scenes/room/BodyView.ts` next to `screenRectOf` and export it — that file already
owns screen-rectangle geometry, and `pickAt` in it can use the same helper.

In `PetRoom.update`, compute `const ghosts = this.occludedToys();` immediately
before the existing `for (const entity of this.entities.values()) { entity.motion.update(...); this.syncEntity(entity); }`
loop, and pass it: `this.syncEntity(entity, ghosts)`.

In `syncEntity(entity, ghosts?)`, after the existing
`view.zIndex = sortKeyOf(body, holder);`:

```ts
const ghost = ghosts?.get(entity.id);
if (ghost !== undefined) {
  // Just in front of whatever is covering it — not on top of the whole room,
  // so a toy behind the bed still reads as being behind the bed rather than
  // floating over the creature.
  view.zIndex = ghost + 0.25;
  view.alpha = GHOST_ALPHA;
} else if (view.alpha !== 1) {
  view.alpha = 1;
}
```

**Do not** use `tint` for this — `refusedDrop` already owns tint, and a
half-transparent red plush would be two messages at once.

**Do not** apply it to a toy that is currently held (`body.held`) — it is in the
user's hand and in front by definition. Add `if (toy.body.held) continue;` to the
outer loop.

### Verify

Place a toy behind the bed (`room.world.place(ball.body, { x: bedX, y: 0, z: bedZ - 40 })`),
pump the ticker, and assert `ball.view.alpha === 0.45` and
`ball.view.zIndex > bed.view.zIndex`. Move it to the front of the room and assert
alpha returns to 1. Snapshot and `Read` the image to confirm it reads as intended.

---

## Task 8 — remove the rug

Remove the type entirely, not just the starting placement — it should not be in
the catalog either.

1. `world/environments/Farmhouse.ts` — delete `at(3, 3, 'rug', 44)` and the
   three-line comment above it.
2. `assets/objects/ObjectCatalog.ts` — delete `'rug'` from `OBJECT_TYPES`, the
   `rug` row from `OBJECT_TRAITS`, and the `rug` row from `OBJECT_COLORS`. Delete
   the `rug 3 x 2 cells` line from the header comment at the top of the file.
3. `assets/objects/ObjectRenderer.ts` — delete `rug: createRug,` from the
   renderer map and the now-unused import.
4. Delete `assets/objects/decorations/Rug.ts`.
5. **Leave `sortKeyOf`'s `collider.height <= 0` decal branch in place.** It is a
   general rule about ground decals, not a rug special case; a comment saying it
   currently has no members is fine, deleting it is not.
6. Grep `'rug'` across `src/` afterwards. Prose mentions in unrelated doc comments
   (`Critters.ts`, `Surface.ts`, `PetRoom.ts` line ~1484) are illustrative English —
   reword them so they do not name an object that no longer exists.
7. Saved rows of type `rug` are filtered by `Dashboard.isKnownType`, so no
   migration is needed. Say so in the commit message.

### Verify

`npx tsc -b` clean; the Room panel's Decor grid no longer offers a rug; a fresh
room renders without one; `window.__reset()` + reload does not throw on a saved
store that still contains a rug row.

---

## Task 9 — the goal-completion celebration

### What is actually known

Reproduced on the preview page: completing a goal **does** show the modal with
"…is proud of you" and the real "+N Happiness", and the room canvas survives
(928×522, scene root intact). No console errors beyond a pre-existing PixiJS
`addChild` deprecation warning from `WallDecor.ts`.

What could **not** be confirmed is whether the creature is drawn inside the modal,
because `features/pets/DancingPet.tsx` creates an `Application` with the default
`autoStart: true` and therefore renders only on `requestAnimationFrame` — which
never fires in the backgrounded preview tab. That is also the most likely cause of
the reported "doesn't show the pet": **the component has no deterministic first
frame.** Anything that delays or suppresses rAF (a background tab, a throttled
window, a slow init resolving after the modal's 3.2 s auto-close) leaves a blank
canvas, and the modal is only up for 3.2 s.

### The fix: make it draw on its own schedule

Rewrite the effect in `features/pets/DancingPet.tsx`:

1. `await instance.init({ ..., autoStart: false })`.
2. After `instance.stage.addChild(pet.root)` and the animation setup, call
   `animation.update(0)` then **`instance.render()` immediately**, so a correct
   first frame exists before any tick.
3. Drive the dance from an explicit `Ticker` the component owns:
   ```ts
   const ticker = new Ticker();
   ticker.add(() => {
     animation.update(ticker.deltaMS);
     instance.render();
   });
   ticker.start();
   ```
   Import `Ticker` from `pixi.js`.
4. In the cleanup, `ticker.stop(); ticker.destroy();` **before** `app.destroy(...)`.

Rationale to put in the doc comment: a modal that lives for three seconds cannot
depend on someone else's animation loop having started. Rendering once on init is
what guarantees the creature is visible even if the first tick never arrives.

### Also check, in this order

1. **Third WebGL context.** The page already holds two (`PetRoom`, and the shared
   offscreen previewer in `lib/preview.ts`). `DancingPet` is a third, created and
   destroyed per completion. Confirm `app.destroy(true, { children: true })` runs
   on unmount — if contexts leak, after ~16 completions the browser drops the
   oldest and **the room goes blank**, which matches "checking a goal breaks the
   room UI". Verify by completing 20 goals in a loop and asserting
   `window.__petApp.renderer` is still live and the room still renders.
2. If contexts do leak, the fix is not to add a pool: give `DancingPet` the same
   treatment `lib/preview.ts` already uses — one module-level `Application`,
   created on first use, reused by every celebration, never destroyed between
   them. Follow that file's structure exactly.
3. Only after 1 and 2: if the room still breaks, capture
   `window.__petApp.renderer.gl.isContextLost()` and the console at the moment of
   breakage before changing anything else.

### Verify

- Complete a goal; pump `window.__petApp.ticker`; then read the modal canvas's
  live GL buffer (`toDataURL` is blank without `preserveDrawingBuffer`):
  ```js
  const canvas = document.querySelector('[role="status"][aria-live="polite"] canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const px = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let opaque = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 8) opaque++;
  ```
  Assert `opaque > 200`. With the explicit render on init this must pass **without**
  pumping any ticker at all — test that case too.
- Complete 20 goals in sequence; assert the room canvas still renders (snapshot it
  and `Read` the file) and `document.querySelectorAll('canvas').length` returns to
  its baseline after each modal closes.

---

## Documentation to update when done

`Docs/AGENTS.md` requires this; do not skip it.

- `Docs/room-and-objects.md` §7c — currently documents removal as a drag to the
  frame's *edge*. Rewrite for the lift-out gesture, and add the edit-mode lock
  (objects immovable outside edit mode, tap to twitch, taps raise the creature's
  interest). Add the `RoomStyle.removed` tombstone and **the redress trap** from
  Task 3b.
- `Docs/room-and-objects.md` — wall grid section: 4 rows, occupied cells refused,
  decor deletable by dragging up, and the clock now being ordinary decor.
- `Docs/theme-and-design.md` §20.x — the toy-ghosting rule (visual hierarchy).
- `Docs/InitialDB-plan.md` / `Docs/API-endpoints/11-schema-additions.md` — no
  changes; `removed` lives inside the existing `Environment.sceneData` JSON and
  adds no column. State that explicitly rather than leaving it unmentioned.

## Definition of done

- [ ] `npx tsc -b` and `npx eslint src` clean from `frontend/`.
- [ ] `npx vite build` succeeds.
- [ ] Every "Verify" block above executed on `app-preview.html`, with the actual
      observed values reported — not "should work".
- [ ] A snapshot of the room read back and visually checked after tasks 6, 7 and 8.
- [ ] Docs updated as listed.
- [ ] No unrelated files modified.
