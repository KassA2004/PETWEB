import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prismaService } from '../prisma/prisma.service';

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
          const username = deriveUsername(authUser.name, authUser.email);

          const user = await prismaService.user.create({
            data: {
              id: authUser.id,
              username,
              email: authUser.email,
            },
          });

          await prismaService.environment.create({
            data: {
              ownerId: user.id,
              name: `${username}'s Room`,
            },
          });
        },
      },
    },
  },
});

function deriveUsername(name: string, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return email.split('@')[0] ?? 'newcomer';
}
