import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth's own client. Per /Docs/API-endpoints/01-auth-endpoints.md, the
 * frontend talks to Better Auth directly rather than through a hand-rolled
 * login/session layer (AGENTS.md — "do not create duplicate systems").
 *
 * `basePath` must match the backend's mount point exactly (Backend/src/auth/auth.ts).
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  basePath: '/api/auth',
});

export const { useSession, signIn, signUp, signOut } = authClient;
