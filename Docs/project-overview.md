## `PROJECT_OVERVIEW.md`

````md
# Digital Pet World

## 1. Project Overview

Digital Pet World is a 2D interactive digital pet application where users create, customize, and interact with unique creatures inside a beautiful, living environment.

The application combines:

- A customizable digital pet
- A visually rich 2D environment
- Pet behaviors and animations
- Real-life goals and tasks
- Rewards and collectible objects
- A personal memory system
- Optional AI-powered content
- Future social/shared environments

The goal is to create an experience that feels like owning a small, personal digital world rather than using a conventional productivity application or playing a traditional game.

The pet should feel alive through movement, reactions, personality, environmental interactions, and visual behavior.

---

# 2. Core Concept

The user creates a unique creature and gives it a place to live.

The creature exists inside a customizable environment containing furniture, decorations, toys, plants, and other interactive objects.

The user can:

- Customize their creature
- Customize their environment
- Interact with their pet
- Complete real-life goals
- Earn rewards
- Collect objects
- Create memories
- Capture moments
- Watch the pet behave independently

Real-life progress should have a visible connection to the digital world.

The central relationship is:

```text
REAL LIFE
   ↓
Goals / Actions
   ↓
Rewards / Memories
   ↓
DIGITAL WORLD
   ↓
Pet reacts / World changes
````

---

# 3. Core Experience

The primary experience should follow this general loop:

```text
Create Pet
    ↓
Customize Pet
    ↓
Enter World
    ↓
Explore / Interact
    ↓
Complete Real-Life Goal
    ↓
Receive Reward
    ↓
World / Pet Reacts
    ↓
Create Memory
    ↓
Continue Building World
```

This loop should feel rewarding without requiring constant engagement.

The application should encourage meaningful interaction rather than endless engagement, grinding, or addictive mechanics.

---

# 4. Design Philosophy

## 4.1 The World Should Feel Alive

The pet should not simply wait for the user to click something.

It should have:

* Idle behaviors
* Movement
* Curiosity
* Reactions
* Preferences
* Environmental interactions
* Mood changes
* Different personalities
* Small unexpected behaviors

The world should continue to feel alive even when the user is not actively controlling the pet.

---

## 4.2 Visuals Are a Core Feature

The application is fundamentally visual.

The pet should not be represented primarily through text or static UI.

The experience should contain:

* Beautiful 2D environments
* Expressive creatures
* Smooth animation
* Layered environments
* Lighting effects
* Particles
* Small environmental details
* Modular creature customization

The visual style should feel similar to an indie game or illustrated digital world rather than a traditional productivity application.

---

## 4.3 Cute + Absurd

Creatures should be able to range from:

```text
Cute
↓
Dreamy
↓
Strange
↓
Absurd
↓
Completely ridiculous
```

Customization should allow users to create creatures that are visually coherent while still allowing intentionally weird combinations.

Examples:

* A tiny mushroom with six eyes
* A floating blob wearing a giant hat
* A sleepy cloud with legs
* A creature with absurd proportions
* A cute creature wearing completely inappropriate furniture as a hat

The system should support creativity rather than forcing every creature into a conventional cute-animal design.

---

# 5. What the Application Is

Digital Pet World is:

* A digital pet experience
* A 2D interactive environment
* A customization system
* A lightweight goal/reward system
* A memory-keeping system
* A visual creative project
* Potentially a social world in the future

---

# 6. What the Application Is NOT

The initial application is NOT:

* A traditional multiplayer game
* A competitive game
* A productivity application with a pet attached
* A social media platform
* A full MMORPG
* A 3D game
* A cryptocurrency project
* An AI chatbot with a pet skin
* An always-online requirement
* An infinite content-generation system

The pet should remain the center of the experience.

---

# 7. MVP Scope

The MVP should focus on proving that the core experience is enjoyable.

The MVP should contain:

### User

* Basic account
* Username
* Authentication

### Pet

* Create a pet
* Name a pet
* Select species/base body
* Customize appearance
* Basic personality
* Basic state

### Environment

* One room/environment
* Background
* Furniture/decorations
* Place objects
* Move objects
* Remove objects

### Pet Interaction

* Idle
* Walk
* Basic interaction
* Basic reactions
* Basic animation

### Goals

* Create goal
* Mark goal as completed
* Receive a reward

### Objects

* Browse the object catalog
* Place objects in the environment
* Rearrange them, and remove them again

*(Superseded the planned Inventory screen. A separate list of owned-but-unseen
items turned out to hold only two kinds of thing — furniture, which belongs in
the room, and wearables, which belong on the creature — so the Room panel became
the object store and the Pet panel the wardrobe. See `room-and-objects.md` §7c.)*

### Memories

* Generate a memory from important events
* View memories
* Attach images/photos where applicable
* Choose whether a memory is private (the default) or shared

---

# 8. MVP Success Criteria

The MVP is successful if a user can:

```text
Create a creature
      ↓
Enter a beautiful room
      ↓
Watch the creature move around
      ↓
Interact with the creature
      ↓
Customize the room
      ↓
Create a real-life goal
      ↓
Complete the goal
      ↓
Receive something in the world
      ↓
See the pet react
      ↓
Look back at the resulting memory
```

The primary question is:

> Does the world feel enjoyable enough that the user wants to return to it?

Not:

> How many features can be implemented?

---

# 9. Architecture Philosophy

The application should be divided into clear systems.

```text
React
    ↓
Application UI

PixiJS
    ↓
2D World Rendering

Pet Simulation
    ↓
Pet Behavior and Decision Making

NestJS
    ↓
Backend Business Logic

Prisma
    ↓
Database Access

PostgreSQL
    ↓
Persistent Data
```

Each system should have a clearly defined responsibility.

---

# 10. Important Separation of Responsibilities

## React

React controls the application's interface.

Examples:

* Menus
* Inventory
* Goals
* Pet creator
* Settings
* Memory book

React should not contain the core PixiJS rendering system.

---

## PixiJS

PixiJS controls the visual world.

Examples:

* Pet sprites
* Environment
* Objects
* Animation
* Particles
* Movement
* Visual interaction

PixiJS should not directly access PostgreSQL.

---

## Pet Simulation

The simulation determines what the pet does.

Examples:

```text
Pet is tired
    ↓
Choose sleep behavior

Pet sees toy
    ↓
Choose interaction behavior

Pet is curious
    ↓
Explore nearby object
```

The simulation should not be responsible for rendering.

---

## NestJS

NestJS controls backend business logic.

Examples:

* Authentication
* Goals
* Rewards
* Inventory
* Memories
* Saving pet state
* Saving environments
* Authorization

---

## PostgreSQL

PostgreSQL stores persistent information.

It should not store every frame of animation or every temporary movement.

---

# 11. AI Philosophy

AI is an optional supporting system.

AI may eventually be used for:

* Creature generation
* Personality generation
* Dialogue
* Memory descriptions
* Creative events
* Content suggestions

AI should NOT be required for basic functionality.

The application should still work if the AI service is unavailable.

AI should not control every pet action or every animation frame.

---

# 12. Social Features

**Built.** See `API-endpoints/13-social-endpoints.md` for the whole surface.

This section used to say social functionality was a future feature and that it
should not complicate the initial architecture. It was requested, and the second
half of that sentence turned out to be the useful part: almost nothing had to
change to accommodate it.

| Listed as possible | Built as |
|---|---|
| Visiting another user's environment | `GET /users/:userId/room`, rendered through the **same** `PetHabitat` the owner uses, read-only |
| Seeing other pets | Visitors in the same PixiJS scene, depth-sorted with the furniture, drawn by the same `PetRenderer` |
| Pet interactions | Four kinds, server-arbitrated, eight animation clips |
| Public spaces | Parks — temporary, capacity-bounded, optionally passcode-protected |
| Shared rooms | *not* built. A room belongs to one person; a park is the shared place |
| Shared events | *not* built |
| Trading objects | *not* built — there is no item ownership to trade. See 13 §12.1 |

What the social layer is **not**, and this is the load-bearing constraint:

> There is no profile, no feed, no follower count and no posts.

The product's answer to "who is this person" is their creature and the room it
lives in (§16). You find somebody by username, and what you find is a pet.
Everything a person does to another person, they do to an animal — which is the
difference between this and a social network with a game attached.

**The MVP loop is unchanged.** The social layer extends it at exactly one point:
a memory made by finishing a goal can now be shared. Otherwise it adds a place
to go rather than a step to take, which is why the whole surface sits behind one
lazy boundary and opens no connection until somebody asks for it.

---

# 13. Future Vision

The long-term vision is a collection of small personal digital worlds.

Each user has:

```text
A Creature
+
A Home
+
A Personality
+
A Collection
+
A History
+
Memories
```

Users should feel that their pet and environment are uniquely theirs.

The application can eventually evolve into a shared world where personal environments and creatures coexist with those of other users.

---

# 14. Technical Direction

The initial technical stack is:

```text
Frontend
├── React
├── Vite
├── TypeScript
├── PixiJS
├── Tailwind CSS
├── Zustand
├── TanStack Query
└── Zod

Backend
├── NestJS
├── TypeScript
├── REST API
├── WebSockets
└── Better Auth

Database
├── PostgreSQL
└── Prisma

Storage
└── local

Future Infrastructure
└── Redis

AI
└── External AI APIs (optional, future feature, not the main focus)
```

---

# 15. Development Priorities

Development should prioritize the following order:

1. Visual quality
2. Pet interaction
3. Creature customization
4. Environment interaction
5. Pet behavior
6. Goal/reward system
7. Memories
8. Persistence
9. AI
10. Social features

The project should avoid implementing large backend systems before the core visual experience has been proven.

---

# 16. Core Principle

The application should feel like:

> **A small living world that belongs to the user.**

The user should not feel like they are managing a database record called `Pet`.

They should feel like they have a strange little creature living in a strange little room that gradually becomes theirs.

The technology exists to create that feeling.

It should never become the experience itself.

```
```
