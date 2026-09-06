import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prismaService } from '../prisma/prisma.service';
import {
  USERNAME_MAX,
  deriveUsername,
  uniqueUsername,
  usernameKeyOf,
} from '../users/username';
import { checkEmailAddress } from './email-address';
import { sessionEnded } from './session-events';

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
 * Whether this process is serving the real thing.
 *
 * Decides two things and nothing else: whether cookies are `Secure` and
 * `SameSite=None` (they must be, over HTTPS, for an API on a different origin),
 * and how long a session lasts. Both are *deployment* facts rather than code
 * paths, which is why they are read here once instead of being sprinkled
 * through the options below.
 */
const PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Better Auth instance.
 *
 * Per /Docs/API-endpoints/01-auth-endpoints.md: Better Auth owns credentials and
 * sessions end to end (AuthUser/AuthSession/AuthAccount/AuthVerification — see
 * /Docs/API-endpoints/11-schema-additions.md §0). We do not hand-write
 * login/session routes here (AGENTS.md — "do not create duplicate systems").
 *
 * `basePath` matches the `/api/auth` mount point from 00-conventions.md §1.
 *
 * ## Two properties this file is responsible for
 *
 * There were three. **Email verification is removed, on request, until further
 * notice**: sign-up creates a session immediately again, nothing is emailed,
 * and an address only has to *look* like one (`email-address.ts`, now a single
 * regex). `someone@example.com` is a usable account. The `emailOTP` plugin, the
 * `mailer` and the `VerifyForm` that fed it are in the history if it comes
 * back — see the note in `email-address.ts`.
 *
 * **A session ends when the user says so.** Signing out deletes the row, and
 * `databaseHooks.session.delete.after` announces it (`session-events.ts`) so
 * that anything holding a *connection* authenticated by that session — the
 * social gateway's WebSockets — is closed in the same moment rather than at its
 * next revalidation.
 *
 * **A session ends by itself.** Thirty days, refreshed daily while it is in
 * use, so an abandoned session on a shared machine expires instead of waiting
 * for somebody to remember it.
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
    /**
     * The session cookie's attributes.
     *
     * The API and the frontend are separate origins, so the cookie is
     * cross-site and a browser will only store it when it is both
     * `SameSite=None` and `Secure` — which means it only works at all over
     * HTTPS. In development the two are `localhost` on different *ports*, which
     * is the same site, so `Lax` is both sufficient and stricter.
     *
     * Stated rather than left to the default because getting it wrong fails in
     * the least helpful way available: sign-in returns 200, sets a cookie the
     * browser silently discards, and the next request is anonymous.
     */
    useSecureCookies: PRODUCTION,
    defaultCookieAttributes: PRODUCTION
      ? { sameSite: 'none', secure: true, httpOnly: true }
      : { sameSite: 'lax', secure: false, httpOnly: true },
  },

  /**
   * A blunt cap on how often anybody may hammer these routes.
   *
   * The password endpoints are the ones that matter: each is an oracle for
   * something — whether an account exists, whether a password is right — and
   * the only defence against being asked a million times is not answering that
   * often.
   *
   * Sign-up's allowance is deliberately loose. It was five per fifteen minutes
   * when an emailed code stood behind it and a mailbox was the real cost of an
   * account; with verification gone the limit is the only cost there is, but it
   * is also the thing a developer runs into making test accounts. Twenty in
   * five minutes stops a script and does not stop an afternoon.
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/sign-up/email': { window: 60 * 5, max: 20 },
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    /*
     * `requireEmailVerification` is deliberately absent (default false).
     *
     * Sign-up therefore returns a session and a cookie, and an address is never
     * checked beyond its shape. That is the requested behaviour, and it is the
     * one line to change if verification comes back.
     */
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
   *
   * **The window is only open when the cookie survives**, which after a
   * deliberate sign-out it does not: `/sign-out` clears both the session cookie
   * and its cached copy, so the browser that signed out has nothing left to
   * present. The five minutes are the exposure for a session revoked
   * *elsewhere*, which is the case `freshAge` and the socket teardown below
   * exist to bound.
   */
  session: {
    modelName: 'AuthSession',
    /** A month, which is how long a room is worth staying signed in to. */
    expiresIn: 60 * 60 * 24 * 30,
    /** Slide the expiry at most once a day rather than on every request. */
    updateAge: 60 * 60 * 24,
    /**
     * How recently the user must have proved who they are before Better Auth
     * will let them change something dangerous — their password, their email.
     * A day: long enough not to be an obstacle, short enough that a borrowed
     * laptop is not an account takeover.
     */
    freshAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: { modelName: 'AuthAccount' },
  verification: { modelName: 'AuthVerification' },

  /**
   * Request middleware, for the one thing that has to happen *before* an
   * account exists.
   *
   * Better Auth refuses a malformed address with a bare code; this refuses it
   * with a sentence, in the same shape as every other refusal in this API
   * (`email-address.ts`). Doing it here rather than in the database hook is
   * what makes it a clean 400 rather than a failed insert.
   *
   * It is also the seam the deliverability rules plugged into — the MX lookup,
   * the disposable-provider list — so it stays wired even though it currently
   * only checks a regex. Bringing those back is editing one file.
   */
  hooks: {
    // `async` although nothing here awaits: Better Auth's middleware signature
    // requires a promise, and this used to await a DNS lookup.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;

      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (typeof email !== 'string') return;

      const verdict = checkEmailAddress(email);
      if (verdict.ok) return;

      throw new APIError('BAD_REQUEST', {
        code: 'INVALID_EMAIL',
        message: verdict.reason,
      });
    }),
  },

  databaseHooks: {
    session: {
      delete: {
        /**
         * The session is gone; tell anything still holding a connection that
         * was authenticated by it.
         *
         * Fires for every route that ends a session — `/sign-out`, revoking one
         * session, revoking all of them — because they all delete the row, and
         * hooking the row rather than the route is what makes that true without
         * anybody having to remember it.
         *
         * See `session-events.ts` for why this is announced rather than called.
         */
        after: async (session) => {
          const userId = (session as { userId?: unknown }).userId;
          if (typeof userId === 'string') sessionEnded(userId);
        },
      },
    },
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
