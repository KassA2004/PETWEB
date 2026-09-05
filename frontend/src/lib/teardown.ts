/**
 * Things that have to be shut down when the session ends.
 *
 * One tiny registry, and it exists to solve a specific code-splitting problem
 * rather than as an abstraction for its own sake.
 *
 * Signing out has to close the social WebSocket: it authenticated with a cookie
 * that is about to stop existing, and a socket outliving its session on a shared
 * computer is somebody else's connection. But the sign-out button lives in the
 * page header — the entry chunk — and the socket lives behind a `lazy()`
 * boundary, so having the header `import` it would pull `socket.io-client` into
 * the bundle of every visitor who never opens the social panel. That is exactly
 * the regression the Performance Rules call out: *"a dependency imported by one
 * panel must not sit in the entry chunk."*
 *
 * A `import()` at sign-out time would work and would download the whole chunk at
 * the moment the user is leaving, to run one function.
 *
 * So the dependency is inverted: the lazy module registers itself when it
 * loads, and the header calls whatever has registered. Nothing is imported that
 * was not already going to be, and a session that never touched the social
 * layer has nothing to tear down.
 */

const teardowns: (() => void)[] = [];

/**
 * Register something to run when the user signs out.
 *
 * Returns the unregister, so a module that is torn down for other reasons does
 * not leave a closure behind holding a connection it no longer owns.
 */
export function onSignOut(teardown: () => void): () => void {
  teardowns.push(teardown);
  return () => {
    const at = teardowns.indexOf(teardown);
    if (at >= 0) teardowns.splice(at, 1);
  };
}

/**
 * Run every registered teardown, most recently registered first.
 *
 * **The order is load-bearing, which is why this is a stack rather than a set.**
 * Registration order is dependency order here: `socket.ts` registers itself
 * when the social chunk loads, and the park hook registers itself later,
 * because a park is a thing that exists *on* a socket. Tearing down in
 * registration order closed the socket first and then asked it to say "I am
 * leaving", which is a message nobody receives — the person stayed on the lawn
 * until the server's sweeper noticed. Unwinding the other way lets each layer
 * use the one underneath it on its way out.
 *
 * Each one is isolated: a teardown that throws must not stop the ones after it,
 * and must never stop the sign-out itself. Failing to close a socket is a
 * problem; failing to sign somebody out because closing a socket threw is a
 * much larger one.
 */
export function runSignOutTeardowns(): void {
  for (const teardown of [...teardowns].reverse()) {
    try {
      teardown();
    } catch {
      /* Nothing here is worth failing a sign-out over. */
    }
  }
}
