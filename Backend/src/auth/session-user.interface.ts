/**
 * The session shape injected into request handlers.
 * Matches /Docs/API-endpoints/00-conventions.md §2 exactly.
 */
export interface SessionUser {
  id: string;
  email: string;
  username: string;
}

declare module 'express' {
  interface Request {
    sessionUser?: SessionUser;
  }
}
