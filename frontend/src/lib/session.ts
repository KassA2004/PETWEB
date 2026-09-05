import { audio } from './audio';
import { authClient } from './auth-client';
import { runSignOutTeardowns } from './teardown';

/**
 * Ending a session, properly.
 *
 * Signing out used to be two lines in the header button: close the social
 * socket, then call `signOut`. It ended the *credential* and left everything
 * the credential had been used to build standing — and two of those leftovers
 * were visible bugs rather than theory:
 *
 * ```text
 *   the park       `sessionStorage` still held the id of the park you had been
 *                  standing in, so the next person to sign in *in that tab* was
 *                  walked straight onto somebody else's lawn
 *   the music      the AudioContext is a module singleton and nothing stopped
 *                  it, so a signed-out browser went on playing the room
 * ```
 *
 * Both are the same mistake: the session was treated as a cookie rather than as
 * everything that exists because of the cookie. So this is one routine, in one
 * place, and the button calls it.
 *
 * ## The order, and why each step is where it is
 *
 * ```text
 *   1  teardowns     while the cookie is still valid — a socket has to be able
 *                    to say "I am leaving the park" before its credential dies
 *   2  audio         stop making noise immediately, not after a round trip
 *   3  storage       forget where this tab was
 *   4  sign out      the server deletes the session row, which closes the
 *                    sockets from its side too (Backend session-events.ts)
 *   5  reload        a fresh document, so nothing in memory can survive
 * ```
 *
 * ## Why it ends in a full page load
 *
 * Because it is the only teardown that cannot be forgotten. This application
 * keeps real state outside React — a WebGL context and a running world, an
 * `AudioContext`, a socket, module singletons in `lib/` — and a `setState` that
 * swaps the tree for a login form leaves every one of them alive and holding
 * the previous user's data. A new document is the one operation that is
 * guaranteed to be complete, it costs a signed-out user nothing (they are about
 * to be handed a marketing page), and it means the next person to sign in on
 * this machine starts from nothing. Steps 1-4 still matter: they are what makes
 * the *server* agree, and they stop the noise before the reload rather than
 * after it.
 *
 * ## What it does not do
 *
 * It does not clear the audio mixer's saved levels. Those are a property of the
 * device — how loud this laptop's speakers want to be — not of the person, and
 * wiping them on sign-out would be a small act of vandalism against whoever
 * signs in next.
 */

/** Everything this application keeps per-session in browser storage. */
const SESSION_KEYS = {
  /** The park this tab was standing in (`features/social/parkMemory.ts`). */
  session: ['petweb.park'],
  /** Whether this browser has ever had a session (`AuthGate`'s prefetch hint). */
  local: ['petweb.returning'],
};

function forgetEverything(): void {
  for (const key of SESSION_KEYS.session) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* A browser that refuses storage has nothing to forget. */
    }
  }

  for (const key of SESSION_KEYS.local) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* As above. */
    }
  }
}

/**
 * End the session and take the browser back to the front door.
 *
 * Resolves only if the sign-out request *failed*, and then with the reason —
 * the success path never returns, because the page is replaced. That signature
 * is deliberately awkward so a caller cannot forget the failure case: a browser
 * that still holds a valid cookie has not signed out, and telling the user
 * otherwise while their session is live is the one outcome worth avoiding.
 */
export async function endSession(): Promise<string | null> {
  // 1. While the credential is still good.
  runSignOutTeardowns();

  // 2. Stop the room. `dispose` releases the AudioContext, which is safe
  //    precisely because this function ends in a new document.
  void audio.dispose().catch(() => undefined);

  // 3. Nothing about where this tab was survives into the next session.
  forgetEverything();

  // 4. The server's copy. This is the step that actually revokes anything.
  const { error } = await authClient.signOut();

  if (error) {
    return error.message ?? 'We could not reach the server to sign you out.';
  }

  // 5. `replace`, not `assign`: the back button must not return to a page that
  //    was rendered for a session that no longer exists.
  window.location.replace('/');

  // The document is going away; nothing after this runs. Returning keeps the
  // type honest for the compiler rather than for a caller.
  return null;
}
