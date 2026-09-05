import { Logger } from '@nestjs/common';

/**
 * "A session has ended."
 *
 * One event, and it exists to close a specific hole rather than as a general
 * event bus. Signing out deletes the session row, which is enough for every
 * *request* — `AuthGuard` reads the store on the next one and there is nothing
 * there. It is not enough for a **socket**, which authenticated once at its
 * handshake and then talks for hours: without this, a socket outlived its own
 * session until `SocialGateway.revalidate` next came round, up to ten minutes
 * later, still standing in a park under a name that had signed out.
 *
 * The client closes its socket on the way out (`lib/teardown.ts`) and that is
 * the normal path. This is the one that does not depend on the client
 * co-operating: a sign-out from another device, a session revoked, a tab that
 * crashed with the connection still open. Security that only works when the
 * client is honest is not security.
 *
 * ## Why a module rather than a Nest provider
 *
 * Direction of dependency. `auth.ts` is not a Nest module — it is the Better
 * Auth instance, mounted on Express before Nest's router exists (`main.ts`) —
 * and the gateway is very much inside Nest. If `auth.ts` imported the gateway
 * to call it, the two would import each other. So neither knows about the
 * other: `auth.ts` announces into this file and the gateway listens to it, the
 * same inversion `lib/teardown.ts` uses on the client and for the same reason.
 */

const logger = new Logger('SessionEvents');

type Listener = (userId: string) => void;

const listeners = new Set<Listener>();

/**
 * Be told when a session ends, for any reason.
 *
 * Returns the unsubscribe, so a module that is destroyed does not leave a
 * closure behind holding a server it no longer owns.
 */
export function onSessionEnded(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Announce that a session has ended.
 *
 * Every listener is isolated. A listener that throws must not stop the ones
 * after it, and must never fail the sign-out that triggered it: not closing a
 * socket is a problem, and refusing to sign somebody out because closing a
 * socket threw is a much larger one.
 */
export function sessionEnded(userId: string): void {
  for (const listener of listeners) {
    try {
      listener(userId);
    } catch (error) {
      logger.warn(`A session-ended listener threw: ${error}`);
    }
  }
}
