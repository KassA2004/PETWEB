/**
 * Is this shaped like an email address?
 *
 * A regex, and **deliberately only a regex**. It does not ask whether the
 * domain exists, whether it can receive mail, or whether the provider is a
 * throwaway one — so `someone@example.com` is a perfectly good address as far
 * as this application is concerned, which is the point: accounts are made from
 * example addresses during development and nothing should be in the way of
 * that.
 *
 * ## What used to be here, and where it went
 *
 * For a short while (Sept 2026) this file also refused RFC-reserved names,
 * known disposable-inbox providers, and any domain with no MX or A record —
 * the cheap half of a real-address requirement whose expensive half was a
 * six-digit code mailed to the address and typed back in.
 *
 * **That whole system is removed, on request, until further notice.** Sign-up
 * creates a session again, `emailAndPassword.requireEmailVerification` is off,
 * and nothing is emailed. If it comes back, the deliverability version of this
 * file is in the history — `git log -- Backend/src/auth/email-address.ts` —
 * along with the `emailOTP` plugin configuration and the `VerifyForm` it fed.
 * Bringing it back is un-deleting three files, not designing it again.
 *
 * ## Why this exists at all, given Better Auth validates the field
 *
 * For the sentence. Better Auth's own refusal is a bare code, and this is the
 * one place a person is told what is wrong with what they typed, in words, in
 * the same shape every other refusal in this API uses. It is also the seam the
 * stricter rules plugged into, so keeping it keeps that seam.
 */

/**
 * The rule of the field.
 *
 * One `@`, something before it, and a dotted domain after it with no spaces.
 * Deliberately not RFC 5322 — the true grammar admits quoted strings, comments
 * and bracketed IP literals, none of which anybody types into a sign-up form,
 * and a regex that accepts them is a regex nobody can read or safely change.
 * Anything this waves through that is not real simply fails to be signed in to.
 */
const SHAPE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export type EmailVerdict =
  | { ok: true; email: string }
  | { ok: false; reason: string };

/**
 * Check an address, and say why not.
 *
 * The address comes back **lowercased and trimmed**, which is the other half of
 * this function's job: it is the value the account is created with, so two
 * people typing `Sam@…` and `sam@…` collide on the unique index instead of
 * quietly becoming two accounts.
 *
 * The reason is written to be shown to the person typing. It is the same for
 * every address that fails, and says nothing about whether an address is
 * already registered — that is a different question with its own disclosure
 * trade-off, and Better Auth's `USER_ALREADY_EXISTS` answers it.
 */
export function checkEmailAddress(raw: string): EmailVerdict {
  const email = raw.trim().toLowerCase();

  if (email.length > 254 || !SHAPE.test(email)) {
    return { ok: false, reason: 'That does not look like an email address.' };
  }

  return { ok: true, email };
}
