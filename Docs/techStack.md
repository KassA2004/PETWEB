# Pocus - Technology Stack

**Purpose:** This document outlines the required technology stack for the Pocus application. Ensure all architectural decisions align with these constraints.

## Core Stack

### Frontend
- **React** - Main frontend framework and application UI.
- **Vite** - Frontend development server and build tool.
- **TypeScript** - Primary frontend programming language.
- **PixiJS** - 2D rendering engine for the interactive pet world, creatures, environments, animations, particles, and visual effects.
- **Tailwind CSS** - Styling for the application's traditional UI.
- **shadcn/ui** - Reusable UI components for menus, dialogs, forms, settings, goals, etc.
- **Splide** (`@splidejs/splide`) - Paging for large option grids in the customization panels.

  Added on request, and deliberately the *vanilla* package rather than
  `@splidejs/react-splide`: the React wrapper is built against React 18 and is
  only a class component around the same library, so a thin `Carousel`
  (`components/ui/carousel.tsx`) mounts it directly and avoids the peer-version
  question entirely. Mounted with `type: 'slide'` and never `'loop'` — loop mode
  clones slides into the DOM, and a cloned React-rendered node is one React does
  not know it has: it never updates, and its handlers are frozen at the moment
  the clone was taken.

  Used only where a category has more options than a grid can hold (eyes has 22,
  mouths 16, the object catalog 20). Categories that fit one page render as a
  plain grid with no carousel chrome at all.
- **Lucide** (`lucide-react`) - Icons for interface chrome: the tab strips, the
  Home/Friends switch, buttons and status lines.

  Added on request, and it does **not** loosen theme-and-design.md §20.1. That
  rule — "there is no icon set, and there must never be one" — is about
  *choosing things*: an ear option is a picture of the ear drawn by the same
  procedural code that draws it in the world, never a glyph standing in for it,
  because a glyph is a second copy of a design that silently stops matching the
  first. Every option grid, every object tile and every creature preview still
  obeys that, and always will.

  Navigation is not choosing a thing. "Parks", "Messages", "Home" name places
  the renderer cannot draw because they are not objects in the world, and a bare
  row of words is what the social layer's four stacked sections looked like
  before — unscannable. Icons are allowed there and forbidden anywhere a preview
  of the real thing is possible.

  Tree-shaken per-icon: only the marks actually used are in the bundle, and
  every one of them is an inline SVG, so the "no images, no webfonts" rule in
  the Performance Rules is untouched.
- **Zustand** - Lightweight client-side state management.
- **TanStack Query** - Server-state management, API fetching, caching, and mutations.
- **Zod** - Runtime validation for API data, pet configurations, and structured data.

---

## Backend

### NestJS
**NestJS** is the main backend framework.
Responsibilities:
- Authentication
- User management
- Pet management & customization
- Environment & object management
- Inventory & goals
- Memories & rewards
- Pet simulation logic
- Realtime communication
- **compression** (`Backend/src/main.ts`) — gzips outgoing JSON responses
  above a size threshold. Registered before the raw Better Auth mount, for
  the same middleware-ordering reason CORS is. Added during the performance
  optimization pass (`Docs/plans/website-performance-optimization-plan.md`,
  Task 15).

### REST API
Used for standard operations:
- Creating/editing pets and saving environments
- Creating/completing goals
- Retrieving memories and managing inventory

### WebSockets
**Socket.IO** (`@nestjs/websockets` + `@nestjs/platform-socket.io` on the
backend, `socket.io-client` on the frontend), on one namespace, `/social`.

Socket.IO rather than a bare `ws`, and the choice is the one
`10-realtime-events.md` §5 already assumed when it said Redis would back "the
Socket.IO adapter": rooms, acknowledgements and reconnection with backoff are
all things a park needs and none of them are worth hand-rolling. The
acknowledgement in particular is load-bearing — joining a park is a *request*
that can be refused (full, wrong passcode, closed), and a protocol without a
reply would need a correlation id and a timeout invented for it.

**No polling fallback.** `transports: ['websocket']` on both ends. Long-polling
would work, and is exactly the shape this feature is not allowed to be built on;
silently falling back to it under a strict proxy would mean shipping that shape
without noticing.

Used for:
- Parks: presence, creature positions, pet-to-pet interactions
- Chat, in a park and between friends
- Friend requests and who is online

See `API-endpoints/13-social-endpoints.md` §8.

### bcrypt / argon2 — deliberately NOT added
A private park's passcode is hashed with **scrypt from Node's own `crypto`**.
A password-hashing KDF is required (a park passcode is a human-chosen secret, so
a fast digest of it is a lookup table away from plaintext), and scrypt is
memory-hard, in the standard library, and costs no native module to compile on
every machine this deploys to. See `13-social-endpoints.md` §5.2.

---

## Database

### PostgreSQL
Primary relational database hosted locally.
Stores persistent application data:
- Users, Pets (appearance, personality, state)
- Environments, Environment objects
- Goals, Memories, Inventory, Object definitions

### Prisma ORM
Used to interact with the local PostgreSQL instance.
Responsibilities:
- Database schema and migrations
- Type-safe queries and relations
- Database access from NestJS

---

## Storage

### Local Storage / MinIO
Local object storage for files that should not be stored directly in PostgreSQL. Must be kept entirely local and free.
Options to implement:
- **NestJS + Multer:** Store files directly in a local directory and serve them statically.
- **MinIO:** Local S3-compatible storage server run via Docker.
Used for:
- User photos, memory images, and generated assets.
*Note: PostgreSQL stores the local file paths/URLs, not the files themselves.*

---

## Realtime Infrastructure

### Redis (Local)
Local Redis instance run via Docker.

*Still not required, and the social layer shipped without it.* The rule from
`10-realtime-events.md` §5 held: Redis backs the Socket.IO **adapter** once more
than one backend process serves sockets, and a single process needs none.

What would have to change for a second process is the adapter, and nothing else.
Membership, capacity, park credentials and every message are in Postgres
precisely so that they are not one process's memory; the in-memory parts —
last-known creature positions and interaction cooldowns — are per-park ephemera
a second process would simply hold its own copy of.

**The ceilings added in Sept 2026 are per-process and one of them is not.**
`MAX_SOCKETS` counts this process's own connections and is correct as it stands;
`MAX_LIVE_PARKS` counts rows and is therefore already global, which is the right
answer for the thing it protects — the database. `PARKS_PER_HOST` is a row count
too. So the only number a second process would need to think about is the socket
one, and the thinking is a division. See `13-social-endpoints.md` §8.5b.

Potential uses, unchanged: WebSocket coordination, Pub/Sub.

---

## Authentication

### Better Auth
Open-source authentication solution to handle security locally without relying on paid third-party services.
Handles: Registration, login, sessions, password management.

Configured in `Backend/src/auth/auth.ts`. Two properties that file is
responsible for, and `Docs/API-endpoints/01-auth-endpoints.md` is the reference:

- **A session ends when the user says so.** `databaseHooks.session.delete.after`
  announces it, and the social gateway closes the sockets that session
  authenticated — 71 ms, measured, against a ten-minute revalidation backstop.
- **A session ends by itself.** Thirty days, slid daily.

**Email verification was added and then removed on request** (Sept 2026). While
it existed, sign-up created no session until a six-digit code mailed to the
address was typed back in — the `emailOTP` plugin plus **nodemailer**, which is
no longer a dependency. Both are in the history if it returns; nothing else in
the stack changed to accommodate its removal.

---

## AI (COMPLETELY OPTIONAL - DO NOT FOCUS ON THIS)
**Important:** AI is an optional, future-state supporting system. Do not focus on this during the initial implementation.
When implemented later, it will use free/local solutions (e.g., Ollama or free-tier APIs) to avoid paid subscriptions.
Potential future uses:
- Generating creature concepts or dialogue
- Procedural content generation
*Constraint: AI will NOT control the pet's behavior every frame.*

---

## Pet Simulation

The core pet simulation is a custom TypeScript system implemented using normal application logic. 
It determines:
- Pet desires, reactions, and mood changes based on personality and environment.
- When the pet walks, sleeps, plays, or investigates.

**Simulation Flow:**
`Pet State + Personality + Environment + Nearby Objects ➔ Behavior Decision ➔ Animation ➔ PixiJS Rendering`

---

## Local Infrastructure Configuration

```yaml
# docker-compose.yml reference for local stack
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
      POSTGRES_DB: digital_pet_world
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: password123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data: