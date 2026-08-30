# ROOM, GRID & OBJECTS

**Purpose:** the reference for how the room is measured, how things are placed in
it, how objects are built, and how the user's choices about it are saved.

Read this before touching anything in `frontend/src/world/`,
`frontend/src/assets/objects/`, `frontend/src/assets/environment/`, or the
placement code in `frontend/src/scenes/PetRoom.ts`.

It sits alongside, not instead of:

| Doc | Covers |
|---|---|
| `theme-and-design.md` | how things should *look* |
| `animation-approach.md` | how things should *move* |
| `pet-anatomy.md` | the creature |
| this | how the room is *measured*, and what is in it |

---

## 1. The one rule

> **An object's size is its grid footprint, and nothing else.**

A chair is 1×1 cells. A bed is 2×1. Every other number about an object — how
wide it is drawn, how deep its collider is, what its contact shadow measures,
where the drag guide highlights — is *derived* from those two integers.

This is not a style preference. It is the fix for a specific class of bug that
kept coming back, described in §3.

---

## 2. The two grids

### 2.1 The floor grid — `world/FloorGrid.ts`

```text
TILE            120 world units, square
GRID_COLUMNS    10        (floor(1280 / 120))
GRID_ROWS       5         (round(600 / 120))
GRID_ORIGIN     (40, 0)   centred horizontally in a 1280-wide room
GRID_BOUNDS     x 40..1240,  z 0..600
```

Three things about it that look like bugs and are not:

**It is inset from the side walls.** The room is 1280 wide and ten whole
120-unit columns are 1200, so there is a 40-unit margin at each side. That strip
is the floor under the skirting board. Drawing seams across it would advertise
cells that do not exist.

**It foreshortens toward the back.** Cells are square *on the floor*. The camera
squashes the far ones exactly as much as it squashes everything else standing on
them. A grid built to look square on screen would have to grow its rows toward
the back, and a floor whose tiles all measure the same on screen reads as flat —
it fights the converging walls rather than agreeing with them. **The wall grid is
the place where square is visibly square** (§2.2), because the back wall sits at
one depth.

**The tile size is chosen against the creature, not the room.** The default rig
is about 170 units across, so a cell is a bit more than one creature: a chair is
a little smaller than the pet, a bed is visibly bigger, a shelf towers over it.
The grid was briefly 100 and the room read as a doll's house the creature had
been dropped into — every proportion was internally consistent and the whole
thing was wrong, because the only ruler a viewer has is the character.

`GRID_BOUNDS` **is** the room's physics bounds
(`world/environments/Farmhouse.ts`). They used to be two different rectangles,
which is exactly how an object could be legally placed somewhere the grid had no
cell for it.

### 2.2 The wall grid — `world/WallGrid.ts`

```text
WALL_COLUMNS    = GRID_COLUMNS      the same columns as the floor
WALL_ROWS       4
WALL_CELL       = TILE              square, and square on screen too
WALL_BASE_Y     150                 above the furniture, clear of the skirting
```

Wall columns *are* floor columns. A painting above the bookshelf is above the
bookshelf because both are anchored to column three.

Four rows, not three — measured against the projection rather than chosen
freely. At 3 rows the top of the grid sits at screen y=125 in the 720-tall room
image; at 4 it is y=62; at 5 it would be y=0, the very top edge of the image,
with no margin for a piece like `vines` or `bunting` whose art overflows its own
cell. 4 is as far as this room goes before the grid meets the ceiling.

The window is a citizen of this grid (2×3 cells), and so is every wall
decoration — **including the clock**, which used to be the one exception (see
below). Nothing on the back wall is positioned by a magic number any more.

**The lattice is visible while you are hanging something, and only then.** The
floor draws its grid into the boards, so the cells a chair can stand on are
visible before the chair is picked up; plaster has no such thing, so the wall
grid used to be invisible until *after* the piece was committed, which is what
made hanging a picture feel like choosing a box at random. `WallGuide` draws all
`WALL_COLUMNS × WALL_ROWS` cells while a drag is live and takes them away again
on release — a permanent lattice turns the wall into graph paper.

**A hole in the wall is on the grid but is not hanging space.** The window's
cells come from the environment (`EnvironmentDefinition.wallReserved`), are
struck through in the guide, and refuse a drop — before this, a painting could
be hung across the glass. Stated as areas rather than checked for by name, so a
room with two windows and a door costs three entries and no conditionals.

**An occupied cell refuses a drop; it no longer resolves one.** Dropping a new
piece on a cell that already holds something used to silently take the older
piece down (`RoomStyle.placeWallDecor`'s clash resolution) — the one wall
interaction with no undo. `PetRoom.wallDragMove` now folds occupied cells into
the same `blocked` flag the window uses, so the cell shades and the drop is
refused, the same red as any other refusal. `placeWallDecor`'s own
clash-resolving code is still there and still correct for a *reposition* that
overlaps a piece's own old cells — it is simply no longer reachable for a
genuine collision between two different pieces, because the drag refuses that
before a drop is ever attempted.

**Deleting a hung piece is the wall's version of lifting something out of the
room.** Drag an already-hung piece — `existingId` is set — above every row of
hanging space (`wall.y > WALL_TOP_Y`, checked in `PetRoom.wallDragMove`) and
letting go removes it from `RoomStyle.decor` rather than hanging it. Shown in
the same red as a blocked drop; a *new* piece from the palette dragged off the
top has simply not landed anywhere, which is indistinguishable from any other
drag that never found a cell.

**Anchored bodies are background, everywhere — a rule with no current members.**
Wall-mounted *physics props* keep a floor-plane collider so the wall grid can
borrow the floor's columns, and every system that ever treated that collider as
furniture produced a bug:

| System | What it must do with `body.anchored` | The bug when it didn't |
|---|---|---|
| `PhysicsWorld.surfaceBodyAt` | skip it | a prop dropped on an anchored body's cell settled on *top* of it, hundreds of units up |
| `Broadphase.interesting` | never pair it | a thrown toy ricocheted off invisible geometry two hundred units up the plaster |
| `BodyView.sortKeyOf` | sort it on the wall plane | it competed for depth with whatever stood on the cell beneath it |
| `PetHabitat` pointer-down | ask the room *first*, the wall second | a bookshelf's top overlaps wall row 0 on screen, so clicking the shelf picked up the painting behind it |

The clock was the only catalog entry that ever set `mount` (and therefore the
only body `anchored: traits.mount !== undefined` ever produced) — it hangs on
the wall-decor grid now, alongside the painting and the shelf, rather than as a
physics prop with a fixed-height collider (§7c). Nothing in the catalog sets
`mount` today, so `anchored` is currently always `false` and this whole table is
dormant rather than deleted: the four fixes stay in place for whatever next
wants a floor-plane collider anchored at a height instead of standing on the
ground.

---

## 3. Placement: why it snaps the way it does

The grid went through three shapes. The first two failed, and their failures are
the reason for the current design.

```text
1. three depth lanes    depth was the axis people wanted control over, and it
                        was the one with almost none

2. snap-then-clamp      snap the object's CENTRE to a tile, then clamp it back
                        inside the room by its own half-extents.
                        The two steps disagreed — the clamp knew nothing about
                        cells — so a bed snapped to the last column and was
                        then shoved ~100 units back off it. Anything larger
                        than a chair could not reach the walls or the corners
                        at all. THIS IS THE BUG THIS SYSTEM EXISTS TO FIX.

3. snap the RECTANGLE   what snaps is the cell rectangle, clamped in cell
                        units. It cannot produce an illegal placement, so
                        there is nothing left to correct afterwards.
```

`snapFootprint(x, z, footprint)` is the whole system:

```text
col = clamp(round((x - originX) / TILE - cols / 2), 0, COLUMNS - cols)
row = clamp(round((z - originZ) / TILE - rows / 2), 0, ROWS - rows)
centre = origin + (anchor + size / 2) * TILE
```

An even-width object therefore centres on a cell *boundary* and an odd-width one
on a cell *centre*. Both are correct; both reach the wall.

```text
     1x1 chair                     2x1 bed
     ┌───┬───┬───┐                 ┌───┬───┬───┐
     │   │   │ ▓ │  centre on      │   │ ▓▓▓▓▓ │  centre on the seam
     └───┴───┴───┘  a cell centre  └───┴───┴───┘  between two cells
                    ↑ reaches the wall in both cases
```

### Rules for anything touching placement

- **Never clamp a placement after snapping it.** If a clamp is needed, the
  footprint is wrong.
- **The drag guide shows the snapped result, not the pointer.** `DepthGuide`
  is fed the same `snapFootprint` output the drop will use. A guide that shows
  where the cursor is rather than where the object will land is a lie, and it is
  the lie users notice first.
- **The status line, the guide and the drop all call the same function.** If
  they disagree, one of them is computing its own answer.
- **Physics is never snapped.** A creature walking to a ball must be able to be
  halfway there, and a ball snapping to a cell mid-bounce would look broken.
  Snapping applies only to *placement* — something set down deliberately.
- **A footprint is checked by the cell, never by its centre point.** An
  even-width footprint centres on the *seam* between its two cells, so a bed
  dropped across a lamp had its one test point land in the gap between the two
  things it was supposed to notice, and went straight through it.
  `stackBlockedAt` walks every cell of the placement.

### What may be set down on what

`ObjectCatalog.acceptsPropsOn(traits)` is the whole rule, and it is derived from
`surface.kind` rather than authored beside it — a **tabletop** or a **shelf** is
a surface *for things*, so a plant pot may go on the table. A bed, a seat or a
container is a surface for the *creature*, and something with no `surface` at all
(a lamp, a plant, a clock) is not a surface at all. Both refuse.

A refusal is said twice, in the same colour (`PALETTE.punch`):

```text
the floor guide   the cells go red instead of cream          DepthGuide.invalid
the object        the carried thing itself goes red          PetRoom.refusedDrop
```

The object is the louder of the two on purpose — it is what the user is looking
at while they decide, and a marking on the floor is a caption underneath it.

The check fires on the *gentle place* path (`settlePlacement`) only. A toy thrown
hard enough to register as a throw skips grid placement entirely by design and
may still land on anything by ordinary collision — snapping, and therefore
stacking rules, apply to something set down deliberately.

---

## 4. The object catalog — `assets/objects/ObjectCatalog.ts`

One row per object type. Every other system reads its answer from here.

```ts
{
  label, category,                 // inventory
  footprint: { cols, rows },       // THE size
  fill,                            // how much of its cells it claims, 0..1
  height,                          // world units
  round,                           // cylinder collider instead of a box
  body, mass, restitution, friction, solidity, drag, rolls,
  surface,                         // what can rest on it, and how nice that is
  mount,                           // wall decor: height above the floor
  home,                            // which depth band a NEW one appears in
  affordances,                     // what the creature can do with it
}
```

Derived, and never authored separately:

```text
renderBoxFor(traits)   -> { width, depth, height }  world units
colliderFor(traits)    -> the physics volume, from the same box
```

`fill` defaults to 0.92 so neighbouring objects have a visible gap rather than a
shared edge — a room where the furniture touches reads as a packed shelf.

### Adding an object

1. One row in `ObjectCatalog.ts`.
2. One renderer file under `assets/objects/{furniture,decorations,play,toys}/`.
3. One line in the `RENDERERS` map in `ObjectRenderer.ts`.
4. If it should be obtainable, one row in the reward pool
   (`lib/mock/world.ts`) until the real inventory endpoints exist.

If adding one requires editing a conditional anywhere else, **the catalog row is
missing a field** — fix the data model, not the conditional.

### What a definition may NOT contain

`ObjectDefinition` (the serializable half, destined for the database) carries
`type`, three colours and a `seed`. It has **no `scale`**. Size is a property of
the type, not of the instance: a chair the user could scale to 1.4 is a chair
that no longer fits the cell it stands on, and the room goes back to being a pile
of things at arbitrary sizes.

---

## 5. Drawing an object

Renderers draw in **world units**, anchored at the floor contact point, with `y`
running negative upward. They are handed `width`, `depth` and `height` and must
stay inside that box. The scene multiplies the whole container by the camera's
scale for its depth, so a renderer never has to know how far into the room it is.

The shared language is `assets/objects/shared/Surface.ts`, and it is the
furniture's version of the rule the creature system already follows
(`theme-and-design.md` §9): one base colour in, a five-step tone ramp out, and a
fixed budget of shapes on top.

```text
base shape        filled with the tone ramp as a soft vertical gradient
+ one top face    the plane the light lands on, foreshortened by the camera
+ one gloss       a single lighter shape, upper left — ALWAYS upper left
+ one shade       a single darker shape along the lower edge
+ a contact shadow
```

A third flat shape on a form means the form is not reading and should be
redrawn.

Helpers worth knowing before writing anything new:

| Helper | For |
|---|---|
| `FLOOR_SQUASH` | how flat a floor-plane extent is drawn, **0.42** everywhere |
| `floorOval`, `floorSlab` | any horizontal plane: tabletop, basket mouth, bowl rim |
| `formFill`, `topFill` | the ramp for an upright face and for an upward one |
| `slab` | a horizontal slab with a visible top face and thickness |
| `post` | a tapered leg, stem or upright |
| `cushion` | anything stuffed |
| `grain`, `weave` | material evidence — six strokes, not thirty |
| `glowPool`, `glowBall` | light, as stacked translucent shapes |
| `groundShadow` | a contact shadow sized from the footprint |

### Traps that have already cost time

- **A pivot has to be paid back by the position.** `PetRoom.syncEntity` puts the
  art container's pivot four tenths of the way up the body, because that is what
  a tumble should rotate about — and a Pixi container draws its content at
  `position - pivot`, so moving the pivot moves the artwork with it. It did not
  pay it back, so **every object was drawn `height * 0.4` below its own contact
  point**: the shadow and the drop guide sat on the cell the grid had chosen
  while the artwork stood a row or more in front of it, the hit rectangle stayed
  with the body so clicking a tall object missed it, and nothing tall could be
  seen to reach the back wall however honestly it had been placed there. It cost
  the bookshelf 57 screen pixels at the back of the room, against a row that is
  39 pixels deep. This read for a long time as "the grid does not work" rather
  than as one drawing bug, which is the real lesson: **when placement looks
  wrong, check that the artwork is where the body is before touching the grid.**
- **`ellipse()` starts a new subpath.** `moveTo → lineTo → ellipse → fill` does
  not close into one shape; it leaves the straight sides unfilled. Both the lamp
  foot and the aquarium stand rendered as floating shapes because of this. Build
  a closed path by hand, or union several complete subpaths under one `fill`
  (which is how `Tunnel` makes a capsule).
- **Draw order is the whole picture.** The bowl's rim was added after its food
  and painted straight over it; the bowl was permanently empty.
- **Anything drawn beyond a container's silhouette needs a mask.** The fish
  bowl's gravel spread out past the bottom of the glass until the contents were
  clipped to the globe.
- **Never animate the object's root transform.** The scene owns it — that is
  what puts the object in perspective. Anything an object animates about itself
  lives one level down.
- **Objects at the same width stacked vertically read as layers.** The first bed
  was a headboard, frame, mattress and blanket at the same width, and it read as
  a layer cake. Parts have to differ in the *plan* as well as in height.

### Object life and state

```text
ObjectLife    small permanent motion: the plant's sway, the lamp's flicker.
              `attachLife(view, { update, drain })`. `drain` is how an object
              tells the room something happened (the music box starting).
              Ticked once a frame for everything in `PetRoom.entities` — which
              is why the clock does not use this any more now that it hangs on
              the wall-decor grid rather than standing as a physics prop
              (§2.2, §7c): nothing ticks a wall decoration every frame, so its
              one caller poses the hands once, at build time, by calling
              `updateLife` itself rather than being called by the room.
ObjectState   the small amount an object remembers: how full the bowl is.
              `attachState` / `readState`, asked for BY SHAPE
              (`SuppliedState`), never by knowing which object it is.
```

Neither is persisted. An empty bowl fills itself while you are away; that is
cheaper than a schema and reads the same.

---

## 6. Affordances — how objects give the creature something to do

**The problem:** a branch in the brain per object type. "If there is a scratching
post and the creature is bored, go and scratch it." Four objects in, that brain
is a switch statement wearing a personality, and every new piece of furniture is
a change to the creature's mind.

**The design:** an object states what it offers; the brain has exactly one
behaviour for using things.

```text
simulation/Affordances.ts     the vocabulary — what a creature can want
        ^
        | (the catalog depends on the simulation, not the reverse:
        |  what a creature is capable of wanting is a fact about the
        |  creature; furniture only says which of those it satisfies)
        |
assets/objects/ObjectCatalog.ts   which objects offer what
        |
        v
simulation/PetBrain.ts        pickAffordance() -> behavior 'use'
        |
        v
animation/clips/Interactions.ts   one looping clip per kind
```

Kinds so far: `eat`, `scratch`, `dance`, `watch`, `hide`.

The whole decision is one score:

```text
score = appeal x appetite x supply x (900 / (900 + distance))
```

- `appeal` and `supply` come from the object. `supply` is the part the catalog
  cannot know — a bowl empties.
- `appetite` comes from the needs (`appetiteFor`), and it is the one place the
  mapping from need to want is written down.
- The distance constant is deliberately larger than the room, so the far corner
  is a discount rather than a refusal.

Three orderings in `select()` that were each arrived at by getting them wrong:

1. **Affordances are checked before the nap.** Low energy is what makes the
   creature both tired and hungry, so a sleep gate in front of the supper bowl
   means it never eats — it goes to bed, wakes restored, and the bowl is
   decoration for ever. An offer that *feeds energy* always beats bed; anything
   else has to be worth about twice as much when the creature is sleepy.
2. **Hiding lives inside the fear interrupt**, not below it. A frightened
   creature is not *deciding* to hide, it is bolting for the nearest hole — and
   fear decays so fast that a deliberated hide would almost never fire.
3. **The cooldown applies to appetites, not to reflexes.** A creature frightened
   twice must be able to hide twice.

### Adding an interaction

1. A kind in `AFFORDANCE_KINDS` and a case in `appetiteFor`.
2. An `affordances` entry on the object's catalog row.
3. A clip in `animation/clips/Interactions.ts` and a row in its `CLIPS` map.

Nothing in `PetBrain.select()` changes.

### Rules for interaction clips

- **Looping**, always. The creature does the thing for as long as the simulation
  says it is doing the thing; the clip's blend-out ends it.
- **The body leads and everything soft arrives late.** Ears, tail and topper are
  driven from the same wave with a phase offset. Getting this wrong is what makes
  procedural animation look mechanical, and it costs one subtraction per part.
- **Re-request the clip every frame it should be running**, don't start it once.
  Interaction clips sit below impacts on purpose, so a bump would otherwise leave
  the creature standing perfectly still for the rest of its supper. `play`
  declines while something higher-priority runs, so asking is free.
- **Never let a behaviour renew its own deadline.** The first version called
  `setHold(duration)` on every tick it was already using something, so each frame
  pushed the end a full duration into the future and the creature ate for ever.
  `beginUsing` guards against exactly this.

---

## 7. RoomStyle — what the user has decided, and keeping it

**The bug:** the hour and the paint colour were `useState` inside `PetHabitat`,
so every refresh and every fresh sign-in put the room back to a sunny ember
afternoon. A room you have decorated and cannot get back to is worse than a room
with no decoration at all, because the second one never promised anything.

**The obvious fix would have been wrong twice over:** two columns for two
settings, and then two more the next time the room gained an axis.

So the room's appearance is one serialisable value — `world/RoomStyle.ts`:

```ts
{
  ambience,   // morning | day | sunset | evening | night
  tint,       // 24-bit colour, from ROOM_TINTS
  floor,      // boards | tiles | checker | stone | plain
  wall,       // plaster | panelled | planks | brick | stripes | tile
  window,     // meadow | mountains | city | park | dungeon | ocean
  decor,      // [{ id, kind, col, row }] on the WALL grid
  lightsOn,
}
```

```text
RoomStyle          plain data. Serializable. Belongs in the database.
     |
     v
resolveMood()      what the light and the surfaces are made of
     |
     v
createScenery()    the room, rebuilt
```

- **`normalizeRoomStyle` is the trust boundary.** Every field falls back
  independently, so one bad value from the network costs one setting rather than
  the whole room.
- **Changing the style is a rebuild, not a tween.** The room is a few dozen flat
  shapes; rebuilding costs less than the bookkeeping of tweening each of them,
  and it lets a change alter *anything* rather than only what somebody remembered
  to make tweenable. Two generations cross-fade for about a second.
- **`PetRoom.setStyle(patch)` is the only entry point.** `setAmbience` and
  `setRoomTint` are thin wrappers kept for callers that only want one axis.
- **Saving is automatic and debounced** (`features/habitat/useRoomStyle.ts`),
  which is the opposite of the pet. A preset is a snapshot somebody named and an
  autosave over it would be frightening; the room is not a snapshot, it is *the
  room*, and a Save button between "I want it to be evening" and it being evening
  is an obstacle rather than a safeguard.

### Persistence

`Environment.sceneData Json` — see `API-endpoints/04-environment-endpoints.md`
§7 and `11-schema-additions.md` §3. The backend validates that it is a
*storable* document; the client decides what it *means*. Neither half knows the
other's catalog of wall textures, which is why adding a wallpaper is a frontend
change with no migration.

---

## 7b. The arrangement — what is standing in the room

`RoomStyle` is what the room is *made of*. This is what is *in* it, and it is
the other half of getting your room back rather than the one the product ships.

```text
  EnvironmentObject   key, type, col, row, definitionData   one row per object
        ↑
  PUT /environments/:id/objects        the whole list, debounced 900 ms
        ↑
  useRoomObjects       ← PetRoom.onArrangementChange (settled placements only)
```

**Cells, not coordinates.** `col`/`row` is the user's decision; a float would
only record which way the physics happened to be rounding. It also survives a
change to the tile size, which a coordinate would not. There is deliberately no
`scale` and no `rotation`: size is the footprint (§1), and what an object does
about its own axis is physics wobble rather than something anybody chose.
`object-definition.ts` drops a `scale` if one arrives.

**The whole list, every time.** Same reasoning as `/style`: the scene is always
holding a complete, settled arrangement, and asking it to work out which objects
are dirty would invent a synchronisation problem across a simulation that moves
things nobody asked it to move.

Four things here were bugs first, and each one is a rule now:

- **Snapshot when the change is reported, not when the write fires.** React
  unmounts children before parents, so on teardown the PixiJS scene is gone by
  the time the hook's cleanup runs — a lazy snapshot answers "nothing", and the
  last act of the page is to save an empty room over the one you arranged.
- **Restore through the placement queue, not by calling the scene.** The
  arrangement returns from the network long before `Application.init` resolves.
  An imperative call is handed to a scene that does not exist, and the room
  silently comes back empty.
- **A restore may have to *move* something, not only add it.** The environment
  furnishes the room with its own props (`Farmhouse.ts`) before the save
  arrives, so every one of them already exists. Skipping those — which
  `hasObject` used to do — threw away the saved position of all the starting
  furniture: move the bed, come back tomorrow, and the bed is where the product
  put it. A restore that only works for furniture the user added is not a
  restore.
- **Each placement is realised exactly once.** Re-applying the list on a later
  render would yank every piece of furniture back to where it was at load.

`settlePlacement` therefore distinguishes a *drag* from an *arrival*: a drag
that is refused is handed back to where it was picked up from; an arrival has
nowhere to be handed back to and takes the nearest free cell instead. It used to
read the drag state unconditionally, which teleported new objects to whatever
was dragged last — or to (0, 0, 0), which is not even inside the grid.

---

## 7c. Putting things in, and taking them out

**The Room panel is the object store.** There is no inventory screen. There used
to be one, and every item in it was already either furniture (which belongs in
the room) or a hat (which belongs on the creature) — so it was a list of things
you owned but could not see, and removing it lost nothing.

Adding is a tap on a catalog tile: the panel shows every `OBJECT_TYPES` entry as
a picture drawn by `renderObject` itself (`features/habitat/objectPreviews.ts`),
grouped by the category the simulation already groups them by. Each tap makes a
*new* object with a fresh id — a catalog is not a cupboard, and asking for a
second chair means a second chair rather than a refusal that the first is
already out.

**Nothing but the creature and its toys moves outside edit mode.**
`PetRoom.pointerDown` gates the grab itself: `this.editing || entity.id ===
'pet' || entity.isToy`. Furniture that shifted every time somebody meant to
throw a ball was a room nobody could leave arranged — and it made toys hard to
grab cleanly, since a drag could just as easily pick up whatever the toy was
resting against. A tap on a locked object still lands, through a small bit of
state (`PetRoom.tapped`, mirroring the drag path's own click detection) that
never touches the physics: no grab, no lift sound, nothing to release. It runs
the same `handleClick` a successful click always ran — the existing knock/shove
twitch — and additionally calls `PetBrain.noticeObject`, so repeated prodding
raises the creature's curiosity the same way a moving toy does. Enough taps
clear the curiosity gate in `PetBrain.select`, and `pickCuriosity` now prefers
whatever is already in `interests` over whatever is merely nearest — so
pointing at something by prodding it reliably sends the creature over to it,
not to a different, closer distraction.

**Removing is "Edit room" plus lifting the thing out of the room, on the
height axis — not dragging it toward an edge of the frame.**

```text
  Edit room  ──→  PetRoom.setEditing(true)
                       │
  drag a thing, then lift it above every row of wall hanging space
                       │    PetRoom.pointerMove computes carry.lift the same
                       │    way it always has (§ carryTarget) and calls
                       │    setDiscarding(carry.lift >= DISCARD_LIFT)
                       ▼
  the frame rings itself red, the caption changes, let go
                       ▼
  PetRoom.discardObject → out of the physics, out of the entity map,
                          shrink-and-fade the artwork, report it upward
```

`DISCARD_LIFT` is `WALL_TOP_Y` — the same constant the wall grid tops out at —
so the threshold is a fact about the room's geometry, not a number chosen to
feel right. This replaced an earlier version that measured the pointer against
the *frame's own screen edges*: a band 28px inside the DOM element's rect. That
band could be reached by dragging toward a front corner of the room — which is
exactly what placing a chair in a corner requires — so trying to arrange the
corner could delete the chair instead. Height cannot be reached that way: every
legal floor placement is `lift: 0` by construction, so no drag across the floor,
corner included, can ever cross the threshold.

Five things this arrangement gets right, each of which was a way to get it
wrong:

- **Edit mode is a switch, not a mode you fall into.** The two states want
  opposite things from the same gesture: normally clicking the lamp turns the
  light off, and while editing, dragging it out throws it away. A room where
  those are one gesture is a room that eats your furniture.
- **The discard test is a fact about the carried thing, not about the
  pointer's screen position.** `carryTarget` already turns pointer travel past
  the back wall into height (`lift`) for the ordinary lift-and-throw gesture;
  discarding reuses that number rather than computing a second, competing
  notion of "outside".
- **The scene decides for itself**, not the page. `PetHabitat` used to measure
  its own host element's `getBoundingClientRect()` and pass a boolean in; now
  `PetRoom.pointerMove` calls `this.setDiscarding(carry.lift >= DISCARD_LIFT)`
  directly, so there is one definition of "being discarded" and it lives next
  to the height calculation it depends on.
- **Removal is reported upward** (`onObjectRemoved`). The page holds its own list
  of what it has put in the room; a scene that quietly removed a row from under
  it would re-add the object on the next render.
- **A piece of the *starting* furniture needs a tombstone; a piece the user
  added does not.** See below.

The exit animation gates nothing: the object leaves the physics and the
arrangement immediately, and what shrinks is a picture of something that has
already gone.

### Why a deleted piece of starting furniture has to be remembered

`Farmhouse.ts`'s `props` are furnished into the room on every
`enterEnvironment()`, unconditionally — that is how the bed is there on a brand
new account with nothing saved yet. A user-added object has no such second
source: it exists only as a saved `EnvironmentObject` row, so omitting it from
the save is the whole story. But the starting bookshelf is not like that —
"missing from the saved arrangement" is ambiguous between *deleted* and *never
touched*, and the environment cannot tell the two apart on its own.

`RoomStyle.removed: string[]` is the id list that resolves the ambiguity —
additive to the JSON document already in `Environment.sceneData`, so no
migration. `PetRoom.discardObject` adds a starting prop's id to it (never a
user-added object's — checked against `environment.props`); `enterEnvironment`
skips furnishing anything already in the set.

**The trap this shape has to avoid twice.** `PetRoom.setStyle` decides whether
to rebuild the room's scenery (`dress(true)`) by comparing the old style to the
new one; `removed` is deliberately excluded from that comparison; a change to
it never earns a cross-fade, because the entity it names is either already gone
(the scene did the removing itself) or needs a *targeted* prune rather than a
full rebuild. That second case is the one that is easy to miss: on the very
first frame, the scene is usually built from `DEFAULT_ROOM_STYLE` — the page's
own room-style fetch is still in flight — so the starting bookshelf gets
furnished *before* anyone has told the scene it was deleted last session. When
the real style arrives moments later with `removed: ['prop-bookshelf']`,
excluding `removed` from the redress comparison means nothing else notices
either. `setStyle` therefore prunes explicitly: after `this.style = merged`, it
walks `merged.removed` and calls the (sound-free, tombstone-free) `removeEntity`
on any id that still has a live entity. `discardObject` and this prune share
that one removal method; only `discardObject` plays a sound and writes the
tombstone, because only it is a thing the user just did.

## 8. The environment's scenery

```text
assets/environment/
  Background.ts          the field behind the box
  Floor.ts               the floor plane, its material, and the grid seams
  Walls.ts               assembles: shell, texture, creases, window, decor,
                         baseboard
  walls/WallTextures.ts  plaster, panelling, planks, brick, stripes, tile
  walls/WallDecor.ts     painting, portrait, shelf, vines, hole, bunting,
                         mirror, sconce, clock
  window/Window.ts       the hole: reveal, pane, glass, bars, sill
  window/WindowViews.ts  what is on the other side
  Lighting.ts            haze, shafts, pool, wash, vignette
  Atmosphere.ts          what is drifting in the air
  Critters.ts            the room's own wildlife
```

Two rules worth stating:

**Wall textures are drawn in world space and projected.** A brick course has to
converge toward the vanishing point on the side walls, or the box stops being a
box. A screen-space pattern painted over a picture of a wall is wallpaper on a
photograph.

**A window view never hard-codes a sky.** It is handed the hour's `SkySpec` and
paints its own land against it, so a mountain range at midnight is the same
mountain range in the dark. The one exception is a view that supplies its own
light — the lava dungeon says so with `selfLit`, and the lighting reads it so the
shafts through the glass go orange at noon and at midnight alike.

**A window is a hole in something thick.** The reveal (the wall's cut edge), the
sill projecting into the room, and the light spilling onto the plaster around the
opening are what stop it being a sticker. The first version had none of them.

---

## 8b. The park — a second environment, and what it cost

```text
assets/environment/park/
  Outdoors.ts            sky, clouds, sun/moon, two treelines, fence, lawn,
                         border shrubs
world/environments/
  Park.ts                the EnvironmentDefinition
```

`world/environments/types.ts` promised that *"adding a second one is writing a
second file rather than picking the first one apart"*. The park is the test of
that promise, and it held: **nothing about the scene, the physics, the grid, the
placement rules, the drag or the pointer changed.** A park is an
`EnvironmentDefinition` and `PetRoom` already knew how to run one.

What an environment is allowed to change, and did:

```text
  the scenery   sky, treeline, fence and grass instead of three walls and a
                window. `createScenery` returns containers; it is not handed a
                wallpaper, so an environment that has no walls simply does not
                draw any
  the light     the sky itself. No window means no shaft and no pool
  the furniture four things at the edges. A park is somewhere to be, not
                somewhere to arrange
  the night     shallow (alpha 0.34, not 0.62). Outdoors at midnight still has
                a sky in it
  wallReserved  empty. There is no wall, so the wall-decor drag simply never
                finds anywhere to land — no conditional anywhere
```

What it may never change, and did not: **the camera, the bounds and the grid.**
Everything standing in the park stands on the same cells a chair stands on
indoors. That is what lets the same snap, the same depth sorting and the same
drag guide run here with no branching.

### The one shared thing that had to be extracted

`createMoodOverlay` (`assets/environment/Lighting.ts`). The wash and the
vignette are what make an *hour* read at all — a park at midnight without them
is a park at noon with green grass — but the rest of `createLighting` is about a
window. So those two came out into a function both environments call, rather
than the park growing a vignette of its own that would drift.

### It is not in the registry, on purpose

`ENVIRONMENTS` and `getEnvironment` carry the farmhouse only. `PetRoom` imports
that registry, and `PetRoom` is on the first screen's load path — so a static
import of the park there would put a sky, a treeline, a fence and a lawn into
the chunk every signed-in visitor downloads, to draw a place most of them will
never stand in. It measured ~17 kB.

`features/social/ParkStage.tsx`, which is itself behind a `lazy()` boundary,
imports `world/environments/Park` directly and hands the definition to
`PetHabitat` as an object. `getEnvironment` keeps answering for the rooms a
creature can *live* in, which is what it is for — a park is somewhere you go,
not somewhere you are from.

### Other people's creatures stand on this grid too

`scenes/room/Visitors.ts` puts them in the **same sortable stage layer** as the
furniture, with a `zIndex` computed by the same rule (`BodyView.sortKeyOf`: the
near edge of the footprint). A park with six creatures and a table in it sorts
exactly as a room with one creature and a table in it does. They have no
collider — the navigator routes *to* them and the physics never has to resolve
two creatures occupying one another, which is a contact neither simulation owns.

See `API-endpoints/13-social-endpoints.md` §10 for the rest.

---

## 9. Verifying visually

Three dev-only harnesses, none of which is built (only `index.html` is a Vite
input):

| Harness | For |
|---|---|
| `room-preview.html` | the room, or a gallery of every object |
| `panel-preview.html` | one React panel, mounted alone |
| `app-preview.html` | the **whole dashboard**, against a fake backend |

`app-preview.html` replaces `window.fetch` with a small in-memory server backed
by `sessionStorage`, so reloading the page genuinely re-reads persisted state
through exactly the client code paths the real one uses. That is the part worth
having: "does the room come back after a refresh" is a question about the
loading flow, and the loading flow does not care whether the rows came from
Postgres. It enforces the rules the real server enforces — the six-goal cap, the
refusal of a made-up `imageUrl` — so a failure there is a client bug rather than
a disagreement about what the server would have said.

`frontend/room-preview.html` + `src/room-preview.ts` renders the room, or a
gallery of every object, without the auth gate or the backend.

```text
/room-preview.html                     the room
/room-preview.html?env=park            the park (see §8b)
/room-preview.html?mode=gallery        every object type, on a neutral floor
/room-preview.html?mode=gallery&only=bed,tunnel   a few of them, larger
```

In the console:

```js
window.__cap('name')       // render + POST to Vite's /__snapshot sink,
                           // which writes frontend/.snapshots/name.png
window.__advance(seconds)  // step the ticker BY HAND
window.__style({ ... })    // change the room's appearance

// Other people's creatures, without a second browser. These call exactly what
// the socket calls, so what is being looked at is the real thing: a real
// PetRenderer, a real animation controller, the real depth sorting.
window.__visitor('ivy', { primaryColor: 0x7bb6e8, earType: 'floppy' }, 0x7bb6e8)
window.__moveVisitor('ivy', 420, 400, 'walk', 1)
window.__interact(null, 'ivy', 'greet', 2600)   // null means the local creature
```

**Two browsers cannot be two users.** They share a cookie jar, so the multiplayer
case cannot be exercised with two tabs. The visitor helpers above cover the
*rendering* half; the other half — a genuinely separate session joining the same
park over a real socket — is exercised by a Node client that signs in, gives
itself a creature, opens a park and walks around in it. That is how the two-user
park was actually verified, and it is the only way to see the wire format,
proximity arbitration and chat delivery all working at once.

**`__advance` is not a convenience.** An automated browser drives the page in a
background tab, where `requestAnimationFrame` is throttled to nothing — so the
world builds and then freezes on frame one, and every snapshot shows the initial
state whatever you do to it. Several hours were lost to this exact symptom
("the style change did nothing") before the cause was found. Pump the ticker
manually and the simulation runs deterministically, which is what a harness
wants anyway.

---

## 10. Checklist for a change in this area

- [ ] Sizes come from `footprint`, not from numbers in the renderer.
- [ ] No clamp after a snap.
- [ ] The drag guide, the status line and the drop all use `snapFootprint`.
- [ ] An object's artwork bottom lands on `project(x, 0, z)` — the same point as
      its shadow and its drop ring. Check this *first* when placement looks wrong.
- [ ] Footprint checks walk cells, not the footprint's centre point.
- [ ] Anything new with a `mount` is anchored, and every table in §2.2 applies
      to it without a special case.
- [ ] New object types are in the catalog, the renderer map and the reward pool.
- [ ] New interactions have a clip, and the clip loops.
- [ ] Renderers use `Surface.ts`, not `Graphics` directly, for shading.
- [ ] Anything the user can choose about the room is in `RoomStyle`, and
      therefore saved; anything they *place* is an `EnvironmentObject`, and
      therefore saved too.
- [ ] Placement saves are debounced and snapshot eagerly — never per frame, and
      never read from a scene that may already be gone.
- [ ] Nothing outside `PetRoom.pointerDown`'s `movable` check (the pet, a toy,
      or `this.editing`) can be dragged. If a new interaction needs to move
      something, it goes through that check rather than around it.
- [ ] A deletion gesture is a fact about world-space geometry (height, a grid
      cell), never about the pointer's position against a DOM element's screen
      rect — that is the bug `DISCARD_LIFT` replaced (§7c).
- [ ] Deleting a piece of the *environment's own* starting furniture writes to
      `RoomStyle.removed`; deleting something the user added does not need to
      (§7c). Either way, if `RoomStyle`'s redress comparison (`setStyle`) grows
      a new field, decide on purpose whether a change to it should rebuild the
      room or be pruned/applied directly — silently doing neither is how a
      deletion stops sticking on the next load.
- [ ] `npx tsc -b` and `npx eslint src` are clean, from `frontend/`.
- [ ] It has been *looked at* — §9.
