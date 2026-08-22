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

- One unbroken silhouette, with parts growing out of it
- A soft mass — squircle, egg, pear, loaf — rather than a circle or a box
- A large, simple, readable face
- Feet fused into the silhouette, and **no arms at all**
- Soft vertical shading built from one base colour
- Ability to become absurd through customization

**There are no arms and no leg joints.** Feet are shapes drawn into the bottom
of the body silhouette. This is a deliberate reversal of the earlier design:
separate limbs on a legless blob were impossible to animate convincingly, and
their presence pushed every animation toward squashing the body to compensate.
Removing them freed the animation system to express movement through lean, hop,
rotation and springy appendages instead (§17).

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
├── Body            (feet fused into the silhouette)
│
├── Ear Left        (or horn, antenna, fin)
├── Ear Right
│
├── Wing Left
├── Wing Right
│
├── Tail
├── Topper
│
├── Face
│   ├── Left Eye
│   ├── Right Eye
│   ├── Left Brow
│   ├── Right Brow
│   ├── Snout
│   └── Mouth
│
└── Optional Accessories
```

Every slot accepts `none`, and every slot is independent. A creature with no
ears, no wings, no tail and no snout is a valid creature; so is one with all of
them at once.

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
    ├── Wing Left           behind the mass
    ├── Wing Right
    ├── Tail
    ├── Ears                behind or in front, per ear type
    ├── Topper
    │
    ├── Body Art            the silhouette, with the feet drawn into it
    │
    ├── Neck Accessory
    │
    ├── Face                clipped to the silhouette
    │   ├── Cheeks
    │   ├── Snout
    │   ├── Eye Left, Eye Right
    │   ├── Brow Left, Brow Right
    │   ├── Mouth
    │   └── Face Accessory
    │
    └── Head Accessory
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
├── topperAnchor
├── headAccessoryAnchor
└── neckAccessoryAnchor
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
  bodyScale: number;   // overall size
  bodyWidth: number;   // the "how fat" dial, independent of size
  bodyHeight: number;
  eyeScale: number;
  eyeSpacing: number;
  eyeHeight: number;   // where the eyes sit on the mass, 0 high .. 1 low
  earScale: number;
  earSpread: number;
  wingScale: number;
  tailScale: number;
  footScale: number;
  restingMood: number; // -1 permanently unimpressed .. +1 permanently pleased
  fangs: number;
}
```

Three of these carry most of the character. `eyeHeight` and `eyeScale` decide
whether a creature reads as a baby (large eyes, low on the face) or as a threat
(small eyes, high on the face). `restingMood` is the personality the expression
system blends every feeling out of. Together with brow shape and `fangs`, they
are what the Cuteness dial actually moves.

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

# 17. Appendage System

Appendages are ears, wings and tails. They carry two jobs at once: they are
where a creature's identity lives, and they are where its animation lives.

## Identity

A pink mass with long ears is a rabbit. The same mass with round ears and a
curl is a pig. With antennae and wings it is a bee. Nothing about the body
changed — which is why the library invests in appendage variety rather than in
body shapes.

```text
Ears     none, bunny, cat, round, floppy, antennae, horns, fins
Wings    none, bee, butterfly, bird, bat, tiny
Tails    none, puff, curl, long, stinger, fluffy
```

Ears cover horns and antennae because the rig cannot tell the difference: they
are all one shape on one joint at the top of the head.

## Motion

Every appendage hangs off a spring. Nothing about ear movement is authored —
the spring is pulled by whatever the body just did, so:

```text
Creature accelerates left   ->  ears swing right
Creature lands hard         ->  everything bounces
Creature is shaken          ->  the whole set flails
Creature turns around       ->  the tail arrives late
```

Each type declares how it behaves rather than what it does:

```text
floppiness   how far it lags behind the body
weight       how long it keeps moving afterwards
flutter      idle wingbeat rate — a bee buzzes, a bird glides
```

A floppy ear and a horn use the same code and look completely different,
because a horn has a floppiness of 0.15 and an ear has 1.5.

This is the single most important decision in the animation system. Loose
parts moving is what makes motion legible, which means **the body itself
almost never has to deform** — see /Docs/animation-approach.md §56.

## Feet

Feet are not appendages. They are drawn into the body silhouette and never
move independently, because a legless creature with animated legs looks like a
puppet. They exist to tell you which way is down.

```text
none, nubs, paws, hooves, talons, four
```

---

# 18. Accessory System

Accessories are the widest customization surface in the project. Where the body
and face offer a handful of shapes each, accessories offer a catalog — and each
item takes a **free color and a free size**, so "a hat" really means "any hat,
in any color, at any size".

There are three slots, and a slot holds at most one item:

```text
head    hats, crowns, flowers, bows
face    glasses, shades, eyepatches
neck    ties, bows, scarves, collars, bandanas
```

Each slot defines one anchor and one reference width. Accessory art scales
itself from that width, which is what lets the same top hat fit a tiny pebble
blob and an enormous tower blob with no per-body special cases.

Slot behavior differs in one important way:

```text
head    attached to the body. Rocks with the wobble.
neck    attached to the body, lying on the mass.
face    attached to the FACE group, so eyewear rides with the eyes when the
        creature looks around, and inherits the face's clip to the silhouette.
```

Configuration is keyed by slot rather than stored as a list, so a second hat is
unrepresentable rather than something the renderer has to defend against:

```ts
accessories: {
  head?: { type: 'topHat',  color: 0x3d2233, scale: 1.0 };
  face?: { type: 'glasses', color: 0x3d2233, scale: 1.0 };
  neck?: { type: 'bowtie',  color: 0xef5f8c, scale: 1.2 };
}
```

---

# 19. Procedural Expression

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

# 20. Visual Layering

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
Neck Accessory

Layer 7
Face (and Face Accessory)

Layer 8
Head Accessory

Layer 9
Effects
```

This keeps the body as one unbroken silhouette with small parts emerging from
behind it.

---

# 21. Rendering Methodology

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
        ├── Neck Accessory
        ├── Face (Eyes, Mouth, Face Accessory)
        └── Head Accessory
```

Each component is independently transformable.

---

# 22. Pet Configuration

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

  /** One item per slot; every item takes a free color and size. */
  accessories: {
    head?: AccessoryConfig;
    face?: AccessoryConfig;
    neck?: AccessoryConfig;
  };

  seed: number;
}
```

The configuration can be stored in the database as JSON.

The rendering system converts the configuration into the visual character.

---

# 23. Random / Procedural Generation

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

# 24. Customization Constraints

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

# 25. Rig Types

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

# 26. Core Design Rule

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
