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
Dream Blue
Lavender
Dusty Rose
Soft Peach
Warm Cream
Muted Mint
Soft Yellow
Deep Indigo
```

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

---

# 9. Materials and Surface Treatment

Objects should not generally appear as completely flat color-filled shapes.

Instead, surfaces should use combinations of:

```text
Base tone
+
Subtle shading
+
Soft highlight
+
Shadow
+
Optional texture
```

The result should remain visually simple but have enough variation to feel tangible.

For example:

```text
Flat object:

████████

Preferred:

    light
   ╱────╲
  │      │
  │      │
   ╲────╱
      ↓
   shadow
```

The exact implementation can use procedural gradients, vector geometry, filters, and lighting effects.

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

The standardized quadruped anatomy must remain underneath the customization system.

---

# 12. Creature Rendering

Creature geometry should be procedurally generated.

The renderer should support:

```text
Procedural shapes
+
Gradients
+
Highlights
+
Shadows
+
Soft outlines
+
Glow where appropriate
```

The creature should not look like a collection of primitive circles and rectangles.

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
