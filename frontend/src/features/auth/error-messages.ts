/**
 * Better Auth's error responses don't share the rest of the API's error codes
 * (see /Docs/API-endpoints/01-auth-endpoints.md §6a — its routes bypass the
 * backend's global exception filter entirely). This maps the handful of codes
 * the auth screen actually encounters to copy a user can act on.
 */
const KNOWN_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email or password is incorrect.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account with that email already exists.',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters.',
};

export function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code;
    if (code && KNOWN_MESSAGES[code]) return KNOWN_MESSAGES[code];

    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}
