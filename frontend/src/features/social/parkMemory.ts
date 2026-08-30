/**
 * The park you were standing in when the page reloaded.
 *
 * Refreshing used to walk you out of a park, and it should not: reloading a tab
 * is not leaving somewhere, and the server agrees — a `ParkParticipant` row
 * outlives the socket that made it by `PARTICIPANT_STALE_MS`, so for a minute
 * after a refresh you are, as far as Postgres is concerned, still on the lawn.
 * All that was missing was the client remembering which lawn.
 *
 * ## What is stored, and what deliberately is not
 *
 * A park id. Not the passcode.
 *
 * That is a security decision and it costs nothing, because of how re-admission
 * works: `ParksService.join` skips the passcode check entirely when a
 * participant row already exists, precisely so that a reconnect does not have
 * to re-type a credential it already satisfied. A refresh takes that same path.
 * If the row *has* been swept — a reload that took longer than a minute, or a
 * server restart — the rejoin is refused with `PARK_PASSCODE_REQUIRED` and the
 * user is put back in front of the list with the park still in it, which is the
 * honest outcome rather than a private park re-entered from a stored secret.
 *
 * `sessionStorage`, not `localStorage`: it is scoped to this tab and dies with
 * it. A park is somewhere you are right now, so a browser reopened tomorrow
 * should not try to walk back into one, and a second tab should not inherit the
 * first tab's whereabouts.
 */

const KEY = 'petweb.park';

/** Where we were, if anywhere. Never throws — private mode has no storage. */
export function rememberedPark(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberPark(parkId: string): void {
  try {
    window.sessionStorage.setItem(KEY, parkId);
  } catch {
    /* A browser that refuses storage costs a refresh, not a park. */
  }
}

export function forgetPark(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* As above. */
  }
}
