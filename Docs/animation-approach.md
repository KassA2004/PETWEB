````md
# PET ANIMATION & LIFE SYSTEM

## 1. Purpose

The animation system exists to make the digital pet feel like a living creature rather than an NPC waiting for the user to click something.

Animation should communicate:

- Personality
- Mood
- Curiosity
- Attention
- Energy
- Emotion
- Physical reactions
- Environmental awareness
- Independent behavior

The pet should appear to have its own small life.

The goal is NOT to create hundreds of animations.

The goal is to create a relatively small set of reusable animations that can be combined, interrupted, layered, and influenced by the pet's state.

---

# 2. Core Philosophy

The pet should never feel like:

```text
User clicks
    ↓
Pet performs animation
    ↓
Pet returns to idle
````

Instead, the pet should behave more like:

```text
Pet has internal state
        ↓
Pet observes environment
        ↓
Pet chooses behavior
        ↓
Behavior produces animation
        ↓
Pet reacts to what happens
        ↓
Pet returns to another behavior
```

The user should sometimes watch the pet and think:

> "Why the hell is it doing that?"

That is a feature.

Small unpredictable behaviors are important for creating the feeling of life.

---

# 3. Separation of Systems

The animation system must be separate from the behavior system.

```text
PET SIMULATION
"What does the pet want to do?"

        ↓

BEHAVIOR
"What action is it taking?"

        ↓

NAVIGATION
"How does it get there from here?"

        ↓

ANIMATION
"How does that action look?"

        ↓

PIXIJ
"Render it."
```

Navigation is a layer rather than a step inside behaviour for the reason §54
sets out at length: *where the creature wants to be* and *how it crosses a
room with furniture in it* fail in completely different ways, and a system that
answers both at once fails at both.

Example:

```text
Behavior:
InvestigateToy

Animation:
Walk
→ Stop
→ Look
→ Sniff
→ PawAtObject
```

The behavior determines the sequence.

The animation system handles the visual execution.

---

# 4. Pet State

The pet should maintain both persistent and runtime state.

## Persistent State

Stored in the database where appropriate.

Examples:

```text
personality
preferences
appearance
age
relationships
memories
```

## Runtime State

Exists while the pet simulation is running.

Examples:

```text
energy
mood
currentBehavior
currentTarget
attentionTarget
movement
animation
temporaryEmotion
```

Runtime state does not need to be continuously written to PostgreSQL.

---

# 5. Core Internal Variables

The pet simulation should use a small set of continuously changing values.

```text
Energy
Hunger
Comfort
Curiosity
Playfulness
SocialNeed
Sleepiness
Mood
```

These values influence behavior probabilities.

Example:

```text
High curiosity
    ↓
More exploration

Low energy
    ↓
More resting

High playfulness
    ↓
More interaction with toys

High social need
    ↓
More attempts to interact with user
```

These values should influence behavior rather than directly dictate every action.

---

# 6. Core Animation States

The initial animation library should contain these states:

```text
IDLE
WALK
RUN
SIT
SLEEP
WAKE
EAT
DRINK
PLAY
LOOK
SNIFF
INTERACT
HAPPY
SAD
SURPRISED
CURIOUS
SCARED
ANGRY
RELAXED
GROOM
```

Not every state needs to be a completely unique animation.

Many states should be combinations of smaller movements.

---

# 7. IDLE

Idle is one of the most important states.

The pet should NOT have one looping idle animation.

Instead, idle should be a collection of small behaviors.

Possible idle actions:

```text
Breathing
Blink
Look around
Ear twitch
Tail movement
Head tilt
Stretch
Yawn
Scratch
Groom
Small body shift
Look at camera
Look at environment
Walk a few steps
Sit down
Stand up
```

Example:

```text
IDLE
│
├── breathe
├── blink
├── look around
├── ear twitch
├── tail movement
├── head tilt
└── random micro-behavior
```

The system should randomly select small actions based on personality and current state.

This prevents the pet from looking like a GIF.

---

# 8. Micro-Animations

Micro-animations are critical to the feeling of life.

Examples:

```text
Blink
Double blink
Ear twitch
Tail flick
Head tilt
Small body bounce
Weight shift
Paw adjustment
Look left
Look right
Look up
Look down
Nose movement
Tiny stretch
```

These should occur independently from major behaviors.

For example:

```text
WALK
+
Tail movement
+
Ear movement
+
Blink
+
Head bob
```

The pet should therefore have multiple things happening simultaneously.

---

# 9. Breathing

Breathing should be present during most non-active states.

Breathing can subtly modify:

```text
Body scale
Chest position
Head position
```

Example:

```text
inhale
→ body expands slightly

exhale
→ body relaxes
```

The effect must remain subtle.

The purpose is not to make the pet look like a balloon.

It is to prevent complete visual stillness.

---

# 10. Blink System

Blinking should be independent from the main animation state.

The pet should blink naturally at irregular intervals.

Possible variations:

```text
Single blink
Double blink
Slow blink
Sleepy blink
Surprised wide eyes
```

Blink timing should not be perfectly predictable.

Avoid:

```text
blink every exactly 4 seconds
```

Prefer randomized intervals within a reasonable range.

---

# 11. Eye / Attention System

The eyes are one of the strongest tools for making the pet feel alive.

The pet should be capable of looking toward:

```text
User cursor
Interesting object
Moving object
Food
Toy
Other pet
Environment event
Random direction
```

Example:

```text
Object enters nearby area
        ↓
Pet notices object
        ↓
Head turns
        ↓
Eyes look toward object
        ↓
Pet decides whether to investigate
```

The eyes and head should not always point in exactly the same direction.

Small differences create more natural behavior.

---

# 12. Face Movement

The creature is a blob: it has no head and no neck to turn. "Looking" is done
by sliding the face group across the front of the mass and shifting the eyes
inside it, with the eyes leading the face.

Possible movements:

```text
Look left
Look right
Look up
Look down
Tilt left
Tilt right
Lower face
Raise face
Turn toward object
Turn away
```

Face movement should often accompany:

* Curiosity
* Attention
* Surprise
* Confusion
* Listening
* Interaction

---

# 13. Topper System

The blob has no ears. The topper — whatever grows out of the top of the mass —
carries the same job: it is the part that reacts first and settles last.

Examples:

```text
Curious
→ topper tips forward

Relaxed
→ neutral

Happy
→ bounces

Scared
→ pulled back

Surprised
→ flicked upright

Sleepy
→ drooped to one side
```

The topper should also drift randomly during idle states.

Each topper type carries a floppiness value, so a heavy puff barely moves while
a thin antenna whips — with no change to the motion code.

---

# 14. Wobble System

The blob is soft, and soft things keep moving after they stop. The wobble layer
replaces the tail: one slow lean of the whole mass, with the arms and the
topper trailing behind it on their own delay.

Possible behaviors:

```text
Idle lean
Slow sway
Fast jiggle
Squash and stretch
Settle after a landing
```

Wobble should respond to:

```text
Mood
Energy
Curiosity
Fear
Excitement
Attention
```

Example:

```text
Happy
→ faster, larger jiggle

Curious
→ leaning toward the target

Relaxed
→ slow sway

Scared
→ pulled in and tight
```

---

# 15. WALK

A blob does not walk, it hops. WALK uses the standardized blob rig.

One hop is the whole cycle:

```text
Stretch on the way up
+
Squash on the landing
+
Feet tucking under
+
Arms flung out
+
Face lagging a beat behind
+
Topper whipping over and settling
```

Hop height scales with the creature's ground clearance, so a blob with tiny
feet takes small hops and one on stilts takes big ones.

Walking should not be perfectly mechanical.

The pet should have small variations in:

* Speed
* Step timing
* Head movement
* Body bounce
* Direction changes

---

# 16. WALKING VARIATIONS

The same walking system can produce different personalities.

## Energetic

```text
Fast movement
Large bounce
High tail
Quick direction changes
```

## Lazy

```text
Slow movement
Small steps
Low head
Minimal bounce
```

## Curious

```text
Frequent stops
Look around
Change direction
Investigate objects
```

## Nervous

```text
Short movements
Frequent looking around
Tail movement
Sudden stops
```

The animation system should use parameters rather than completely separate animations.

---

# 17. RUN

Running should exaggerate the walking system.

```text
Larger leg movement
Higher body bounce
Faster tail movement
Greater forward movement
```

Running should primarily occur during:

* Excitement
* Play
* Chasing objects
* Returning to the user
* Random bursts of energy

Running should not be the default movement.

---

# 18. SIT

The pet should transition into sitting rather than instantly changing state.

```text
Stand
↓
Slow body movement
↓
Rear legs bend
↓
Body lowers
↓
SIT
```

Sitting can become an independent idle state.

While sitting:

```text
Blink
Look around
Tail movement
Ear movement
Groom
Yawn
```

---

# 19. SLEEP

Sleep should be a multi-stage behavior.

```text
Sleepy
↓
Yawn
↓
Look for comfortable position
↓
Walk to sleeping location
↓
Turn around
↓
Lie down
↓
Sleep
```

During sleep:

```text
Breathing
Small body movement
Occasional twitch
Ear movement
Dream reaction
```

The pet should occasionally wake briefly and return to sleep.

---

# 20. WAKE

Waking should not instantly transition to active behavior.

```text
Sleep
↓
Small movement
↓
Eyes open
↓
Stretch
↓
Yawn
↓
Look around
↓
Stand
```

The pet can then choose its next behavior.

---

# 21. EAT

Eating should depend on the object being consumed.

Basic sequence:

```text
Approach food
↓
Look at food
↓
Sniff
↓
Begin eating
↓
Small repeated eating movement
↓
Finish
↓
Happy / satisfied reaction
```

The pet should occasionally stop eating and look around.

---

# 22. DRINK

Similar to eating but with different movement.

```text
Approach water
↓
Look
↓
Lower head
↓
Drink
↓
Raise head
↓
Small face movement
```

---

# 23. PLAY

Playing should be energetic and varied.

Possible behaviors:

```text
Chase
Paw at toy
Jump
Roll
Carry
Push
Inspect
Run around
```

The same toy should not always produce the exact same animation.

Example:

```text
Toy detected
    ↓
Choose play behavior

Possible result:
    Chase

OR:
    Paw

OR:
    Inspect

OR:
    Ignore
```

This makes the pet feel less scripted.

---

# 24. INTERACTION

Interaction should be contextual.

Examples:

```text
Pet + Toy
→ Play

Pet + Bed
→ Rest

Pet + Food
→ Eat

Pet + Object
→ Inspect

Pet + User
→ Approach / Look / React
```

Interactions should produce chained animation sequences.

Example:

```text
Notice
↓
Approach
↓
Look
↓
Interact
↓
Reaction
↓
Return to normal behavior
```

---

# 25. CURIOSITY

Curiosity should be one of the primary systems that makes the pet feel alive.

The pet should occasionally notice something without the user explicitly telling it to.

Examples:

```text
New object appears
Something moves
User enters room
Light changes
Toy is nearby
Another pet appears
Random environmental event
```

The pet can:

```text
Stop
Look
Tilt head
Walk closer
Sniff
Inspect
Lose interest
Continue walking
```

Importantly, the pet should sometimes decide:

```text
"I don't care."
```

Not every environmental stimulus should produce an interaction.

---

# 26. SURPRISE

Unexpected events should trigger a short reaction.

Example:

```text
Unexpected object movement
↓
Head snaps toward object
↓
Eyes widen
↓
Ears raise
↓
Small body movement
↓
Investigate OR ignore
```

The reaction should be short.

---

# 27. EMOTIONAL STATES

Emotions should modify animation rather than replace the entire animation system.

Core emotions:

```text
Happy
Sad
Excited
Curious
Relaxed
Sleepy
Scared
Angry
Confused
Surprised
```

Each emotion should modify multiple parameters.

Example:

```text
Happy
├── Tail movement ↑
├── Body bounce ↑
├── Eyes happier
└── Movement speed slightly ↑
```

---

# 28. Personality

Personality should influence animation frequency and behavior selection.

Example personality traits:

```text
Playfulness
Curiosity
Energy
Laziness
Affection
Timidity
Confidence
Independence
```

A highly curious pet might:

```text
Look around frequently
Investigate objects
Stop while walking
Explore the room
```

A lazy pet might:

```text
Sleep frequently
Move slowly
Ignore objects
Stretch
Return to bed
```

A playful pet might:

```text
Run
Play
Chase
Approach the user
Interact with toys
```

Personality should influence probability, not create rigid scripts.

---

# 29. Behavior Selection

The pet should select behaviors based on weighted decisions.

Conceptually:

```text
Potential Behaviors
        ↓
Evaluate Conditions
        ↓
Apply Personality
        ↓
Apply Current State
        ↓
Apply Environment
        ↓
Weighted Selection
        ↓
Chosen Behavior
```

Example:

```text
Energy: Low
Curiosity: High
Playfulness: Medium

Possible behaviors:

Sleep       60%
Explore     15%
Play        10%
Idle        15%
```

These probabilities should change dynamically.

---

# 30. Randomness

Randomness should be controlled.

The pet should not behave randomly for the sake of randomness.

Use randomness to create variation inside sensible behavioral boundaries.

Good:

```text
Pet chooses one of several idle actions.
```

Bad:

```text
Pet randomly teleports across the room.
```

Randomness should create personality and variation, not chaos.

---

# 31. Memory of Recent Actions

The pet should maintain short-term runtime memory.

Example:

```text
lastBehavior
lastInteraction
lastTarget
recentTargets
timeSinceInteraction
timeSinceEating
timeSinceSleeping
```

This prevents repetitive behavior.

For example:

```text
Pet just played with ball
↓
Reduce probability of immediately playing with same ball
```

This creates behavioral variety.

---

# 32. Behavioral Cooldowns

Some behaviors should have cooldowns.

Examples:

```text
Yawn
Blink variation
Stretch
Special reaction
Play
Groom
```

This prevents:

```text
Yawn
Yawn
Yawn
Yawn
Yawn
```

within a few seconds.

The pet should feel spontaneous rather than malfunctioning.

## Time between thoughts

The most important cooldown is on *thinking itself*. Nothing below the
interrupt layer is reconsidered more than about once every two or three
seconds, and a chosen behaviour then runs for four to eleven. A creature that
re-decides sixty times a second is not deliberating, it is twitching: it
changes its mind mid-stride, sets off in a new direction, and reads as an
animation glitch rather than as an animal.

Interrupts (§33) are exempt, so being picked up or having a ball thrown at it
still lands on the frame it happens.

## Appetites have to be able to run out

A need that only ever climbs produces a creature obsessed with one thing.
Every appetite therefore costs something to satisfy and takes much longer to
come back than it does to spend:

```text
playing        burns playfulness in twenty seconds, rebuilds over minutes
chasing a moth builds a fatigue that ends the chase and takes a while to clear
having a look  spends the curiosity that sent it over there
sleeping       has hysteresis — it wakes properly or not at all — and a long
               cooldown afterwards, so a nap is a thing that happens a few
               times a session rather than something it is always halfway into
```

The failure mode without these is specific and easy to miss in a short look at
the room: the creature finds the single behaviour whose need refills fastest
and does only that. Living on the bed and never stopping playing are the same
bug.

---

# 33. Interruptions

Behaviors should be interruptible.

Example:

```text
Pet walking
    ↓
Unexpected sound/event
    ↓
Stop walking
    ↓
Look toward event
    ↓
React
    ↓
Resume walking
```

Another example:

```text
Pet playing
    ↓
User interacts
    ↓
Pet notices user
    ↓
Play behavior interrupted
    ↓
Approach user
```

Not every behavior should be interruptible.

Critical transitions such as eating or sleeping should generally complete or transition gracefully.

---

# 34. Transitional Animations

Avoid hard state changes.

Bad:

```text
WALK
↓
SLEEP
```

Better:

```text
WALK
↓
STOP
↓
LOOK
↓
YAWN
↓
LIE_DOWN
↓
SLEEP
```

Transitions are one of the main differences between an animated object and a convincing creature.

---

# 35. Layered Animation

Multiple animations should be able to run simultaneously.

Example:

```text
Primary Animation:
WALK

Secondary:
Tail sway

Facial:
Blink

Attention:
Look toward object

Environmental:
Shadow movement
```

The system should avoid forcing every animation to replace the previous one.

---

# 36. Animation Priority

When animations conflict, use priorities.

Example:

```text
Emergency Reaction
    ↓
High priority

Interaction
    ↓
Medium-high priority

Movement
    ↓
Medium priority

Idle
    ↓
Low priority
```

Example:

```text
IDLE
↓
WALK
↓
SURPRISED
```

The surprise animation temporarily overrides movement.

After the reaction:

```text
SURPRISED
↓
Evaluate behavior again
```

---

# 37. Animation State Machine

The animation system should use a state machine rather than independent uncontrolled timers.

Example:

```text
                    ┌─────────┐
                    │  IDLE   │
                    └────┬────┘
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
        WALK            PLAY          SLEEP
          │              │              │
          ↓              ↓              ↓
      INTERACT         HAPPY           WAKE
          │              │              │
          └──────────────┴──────────────┘
                         ↓
                        IDLE
```

The state machine controls transitions.

The behavior system decides which state should come next.

---

# 38. Environment Awareness

The pet should not behave as if the environment does not exist.

The animation system should receive information about:

```text
Nearby objects
Walkable areas
Furniture
Food
Toys
User
Other pets
Environmental events
```

This enables behaviors such as:

```text
See bed
→ walk toward bed

See toy
→ investigate

See user
→ look at user

Obstacle detected
→ change direction
```

---

# 39. User Awareness

The pet should sometimes acknowledge the user without requiring interaction.

Possible behaviors:

```text
Look toward cursor
Look toward user
Walk toward user
Sit near user
React to user entering the room
Ignore user
```

Importantly, the pet should not constantly follow the user.

Independence is part of feeling alive.

---

# 40. Independent Behavior

The pet should be capable of doing things without user input.

Examples:

```text
Walk around
Sleep
Play
Explore
Groom
Look around
Sit
Stretch
Investigate objects
Return to favorite location
```

The user should be able to simply watch.

This is one of the most important features of the system.

---

# 41. Favorite Locations and Objects

The pet may eventually develop preferences.

Example:

```text
Favorite sleeping location
Favorite toy
Favorite object
Favorite area
```

This can influence behavior.

Example:

```text
Pet is tired
+
Favorite bed exists
        ↓
Higher probability of choosing that bed
```

This creates the beginning of individual personality.

---

# 42. Long-Term Behavioral Development

The pet can eventually change based on its experiences.

For example:

```text
Frequently plays with ball
        ↓
Ball becomes preferred object
```

Or:

```text
Frequently receives affection
        ↓
Higher social behavior
```

Or:

```text
Repeatedly ignores object
        ↓
Lower interest in object
```

This should be introduced after the basic simulation works.

---

# 43. Anti-NPC Principles

The following principles are mandatory for the pet system.

## The pet should not:

* Stand completely still for long periods
* Repeat the same idle animation endlessly
* Always respond immediately
* Always obey the user
* Always interact with nearby objects
* Always follow the user
* Perform identical sequences every time
* Teleport between states
* Change emotion instantly
* Move with perfectly mechanical timing

## The pet should:

* Pause
* Look around
* Change its mind
* Ignore things
* Get distracted
* React to unexpected events
* Have periods of inactivity
* Have bursts of energy
* Show subtle physical movement
* Have individual preferences
* Occasionally surprise the user

---

# 44. "Alive" Does Not Mean "Always Active"

The pet should sometimes do almost nothing.

A realistic idle sequence might be:

```text
Sit
↓
Blink
↓
Look left
↓
Do nothing
↓
Ear twitch
↓
Look toward window
↓
Yawn
↓
Lie down
↓
Sleep
```

This is better than:

```text
Dance
Jump
Run
Wave
Spin
Smile
```

every thirty seconds.

Constant stimulation makes the creature feel like a toy, not a living thing.

---

# 45. Animation Timing

Animation timing should have natural variation.

Avoid perfectly synchronized loops.

For example:

```text
Body breathing:
2.8 seconds

Blink:
random interval

Tail:
1.7–3.2 seconds

Ear movement:
random

Idle decision:
variable interval
```

Small timing differences should prevent mechanical repetition.

---

# 46. Procedural Animation

Whenever practical, movement should be generated mathematically rather than requiring a separate animation asset.

Examples:

```text
Breathing
Tail movement
Eye movement
Head rotation
Ear rotation
Body bounce
Leg rotation
Blinking
```

This allows animations to adapt to different body proportions.

---

# 47. Animation Parameters

Animations should expose parameters.

Example:

```ts
interface AnimationParameters {
  speed: number;
  intensity: number;
  bounce: number;
  tailMovement: number;
  headMovement: number;
}
```

The same animation can therefore produce different results.

Example:

```text
Lazy Walk
speed = 0.5
bounce = 0.2

Energetic Walk
speed = 1.2
bounce = 0.8
```

---

# 48. Animation and Standardized Anatomy

The animation system must operate on the standardized blob rig defined in the Pet Anatomy system.

It must assume the existence of:

```text
Body
Face (2 Eyes, Mouth)
2 Arms
2 Feet
Topper
```

Customization changes proportions and appearance.

The animation system adapts to those parameters.

It must NOT require a unique animation implementation for each pet.

---

# 49. Example Full Behavior

Example: The user enters the room.

```text
User enters
    ↓
Pet notices movement
    ↓
Eyes look toward user
    ↓
Head turns
    ↓
Pet evaluates mood
    ↓
If social:
    ↓
Pet walks toward user
    ↓
Tail movement increases
    ↓
Pet stops nearby
    ↓
Looks at user
    ↓
Happy reaction
    ↓
Returns to normal behavior
```

Another pet might instead:

```text
User enters
    ↓
Looks at user
    ↓
Blinks
    ↓
Ignores them
    ↓
Continues sleeping
```

Both are valid.

That difference is personality.

---

# 50. Example Autonomous Behavior

A pet is alone in its room.

```text
IDLE
 ↓
Looks around
 ↓
Notices toy
 ↓
Curiosity check
 ↓
Decides to investigate
 ↓
Walks toward toy
 ↓
Stops
 ↓
Sniffs
 ↓
Paws at toy
 ↓
Toy moves
 ↓
Surprised
 ↓
Chases toy
 ↓
Plays
 ↓
Energy decreases
 ↓
Becomes tired
 ↓
Looks for bed
 ↓
Walks to bed
 ↓
Lies down
 ↓
Sleeps
```

The user does nothing.

The pet creates its own small sequence of life.

---

# 51. Initial Animation Priority

The first implementation should focus on quality rather than quantity.

### Required

```text
IDLE
WALK
SIT
SLEEP
WAKE
LOOK
BLINK
HEAD MOVEMENT
TAIL MOVEMENT
EYE MOVEMENT
INTERACT
HAPPY
SURPRISED
```

### Second Stage

```text
RUN
PLAY
EAT
DRINK
GROOM
STRETCH
YAWN
SNIFF
SCARED
SAD
ANGRY
```

### Later

```text
Complex emotional reactions
Memory-based behaviors
Object preferences
Long-term personality development
Advanced social behavior
Advanced environmental reactions
```

---

# 52. Final Architecture

The complete system should conceptually work as:

```text
                    PET
                     │
             ┌───────┴───────┐
             │               │
         Persistent        Runtime
           State             State
             │               │
             │        ┌──────┴──────┐
             │        │             │
             │     Personality   Environment
             │        │             │
             │        └──────┬──────┘
             │               │
             │        Behavior System
             │               │
             │        Behavior Decision
             │               │
             │        Animation State
             │               │
             │        Layered Animation
             │               │
             └───────────────┤
                             ↓
                    Standardized Rig
                             ↓
                   Procedural Animation
                             ↓
                          PixiJS
                             ↓
                     Living Creature
```

---

# 54. Direct Manipulation and Physics

The user does not drive the creature through buttons. Everything you can do to
it, you do to it directly, and the simulation reacts. That requires a physics
layer underneath the room.

## Space

The room is a box, and the physics is genuinely three-dimensional:

```text
x        left/right across the room
y        up. 0 is the floor; gravity pulls toward it
z        into the room. 0 is the back wall, ROOM_DEPTH the front edge
```

There is no fake axis and no depth "gate". Two things collide when they
overlap in all three, which is the only definition of "the plant at the back is
not in the way of the ball at the front" that holds up. The version this
replaced used depth twice over as a lie — once to the renderer as a draw order
and once to the solver as a maximum distance — and neither lie survived contact
with a room that had ten things in it.

Screen position and screen size are then *derived* from those three numbers by
a one-point perspective camera (`world/Projection.ts`):

```text
s(z)  =  CAMERA / (CAMERA + DEPTH - z)      how big things are at depth z
sx    =  VP_X + (x - VP_X) * s
sy    =  HORIZON + (EYE - y) * s
```

Two consequences, and both of them are the point:

```text
size is the depth cue     something at the back is drawn smaller, so depth is
                          readable without anything having to overlap
the map inverts           every pixel of visible floor is exactly one place in
                          the room, so a two-dimensional pointer can address a
                          three-dimensional space with no mode and no guessing
```

## The floor grid

Physics uses a continuous `x` and `z`. A *user* placing furniture does not want
continuous position — they want to know which part of the floor a thing is on.
So the floor is a grid of tiles, sized from the furniture rather than from the
room: about a hundred world units square, which lands on **13 columns by 6
rows** in a room that is 1280 by 600.

This started as three depth rows and nothing at all across the width, which
meant an object could be anywhere on the x axis and only ever in one of three
places on the z axis. Depth was the axis people actually wanted control over,
and it was the one that had almost none.

The tiles earn their place three times over. They give the floor its seam
lines, so depth is visible with nothing in the room at all. They give a set-down
object somewhere definite to land, so two things never end up four pixels apart
and permanently in each other's way. And they give the drag affordance something
to name — the room can say *row 3, column 7* while you are deciding.

Snapping happens on *placement* only, never on a throw: a ball that snapped to a
tile mid-bounce would look broken. Placement wants tidiness; physics wants to be
left alone.

The creature ignores all of it and walks wherever it likes.

## Nothing hangs in the air

Static bodies are never integrated — that is what "furniture stays put" means —
so they have no gravity of their own. Left alone, that produces a bug with a
name: put a chair on a table, take the table out of the room, and the chair
stays where it was. Stack another on that, remove the one underneath, repeat,
and furniture climbs out of the frame.

So every step, any static body sitting above whatever is actually under it falls
until it is not (`PhysicsWorld.settleUnsupported`). It *falls* rather than snaps,
because the two look completely different: a chair that drops when you take the
table away reads as physics, and one that teleports reads as a glitch.

Two things it deliberately does not do. It never pushes anything *up* — building
a stack as high as you like is a feature, not a defect. And it exempts bodies
flagged `anchored`, which is wall-hung decor: the one thing in the room that is
legitimately in mid-air.

## Three kinds of body

Everything used to be a ragdoll — a small assembly of circular nodes held
together by distance links and shape matching. It gave a chair three collision
points and a personality, and it also gave the room twelve soft bodies arguing
with each other in a space the size of a rug. Nothing in a living room needs to
be a soft body.

```text
static      furniture. Immovable while it stands there. The pointer can pick it
            up and put it somewhere else; a creature walking into it cannot.
dynamic     toys. They fall, roll, bounce, get batted about, and settle.
character   the creature. Dynamic, but driven by intent rather than by forces.
```

Crossing that is a second, independent question: **does the creature have to
walk around it?**

```text
solid       yes. The bed, the chair, the basket, and every toy — the things the
            creature actually interacts with.
scenery     no. The plant, the lamp, the table, the clock, the rug. Drawn, lit,
            sorted by depth, bounced off by toys, and never in the way.
```

Scenery is not "no collider". A ball still bounces off the plant, things still
stand on the table, and a creature that climbs onto one is still held up by its
top face; the only thing suppressed is the *side* of a contact against a
character (`Narrowphase.sidesOpen`).

It exists because the two things a room has to be pull against each other. A
room furnished densely enough to look lived in is a room with a dozen collision
volumes in it, and a creature the size of the gaps between them spends its
afternoon wedged behind the pot plant. Furnish it thinly enough to roam and it
stops looking like anywhere. Scenery is how the floor stays open while the room
stays full, and the price — a creature that occasionally overlaps a table leg —
is one nobody watching has ever minded.

A collider is a footprint in the floor plane — a circle or a rectangle —
extruded upward by its height. Nothing rotates. Rotation is a rendering
concern: a knocked lamp leans because its artwork leans, and leaving it out of
the solver removes the entire class of bug where the solver argues with itself
about angular momentum.

The lean, the roll and the wobble all still exist. They are one damped spring
per object (`scenes/room/PropMotion.ts`), driven by the things that ought to
rock something — a knock, an acceleration, a throw — and answering to nothing
else. The lamp still rocks. It just cannot take the room with it.

## Position, and then velocity, and never the two at once

Velocity is a value a body owns, integrated semi-implicitly at a real 1/120s.
That one decision is what the rewrite is actually about. The system before
stored velocity implicitly, as the gap between a body's current and previous
positions, which meant *moving a body out of a wall was indistinguishable from
throwing it*. Every jitter, every slow drift and every creature launched into
orbit came from that confusion.

Contact response is therefore two strictly separate halves:

```text
velocity   what the collision does — bounce, and friction. Runs only when the
           two are genuinely approaching. A lean is not a collision.
position   what the overlap needs. Moves positions and nothing else. A resting
           stack runs it every frame and never gains a pixel per second.
```

And resting is a third thing again, deliberately not a contact impulse:

```text
grounded friction     mu * g against the direction of travel, with a cutoff
                      that takes horizontal speed to exactly zero
supported bodies      are not falling, so a small downward velocity on a
                      grounded body is set to zero rather than carried
sleeping              is sticky. Once out, only an explicit wake gets a body
                      back — a neighbour arriving at speed, a shove, the thing
                      underneath being lifted away
```

"Exactly zero" is what makes sleeping possible, and sleeping is what makes the
room quiet. A body that keeps a fraction of a pixel per second forever never
sleeps, and a room full of those drifts overnight.

## Things sit on top of and inside other things

A tabletop needs no special handling at all: it is the top face of a box, and
landing on it falls out of ordinary collision. The whole one-way-platform
subsystem stopped being necessary the moment furniture became boxes.

What is left is semantics — how comfortable a surface is, and one genuine
exception:

```text
container    a basket. Only enterable from above, and you cannot roll out of
             the side of it.
```

"Enterable from above" is decided by where the arriving thing's *middle* is: over
the opening means dropping in, merely overlapping the edge means walking into
the side, and the side of a basket is a side.

One rule keeps tall things and short things honest. Minimum-penetration
resolution gets a creature walking into a table catastrophically wrong — the
overlap is the table's whole height and only a few pixels sideways, so the
shallower axis is sideways and the creature is quietly served up onto the
table. The test that actually means "on top of" is where the body *was*, not
how deep it is now.

Furniture also carries a `comfort`, which is a separate question from whether
you can stand on it. A table has a perfectly good surface and the creature can
absolutely climb it; nobody sleeps on a table (§41).

## Climbing

The brain says *what* to climb. How hard to jump is arithmetic — `sqrt(2gh)`,
aimed so the creature is over the middle of the surface when the climb runs out
— and whether it lands is the solver's business.

For the length of the climb the creature may pass through the **sides** of the
thing it is climbing, never its top. A creature getting onto a chair puts its
paws on the seat and scrambles; it does not clear the back of the chair from a
standing jump. Opening the whole body instead is the obvious thing to do and it
is wrong: the creature sails through the bed, lands on the floor inside it, and
is squeezed out of the side like a pip.

Two details stop the room being pushed around:

```text
legs accelerate, never set speed    a creature that can set its own velocity
                                    is a bulldozer and will shunt a table
                                    across the room without slowing down
obstacles are steered around        the room gives the creature a sideways
                                    bias when the way ahead is blocked, so it
                                    curves past a chair rather than leaning on
                                    it until the brain changes its mind (§38)
```

And a landing it chose is not a fall: without that distinction the creature
frightens itself every time it hops onto the bed, and then spends a minute
being cross about it.

## Manipulation

The pointer has two axes and the room has three. The answer is to give the
pointer one unambiguous job: **it addresses a point on the floor.** Screen y
maps to depth, not to height, and the projection makes that exact.

```text
Press and drag        picks the thing up and carries it
Drag up the screen    walks it away from you, deeper into the room
Drag down             brings it toward you
Keep dragging up      past the back wall the floor runs out, and the travel
                      becomes height: the thing lifts
Release gently        places it: snapped to a row, settled onto whatever is
                      underneath it
Release while moving  throws it, carrying the drag velocity
Press without moving  a click, not a drag — and it goes back exactly where it
                      was, because a carry that lasted a third of a second
                      should not rearrange the room
```

A carried thing hovers above whatever is underneath it, so dragging a ball over
the table lifts it clear of the tabletop and letting go drops it onto the
table. You never have to express "height" with a mouse, because you never need
to — until you *want* to, and then you keep going.

That last part matters more than it sounds. Depth runs out at the back wall;
the pointer does not. Reading the remaining travel as lift means picking a
thing up and hurling it is the same gesture as sliding it around the floor,
just continued past the end of the floor, and it is continuous at the join
because at the exact moment the floor runs out the height it converts to is
zero. It works identically for the creature and for a toy, because depth works
one way in this room.

While something is being carried the floor says where it will land:

```text
the band     the depth row under the pointer, brightened across the floor
the ring     an ellipse exactly where the thing will come down, drawn in
             perspective so it is visibly lying flat
the tether   a dashed line joining the two, because the object is in the air
the pips     three marks up the left of the floor, the active row filled
```

A click means different things to different objects: the lamp toggles the
room's light, the creature gets a poke, anything else gets a small shove.

## Getting there is not the solver's job

The creature does not find its way around the room by bumping into it. It used
to, and everything that made it look stupid came from that: the corner it could
not leave, the ball it could not reach, the six seconds spent leaning on the
side of the bed because its target happened to be behind it. A collision is a
fine way to find out that something is *there*. It is a hopeless way to work
out how to get *past* it.

So there is a navigation layer, and it sits between what the creature wants and
how it moves:

```text
BEHAVIOUR    the brain names a place, or a thing        PetBrain
    ↓
NAVIGATION   which way now, and is this still working   simulation/navigation
    ↓
LOCOMOTION   lean at that point                         CharacterController
    ↓
PHYSICS      and then whatever actually happens         PhysicsWorld
```

Three files, one question each:

```text
NavGrid      the floor as cells, and which of them are taken. Rebuilt only when
             something that blocks the creature has moved, which in a settled
             room is never
PathFinder   A* over those cells, then pulled taut against line-of-sight, so
             what comes back is the two or three corners an animal would turn
             rather than a staircase of twenty-pixel steps
Navigator    the route, and the question of whether to keep believing in it
```

Only *solid* things above the creature's step height are taken, and cells are
marked out to the creature's own radius — so a free cell means a cell its whole
body fits in, and the follower can treat itself as a point.

### The route is a belief, not a commitment

Every frame the navigator asks whether the route it has is still a route. It
re-plans when the room changed under it, when the thing it was walking to moved,
when something shoved the creature off the path, and when it has made no
progress for a second and a bit.

```text
destination
     ↓
find a route  ←──────────────┐
     ↓                       │ the room changed, I was shoved, my target moved,
walk the next corner         │ or I have got nowhere for a second and a bit
     ↓                       │
arrived?  ── no ── blocked? ─┘
     ↓ yes                  ╲
   done                      ╲ three times → give up, and say so
```

Arriving is not permanent either: a creature that considers a chase finished
the first time it catches the ball is a creature that stands watching the ball
leave.

### Failure is a result

The last arrow is the one that matters most. Sometimes the ball really is under
the bed. A creature that cannot reach it does not need better pathing, it needs
to be able to shrug — so the navigator reports `failed`, the room tells the
brain (`couldNotReach`), and the brain writes that thing off for twenty seconds
and has a different idea. Nothing above it ever waits.

### Beside it, not on it

A creature going to a *thing* does not want the middle of the thing. It wants
anywhere it can stand that is close enough to play with it, and if that side is
against the wall it wants a different side:

```text
        ▓▓▓▓ wall ▓▓▓▓
        ·  ✗  ·
     ·     ball    ·          eight approaches, nearest first; the first one
        ·  ✓  ·               with somewhere to stand and a route to it wins
```

The brain names the object and the navigator picks the spot, because which side
is reachable depends on what is against the wall and how wide the creature is,
and the brain knows neither.

### Soft collisions

None of that makes the creature careful, and it should not. Walking into
something solid at pace costs it its footing: it bounces off along the contact
normal, gets a sideways bias so it scrapes past instead of squaring up again,
and its artwork is knocked out of true for a moment (`PetRoom.stumble`).
Positional correction is gentler for a character than for anything else
(`SOFT_CORRECTION`), which is the difference between a creature that bumps into
the bed and one that stops against it like a wall.

What does *not* change during a stumble is where the creature was going. It
still wants to be over there, and it carries on wanting that while it trips.

### Keeping the ball in play

The same principle applies to toys, from the other end. A pounce that simply
sends the ball away from the paw eventually wedges it in a corner, because away
from the paw *is* into the wall once the creature has chased it there. Pushing
back from the walls does not fix it — in the gap between the bed and the wall
the two pushes cancel and the ball rattles up and down the alley.

So a swipe measures sixteen directions, asks how far the ball could actually
travel down each, and scales that by how much the paw wanted to go that way
(`scenes/room/Swipe.ts`). Out in the open every direction has room and the paw
decides; in a corner the scores collapse onto the one or two directions that
lead anywhere. There is no list of corners and no arrangement of furniture that
needs a new clause.

One exception earns its place: a toy the creature has *just* batted does not
count as somebody playing with it when it comes back. Without that the pounce
tops up the playfulness the pounce spent, and the creature plays with the same
ball until the tab is closed (§32).

## Where the code lives

One file per question, because each of these used to be answered in three
places at once:

```text
simulation/physics/
  types.ts                the vocabulary. One record per body, and nothing else
  constants.ts            every tuned number, side by side
  Collider.ts             footprints, tops, containment
  Body.ts                 making bodies, and the only writes to a velocity
  Environment.ts          the floor and the four walls
  Broadphase.ts           which pairs are worth testing
  Narrowphase.ts          whether they touch, and along which axis
  Solver.ts               what that does to them, in two separate halves
  Sleep.ts                when something has finished moving
  CharacterController.ts  the creature's legs
  Manipulator.ts          the pointer's hands
  PhysicsWorld.ts         the conductor, and almost nothing else

simulation/navigation/
  NavGrid.ts              the floor, and which of it is taken
  PathFinder.ts           A*, then pulled taut
  Navigator.ts            the route, and when to stop believing in it

world/
  Projection.ts           the camera: three dimensions into two, and back
  Lanes.ts                the room's three rows
  environments/           one file per room the creature can live in

scenes/room/
  BodyView.ts             where a body appears, how big, in what order
  DepthGuide.ts           telling the user where they are about to put things
  PropMotion.ts           the lean, the roll and the wobble
  Swipe.ts                which way a batted toy goes, and why not the wall
```

## The room is not the scene

The creature is going to live in more than one room, and the user is going to
choose which. So the scene knows how to run *an* environment, and an
environment is a plain record (`world/environments/types.ts`): a floor to walk
on, some scenery to draw, a light to sit under, and the objects it starts with.
`PetRoom` takes one and `setEnvironment` swaps it — the creature survives the
move with its needs, its habits and its opinion of you intact, and everything
around it is replaced.

One thing an environment deliberately cannot change is the camera. Every room
is the same box seen from the same place, because the projection is what the
pointer, the depth rows and the draw order are all built on. Rooms vary in what
is in them and what they are made of, which is the axis that matters.

## What the creature is told

The room reports events to the simulation. It never reports *animations* —
only what happened:

```text
pickedUp()              -> fear up a little
thrown(speed)           -> fear up a lot, anger up with it
hitBy(speed, isToy)     -> a lobbed toy is a game; a chair is not
lightsChanged(on)       -> off means sleep, on means look around
poked()                 -> play, unless it is already cross with you
couldNotReach(id)       -> that did not work. Write it off and think again
```

Those feed the same weighted needs everything else reads (§5, §29), so the
reactions stack: throw the creature once and it is frightened, throw it
repeatedly and the fear fades into anger, which lasts much longer.

## Reaction states

Three animation states exist purely for this layer:

```text
HELD      dangling, arms up, feet swinging, wide eyes
SCARED    pulled in and trembling fast. Also the falling pose.
ANGRY     puffed up, leaning at you, juddering slowly
```

Fear and anger are deliberately opposite in shape and frequency: fear is small
and fast, anger is big and slow.

---

# 54b. The Room Is Alive Too

The creature cannot be the only thing moving. A room where the only motion is
the pet reads as a stage set with one actor on it, and the creature's own
liveliness has nothing to be measured against.

## Objects that move on their own

Renderers stay pure factories: they build a container and, if what they built
is alive, register how it moves.

```text
clock    hands on the real time, a 1.4s pendulum, and a strike on the hour
plant    two slow sine waves, hinged where the stems leave the pot
lamp     a bulb's breath, and an occasional flicker
window   the pool of light creeps across the floor and breathes
```

An object can also raise an **event**, which is how something in the artwork
reaches the simulation. The clock striking the hour is the only one so far: the
case rocks on its hook, and the creature looks up. Not an emergency — a look,
and then it gets on with its afternoon.

The clock is the one object in the room that is not make-believe. It tells the
user's real time, so glancing at the creature's room says something true about
the user's own afternoon.

## Critters

A beetle crossing the floorboards, a moth working the lamp, dust rolling along
the skirting.

```text
beetle   bursts of scurrying, then a long suspicious pause
moth     orbits the lamp while it is lit; wanders and glows in the dark
dust     drifts, and is never quite on the floor or quite off it
```

They are deliberately *not* physics bodies. They weigh nothing, they are never
in the way, and giving them mass would only mean the creature could kill one
with a chair. They are simulated as positions, and the creature perceives them
like anything else — so it chases them, and never catches them.

That chase is self-limiting on purpose: chasing builds fatigue, fatigue ends
the chase, and the fatigue takes several seconds to wear off. A creature that
pursued every moth for ever would not read as curious, it would read as broken
(§32).

Small things also scatter. A landing, a thrown toy, a struck clock — anything
loud sends whatever was near it somewhere else.

---

# 55. Expression System

Expressions are ten numbers, not pictures:

```text
mouthCurve   -1 miserable .. +1 delighted
mouthOpen     0 shut .. 1 yelling
mouthWidth
eyeOpen       upper lid
eyeSquint     lower lid — the happy squint
eyeWide       fear and surprise blow the eyes up
browInner    -1 inner ends down (angry) .. +1 up (worried)
browRaise     both brows lifted
blush
pupil
```

Because they are continuous, a creature can be four-fifths of the way from
delighted to alarmed and look exactly like that.

## The mouth is not a choice

There is **no list of mouth shapes**. A mouth picked from a menu keeps grinning
while the creature is being thrown across the room, which is the fastest way to
make a pet feel like a puppet. The mouth is redrawn from `curve`, `open` and
`width` whenever they meaningfully change.

What the user picks instead is cosmetics and personality:

```text
mouthWidth, mouthWeight, fangs   cosmetics
restingMood                      personality
```

`restingMood` is the face a creature returns to. Every emotion blends out of
its resting face rather than out of a blank one, so a naturally grumpy creature
is still recognisably grumpy while it is happy.

## Reading an expression

Three cues do almost all the work, and they must agree:

```text
Real smile     mouth curve UP + lower lid UP (squint)
Fake smile     mouth curve UP only
Sad            mouth DOWN + inner brows UP
Angry          mouth open + inner brows DOWN + narrowed eyes
Afraid         mouth small and open + eyes WIDE + brows UP
```

The two lids are never allowed to meet in the middle: left alone they leave a
thin dark sliver that reads as a bow tie rather than an eye.

## Where feelings come from

The simulation, not the animation layer. `PetBrain` reports an emotion and a
strength alongside its behaviour, because *what a creature is doing* and *how it
feels about it* are different questions — a creature can play with a toy while
still visibly annoyed with you.

---

# 56. Animation Architecture

Four layers, applied in this order every frame:

```text
1. STATES    what the creature is doing        (crossfaded, never switched)
2. CLIPS     what is being done to it          (one-shots, laid over the top)
3. LAYERS    the fact that it is alive         (breathing, lean, springs)
4. GUARD     limits nothing may exceed
```

Then the face is driven separately, from feelings.

## States are values, not actions

A state returns a **pose** — a set of joint offsets — as a pure function of the
context. It has no frame counter and no knowledge of what came before it. That
is what lets the controller crossfade two states: it keeps the outgoing pose and
fades between them, so nothing ever snaps.

```text
idle · hop · run · sit · sleep · play · discover · held · scared · angry · dizzy
```

## Clips are events

Landing, hitting a wall, being shaken and pouncing all have a beginning, a
middle and an end, and none of them belong in a state machine. A clip is a
function of normalized time, with a priority and its own blend in and out:

```text
land     squash, then STAY DOWN in proportion to the drop, then push up
smash    pivot against the wall and peel off it
shake    loops for exactly as long as you keep shaking
pounce   crouch, spring, land on the toy, wiggle
```

A hard landing keeps the creature on the floor for over a second. That waiting
is the animation.

## Springs do the acting

See §17 of the anatomy doc. Every appendage is spring-driven, which produces
correct follow-through for animations nobody authored — including whatever the
user invents by throwing the creature at the furniture.

## The guard: stop compressing the creature

The old system expressed everything by scaling the body, and it looked like the
creature was being crushed. The rewrite fixes this in three places:

```text
Poses      express motion with lean, hop, rotation and travel
Springs    make motion legible through the loose parts
Guard      clamps what is left
```

After every layer has had its say, the controller clamps the body:

```text
scale      0.80 .. 1.30 on each axis
area       0.90 .. 1.12  (a squash may not become a smear)
appendages 1.1 radians from rest (an ear may whip, never fold through the head)
```

No combination of state, clip and layer can deform the creature past those
numbers. A creature can be hit by a chair mid-hop while being shaken and still
look like itself.

# 57. Core Principle

The animation system should follow one fundamental rule:

> **The pet is not an animation that reacts to the user. The pet is a creature with a continuous internal state, and animation is the visual expression of that state.**

The goal is to make the user occasionally forget that the behavior is being generated by a program.

The pet should appear to:

* Notice things
* Think about things
* Change its mind
* Have preferences
* Get distracted
* Become tired
* Become excited
* Ignore the user
* Seek the user
* Explore
* Rest
* React
* And occasionally do something completely ridiculous

The combination of **procedural animation + standardized anatomy + layered micro-animations + personality-driven behavior + environmental awareness** should create the feeling of a living digital pet without requiring hundreds of hand-created animation assets.

---

```
```
