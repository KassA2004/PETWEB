````md
# PET ANATOMY & PROCEDURAL CHARACTER SYSTEM

## 1. Purpose

The pet system is a **code-based 2D procedural character system**.

Pets are not stored as complete static images.

Instead, every pet is constructed from a standardized anatomical rig that can be customized through parameters.

The core principle is:

> **One standardized rig, many different creatures.**

Every creature must remain compatible with the same fundamental anatomy and animation system regardless of its appearance.

---

# 2. Visual Direction

The creature is a **blob**: one soft mass with a face on it.

It is not an animal. It has no head, no neck, no ears and no tail. Trying to
give it those things is what turns a blob back into a generic cartoon pet.

The creatures should have:

- One unbroken silhouette, with small things poking out of it
- A rounded-square (squircle) mass rather than a circle or a box
- A large, simple, readable face placed high on the mass
- Stubby arms and feet that exist for motion, not for detail
- Flat fills, bold color, minimal detail
- Ability to become absurd through customization

The base visual concept is:

```text
        ,--.
       (    )        <- topper
      __|__|__
     |        |
     |  ●  ●  |      <- face, high on the mass
    -|    ω   |-     <- arms
     |        |
     |________|
       ▄    ▄        <- feet
```

The exact appearance can vary, but the underlying anatomical structure remains standardized.

---

# 3. Standardized Base Rig

Every creature must be constructed from the following core components:

```text
Pet
│
├── Body
│
├── Arm Left
├── Arm Right
│
├── Foot Left
├── Foot Right
│
├── Topper
│
├── Face
│   ├── Left Eye
│   ├── Right Eye
│   └── Mouth
│
└── Optional Accessories
```

These components form the **Base Rig**.

The Base Rig is the foundation for every pet.

---

# 4. Anatomical Hierarchy

The character should use a parent-child hierarchy.

```text
Pet Root
│
└── Body
    │
    ├── Foot Left
    ├── Foot Right
    │
    ├── Arm Left
    ├── Arm Right
    │
    ├── Topper
    │
    └── Face
        ├── Eye Left
        ├── Eye Right
        └── Mouth
```

Moving the body should automatically move everything attached to it.

Moving the face should move the eyes and mouth.

Moving an individual arm should not move the body.

Everything except the face sits **behind** the body mass in draw order. The
blob is one unbroken silhouette with small parts emerging from it — feet below,
arms at the sides, topper above.

---

# 5. Coordinate / Anchor System

Each anatomical component must have standardized attachment points.

The rig should define anchors such as:

```text
Body
├── faceAnchor
├── armLeftAnchor
├── armRightAnchor
├── footLeftAnchor
├── footRightAnchor
└── topperAnchor
```

The face defines:

```text
Face
├── leftEyeAnchor
├── rightEyeAnchor
├── mouthAnchor
├── leftCheekAnchor
└── rightCheekAnchor
```

These anchors define where components attach.

This allows the visual appearance of a component to change without breaking the animation system.

The pet root sits **on the floor, between the feet**: `-y` is up, and the blob
faces the viewer. So the body centre has a negative y, and the feet land on
`y = 0`.

---

# 6. Standardized Anatomy Requirement

Every pet MUST conform to the Base Rig.

Customization changes the appearance and proportions of the rig but does not fundamentally remove required anatomical attachment points.

For example:

```text
Standard Pet
├── Rounded square mass
├── Two dot eyes
├── Small arms and feet
└── A puff on top
```

Can become:

```text
Tall Pet
├── Narrow, tall mass
├── Sparkle eyes
├── Long arms
└── An antenna
```

Or:

```text
Wide Pet
├── Low, wide mass
├── Sleepy eyes
├── Tiny feet
└── A sprout
```

Or:

```text
Absurd Pet
├── Small mass
├── Enormous eyes
├── Huge arms and feet
└── A topper bigger than the body
```

All remain compatible with the same rig.

---

# 7. Customization Methodology

Customization should modify parameters rather than replacing the entire character.

Example:

```ts
interface PetBodyParameters {
  bodyScale: number;
  eyeScale: number;
  eyeSpacing: number;
  mouthScale: number;
  topperScale: number;
  armScale: number;
  footScale: number;
}
```

A pet could therefore have:

```json
{
  "body":   { "type": "pebble", "scale": 1.2 },
  "eyes":   { "type": "sparkle", "scale": 1.4, "spacing": 0.22 },
  "mouth":  { "type": "grin", "scale": 1.1 },
  "topper": { "type": "antenna", "scale": 1.6 },
  "arms":   { "scale": 0.8 },
  "feet":   { "scale": 1.0 }
}
```

The rig remains identical.

Only its parameters change.

---

# 8. Appearance vs Anatomy

The system must separate:

## Anatomy

Defines:

* Where body parts exist
* How parts connect
* Where joints are
* How parts move
* How animation works

## Appearance

Defines:

* Shape
* Size
* Color
* Pattern
* Eyes
* Mouth
* Topper style
* Accessories

Example:

```text
ANATOMY
    ↓
Standard blob rig

APPEARANCE
    ↓
Rounded square mass
Dot eyes
Wave mouth
Tiny feet
Cloud puff on top
Pink
```

This separation is critical.

Changing appearance must not require rewriting the animation system.

---

# 9. Code-Based Geometry

The creature should primarily be constructed from procedural vector geometry.

There are only three silhouette primitives in the whole project:

```text
Squircle        rounded-square masses  — the blob, cushions
Organic Oval    soft wobbly ovals      — puffs, foliage, background shapes
Capsule         stubby limbs and stems — arms, feet, stalks
```

Everything is drawn **flat**: one fill per shape, no gradients, no filters.
Depth comes from stacking a small number of flat shapes in the right order.

Example:

```text
Body
= squircle
+ belly patch
+ one shade shape
+ one shine shape

Eye
= dark squircle
+ highlight dot
+ lid

Mouth
= one or two stroked curves

Arm / Foot
= capsule or flat oval
```

PixiJS should render the resulting geometry.

---

# 10. Shape Generators

Create reusable procedural shape generators.

Example:

```ts
createBody(parameters)
createFace(parameters)
createEye(parameters)
createMouth(parameters)
createArm(parameters)
createFoot(parameters)
createTopper(parameters)
```

These functions should generate visual components based on standardized parameters.

They should not contain pet-specific behavior.

---

# 11. Rig Generation

The character should be generated through a central rig builder.

Conceptually:

```ts
createPet({
  anatomy,
  appearance,
  personality
});
```

The builder creates:

```text
Pet Root
    ↓
Body
    ↓
Feet
    ↓
Arms
    ↓
Topper
    ↓
Face
```

Each generated component is attached to its appropriate anchor.

---

# 12. Animation System

Animations operate on the standardized rig rather than individual creature designs.

The animation system should support:

```text
IDLE
WALK (hop)
RUN
SLEEP
EAT
PLAY
LOOK
SNIFF
INTERACT
HAPPY
SAD
SURPRISED
```

Because every creature uses the same rig, these animations can be reused.

---

# 13. Hop Animation

A blob does not walk, it hops. One hop is the whole cycle, and the cycle is
built from two curves:

```text
hop      0 on the ground, 1 at the apex   -> height and stretch
squash   strongest the instant it lands   -> the splat
```

Stretch on the way up, squash on the landing: that pairing is what makes a soft
body read as soft.

Everything else hangs off the same two curves:

```text
Feet tuck up and swing under
Arms fling out
Face lags a beat behind the mass
Topper whips over and settles
```

The exact amplitude should be influenced by the pet's proportions.

For example:

```text
Tiny feet
→ small hops

Tall feet
→ big hops
```

The animation system adapts to the rig parameters.

---

# 14. Animation Independence

Animation should not depend on a specific appearance.

This must work:

```text
Round Pebble Pet
     ↓
WALK animation
```

and:

```text
Absurd Tower Pet
     ↓
Same WALK animation
```

The animation system operates on:

```text
joints
anchors
transforms
```

rather than specific visual assets.

---

# 15. Facial System

The face is a single group sitting on the front of the blob, and it is its own
joint. The animation layer slides the whole face a few pixels to suggest the
creature turning — that is the only "head turn" a blob needs.

```text
Face
├── Cheeks
├── Eyes
│   └── Lids
└── Mouth
```

The face is **clipped to the body silhouette**, so a wide-set eye or a cheek on
a narrow creature slides under the edge of the mass instead of floating beside
it.

Eyes should support:

```text
Open
Closed
Sleepy
Happy
Surprised
Wide
```

The eyes should also support procedural movement:

```text
Look Left
Look Right
Look Up
Look Down
Look At Object
Look At Cursor
Blink
```

This allows the pet to appear responsive without requiring unique animation assets.

Each eye is built the same way regardless of type:

```text
pupil   the dark shape. Slides a few pixels to look around.
lid     coat-colored cover, scaled 0 (open) to 1 (shut).
lash    a curve riding the lid's lower edge, so a shut eye reads as shut.
```

---

# 16. Topper System

The topper is the one thing growing out of the top of the blob. With no ears
and no tail, this is where the creature's silhouette variety lives.

Possible topper styles:

```text
None
Puff
Sprout
Antenna
Swirl
Ridiculous
```

Toppers attach to a single anchor at the crown and rotate around their base,
which is what lets the wobble layer drag them a frame behind the body.

Each topper type carries a floppiness value:

```text
Heavy puff
→ barely moves

Thin antenna
→ whips
```

Animations can include:

```text
Idle drift
Happy bounce
Fear pull-back
Curiosity tip-forward
Sleep droop
```

---

# 17. Limb System

Arms and feet are nubs. They exist for motion, not for detail: an arm that
swings and a foot that peeks out under the body is what stops the creature
reading as a beanbag.

Both hang from their own origin, so the rig can rotate them about their
attachment point.

```text
Arms
→ splay outward at rest
→ swing, fling, reach, flop

Feet
→ spread under load
→ tuck up mid-hop
→ slide out when the body melts
```

---

# 18. Procedural Expression

Expressions should be generated by combining transformations of the face and
the mass.

For example:

```text
Happy
├── Mouth stretched wide
├── Face raised slightly
└── Body bouncing

Sad
├── Eyes lowered
├── Face slid down the mass
└── Mass settled and widened

Surprised
├── Eyes enlarged
├── Mouth open
├── Mass stretched tall
└── Topper flicked upright
```

No separate complete character sprite is required for each expression.

---

# 19. Visual Layering

The pet should be rendered in layers.

```text
Layer 1
Contact Shadow

Layer 2
Feet

Layer 3
Arms

Layer 4
Topper

Layer 5
Body

Layer 6
Face

Layer 7
Accessories

Layer 8
Effects
```

This keeps the body as one unbroken silhouette with small parts emerging from
behind it.

---

# 20. Rendering Methodology

The pet should exist as a PixiJS scene graph.

Conceptually:

```text
Pixi Container
│
└── Pet Container
    │
    ├── Contact Shadow
    └── Body
        ├── Feet
        ├── Arms
        ├── Topper
        ├── Body Art
        └── Face
```

Each component is independently transformable.

---

# 21. Pet Configuration

A pet should be represented by data rather than hardcoded visual code.

Example:

```ts
interface PetAppearance {
  bodyType: BodyType;
  bodyScale: number;

  eyeType: EyeType;
  eyeScale: number;
  eyeSpacing: number;

  mouthType: MouthType;
  mouthScale: number;

  topperType: TopperType;
  topperScale: number;

  armScale: number;
  footScale: number;

  primaryColor: number;
  secondaryColor: number;
  accentColor: number;

  pattern: PatternType;
  seed: number;
}
```

The configuration can be stored in the database as JSON.

The rendering system converts the configuration into the visual character.

---

# 22. Random / Procedural Generation

The system should support generating creatures from a seed.

Example:

```ts
generatePet(seed);
```

The same seed must generate the same creature.

Example:

```text
Seed: 182739

Body:
Wide pebble

Eyes:
Two sleepy

Mouth:
Flat line

Topper:
Antenna

Colors:
Pastel blue
```

This creates a reproducible procedural character.

---

# 23. Customization Constraints

Customization should have boundaries.

The user should be able to create absurd creatures, but the creature must remain compatible with the base rig.

Allowed:

```text
Huge mass
Tiny feet
Enormous eyes
Giant topper
Wide body
Small mouth
Different colors
Asymmetrical accessories
```

Not allowed by the base system:

```text
Removing the body entirely
Removing all required attachment points
Changing the rig hierarchy
Creating arbitrary anatomy that the animation system cannot understand
```

Advanced anatomy can be added later through additional rig types.

---

# 24. Rig Types

The initial project should use ONE primary rig.

```text
BlobRig
```

All initial creatures must use it.

Future rig types may include:

```text
BlobRig
FlyingRig
QuadrupedRig
HumanoidRig
MultiLegRig
```

These should only be introduced if the project eventually requires them.

The first version should not attempt to support multiple fundamentally different anatomies.

---

# 25. Core Design Rule

The most important rule of the character system is:

> **Customization changes the creature's appearance and proportions, not the fundamental rig.**

The animation system should be designed around the standardized rig.

The renderer should be designed around flat procedural geometry.

The database should store configuration.

The pet simulation should control behavior.

The system should therefore follow:

```text
Pet Data
    ↓
Appearance Parameters
    ↓
Standardized Blob Rig
    ↓
Procedural Geometry
    ↓
Animation System
    ↓
PixiJS
    ↓
Visible Creature
```

This allows the project to create a large variety of cute and absurd creatures without creating a separate character model and animation system for every pet.

```
```
