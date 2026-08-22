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
where it will land — the row it is over is brightened, an ellipse sits flat on
the floor at the landing point, and a dashed tether joins the two. Objects set
down snap to a row.

None of it is visible when nothing is being moved. Affordances belong to the
moment a decision is being made, and this room is meant to be looked at the
rest of the time.

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

---

# 11. Creature Design

Creatures should be the visual centerpiece.

They should have:

* Soft rounded forms
* Expressive silhouettes
* Large readable eyes
* Small expressive details
* Gentle shading
* Subtle highlights
* Soft contact shadows
* Strong visual personality

The creature should remain recognizable at small sizes.

The standardized blob anatomy must remain underneath the customization system.

---

# 12. Creature Rendering

Creature geometry should be procedurally generated.

The renderer should support:

```text
Procedural shapes
+
Tone-ramp gradient fills
+
One gloss highlight
+
Markings clipped to the silhouette
+
Soft outlines
+
A contact shadow
```

Dark creatures are a special case worth naming: a dark eye on a dark coat is
not an eye, it is a hole. Parts check the coat's perceived brightness and add
their own contrast when the body cannot provide it.

The creature should not look like a collection of primitive circles and
rectangles. The squircle — a rounded square that is neither box nor ball — is
the signature silhouette: it reads as a soft mass with weight, and it is what
makes the blob a creature rather than a bubble.

Procedural geometry should be used to create **organic-looking silhouettes**.

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
