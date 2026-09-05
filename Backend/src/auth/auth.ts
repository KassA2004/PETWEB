import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prismaService } from '../prisma/prisma.service';
import {
  USERNAME_MAX,
  deriveUsername,
  uniqueUsername,
  usernameKeyOf,
} from '../users/username';
import { checkEmailAddress } from './email-address';
import { CODE_LIFETIME_MINUTES, sendVerificationCode } from './mailer';
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
 * Decides three things and nothing else: whether cookies are `Secure` and
 * `SameSite=None` (they must be, over HTTPS, for an API on a different origin),
 * how long a session lasts, and whether a missing mail server is fatal. Every
 * one of those is a *deployment* fact rather than a code path, which is why
 * they are read here once instead of being sprinkled through the options below.
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
 * ## Three properties this file is responsible for
 *
 * **An account belongs to a real address.** `emailAndPassword` refuses to sign
 * anybody in until their address has been proved, and the proof is a six-digit
 * code sent to it (`emailOTP`). Sign-up is not a session — it is a request to
 * be let in, granted by typing back something only the mailbox's owner could
 * have read. `hooks.before` refuses the obviously-unreal before an account row
 * is spent on it (`email-address.ts`).
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
   * The password endpoints are the ones that matter — every one of them is an
   * oracle for something (whether an account exists, whether a password is
   * right, what a code is) and the only defence against being asked a million
   * times is not answering that often. `emailOTP` has its own, tighter, limit
   * on *sending* codes; this is the floor under everything else.
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/sign-up/email': { window: 60 * 15, max: 5 },
      '/email-otp/verify-email': { window: 60, max: 8 },
      '/email-otp/send-verification-otp': { window: 60 * 5, max: 4 },
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    /**
     * The rule the whole feature exists for: an unverified address cannot sign
     * in. Not "can sign in but sees a banner" — the session is never created,
     * so there is no state in which a made-up address is a usable account.
     *
     * Better Auth answers such an attempt with `EMAIL_NOT_VERIFIED` and sends a
     * fresh code, so the login form can move straight to asking for it
     * (`features/auth/VerifyForm.tsx`).
     */
    requireEmailVerification: true,
  },

  emailVerification: {
    /**
     * Verifying is the last step of signing up, so it ends where signing up
     * was going: inside the product. Without this the user proves their
     * address and is then shown a login form to type the password they chose
     * ninety seconds ago.
     */
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
  },

  plugins: [
    /**
     * A code, not a link.
     *
     * A link has to survive being copied between devices, mangled by a mail
     * client's URL rewriter and opened in a browser that is not the one that
     * started the sign-up — and when any of that goes wrong the user is on a
     * dead page with nothing to do. Six digits typed into the form that is
     * already open goes wrong in none of those ways, and works when the mail is
     * read on a phone and the account is being made on a laptop.
     *
     * `storeOTP: 'hashed'` because a table of live verification codes in
     * plaintext is a table of live credentials. `allowedAttempts` and the
     * ten-minute expiry are what make six digits enough: 10^6 with five guesses
     * inside ten minutes is not a space anybody walks.
     */
    emailOTP({
      otpLength: 6,
      expiresIn: CODE_LIFETIME_MINUTES * 60,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      sendVerificationOnSignUp: true,
      // Take over the default link-based verification everywhere, so there is
      // one way to prove an address rather than two that can disagree.
      overrideDefaultEmailVerification: true,
      rateLimit: { window: 60, max: 2 },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendVerificationCode(email, otp, type);
      },
    }),
  ],

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
   * Better Auth validates that an address is shaped like an address. It cannot
   * know whether the domain can receive mail, because that is a DNS lookup and
   * a policy — both of which are ours. Doing it here rather than in the
   * database hook is what makes the refusal a clean 400 with a sentence in it,
   * instead of a failed insert.
   */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;

      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (typeof email !== 'string') return;

      const verdict = await checkEmailAddress(email);
      if (verdict.ok) return;

      throw new APIError('BAD_REQUEST', {
        code: 'EMAIL_NOT_DELIVERABLE',
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
         * Note that this now happens *before* the address has been verified,
         * and deliberately so: the username has to be reserved at the moment it
         * is chosen or two people can pick the same one and only find out ten
         * minutes later, and the room has to exist before the first session
         * because `autoSignInAfterVerification` puts the user straight into it.
         * An account that is never verified is a row nobody can sign in to.
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
