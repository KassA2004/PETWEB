/**
 * The showcase account: one sign-in that has already earned everything.
 *
 * Half of this product's catalogue is behind three counters — minutes focused,
 * goals finished, memories shared (`Backend/src/progress/progress.ts`) — and
 * that is the right shape for a person living in the room. It is the wrong
 * shape for somebody who has been handed the app for ten minutes and asked
 * what they think of it: they cannot see the Study Desk without serving fifteen
 * hours first, and "take my word for it, there is more" is not a demo.
 *
 * So this makes an account that has, on paper, done all of it.
 *
 * ## What it does, and what it deliberately does not
 *
 * ```text
 *   signs up      through the real /api/auth/sign-up/email route, so the
 *                 password is hashed by Better Auth and the sign-up hook runs
 *                 — the domain User row and the starting Environment are made
 *                 by the same code every other account goes through
 *   tops up       the three counters, past the highest threshold in the
 *                 catalogue, and sets affection to full
 *   leaves alone  the creature. An empty account opens the creator, which is
 *                 exactly where somebody trying the assets out wants to land
 * ```
 *
 * **Nothing here is a back door.** There is no route, no flag on the row, and
 * no code path in the product that treats this account differently: it is an
 * ordinary user whose three numbers happen to be large, and every unlock it
 * gets, it gets by meeting the same requirement everybody else does. Delete the
 * row and it is gone.
 *
 * Idempotent. Running it again on an account that exists tops the numbers back
 * up rather than failing, which is what you want after a `prisma migrate reset`
 * or a day of using it as a scratch account.
 *
 * ```bash
 * # with the API running (it is what hashes the password)
 * node scripts/seed-showcase-account.mjs
 * # or with your own credentials
 * SHOWCASE_EMAIL=me@example.com SHOWCASE_PASSWORD=... node scripts/seed-showcase-account.mjs
 * ```
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const EMAIL = process.env.SHOWCASE_EMAIL ?? 'showcase@petweb.app';
const PASSWORD = process.env.SHOWCASE_PASSWORD ?? 'ShowEverything!2026';
const NAME = process.env.SHOWCASE_NAME ?? 'showcase';
const API = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * The `Origin` a browser would have sent.
 *
 * Better Auth refuses a request with no origin at all (`MISSING_OR_NULL_ORIGIN`)
 * — which is right, and is the CSRF check doing its job. A script is not a
 * browser and has to say which of the trusted origins it is standing in;
 * `getCorsOrigins()` allows `localhost:5173` unconditionally, so that is the
 * one to claim when nothing else is configured.
 */
const ORIGIN = process.env.FRONTEND_URL ?? 'http://localhost:5173';

/**
 * What the account is credited with.
 *
 * Comfortably past the largest requirement in `ObjectCatalog.ts` — 900 focus
 * minutes, 40 goals, 20 memories — with enough headroom that adding a more
 * expensive object later does not quietly re-lock the demo. Not absurd numbers
 * either: they are printed on the stats tab and on every visit to this room, so
 * they should read as somebody who has used the product for a while rather than
 * as a debug value.
 */
const CREDITED = {
  focusMinutes: 1200,
  goalsCompleted: 60,
  memoriesShared: 25,
};

async function signUp() {
  let response;
  try {
    response = await fetch(`${API}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ name: NAME, email: EMAIL, password: PASSWORD }),
    });
  } catch (cause) {
    throw new Error(
      `Cannot reach the API at ${API}. Start it first (npm run start:dev) — it is ` +
        'what hashes the password and creates the room.',
      { cause },
    );
  }

  if (response.ok) return 'created';

  // Already there is the ordinary case on a re-run, and it is not a failure.
  const body = await response.text();
  if (response.status === 422 || /exist/i.test(body)) return 'existing';

  throw new Error(`Sign-up failed (${response.status}): ${body}`);
}

const prisma = new PrismaClient();

try {
  const outcome = await signUp();

  // `updateMany` rather than `update`, so a missing row is a message rather
  // than an exception: sign-up said it exists, and if the domain row does not,
  // that is worth reporting plainly.
  const { count } = await prisma.user.updateMany({
    where: { email: EMAIL },
    data: {
      ...CREDITED,
      // Full, and settled as of now — affection decays from `affectionAt`, so
      // an account seeded last month would otherwise open on a cold creature.
      affection: 1,
      affectionAt: new Date(),
      lastFollowThroughAt: new Date(),
    },
  });

  if (count === 0) {
    throw new Error(
      `No user row for ${EMAIL}. Sign-up reported "${outcome}" — check the API logs.`,
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: {
      username: true,
      focusMinutes: true,
      goalsCompleted: true,
      memoriesShared: true,
    },
  });

  console.log(`Showcase account ${outcome === 'created' ? 'created' : 'topped up'}.`);
  console.log(`  email     ${EMAIL}`);
  console.log(`  password  ${PASSWORD}`);
  console.log(`  username  ${user.username}`);
  console.log(
    `  credited  ${user.focusMinutes} focus minutes, ${user.goalsCompleted} goals, ` +
      `${user.memoriesShared} memories shared`,
  );
  console.log('Everything in the object catalogue is unlocked for it.');
} finally {
  await prisma.$disconnect();
}
