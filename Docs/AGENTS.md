# AGENT RULES

## Before Coding

1. Read all documentation in `/docs`.
2. Read `PROJECT_OVERVIEW.md`.
3. Read `TECH_STACK.md`.
4. Read the relevant technical specification.
5. Inspect the existing implementation before modifying anything.

## Architecture Rules

- Do not introduce technologies not specified in TECH_STACK.md without approval.
- Do not replace Prisma.
- Do not replace PixiJS.
- Do not redesign the database without documenting the change.
- Do not create duplicate systems when an existing system can be extended.

## Visual Rules

- Follow `pet-anatomy.md`.
- Follow `animation-approach.md`.
- Follow `theme-and-design.md`.
- Follow `room-and-objects.md` for anything in the room: the grid, placement,
  object sizing, object shading, affordances and the saved room style.
- Follow `audio-and-feedback.md` for anything that makes a noise or animates a
  control.
- Pets must use the standardized blob rig.
- Visual assets should remain code-generated/procedural.

## Room Rules

- An object's size is its grid footprint. Nothing may author a width, a depth or
  a collider extent beside it.
- Never clamp a placement after snapping it. If a clamp seems necessary, the
  footprint is wrong.
- The drag guide, the status line and the drop must all call `snapFootprint`.
- Anything the user can choose about the room belongs in `RoomStyle`, and is
  therefore saved. Room appearance must never live in React state.
- Adding an object is one catalog row, one renderer and one line in the renderer
  map. If it needs a conditional anywhere else, the catalog row is missing a
  field.

## Audio Rules

- No component constructs audio. It reports an event; `lib/audio` decides what
  that sounds like and whether there is room for it.
- There are no audio files. Sounds are synthesised, for the same reasons the
  artwork is procedural.
- Every repeating sound has a throttle key and a cooldown. Physics must never be
  able to spam the mixer.
- Channel levels live in one table (`AudioBus.DEFAULT_LEVELS`) and are tuned by
  measurement, not by ear alone.
- Audio starts only from a user gesture, and `unlock()` is idempotent.

## Persistence Rules

- Anything the user decides belongs to the user, and is saved: the room's
  appearance (`Environment.sceneData`), what is standing in it
  (`EnvironmentObject`), their goals and their memories.
- Ownership is always derived from the session. No handler takes an owner id
  from a request body, and someone else's row is a 404 rather than a 403.
- Rules that protect data are enforced on the server. A disabled button is a
  courtesy; the six-goal cap is counted inside the transaction that inserts.
- Never save on a timer that runs per frame. Placement saves are debounced and
  triggered by *settled* changes only.
- PostgreSQL stores the path to an uploaded file, never the bytes.

## Implementation Rules

- Work on one task at a time.
- Keep changes scoped.
- Do not implement future features unless explicitly requested.
- Test changes before marking a task complete.
- Update documentation when architecture changes.

## Completion

A task is complete only when:

- Implementation exists
- TypeScript compiles
- Tests pass where applicable
- No unrelated files were modified
- Documentation is updated if necessary