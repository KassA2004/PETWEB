/**
 * What a username is allowed to be, in one place.
 *
 * The social layer's entire discovery model is "type somebody's username", so
 * this file is doing more work than it looks like it is: it is the difference
 * between a name a person can say out loud and a name that is a hiding place.
 *
 * Three rules, and each one is here for a reason rather than for tidiness:
 *
 *   the character set   `[A-Za-z0-9_-]` only. No spaces, no punctuation, and
 *                       critically no characters outside ASCII — a name
 *                       containing a Cyrillic `а` looks exactly like one
 *                       containing a Latin `a`, and "search for your friend by
 *                       name" stops being safe the moment two names can be
 *                       indistinguishable on screen
 *   the length          3-24. Long enough to be somebody, short enough to fit
 *                       in the places the interface has to show it
 *   the key             `usernameKey` is the lowercase form, and it is what
 *                       the unique constraint is on, so `Kass` and `kass`
 *                       cannot both exist (user.prisma)
 *
 * Nothing else in the backend is allowed to decide these. `UsersService` is
 * the only writer of the two columns, and it writes them through here.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

/** The whole character set, anchored. Nothing outside ASCII gets in. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export const USERNAME_RULE_MESSAGE =
  'A username is 3 to 24 characters, and may use letters, numbers, hyphens and underscores.';

/** The lowercase form the unique index is on. */
export function usernameKeyOf(username: string): string {
  return username.trim().toLowerCase();
}

/** True when this is a name the product will accept as typed. */
export function isValidUsername(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length >= USERNAME_MIN &&
    trimmed.length <= USERNAME_MAX &&
    USERNAME_PATTERN.test(trimmed)
  );
}

/**
 * Turn whatever an account signed up with into a legal username.
 *
 * Sign-up hands us a display name and an email address, neither of which has
 * agreed to any of the rules above. This strips what it must, pads what is too
 * short and truncates what is too long — and never fails, because the
 * alternative is refusing somebody an account over the shape of their email.
 *
 * The result is a *candidate*. It may already be taken, which is
 * `uniqueUsername`'s problem rather than this function's.
 */
export function deriveUsername(name: string | null | undefined, email: string): string {
  const fromName = (name ?? '').trim();
  const fromEmail = email.split('@')[0] ?? '';

  const cleaned = sanitize(fromName) || sanitize(fromEmail) || 'newcomer';

  // Too short is padded rather than rejected: "jo" is a real name, and the
  // three-character floor exists to keep the search space usable, not to have
  // an opinion about anybody's name.
  const padded = cleaned.length >= USERNAME_MIN ? cleaned : `${cleaned}pet`;

  return padded.slice(0, USERNAME_MAX);
}

/**
 * Find a free name near this one.
 *
 * `taken` answers whether a key is already in use — normally a database read.
 * On a collision the candidate gains a number, and the number grows: `kass`,
 * `kass2`, `kass3`. Truncated from the left so the suffix always survives,
 * because a candidate that is already 24 characters long must not produce
 * `kass...long2` that is 25 and fails the constraint it was trying to satisfy.
 *
 * Gives up after a bounded number of tries and falls back to a random suffix.
 * An unbounded loop here is a request that hangs when somebody's name is
 * popular, and the fallback is a name nobody loves but everybody can have.
 */
export async function uniqueUsername(
  candidate: string,
  taken: (key: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(usernameKeyOf(candidate)))) return candidate;

  for (let attempt = 2; attempt <= 40; attempt += 1) {
    const suffix = String(attempt);
    const next = `${candidate.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
    if (!(await taken(usernameKeyOf(next)))) return next;
  }

  const random = Math.random().toString(36).slice(2, 8);
  return `${candidate.slice(0, USERNAME_MAX - random.length)}${random}`;
}

/** Strip everything the character set does not allow. */
function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, USERNAME_MAX);
}
