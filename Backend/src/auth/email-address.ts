import { promises as dns } from 'node:dns';

/**
 * Whether an address is a real place a person can be reached.
 *
 * The product's rule is "no made-up addresses", and there is exactly one thing
 * that actually proves an address exists: **sending a code to it and being told
 * what the code was.** That is `emailOTP` in `auth.ts`, and it is the guarantee.
 * Everything in this file is the cheaper half of the job — refusing the
 * obviously-not-real *before* an account row, a room and a verification email
 * are spent on it, and saying why in a sentence the person can act on.
 *
 * Three checks, in increasing cost:
 *
 * ```text
 *   shape        one @, a dotted domain, no spaces, sane lengths
 *   reputation   not a throwaway-inbox provider
 *   existence    the domain has somewhere to deliver mail (MX, or an A record,
 *                which RFC 5321 §5.1 still permits as a fallback)
 * ```
 *
 * ## What this deliberately does not do
 *
 * It does not try to decide whether the *mailbox* exists. That answer is only
 * available by asking the receiving server, most of which now refuse to say,
 * and the ones that answer honestly will happily tell an attacker which of your
 * users exist. The code is the mailbox check.
 *
 * It also does not treat a DNS failure as a bad address. A resolver that is
 * down or rate-limiting is our problem, not the person's, and refusing
 * sign-ups because of it would be an outage that looks like a validation rule.
 * A lookup that *answers* and answers "no such domain" is a refusal; a lookup
 * that cannot answer is a pass, and the code still has to arrive.
 */

/** The rule of the field, before anything is looked up. */
const SHAPE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Domains that exist to be thrown away.
 *
 * A short list rather than an exhaustive one, and it is not trying to be
 * exhaustive: a blocklist of disposable providers is a treadmill nobody wins,
 * and the code sent to the address is what actually holds. These are the
 * handful common enough that catching them saves a real number of junk rows,
 * and the message they produce ("that looks like a temporary address") is
 * clearer than letting somebody verify an inbox that will not exist tomorrow.
 */
const DISPOSABLE = new Set([
  '0-mail.com',
  '10minutemail.com',
  '20minutemail.com',
  'discard.email',
  'dispostable.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'grr.la',
  'inboxbear.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.net',
]);

/**
 * Domains that are reserved by the RFCs and can never receive mail.
 *
 * `example.com` and friends (RFC 2606) plus the `.test`/`.invalid`/`.localhost`
 * special-use names. Some of these do resolve, so the DNS check below would let
 * them through; they are refused by name because they are, definitionally, not
 * anybody's address.
 */
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);
const RESERVED_TLDS = new Set(['test', 'invalid', 'localhost', 'example', 'local']);

export type EmailVerdict =
  | { ok: true; email: string }
  | { ok: false; reason: string };

/** The domain part, lowercased, or null if there isn't one. */
function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return domain.length > 0 ? domain : null;
}

/**
 * Can this domain receive mail at all?
 *
 * MX first, and an A/AAAA record as the fallback the SMTP spec still allows —
 * plenty of small domains deliver to their own host without publishing an MX.
 *
 * `true` on anything that is not an authoritative "no". `ENOTFOUND` and
 * `NXDOMAIN` are the resolver saying the domain does not exist, which is an
 * answer; a timeout, a refusal or a thrown socket error is the resolver saying
 * nothing, and nothing is not evidence.
 */
async function domainAcceptsMail(domain: string): Promise<boolean> {
  const missing = (error: unknown): boolean => {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN';
  };

  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) return true;
  } catch (error) {
    if (!missing(error)) return true;
  }

  try {
    const a = await dns.resolve4(domain);
    if (a.length > 0) return true;
  } catch (error) {
    if (!missing(error)) return true;
  }

  try {
    const aaaa = await dns.resolve6(domain);
    return aaaa.length > 0;
  } catch (error) {
    return !missing(error);
  }
}

/**
 * Check an address, and say why not.
 *
 * The reasons are written to be shown to the person typing, so they name the
 * problem rather than the rule that caught it. They are also deliberately the
 * same for every address that fails a given check — nothing here reveals
 * whether an address is already registered, which is a different question with
 * a different answer (`USER_ALREADY_EXISTS`) and its own disclosure trade-off.
 */
export async function checkEmailAddress(raw: string): Promise<EmailVerdict> {
  const email = raw.trim().toLowerCase();

  if (email.length > 254 || !SHAPE.test(email)) {
    return { ok: false, reason: 'That does not look like an email address.' };
  }

  const domain = domainOf(email);
  if (!domain) {
    return { ok: false, reason: 'That does not look like an email address.' };
  }

  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (RESERVED_DOMAINS.has(domain) || RESERVED_TLDS.has(tld)) {
    return {
      ok: false,
      reason: 'That domain cannot receive mail. Please use a real email address.',
    };
  }

  if (DISPOSABLE.has(domain)) {
    return {
      ok: false,
      reason:
        'That looks like a temporary inbox. Pocus needs an address you will still have tomorrow.',
    };
  }

  if (!(await domainAcceptsMail(domain))) {
    return {
      ok: false,
      reason: `We cannot find a mail server for ${domain}. Please check the address.`,
    };
  }

  return { ok: true, email };
}
