import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prismaService } from '../prisma/prisma.service';

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
  trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],

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
  session: { modelName: 'AuthSession' },
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
