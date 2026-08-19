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

The creatures should have:

- Cute animal-like proportions
- Four-legged anatomy
- Rounded and soft shapes
- Large expressive heads/eyes
- Short or stylized limbs
- Expressive tails
- Simplified anatomy
- Dreamy indie-game visual language
- Ability to become absurd through customization

The creatures should feel like fictional animals rather than realistic cats.

The base visual concept is:

```text
        EARS
       /    \
      / HEAD \
     |  ●  ●  |
     |   ◡    |
      \______/
          |
       NECK
          |
     ┌─────────┐
     │  BODY   │
     │         │
     └─────────┘
      /  | |  \
     /   | |   \
   LEG  LEG LEG LEG
          |
        TAIL
````

The exact appearance can vary, but the underlying anatomical structure remains standardized.

---

# 3. Standardized Base Rig

Every creature must be constructed from the following core components:

```text
Pet
│
├── Body
│
├── Head
│
├── Neck
│
├── Front Leg Left
├── Front Leg Right
├── Back Leg Left
├── Back Leg Right
│
├── Tail
│
├── Ear Left
├── Ear Right
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
    ├── Neck
    │   └── Head
    │       ├── Ear Left
    │       ├── Ear Right
    │       └── Face
    │           ├── Eye Left
    │           ├── Eye Right
    │           └── Mouth
    │
    ├── Front Leg Left
    ├── Front Leg Right
    ├── Back Leg Left
    ├── Back Leg Right
    │
    └── Tail
```

Moving the body should automatically move all children attached to it.

Moving the head should move the eyes, mouth, and ears.

Moving an individual leg should not move the body.

---

# 5. Coordinate / Anchor System

Each anatomical component must have standardized attachment points.

The rig should define anchors such as:

```text
Body
├── headAnchor
├── frontLegLeftAnchor
├── frontLegRightAnchor
├── backLegLeftAnchor
├── backLegRightAnchor
└── tailAnchor
```

The head defines:

```text
Head
├── leftEyeAnchor
├── rightEyeAnchor
├── mouthAnchor
├── leftEarAnchor
└── rightEarAnchor
```

These anchors define where components attach.

This allows the visual appearance of a component to change without breaking the animation system.

---

# 6. Standardized Anatomy Requirement

Every pet MUST conform to the Base Rig.

Customization changes the appearance and proportions of the rig but does not fundamentally remove required anatomical attachment points.

For example:

```text
Standard Pet
├── Body
├── Head
├── 4 Legs
└── Tail
```

Can become:

```text
Fat Pet
├── Large Body
├── Small Head
├── Short Legs
└── Tiny Tail
```

Or:

```text
Long Pet
├── Long Body
├── Large Head
├── Long Legs
└── Long Tail
```

Or:

```text
Absurd Pet
├── Huge Body
├── Tiny Head
├── Extremely Short Legs
└── Giant Tail
```

All remain compatible with the same rig.

---

# 7. Customization Methodology

Customization should modify parameters rather than replacing the entire character.

Example:

```ts
interface PetBodyParameters {
  width: number;
  height: number;
  headScale: number;
  legLength: number;
  legWidth: number;
  tailLength: number;
  earSize: number;
}
```

A pet could therefore have:

```json
{
  "body": {
    "width": 1.4,
    "height": 0.9
  },
  "head": {
    "scale": 1.3
  },
  "legs": {
    "length": 0.65,
    "width": 0.4
  },
  "tail": {
    "length": 1.5
  },
  "ears": {
    "size": 0.8
  }
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
* Texture
* Eyes
* Ears
* Mouth
* Tail style
* Accessories

Example:

```text
ANATOMY
    ↓
Standard four-legged rig

APPEARANCE
    ↓
Round body
Large eyes
Tiny legs
Huge ears
Cloud tail
Lavender color
```

This separation is critical.

Changing appearance must not require rewriting the animation system.

---

# 9. Code-Based Geometry

The creature should primarily be constructed from procedural vector geometry.

Potential primitives:

```text
Circle
Ellipse
Rounded Rectangle
Bezier Curve
Polygon
Custom Path
```

These primitives can be combined into more complex shapes.

Example:

```text
Body
= rounded ellipse
+ custom curves
+ shading

Head
= rounded shape
+ ears
+ face

Leg
= rounded capsule
+ paw

Tail
= bezier curve
```

PixiJS should render the resulting geometry.

---

# 10. Shape Generators

Create reusable procedural shape generators.

Example:

```ts
createBody(parameters)
createHead(parameters)
createLeg(parameters)
createEar(parameters)
createTail(parameters)
createEye(parameters)
createMouth(parameters)
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
Head
    ↓
Face
    ↓
Legs
    ↓
Tail
```

Each generated component is attached to its appropriate anchor.

---

# 12. Animation System

Animations operate on the standardized rig rather than individual creature designs.

The animation system should support:

```text
IDLE
WALK
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

# 13. Walking Animation

Walking should use a standardized four-legged gait.

Example:

```text
Phase 1

Front Left  → Forward
Back Right  → Forward

Front Right → Back
Back Left   → Back


Phase 2

Front Right → Forward
Back Left   → Forward

Front Left  → Back
Back Right  → Back
```

The body should also have subtle:

```text
Vertical bounce
Horizontal movement
Head movement
Tail movement
```

The exact amplitude should be influenced by the pet's body proportions.

For example:

```text
Short legs
→ smaller stride

Long legs
→ larger stride
```

The animation system adapts to the rig parameters.

---

# 14. Animation Independence

Animation should not depend on a specific appearance.

This must work:

```text
Cat-like Pet
     ↓
WALK animation
```

and:

```text
Absurd Pet
     ↓
Same WALK animation
```

The animation system operates on:

```text
joints
anchors
bones
transforms
```

rather than specific visual assets.

---

# 15. Facial System

The face should be modular.

```text
Face
├── Eyes
├── Pupils
├── Eyebrows (optional)
└── Mouth
```

Eyes should support:

```text
Open
Closed
Sleepy
Happy
Surprised
Wide
Angry
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

---

# 16. Tail System

The tail should be procedurally animated.

Possible tail styles:

```text
Short
Long
Curved
Fluffy
Thin
Round
Ridiculous
```

The tail should have one or more controllable segments or a curve.

Animations can include:

```text
Idle sway
Happy wag
Fear curl
Curiosity movement
Sleep movement
```

The tail's behavior can eventually respond to the pet's state.

---

# 17. Ear System

Ears should have standardized attachment points.

Possible variations:

```text
Small
Large
Round
Pointed
Floppy
Asymmetrical
Ridiculous
```

Ears can independently rotate.

Example:

```text
Curious
→ ears forward

Sad
→ ears downward

Surprised
→ ears upward

Sleep
→ ears relaxed
```

---

# 18. Procedural Expression

Expressions should be generated by combining facial transformations.

For example:

```text
Happy
├── Eyes slightly closed
├── Mouth smiling
└── Head slightly raised

Sad
├── Eyes lowered
├── Mouth curved downward
└── Head lowered

Surprised
├── Eyes enlarged
├── Pupils enlarged
├── Mouth open
└── Head moved backward
```

No separate complete character sprite is required for each expression.

---

# 19. Visual Layering

The pet should be rendered in layers.

Example:

```text
Layer 1
Back Legs

Layer 2
Tail

Layer 3
Body

Layer 4
Front Legs

Layer 5
Neck

Layer 6
Head

Layer 7
Face

Layer 8
Accessories

Layer 9
Effects
```

This allows limbs and accessories to appear naturally in front of or behind the body.

---

# 20. Rendering Methodology

The pet should exist as a PixiJS scene graph.

Conceptually:

```text
Pixi Container
│
└── Pet Container
    │
    ├── Back Legs
    ├── Tail
    ├── Body
    ├── Front Legs
    ├── Head
    ├── Face
    ├── Accessories
    └── Effects
```

Each component is independently transformable.

---

# 21. Pet Configuration

A pet should be represented by data rather than hardcoded visual code.

Example:

```ts
interface PetAppearance {
  body: BodyConfig;
  head: HeadConfig;
  legs: LegConfig;
  ears: EarConfig;
  eyes: EyeConfig;
  mouth: MouthConfig;
  tail: TailConfig;
  colors: ColorConfig;
  accessories: AccessoryConfig[];
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
Large rounded

Head:
Oversized

Eyes:
Three sleepy eyes

Legs:
Very short

Tail:
Long curly tail

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
Huge head
Tiny legs
Long tail
Large ears
Wide body
Small eyes
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
QuadrupedRig
```

All initial creatures must use it.

Future rig types may include:

```text
QuadrupedRig
FlyingRig
BlobRig
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

The renderer should be designed around procedural geometry.

The database should store configuration.

The pet simulation should control behavior.

The system should therefore follow:

```text
Pet Data
    ↓
Appearance Parameters
    ↓
Standardized Quadruped Rig
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
