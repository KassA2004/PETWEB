import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prismaService } from '../prisma/prisma.service';
import {
  USERNAME_MAX,
  deriveUsername,
  uniqueUsername,
  usernameKeyOf,
} from '../users/username';
import 'dotenv/config';

export const getCorsOrigins = (): string[] => {
  const origins = new Set<string>();
  if (process.env.FRONTEND_URL) {
    origins.add(process.env.FRONTEND_URL);
  }
  origins.add('http://localhost:5173');
  origins.add('http://localhost:4173');
  origins.add('http://127.0.0.1:5173');
  origins.add('http://127.0.0.1:4173');
  return Array.from(origins);
};

/**
 * Better Auth instance.
 *
 * Per /Docs/API-endpoints/01-auth-endpoints.md: Better Auth owns credentials and
 * sessions end to end (AuthUser/AuthSession/AuthAccount/AuthVerification — see
 * /Docs/API-endpoints/11-schema-additions.md §0). We do not hand-write
 * login/session routes here (AGENTS.md — "do not create duplicate systems").
 *
 * `basePath` matches the `/api/auth` mount point from 00-conventions.md §1.
 */
export const auth = betterAuth({
  database: prismaAdapter(prismaService, { provider: 'postgresql' }),

  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: getCorsOrigins(),

  // InitialDB-plan.md uses UUID (PK) for every table's id. Better Auth's
  // default id generator is not a UUID, so it's overridden to keep AuthUser /
  // AuthSession / AuthAccount ids consistent with every other table.
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  // Map Better Auth's default model names onto the Auth-prefixed tables in
  // /Backend/prisma/auth-*.prisma, so they never collide with the domain
  // `User` model in user.prisma.
  user: { modelName: 'AuthUser' },
  /**
   * `modelName` maps this onto `AuthSession` (`Backend/prisma/auth-*.prisma`).
   *
   * `cookieCache` is the performance-relevant part: a signed copy of the
   * session in the cookie, refreshed every five minutes. `AuthGuard` runs on
   * every request, and without this every request began with a session read
   * from Postgres — five of them on one dashboard load, before any handler had
   * done its own work.
   *
   * Five minutes, and not longer, because this is the window in which a
   * revoked session still works. The domain `User` lookup in `auth.guard.ts`
   * is deliberately NOT cached: that row is the authorization decision, and it
   * is a primary-key hit.
   */
  session: {
    modelName: 'AuthSession',
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: { modelName: 'AuthAccount' },
  verification: { modelName: 'AuthVerification' },

  databaseHooks: {
    user: {
      create: {
        /**
         * First-login bootstrap, per 01-auth-endpoints.md §2:
         *
         *   sign-up -> create domain User row -> create default Environment
         *
         * Runs inside the sign-up request, after Better Auth has committed the
         * AuthUser row, so by the time /sign-up/email responds the user already
         * has a room to enter.
         *
         * Starter InventoryItems are NOT granted here yet — no ObjectDefinition
         * catalog exists to grant from (that's package 05 work). See the scope
         * note in 11-schema-additions.md §0.
         */
        after: async (authUser) => {
          // A username is unique now (user.prisma), and sign-up is where two
          // accounts most plausibly collide — two people called "sam", or the
          // same person's `sam@work` and `sam@home`. So the derived name is
          // walked until it is free rather than inserted and hoped for.
          //
          // There is still a race between the check and the insert, and the
          // database is what closes it: `usernameKey` is UNIQUE, so a loser
          // gets a constraint violation and retries with the next candidate.
          const username = await uniqueUsername(
            deriveUsername(authUser.name, authUser.email),
            async (key) =>
              (await prismaService.user.count({ where: { usernameKey: key } })) > 0,
          );

          const user = await createUserWithUniqueName(authUser.id, authUser.email, username);

          // `user.username`, not the candidate above: the insert may have had
          // to take a different name after a collision, and a room called
          // "sam's Room" belonging to `sam3` is a small lie the product would
          // then be stuck with.
          await prismaService.environment.create({
            data: {
              ownerId: user.id,
              name: `${user.username}'s Room`,
            },
          });
        },
      },
    },
  },
});

/**
 * Insert the domain `User`, retrying past a username collision.
 *
 * `uniqueUsername` above asks the database whether each candidate is free, and
 * between that answer and this insert another sign-up can take the name. The
 * window is small and the consequence is a failed registration, which is not a
 * thing to leave to luck — so a `P2002` on `usernameKey` is caught and the next
 * candidate tried.
 *
 * Bounded, and the bound is generous: five collisions in a row on a name that
 * was free a millisecond ago is not contention, it is a bug somewhere else, and
 * failing loudly is better than looping.
 */
async function createUserWithUniqueName(
  id: string,
  email: string,
  candidate: string,
): Promise<{ id: string; username: string }> {
  let username = candidate;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prismaService.user.create({
        data: { id, username, usernameKey: usernameKeyOf(username), email },
        select: { id: true, username: true },
      });
    } catch (error) {
      const taken =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!taken) throw error;

      const suffix = Math.random().toString(36).slice(2, 6);
      username = `${candidate.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
    }
  }

  throw new Error('Could not allocate a unique username for a new account.');
}
