import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

/**
 * Better Auth's own client. Per /Docs/API-endpoints/01-auth-endpoints.md, the
 * frontend talks to Better Auth directly rather than through a hand-rolled
 * login/session layer (AGENTS.md — "do not create duplicate systems").
 *
 * `basePath` must match the backend's mount point exactly (Backend/src/auth/auth.ts).
 *
 * `emailOTPClient` is the client half of the plugin the backend mounts. It adds
 * two calls and nothing else: `emailOtp.sendVerificationOtp` and
 * `emailOtp.verifyEmail`. Without it those two endpoints exist on the server
 * and have no typed way to be reached from here.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
