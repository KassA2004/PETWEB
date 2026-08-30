import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * A private park's passcode, hashed.
 *
 * **scrypt, not SHA-256, and the difference is the whole point of this file.**
 * A park passcode is a human-chosen secret — it will be `letmein`, it will be
 * a birthday, and it will be reused from somewhere else. A fast digest of a
 * human-chosen secret is a lookup table away from being plaintext, so what is
 * stored has to be *deliberately slow to compute* and *salted*, which is what a
 * password-hashing KDF is for and what a general-purpose digest is not.
 *
 * scrypt specifically, rather than adding argon2 or bcrypt: it is in Node's own
 * `crypto` module, it is a memory-hard KDF designed for exactly this, and it
 * costs the project no new dependency — a native module would have to be
 * compiled on every machine this deploys to, in exchange for a difference
 * nobody attacking a park passcode would notice.
 *
 * The stored format carries its own parameters:
 *
 * ```text
 *   scrypt$16384$8$1$<salt base64>$<hash base64>
 *          N     r p
 * ```
 *
 * so that raising the cost later does not invalidate what is already stored:
 * an old hash still verifies against its own N, and is simply verified more
 * cheaply than a new one. Nothing has to be migrated, and nobody is locked out
 * of their own park by a parameter change.
 */

/** CPU/memory cost. 16384 is Node's own default and is roughly 16 MB per hash. */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

/**
 * Room scrypt is allowed. Node's default (32 MB) is under what N=16384, r=8
 * actually needs on some builds, and the failure mode is an exception rather
 * than a wrong answer — so it is stated rather than left to the default.
 */
const MAX_MEM = 64 * 1024 * 1024;

export const PASSCODE_MIN = 4;
export const PASSCODE_MAX = 64;

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(passcode.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/**
 * Check a passcode against a stored hash.
 *
 * `timingSafeEqual` rather than `===`: a comparison that returns early on the
 * first wrong byte leaks how much of the guess was right, and a park passcode
 * is short enough for that to matter. A malformed stored value verifies as
 * false rather than throwing — a park nobody can enter is a smaller failure
 * than a gateway that crashes on one bad row.
 */
export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  const salt = Buffer.from(parts[4], 'base64');

  let actual: Buffer;
  try {
    actual = await scrypt(passcode.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
  } catch {
    // Stored parameters this build will not run (an N raised past maxmem by a
    // future version, say). False, not a crash.
    return false;
  }

  return timingSafeEqual(actual, expected);
}
