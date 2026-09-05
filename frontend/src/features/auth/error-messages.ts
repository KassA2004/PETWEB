/**
 * Better Auth's error responses don't share the rest of the API's error codes
 * (see /Docs/API-endpoints/01-auth-endpoints.md §6a — its routes bypass the
 * backend's global exception filter entirely). This maps the handful of codes
 * the auth screen actually encounters to copy a user can act on.
 */
const KNOWN_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email or password is incorrect.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account with that email already exists.',
  USER_ALREADY_EXISTS: 'An account with that email already exists.',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters.',

  /*
   * Verification.
   *
   * `INVALID_OTP` deliberately does not say how many attempts are left or
   * whether the code has expired: both are facts about the account, and the
   * person who owns the mailbox has the code in front of them either way.
   */
  INVALID_OTP: 'That code is not right. Check it and try again.',
  OTP_EXPIRED: 'That code has expired. Ask for a new one.',
  TOO_MANY_ATTEMPTS: 'Too many tries. Ask for a new code.',
  EMAIL_NOT_VERIFIED: 'Confirm your email address first — we have sent you a code.',
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
