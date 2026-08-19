# Digital Pet World - Technology Stack

**Purpose:** This document outlines the required technology stack for the Digital Pet World application. Ensure all architectural decisions align with these constraints.

## Core Stack

### Frontend
- **React** - Main frontend framework and application UI.
- **Vite** - Frontend development server and build tool.
- **TypeScript** - Primary frontend programming language.
- **PixiJS** - 2D rendering engine for the interactive pet world, creatures, environments, animations, particles, and visual effects.
- **Tailwind CSS** - Styling for the application's traditional UI.
- **shadcn/ui** - Reusable UI components for menus, dialogs, forms, settings, inventory, goals, etc.
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

### REST API
Used for standard operations:
- Creating/editing pets and saving environments
- Creating/completing goals
- Retrieving memories and managing inventory

### WebSockets
Used for realtime features:
- Shared environments
- Player presence and interactions

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
*Note: Required only when realtime/shared-world functionality becomes necessary. Not required for the initial prototype.*
Potential uses: Player presence, WebSocket coordination, Pub/Sub.

---

## Authentication

### Better Auth
Open-source authentication solution to handle security locally without relying on paid third-party services.
Handles: Registration, login, sessions, password management.

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