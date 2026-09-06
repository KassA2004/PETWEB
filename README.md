# Pocus

Your progress lives somewhere.

Set one small goal, focus on it, finish it — and a creature in a warm little
room notices every time. The room grows because you did.

```text
frontend/   React + Vite + PixiJS. The world, the creature, the interface
Backend/    NestJS + Prisma + Postgres. Accounts, rooms, goals, parks
Docs/       The reference. Read AGENTS.md before changing anything
```

## Running it

```bash
npm install --prefix Backend && npm install --prefix frontend
cp Backend/.env.example Backend/.env      # fill in DATABASE_URL and the secret
npx prisma migrate deploy --schema Backend/prisma
npm run start:dev --prefix Backend        # http://localhost:3000
npm run dev --prefix frontend             # http://localhost:5173
```

`frontend/.env` needs `VITE_API_URL` pointing at the backend. The frontend and
the API must be reached on the same host, or the session cookie is cross-site
and is never stored.

Signing up sends a six-digit code to the address given. **You do not need a
mail account to develop against this**: with no `SMTP_URL` set, the backend
prints the code and a link to the rendered email on a throwaway Ethereal inbox.
`Backend/.env.example` has paste-ready `SMTP_URL` lines for real providers, and
`MAIL_REQUIRED=1` — which every deployment should set — turns the fallback off.

## Where to read next

- `Docs/AGENTS.md` — the rules, and the bugs each one exists to prevent
- `Docs/project-overview.md` — what the product is
- `Docs/techStack.md` — every dependency, and why it is allowed
- `Docs/room-and-objects.md` — the grid, placement, and drawing an object
- `Docs/API-endpoints/` — the REST surface and the socket protocol
