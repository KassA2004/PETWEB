````md
# VISUAL DESIGN, LOOK & FEEL

## 1. Design Vision

The application should feel like a **dreamy little world that happens to contain a living creature**.

The visual identity should be:

- Dreamy
- Cozy
- Cute
- Colorful
- Slightly surreal
- Softly glowing
- Atmospheric
- Warm
- Playful
- Visually rich without being overwhelming

The world should feel like somewhere the user wants to stay for a while.

The visual direction should communicate:

> **A cozy dream world inhabited by strange, adorable creatures.**

The application should feel closer to an **indie animated world** than a conventional productivity application.

---

# 2. Core Visual Principle

The design should prioritize:

```text
Shape
    ↓
Lighting
    ↓
Depth
    ↓
Atmosphere
    ↓
Color
    ↓
Detail
````

Color should support the environment rather than being used to fill every object with bright solid colors.

The world should feel illuminated and dimensional rather than flat.

---

# 3. Color Philosophy

The palette should be **colorful but cozy**.

Avoid extremely saturated primary colors and harsh neon colors.

Preferred colors should lean toward:

* Pastels
* Muted warm colors
* Soft blues
* Dusty pinks
* Lavender
* Warm cream
* Soft greens
* Peach
* Pale yellow
* Muted orange
* Deep blue/purple for shadows

Colors should have enough variation to make the world visually interesting while maintaining a cohesive atmosphere.

Example palette direction:

```text
Blush        the creature's default pink
Punch        a deeper pink, for shade and accents
Ember        the warm orange the room is built from
Sand         wicker, wood, floors
Cream        paper, highlights, light surfaces
Mint
Sky
Grape
Ink          near-black plum: eyes, mouths, outlines — never pure black
```

The interface around the world uses the same palette on a warm paper surface,
so the page and the habitat read as one product rather than a dashboard with a
game bolted on.

These are directional rather than fixed colors.

The final palette should be developed around the environment and lighting system.

---

# 4. Lighting

Lighting is a major part of the visual identity.

The world should not look like objects simply placed on a flat canvas.

Lighting should create:

* Depth
* Warmth
* Separation
* Mood
* Spatial awareness

The scene should use soft light rather than harsh directional lighting.

Example:

```text
             SOFT AMBIENT LIGHT
                    ↓
        ┌─────────────────────┐
        │                     │
        │       PET           │
        │      /   \          │
        │                     │
        └─────────────────────┘
                    ↓
              SOFT SHADOW
```

Lighting should generally feel diffuse and gentle.

---

# 5. Shadows

Shadows are mandatory.

Objects should not appear to float.

Use soft shadows beneath:

* Pets
* Furniture
* Objects
* Decorations
* Walls where appropriate

Shadows should help communicate:

* Where the object is standing
* Its relationship to the floor
* Depth
* Distance from surfaces

The pet should have a soft contact shadow beneath its body.

Example:

```text
       PET
      /   \
     /     \
       ↓
   soft shadow
  ─────────────
```

The shadow should become slightly stronger when the pet is close to the ground and softer when the pet jumps or moves upward.

---

# 6. Ambient Atmosphere

The environment should contain subtle atmospheric effects.

Possible effects include:

* Soft glow
* Floating particles
* Dust
* Tiny sparkles
* Light rays
* Soft haze
* Ambient gradients
* Subtle background movement
* Gentle environmental particles

These effects should be subtle.

The goal is:

```text
Atmosphere
≠
Visual noise
```

The user should feel the atmosphere before consciously noticing the effects.

---

# 7. Glow

Glow should be used sparingly.

Appropriate uses:

* Lamps
* Windows
* Magical objects
* Special decorations
* Pet reactions
* Certain environmental elements
* Nighttime lighting

Avoid giving every object a glow effect.

The world should feel softly illuminated, not radioactive.

---

# 8. Depth

The environment should have multiple visual depth layers.

Conceptually:

```text
BACKGROUND
    ↓
BACK ENVIRONMENT
    ↓
FURNITURE / STRUCTURES
    ↓
PET + INTERACTIVE OBJECTS
    ↓
FOREGROUND
    ↓
ATMOSPHERIC EFFECTS
```

This creates a stronger sense of space while remaining 2D.

## The room is a box

The layers above are the *composition*. The space they sit in is a room seen
in one-point perspective — a shallow diorama you are looking into rather than
a flat elevation you are looking at:

```text
┌──────────────────────────────┐
│ ╲        back wall        ╱  │
│  ╲______________________╱    │   ← the wall/floor crease
│  ╱                      ╲    │
│ ╱          floor         ╲   │
└──────────────────────────────┘
```

Left and right walls converge, the floor widens toward the viewer, and the
floor's seam lines run across it at the boundaries of the room's three depth
rows. Composition, not architecture: the box exists so that space is legible,
not so that the room looks like a technical drawing.

## Size is the depth cue

Everything in the room is drawn smaller the further back it stands — a little
under a third smaller at the back wall than at the front. This is doing most of
the work, and it is why the old flat elevation read as crowded: with everything
at one size, the only evidence of depth was which thing covered which, so the
user could not tell where anything was until it overlapped something else.

Three quieter cues support it:

```text
aerial perspective   things further off are slightly paler and cooler, because
                     that is what distance does to contrast
contact shadows      scale and soften with the same camera, so a shadow at the
                     back is a smaller shadow
floor seams          converging lines the eye can measure depth against, even
                     in an empty room
```

## Depth has to be sayable, not only visible

A pointer has two axes. When something is being carried, the floor is marked
where it will land — the **cells** it will occupy are filled in perspective, the
depth rows they sit in are brightened much more faintly, an ellipse sits flat on
the floor at the landing point, and a dashed tether joins the two.

What is drawn is the *snapped* result, not the pointer's own position. A guide
that shows where the cursor is rather than where the object will land is a lie,
and it is the lie users notice first.

None of it is visible when nothing is being moved. Affordances belong to the
moment a decision is being made, and this room is meant to be looked at the
rest of the time.

## The room is measured

The floor is a grid of square 120-unit cells, ten across and five deep, and an
object's size **is** its footprint on that grid: a chair is one cell, a bed is
two. The back wall has its own grid sharing the floor's columns, so a painting
hangs above the bookshelf rather than approximately above it.

That is a large enough subject to have its own document. See
**`room-and-objects.md`** for the grid, the placement rules, the object catalog,
the object surface language, affordances, and how the user's choices about the
room are saved.

## A toy behind something is dimmed, not gone

Depth sorting is correct perspective and, on its own, a bad game: a ball that
has rolled behind the bed is sorted honestly and is therefore invisible, and
the one thing worth knowing about a toy is where it is. An occluded toy is
drawn *above* whatever is covering it and dimmed to 45% alpha — present, and
readably behind the thing hiding it, rather than gone or (worse) drawn in front
as if nothing were in the way.

This is not a blend with the depth tint every object already carries (§8
above) — that tint is aerial perspective, a fact about distance, and applies
whether or not anything is in front. Ghosting is a fact about occlusion, layered
on top of it, and only ever applies to toys: furniture that is genuinely behind
something else is *meant* to disappear behind it, the same as it would in a
real room. Only the object a user is actively looking for benefits from
cheating the sort order.

`scenes/PetRoom.ts`'s `occludedToys` finds, once a frame, every toy whose
screen rectangle overlaps something both taller and nearer; `syncEntity` then
draws that toy just above its occluder's own depth (`+0.25`, enough to win the
sort without competing with whatever is genuinely in front of the occluder
itself) at the reduced alpha. Cheap on purpose — only toys are checked, and only
against things actually in front of them on screen, not a second full sort of
the room.

---

# 9. Materials and Surface Treatment

Every surface is shaded from **one base colour**, expanded into a fixed five-step
tone ramp and rendered as a soft vertical gradient:

```text
light   top of the form, catching the window
base    the colour that was chosen
shade   the underside
deep    contact shadow, inner ear, the gap under a belly
line    the soft outline
```

One colour in, a whole creature part out. That is what keeps a randomly
generated creature looking designed rather than assembled, and it is why the
customizer only ever asks for four colours no matter how many parts a creature
has.

A surface is built from:

```text
Base shape filled with the tone ramp
+
One flat lighter shape for the gloss highlight
+
Optional markings, clipped to the silhouette
+
A contact shadow underneath
```

The result should remain visually simple but have enough variation to feel
tangible.

For example:

```text
Bare shape:

████████

Preferred:

   ╱────╲   <- one lighter shape, upper left
  │      │
  │  ▒▒  │  <- one darker shape, lower edge
   ╲────╱
   ══════   <- flat contact shadow
```

Two flat shapes on top of a fill is the budget. A third is usually a sign the
form itself is not reading and should be redrawn instead.

The implementation uses procedural vector geometry with local-space gradients
(`textureSpace: 'local'`), so a part's lighting follows the part rather than the
screen — an ear keeps its own shading wherever the rig swings it.

Blend modes and filters are still not used anywhere: they cost frame time and
every effect they would provide (glow, light pool, contact shadow, vignette) is
achievable as a translucent shape.

---

# 10. Object Design

Objects should be recognizable through **silhouette and form**, not simply through large areas of solid color.

Furniture and environmental objects should have:

* Rounded edges where appropriate
* Interesting silhouettes
* Soft shading
* Slight imperfections
* Distinct proportions
* Simple but expressive forms

Objects should feel designed rather than generated from generic UI components.

Since the room gained a grid, this is enforced rather than hoped for. Every
object is drawn to the world-space box its grid footprint gives it, and every
object is shaded through one shared surface language
(`assets/objects/shared/Surface.ts`) that applies the same rules §9 sets out for
the creature: one base colour in, a five-step tone ramp out, one gloss shape,
one shade shape, one contact shadow. A third flat shape on a form means the form
is not reading and should be redrawn.

See `room-and-objects.md` §5 for the helpers and for the traps that have already
cost time — chief among them that an `ellipse()` call starts a new subpath, so a
hand-built outline that ends in one never closes.

---

# 11. Creature Design

Creatures are the visual centerpiece, and the character system is the largest
design surface in the project. This section is the reference for it.

## 11.1 Visual philosophy

The style is **soft chunky flat vector**. Every creature is built from a small
number of clean shapes with exaggerated proportions:

* rounded, organic silhouettes with deliberate asymmetry
* a large, simple, readable face
* feet drawn into the bottom of the mass, never hung off it
* layered solid-colour shapes rather than gradients or texture
* small, controlled highlight and shade shapes

The test is the **silhouette**. At thumbnail size, before the face is drawn, a
creature should already look intentional, balanced and distinct from the one
beside it. A body that only reads as a creature once it has eyes is not
finished.

## 11.2 Character philosophy — pets are not required to be cute

This is the load-bearing rule of the whole system, and the easiest one to
accidentally break.

The visual language provides the foundation. **The user provides the
personality.** The library therefore has to contain options that are ugly,
stupid, sad, unsettling, smug, serious, emo, chaotic and wrong, alongside the
adorable ones. A customization system where every choice is a slightly
different cute face is not a customization system.

A user must be able to build:

```text
Cute bunny            Angry square creature    Sleepy round creature
Dumb blob             Sad emo creature         Crazy wide-eyed creature
Derpy asymmetric      Tiny serious creature    Huge goofy creature
Strange chaotic
```

and all of them must look like they came from the same game.

Concretely, in the libraries:

```text
Eyes    Sparkle and Saucer are adorable. Pinprick, Beady, Deadpan, Manic,
        Blank and Sharp are not, and that is why they exist.
Mouths  Smile and Cat sit beside Jagged, Stitched, Slab and Wobble.
Bodies  Round and Blob sit beside Square, Narrow, Bell and Lump.
Teeth   Two front teeth are goofy. Snaggle and Uneven are wrong on purpose.
```

When adding an asset, ask "what personality does this unlock?" rather than
"is this cute enough?".

## 11.3 Body rules

A body type is a **half-width profile** — an array of samples from the crown
down to the floor (`customization/BodyTypes.ts`). That is the entire
definition; there is no per-type drawing code.

```text
t = 0   the crown
t = 1   the floor, where the feet fuse in
w       half-width there, 1 = the body's full half-width
```

Two profiles that disagree about where the mass sits produce two genuinely
different creatures. Pear narrows to 0.62 at the shoulders and swells low down;
Egg does the reverse. Neither is the other one squashed, and that distinction is
the difference between a designed silhouette and a stretched rectangle.

A type also carries:

```text
tension     1 = fully rounded corners, lower = boxier. Square uses 0.55.
asymmetry   how much left/right variation the outline may take
stance      how far apart the feet plant, as a share of half-width
```

Proportion rules:

* Width and height are free individually; only their **ratio** is bounded
  (0.38 to 2.6), which prevents a creature with no silhouette left while still
  allowing a pancake and a pole.
* Everything else on the creature measures itself against the body, never
  against a fixed pixel size.
* The silhouette is authored once and reused as artwork, as the face's clip,
  and as the mask for every shading layer, so no customization value can push a
  highlight or a cheek off the edge of the creature.

## 11.4 Ear rules

Ears carry more identity than any other part — long ears make a rabbit, round
discs make a pig, and the body did not change. So the library invests here, and
the shapes genuinely differ rather than being one primitive resized.

Every ear is one of three kinds:

```text
ribbon   a spine with a width profile along it — bunny, cat, spikes, floppy,
         drooping, lopsided, antennae, horns, wide
disc     a circle dragged down into the head — small round, big round
fin      a swept wedge leaving the head sideways
```

The spine is **integrated along an arc**, not offset sideways. That is the
difference between an ear that bends and an ear that folds over: a floppy ear
has to end up pointing back at the floor, and no amount of horizontal offset
will do that.

Attachment is the thing that used to look wrong, and it is fixed by two rules:

```text
baseSink   the ear shape starts BELOW its own joint, inside the body, so the
           silhouette is continuous where the two meet
base cap   ears drawn in front of the mass get a flat coat-coloured shape over
           their base, which erases the outline crossing the body
```

Ears drawn behind the mass need neither — the body swallows the seam. An ear
that ends at the body's edge with a visible hard join is a bug.

Shading is one solid band down the shadowed side, cut to the ear's own outline.

## 11.5 Foot rules

Feet are not appendages. They never move independently — a legless creature
with animated legs looks like a puppet — so they exist to say which way is down
and to give the bottom of the silhouette weight.

Feet used to look pasted on for two reasons, and both are design rules now:

1. **Every kind has its own outline.** A hoof and a paw are not the same pad at
   two sizes. Paws have toe bumps cut into the silhouette rather than dots
   painted on; hooves are narrow, flat-bottomed and cleft; talons splay; boots
   have an ankle.
2. **Feet are drawn behind the mass with their tops buried in it** (`sink` on
   the foot type), measured from the silhouette's actual lower edge above that
   foot, not from the bounding box. A soft dark shape inside the body where they
   meet finishes the join.

Feet plant at the body type's own `stance`, clamped so the ankle always has body
above it. Huge feet on a tiny creature stay comic; they never detach into two
objects either side of it.

## 11.6 Face rules

The face is a group clipped to the body silhouette, so a wide-set eye on a
narrow creature slides under the edge of the mass instead of floating beside it.

Draw order inside the face is deliberate:

```text
cheeks → snout → eyes → pupils → brows → mouth → teeth
```

### Eyes

The largest library in the project, because eyes decide what kind of creature
this is. Each preset describes:

```text
outline    the eye's own silhouette — round, oval, almond, angular, wedge,
           half, sliver, square
sclera     0 = a solid dark eye, 1 = a white with a pupil floating in it
pupil      size, shape and RESTING OFFSET. Off-centre is a personality.
lids       resting coverage, which the expression system moves from
tilt       rest rotation. Inward reads angry, outward reads sad, before a
           single brow is drawn.
asymmetry  how differently the two eyes are built — the derp dial
```

The whole eye is drawn inside a container **masked by its own outline**. That
one decision solves the pupil problem permanently: a pupil cannot leave an eye
it is drawn inside of, and a lid sliding down automatically takes the shape of
whichever eye it is closing. Each eye publishes its own `pupilRange`, so gaze
moves pupils in the eye's units — a narrow eye restricts vertical travel far
more than horizontal.

Every eye gets a closed-eye line on the lid's lower edge. Without it a shut eye
is just a patch of coat, and a sleeping creature has no face.

### Mouth

A mouth type is a **shape language, not a pose**. Each preset says where its
upper and lower edges go *given* a curve and an openness, and the expression
system supplies those two numbers every frame:

```text
bias        the curve the design carries by itself — a frown starts bent
curveGain   how far it bends in response to feeling
openGain    how far it opens relative to what was asked
kind        'lips' (an upper edge that can part from a lower one) or
            'hole' (an opening whose size is the expression)
```

So a `:3` picked in the editor is still a `:3` when the creature is furious —
the lobes turn over. Nothing swaps the user's shape out from under them.

### Teeth

Every tooth is a **dome with a flat root**, buried in the lip it hangs from, so
the lip line cuts it the way a gum cuts a real tooth. Never a rectangle dropped
inside a smile.

A set is described by numbers, not shapes — count, width, length, roundness,
spread, jitter — so a neat row and a snaggletooth run one renderer. `protrude`
says how much shows when the mouth is *shut*, which is what makes fangs a
permanent feature of a face rather than something you only see during a yawn.

Teeth root at the **lowest point of the lip line** when the mouth is closed and
at the middle of the upper lip when it is open — the two places a tooth can
emerge from without crossing the mouth it belongs to.

### Brows

The single biggest lever on whether a creature reads as sweet or as a problem.
The shape is chosen; the angle is animated. Each type carries its own resting
tilt, so a design can be permanently cross or permanently worried before any
feeling arrives — and the expression system still moves it from there.

Convention, and getting it backwards makes every pose look wrong:

```text
inner ends down  → angry
inner ends up    → sad, worried
both raised      → surprised
```

### Cheeks

Deliberately the smallest system in the face: one flat shape per side, one
alpha. Over-render them and the face becomes a doll. The whole shape must fit
inside the silhouette — a blush half cut off by the body reads as a bruise.

## 11.7 Expression rules — character vs expression

The most important architectural distinction in the character system.

```text
CHARACTER DESIGN                     EXPRESSION / STATE
persistent, chosen by the user       dynamic, driven by the simulation
stored in PetAppearance              computed every frame

body, ears, feet, eye type, brow     happy, sad, angry, afraid, surprised,
type, mouth type, teeth, cheeks,     confused, sleepy, curious, playful,
colours, patterns, proportions,      frustrated, embarrassed, relaxed, …
resting mood
```

Expression values are **modifiers**, not faces:

```text
Base character
    ↓
User-selected facial design          (eye preset, mouth preset, brows, teeth)
    ↓
Expression modifiers                 (curve, openness, twist, lids, squint,
    ↓                                 widen, tilt, brow angle, blush, pupil)
Animation / state modifiers          (blink, gaze, clip overrides)
    ↓
Final rendered face
```

Consequences that the system must keep true:

* A chosen mouth must still communicate every emotion. The design decides how
  far it bends, never whether it bends.
* A chosen eye must still participate in every emotion. Lids start from the
  preset's own resting coverage, so a Sleepy eye stays half shut when the
  creature is delighted, and widening lifts that droop out of the way rather
  than deleting it.
* Brows rotate around the rest angle the brow type chose, so Angular brows stay
  crosser than Worried ones at the same anger.
* **The same emotion looks different on different characters.** A sad pet with
  saucer eyes and a sad pet with beady eyes must both read as sad and must not
  look alike. If they look alike, the expression layer has overwritten the
  design instead of modifying it.

Expressions are never authored as complete static faces. Doing that would
destroy customization.

---

# 12. Creature Rendering

Creature geometry is procedurally generated. Nothing is a sprite.

The stack, back to front:

```text
wings, tail, back ears, topper       behind the mass
body silhouette                      one flat coat colour + a soft outline
  bottom shade, belly panel,         all clipped to the silhouette
  markings, one light patch
feet                                 behind the mass, tops buried in it
front ears
neck accessory
face (clipped to the silhouette)
  cheeks, snout, eyes, pupils, brows, mouth, teeth, eyewear
head accessory
contact shadow                       under everything
```

## 12.1 Shading rules

Flat vector, always:

```text
Prefer            Avoid
solid fills       heavy gradients
layered shapes    glossy plastic rendering
one shade shape   fake inner shadows
one light patch   photorealistic lighting
soft outlines     stacks of highlights
```

Polish comes from shape design and layering, not from gradients. Two flat
colours give a shape volume; a gradient just makes it look wet.

Every shading layer is masked to the shape it belongs to, so no combination of
customization values can leave a highlight floating beside a creature.

Dark creatures are a special case worth naming: a dark eye on a dark coat is not
an eye, it is a hole. Parts check the coat's perceived brightness and add their
own contrast when the body cannot provide it.

## 12.2 Customization rules

The principle is:

> **Maximum creative variety within a coherent visual language.**

Not "maximum numerical range", and emphatically not "clamp everything until
nothing can look bad". If an extreme combination looks wrong, the fix is better
geometry, relative scaling or a dependent constraint — never a smaller slider.

Limits live in one file (`customization/PetConstraints.ts`) and come in two
kinds, which are deliberately kept apart:

**Absolute ranges** are what a slider may produce. They are wide on purpose, and
they are exported so the editor and the clamp agree. A slider whose range is
wider than the value it writes is a control that silently does nothing, which is
worse than no control at all.

**Dependent constraints** are relationships between values, resolved in pixel
space when proportions are computed — *not* applied to the stored appearance. A
slider that snapped back while you dragged it would feel broken; a creature that
fell apart at the end stops would be worse. So the number you chose is the number
that stays, and the renderer refuses to let the result come apart:

```text
body aspect      width and height are free; only their ratio is bounded
eye gap          eyes cannot overlap, and cannot leave the face — measured at
                 the width the body actually has WHERE THE FACE SITS
ear offset       ears cannot be anchored past the edge of the crown
foot width       the set cannot be so wide it detaches from the body
mouth width      the shape cannot be cut off by the face clip
snout, wings     cannot swallow the face or dwarf the creature
cheeks           the whole blush fits inside the silhouette
```

## 12.3 Adding new assets

The libraries are data. Adding content should not require touching a renderer:

```text
a new body     one row in BodyTypes: a width profile, tension, stance
a new ear      one row in EarTypes: kind, taper, bend, droop, tilt
a new foot     one row in FootTypes, plus an outline function in parts/Foot
a new eye      one row in EyeTypes; a new *outline* also adds one function to
               parts/EyeShapes
a new mouth    one row in MouthTypes: an `upper` function, optionally `lower`
a new tooth    one row in TeethTypes — numbers only
a new emotion  one row in EXPRESSIONS: twelve numbers
```

If adding an asset requires editing a `switch` in a part renderer, the preset
shape is missing a field. Fix the data model rather than the conditional.

---

# 13. Outlines

Outlines should not be uniformly thick black lines.

Avoid the appearance of:

```text
████████████
comic-book outline
```

Instead, outlines should be:

* Soft
* Darker versions of surrounding colors
* Subtle
* Variable where useful
* Used primarily for separation

Some objects may have no visible outline at all if lighting provides sufficient separation.

---

# 14. Imperfection

The world should not feel mathematically sterile.

Small irregularities are encouraged:

* Slightly uneven shapes
* Organic curves
* Asymmetrical accessories
* Different object proportions
* Subtle variation
* Non-perfect placement
* Procedurally varied decorations

The goal is **designed imperfection**.

The world should feel handmade even though much of it is generated through code.

---

# 15. Cozy Environment

Rooms should feel lived-in.

Possible elements:

* Rugs
* Pillows
* Plants
* Lamps
* Books
* Toys
* Small decorations
* Beds
* Tables
* Windows
* Shelves
* Strange little objects

Objects should have a purpose within the environment or contribute to its personality.

Avoid filling the room simply to make it look busy.

---

# 16. Environmental Color

The environment should generally use a softer palette than the creature.

This creates visual hierarchy:

```text
Environment
    ↓
Soft / atmospheric

Pet
    ↓
More visually expressive

Important interaction
    ↓
Stronger visual emphasis
```

The pet should remain easy to see without looking pasted onto the scene.

---

# 17. Day / Night Atmosphere

The environment should eventually support different lighting moods.

Possible states:

```text
Morning
Day
Sunset
Evening
Night
```

The underlying environment does not need to change completely.

Lighting and atmosphere can transform the same room.

Example:

```text
DAY
Warm ambient light
Bright atmosphere
Soft shadows

SUNSET
Orange/pink ambient light
Longer shadows
Warm glow

NIGHT
Deep blue environment
Soft lamp lighting
Stronger localized glow
Subtle particles
```

This creates variety without requiring completely different scenes.

## The mood is data

All five hours exist, and they are one record each in `world/Ambience.ts`.
Nothing in that file builds anything; the scenery reads it, so "what does
sunset look like" has exactly one answer and it lives in one place.

A mood is made of four things, in the order the eye reads them:

```text
key      the light actually falling into the room — the shafts out of the
         window, the pool they land in, the lit patch of wall
grade    where the room's own surface colours are pushed. Late light does not
         add orange on top of a wall, it makes the wall orange
wash     one translucent sheet over the whole frame
air      what is floating in the light: dust by day, fireflies at night
```

plus the small print that keeps the room consistent under it — the vignette,
how much of a contact shadow there is, how strongly lamps read, and what is
outside the window.

The window is the one place the hour is stated outright rather than implied,
and it is worth exactly four shapes: a sky, two hills, a disc, and stars if the
sky is dark enough to hold any.

## The room is also a colour the user chooses

The hour and the paint are separate axes. `ROOM_TINTS` is what the room is
*made of* — surface colours, deliberately muted next to the creature palette
(§16) — and every one of them is then graded by whatever hour it is. A sage
room at midnight and an ember room at midnight are the same midnight.

## And four more axes besides

Light sets the *time*; it cannot set the *vibe*. A painting, a shelf of
oddments, ivy coming through the plaster and a hole with something living behind
it are four different rooms at the same hour in the same colour. So the room also
carries a floor material, a wall material, a window view and a list of things
hung on the wall.

All six axes are one saved record — `world/RoomStyle.ts` — and that is the
important part rather than the count. The hour and the paint used to live in
React state, so every refresh put the room back to a sunny ember afternoon and
threw away whatever the user had chosen. A room you have decorated and cannot get
back to is worse than a room with no decoration at all, because the second one
never promised anything.

The window is the piece that changes most. It is no longer four shapes saying
what time it is; it is a hole in something thick — a reveal, a sill, light
spilling onto the plaster — with a *view* behind it that the user picks. A view
never hard-codes a sky: it is handed the hour's own and paints its land against
it, so a mountain range at midnight is the same range in the dark. The one
exception is a view that supplies its own light, and the lava dungeon says so
outright so the shafts through the glass go orange at noon and at midnight
alike.

See `room-and-objects.md` §7 and §8.

## Changing the mood is a rebuild

A room is a few dozen flat shapes, so redressing it costs less than the
bookkeeping of tweening every shape would, and it lets an hour change
*anything* rather than only the things somebody remembered to make tweenable.
Two generations cross-fade for about a second: the new ground goes under the
old one, everything translucent dissolves across.

The furniture, the creature and everything it remembers stay put. This is the
light changing, not a new room.

## Lamps and the light switch are a different axis again

Ambience is what hour it is. The lamp switch is whether anybody left a light
on. They compose — flicking the switch at midday dims the room, flicking it at
night nearly closes it — and a lamp's own flicker is scaled by the hour rather
than overridden by it, so it is barely there at noon and is the whole room at
midnight.

---

# 18. Weather / Environmental Effects

Future versions may support environmental effects such as:

* Rain outside windows
* Snow
* Floating dust
* Falling leaves
* Fireflies
* Clouds
* Wind
* Soft light particles

These should influence atmosphere rather than become gameplay distractions.

---

# 19. Animation and Visual Feel

Visual movement should be soft and organic.

Avoid:

* Instant movement
* Mechanical rotation
* Linear robotic motion
* Perfectly synchronized animations

Prefer:

* Ease-in
* Ease-out
* Smooth acceleration
* Small overshoots
* Gentle bouncing
* Subtle secondary motion

The pet's body, tail, ears, and face should move at slightly different timings.

This contributes significantly to the feeling of life.

---

# 20. UI Design

The application UI should not visually dominate the world.

The primary experience is the environment and the pet.

UI should feel integrated into the world rather than like a standard SaaS dashboard.

Preferred characteristics:

* Soft rounded shapes
* Minimal panels
* Gentle shadows
* Subtle transparency
* Warm typography
* Simple icons
* Soft colors
* Minimal visual clutter

The interface should disappear when the user is simply spending time with the pet.

---

## 20.1 Choosing things: show the thing

**A customization option is shown as the thing it makes, never as its name.**

"Ears Type 2" tells the user nothing they can act on. The rule is absolute
across the product: every option in the creature editor and every object in the
room panel is a picture, drawn by the same procedural code that draws it in the
world.

```text
  your appearance + { earType: 'floppy' }  ──→  PetRenderer  ──→  crop to head
  renderObject({ type: 'lamp' })           ──→  the lamp
  createFloor({ pattern: 'tiles' })        ──→  a patch of tiled floor
```

There is no icon set for *this*, and there must never be one — an icon standing
in for an option is a second copy of a design that silently stops matching the
first.

> The boundary, since the product now has `lucide-react` in it: icons are for
> **interface chrome** — the tab strips, the Home/Friends switch, buttons,
> status lines, section headings — where the thing being named is a *place* or
> an *action* that the renderer cannot draw, because it is not an object in the
> world. The moment a preview of the actual thing is possible, the preview wins
> and the icon is wrong. Nothing in the creature editor, the object catalog or
> any option grid may ever be a glyph. `lib/preview.ts` owns the
single offscreen `Application` every thumbnail is drawn by (one WebGL context,
not one per tile: the browser drops the oldest at about sixteen, which looks
exactly like a rendering bug and is not one) and caches by key.

**Previews crop to the part being chosen.** Drawn whole, a creature is mostly
body, and two ear options differ by a dozen pixels in a 76-pixel tile. Each
category names the joints its choice shows up in and the preview frames on
those, squared and padded (`features/customization/previews.ts`).

> A framing trap worth knowing: expressing the crop as "how much of the tile the
> subject fills" runs backwards — a *smaller* fill makes the visible window
> *bigger*. Dialling a face down to 0.64 to "give it air" opened the window
> wider than the whole creature, and every face option rendered uncropped. The
> tiles looked plausible; it took a contact sheet to see. The crop is expressed
> as padding around the part instead, which cannot invert.

## 20.2 The option grid

Every category uses one control (`components/ui/option-grid.tsx`), and it makes
four failures structurally impossible rather than merely discouraged:

```text
  stretched     tiles are a fixed square; nothing is sized by its content, so a
                long label cannot pull a tile out of shape
  deformed      previews are object-contain inside that square, so a wide asset
                letterboxes instead of squashing
  overcrowded   a page holds columns x rows and no more. The eleventh option
                starts page two rather than shrinking the other ten
  inconsistent  every category gets the same tile, gap and column count,
                because they all get the same component
```

Captions are one line and clipped: a caption that wraps makes its tile taller
than its neighbours, and a grid at two heights is what "visually broken" looks
like.

Categories longer than one page become a Splide carousel (see `TECH_STACK.md`).
The last page is padded with invisible blanks — without them a page of three
tiles centres its three across the full width while the page before shows eight
in columns, so sliding between them moves every tile sideways and reads as the
grid rearranging itself rather than as a page turning.

Motion is a lift on hover and a squash on press, both transforms, so neither
costs a layout.

## 20.3 The page does not scroll

The shell is exactly one viewport tall, and **the only scrollable region in the
product is the tools column.** The world is a fixed object you look into; a page
that could scroll it out of view is a page where the main thing can be lost by
touching the wheel.

Every ancestor of that column carries `min-h-0`. Without it a flex child refuses
to shrink below its content height, the column grows past the viewport, and the
`overflow-hidden` at the top clips the bottom of it — which looks like the panel
is broken rather than like the page is fixed.

## 20.4 The frame is the room's shape

The habitat frame is sized by measurement to the room's own 16:9
(`PetHabitat`'s `ResizeObserver`), never by a CSS ratio and never by the
column's width.

`fit: 'contain'` means a frame of the wrong shape never *stretches* the room —
it pads it, and two grey bands are what the eye reads as the room having been
pulled wide. Matching the ratio removes the bands instead of disguising them.

CSS alone cannot do this: the frame wants its width from its height while a
`w-fit` card wants its height from its content's width, which is a genuine
circular dependency the browser resolves by giving the canvas an intrinsic width
of nearly zero. Two multiplications in a `ResizeObserver` have no such problem.

Anything that is not the room is kept out of that frame — the creature's name
and mood sit above it, and messages float over it — because every pixel of
chrome inside the frame is a pixel off the room twice: once for the chrome, and
again for refitting the room into a box whose shape the chrome changed.

> All of the above describes the **desktop** card. A phone gets a different
> answer to the same question, for the same reason: see §20.5.

## 20.5 A phone is a different shape, not a narrow desktop

Three layouts, chosen by `lib/useViewport.ts`'s `useLayoutMode`:

```text
  desktop     ≥1024px wide       the world beside the tools, framed as a card
  portrait    a phone upright    the world above the tools, edge to edge
  landscape   short AND sideways  the world beside the tools, at phone scale
```

**Landscape is a real third case, not a narrow desktop.** A phone on its side is
compact by width and has 375 pixels of height. Given the portrait layout — a
header, then a full-width room, then a column of tools — the room alone is 457 of
them, and everything under it is clipped out of a shell that is exactly one
viewport tall and does not scroll. It reads as the page having frozen, because
from the user's side that is what it is.

The test is on height **and orientation**. Height alone describes the problem
better and was wrong for the case that turns out to be the common one: a
keyboard shrinks the layout viewport too, so a phone held upright at 375×470
matched every sensible height threshold and flipped the whole interface
mid-sentence. A small tablet at 1000×700 still wants the column and still gets
it.

### The frame comes off

§20.4 is about the desktop card. On a phone the card is 48 pixels of a
375-pixel screen — 24 of page padding, 24 of border and inset — which took the
canvas to 327 wide and 184 tall, a room occupying 23% of a screen the creature
is supposed to live in. Full-bleed is 375 and 211.

The frame is not dropped so much as moved: the pet's name, its mood and the
light switch become chips floating over the top of the room on a gradient scrim,
which is where a game puts them and costs the room no height at all.

A **4% overscale** goes with it (`PetRoomOptions.zoom`, multiplied into the fit
so the projection, the pointer mapping and the depth scale all stay in
agreement). What it spends is the empty plaster above the shelf line, which is
the only part of the view nothing is ever placed in. Past about 1.06 it starts
eating the wall-decor rail, so it is a nudge and not a camera.

### One tree, two shapes — this rule is load-bearing

Portrait and landscape are **one component tree** that differs only in classes
and props. They must never become two `return`s again, and the reason is not
tidiness.

React reconciles by position. Two trees mean everything under them is unmounted
and rebuilt when the shape changes: the PixiJS world, the social layer with
whatever park the user was standing in, a half-typed form. That is expensive on
a rotation and it was *catastrophic* on a phone, because a keyboard shrinks the
layout viewport enough to look like one — so opening the keyboard to name a park
or write a message tore the whole screen down and rebuilt it. Users reported it,
accurately, as the app crashing and restarting.

Both halves are fixed and both are worth keeping: `useLayoutMode` no longer
mistakes a keyboard for a rotation (it requires `orientation: landscape`), and
the tree no longer costs the world when the mode does legitimately change.

The header stays at the top in both shapes. In landscape that spends 44 of 375
pixels of height, which is the price of the tree being identical.

### The keyboard is a third section the page cannot see

A mobile browser does not shrink the layout viewport when the on-screen keyboard
opens; only the *visual* viewport changes. So `100svh` keeps describing the whole
screen and the bottom of the shell — where every composer in this product lives —
ends up underneath the keyboard.

`lib/useViewport.ts` publishes `--app-height` and `--keyboard-inset`, and it has
to read **two** signals because the fix for one platform hides the symptom on it:

```text
  Android, with interactive-widget=resizes-content (index.html)
    the LAYOUT viewport shrinks, so both measures agree and there is no
    difference to subtract. The keyboard is found by noticing the screen lost a
    third of itself without changing width

  iOS, which honours no such thing
    the layout viewport is unchanged and is scrolled up behind the keyboard, so
    the visual viewport is what shrank and `offsetTop` is the push
```

And then the room **stands down**: while a keyboard is open the compact layout
animates the room band to zero and gives the whole visible area to the
conversation. Typing means you are writing rather than watching. The habitat is
clipped rather than unmounted or resized — a PixiJS renderer asked to draw a
zero-height box does not reliably come back.

A conversation is a column, not a tall block: header pinned, log scrolling,
composer at the bottom. `lib/useStickToBottom.ts` keeps the log on its newest
line *including when the box shrinks*, which a `[messages]` effect cannot see.

### While a keyboard is up, the thing being typed into owns the screen

A phone with a keyboard has about 300 points left. The page was spending eighty
of them on a title, a where-am-I switch and a row of tabs — none of which
anybody looks at mid-sentence. So on a compact screen, `keyboardOpen` takes the
header and the tab strip away, and the room band was already collapsing.

They come back when the keyboard does. Nothing has to be dismissed and nothing
can be got stuck in: the exit is the keyboard's own exit, which is the one
control on a phone everybody already knows. Both are *unmounted* rather than
hidden — a header that is merely invisible is still in the tab order.

This is one rule, so it covers every field without being asked to: a message, a
park's name, a goal, the creature's name.

### Two jobs are screens, not panels

`components/ui/sheet.tsx`. On a small screen, **a conversation** and **opening a
park** take the whole viewport: one title bar, one way back, nothing else
competing.

Both are jobs you do with both hands and your whole attention, and both were
being done inside a panel that was itself inside a page — a form you could not
move around in and a conversation you could not read. It is also not a new idea
here: it is what the social layer already does with the world column when you
walk into a park.

```text
  a Sheet is        the viewport, portalled to <body> so no ancestor's
                    overflow, transform or stacking context can clip it
  a Sheet is not    a modal. No scrim, and it has not covered the page —
                    it has replaced it
  but it does       mark the app root `inert`, so Tab cannot walk into the
                    page behind, and focus the back arrow on open
```

The park form's buttons live in the sheet's footer, outside the scrolling form
and attached by `form=`. A commit button below the fold is a form people abandon.

### A submit button says why, rather than going grey

The Web Interface Guidelines are right and a phone makes it obvious: a
greyed-out button at the bottom of a screen, whose reason is a field you have
scrolled past, is a dead end with no explanation. "Open it" stays live and,
pressed early, says what is missing.

### Nothing autofocuses on a touch device

`autoFocus` on a phone throws the keyboard up over the page before anybody has
said they want to type. It is a courtesy on a pointer device and an ambush on a
phone, so it is gated on `(pointer: coarse)`.

### The renderer follows its host

`resizeTo` sounds like it does this and does not: PixiJS reads the element on
`init` and then only on a *window* resize. An application that started life
inside a box of no size stays at no size forever.

Which is how the park came out wrong on a desktop. The social layer renders a
park through a portal into a host the dashboard was still hiding, so the canvas
initialised at 0×0 and no window resize followed. Two changes, and both are
worth having: the host now hides with `empty:hidden` — CSS `:empty` stops
applying in the same commit React appends the portal's child, a render earlier
than any state could — and `PetHabitat` observes its own host, so a canvas that
starts at no size recovers instead of staying wrong.

## 20.6 Skeletons

`components/ui/skeleton.tsx` is the one placeholder shape in the product —
shadcn's `Skeleton`, hand-written to match `card.tsx`'s conventions (there is
no `components.json`; shadcn is used here as a style, not a CLI). Every
loading placeholder in the panels — grid tiles (`option-grid.tsx`'s
`Thumbnail`), the customizer's own shape before the customizer arrives
(`CustomizerSkeleton.tsx`), Memories' cards, the Pet Library's tiles — is
built from it, so they all breathe at the same rate and stop together under
`prefers-reduced-motion`.

**A skeleton must occupy the exact box its real content will occupy.** A
placeholder of the wrong size is a layout shift with extra steps; this is the
same discipline as §20.4's frame-shape rule, applied to loading states.

**It breathes, it does not sweep.** `.petweb-skeleton`'s animation is a slow
opacity pulse (`index.css`), not a moving gradient — a sweep reads as a
progress bar that is nearly done, which a skeleton has no way of promising.

**Shown late, held long.** `lib/useDelayedVisible.ts` is the one place the
timing lives: nothing appears until the wait has run 150 ms (so a 90 ms fetch
never flashes a skeleton for three frames), and once shown it stays at least
400 ms (so a skeleton that would otherwise vanish in 40 ms doesn't read as a
flicker in the other direction). Every skeleton in the product is gated by
this hook rather than reimplementing its own timing.

## 20.7 The loading screen

`features/habitat/WorldLoader.tsx` is what covers the habitat frame — and
**only** the frame, never the tools beside it — while the room is still being
assembled. Two decisions shape it:

**The creature is the loading animation.** `DancingPet`, the same animated
renderer the product already had (`features/pets/DancingPet.tsx`), bobs in
place while the room loads. This is the one loading asset a generic spinner
could never be: a small preview of the thing about to appear.

**Progress is a ring, not a bar.** An SVG arc closing on itself around the
creature reads as "the world is assembling," where a filling bar reads as a
file download — and it would be lying about what is actually happening
(`useWorldProgress` measures four weighted phases of *render work* — session,
data, world, settled — never bytes). The ring geometry is one radius/
circumference pair (`WorldLoader.tsx`) so the dash maths cannot drift from the
visible circle.

The overlay fades over 200 ms rather than disappearing on one frame, and is
held for a minimum visible time the same way a skeleton is (§20.5) — a room
that loads instantly should not flash a loading screen either.

---

# 21. UI vs World

The visual hierarchy should be:

```text
1. PET
2. ENVIRONMENT
3. INTERACTIVE OBJECTS
4. ATMOSPHERE
5. UI
```

UI should support the experience rather than become the experience.

---

# 22. Prohibited Visual Direction

The project should NOT resemble:

### Generic children's cartoon aesthetic

Avoid overly simplistic, aggressively saturated cartoon visuals.

### Flat vector UI illustrations

Avoid:

```text
Solid shape
+
solid color
+
black outline
```

as the primary visual language.

### Pony-tail / overly glossy character style

Avoid overly polished, plastic, fashion-doll-like character aesthetics.

Characters should feel like **strange little creatures**, not conventional cartoon mascots.

### Generic mobile-game aesthetics

Avoid:

* Excessive gradients
* Excessive glossy effects
* Giant buttons
* Aggressive reward visuals
* Excessive particle explosions
* Hyper-saturated colors

### Corporate productivity aesthetics

Avoid making the application resemble:

* Notion
* Trello
* Standard task managers
* SaaS dashboards

The productivity functionality exists underneath the experience.

It should not dominate the visual identity.

---

# 23. Visual Keywords

The overall art direction should be guided by these keywords:

```text
Dreamy
Cozy
Soft
Whimsical
Organic
Colorful
Atmospheric
Warm
Surreal
Cute
Expressive
Gentle
Indie
Lived-in
Magical
```

---

# 24. Visual Keywords to Avoid

Avoid these directions:

```text
Corporate
Flat
Sterile
Neon
Plastic
Overly glossy
Generic cartoon
Generic children's app
Hyper-realistic
Photorealistic
Harsh
Aggressively saturated
Mechanical
Minimal to the point of emptiness
```

---

# 25. Overall Visual Formula

The intended visual result should follow approximately:

```text
                DREAMY WORLD

       Soft Colors
            +
       Organic Shapes
            +
       Procedural Creatures
            +
       Soft Lighting
            +
       Atmospheric Effects
            +
       Contact Shadows
            +
       Subtle Animation
            +
       Environmental Depth
            ↓
       COZY LIVING WORLD
```

---

# 26. Final Design Principle

The application should feel like **a tiny illustrated world that happens to be alive**.

It should not feel like a productivity application with a pet attached to it.

It should not feel like a conventional game.

It should feel like opening a small window into a strange, cozy world where an absurd little creature has its own personality, habits, room, and life.

The visual system should therefore prioritize:

> **Atmosphere over decoration.
> Form over flat color.
> Lighting over outlines.
> Personality over polish.
> Organic movement over mechanical animation.**

The final result should be colorful enough to feel joyful, soft enough to feel cozy, and strange enough to feel uniquely its own.

```
```
