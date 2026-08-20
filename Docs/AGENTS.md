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

- Follow PET_ANATOMY.md.
- Follow ANIMATION_SYSTEM.md.
- Follow VISUAL_DESIGN.md.
- Pets must use the standardized blob rig.
- Visual assets should remain code-generated/procedural.

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