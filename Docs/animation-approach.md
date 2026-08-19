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

ANIMATION
"How does that action look?"

        ↓

PIXIJ
"Render it."
```

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

# 12. Head Movement

Head movement should be subtle and layered.

Possible movements:

```text
Look left
Look right
Look up
Look down
Tilt left
Tilt right
Lower head
Raise head
Turn toward object
Turn away
```

Head movement should often accompany:

* Curiosity
* Attention
* Surprise
* Confusion
* Listening
* Interaction

---

# 13. Ear System

Ears should communicate emotional state.

Examples:

```text
Curious
→ ears forward

Relaxed
→ neutral

Happy
→ slight movement

Scared
→ ears lowered

Surprised
→ ears raised

Sleepy
→ relaxed/down
```

Ear movement should also occur randomly during idle states.

---

# 14. Tail System

The tail should be independently animated.

Possible behaviors:

```text
Idle sway
Slow wag
Fast wag
Tail flick
Tail curl
Tail drop
Tail puff
```

Tail behavior should respond to:

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
→ stronger wag

Curious
→ tail raised

Relaxed
→ slow movement

Scared
→ tail lowered/curling
```

---

# 15. WALK

Walking should use the standardized quadruped rig.

Walking consists of:

```text
Leg movement
+
Body bounce
+
Head movement
+
Tail movement
+
Ear movement
```

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

The animation system must operate on the standardized quadruped rig defined in the Pet Anatomy system.

It must assume the existence of:

```text
Body
Head
4 Legs
Tail
Ears
Face
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

# 53. Core Principle

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

```
```
