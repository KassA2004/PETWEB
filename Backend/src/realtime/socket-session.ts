import { fromNodeHeaders } from 'better-auth/node';
import type { Socket } from 'socket.io';
import { auth } from '../auth/auth';
import { prismaService } from '../prisma/prisma.service';
import type { SessionUser } from '../auth/session-user.interface';

/**
 * Who is on the other end of a socket.
 *
 * The same two steps `AuthGuard` takes for a request, for the same reasons, and
 * it matters that they are the same two: a socket authenticated differently
 * from a request is a second authentication system, and a second
 * authentication system is where the bug is.
 *
 *   1. resolve the Better Auth session from the handshake's cookies
 *   2. look up the domain `User` row by that id, and fail closed if it is gone
 *
 * **The cookie, not a token in the query string.** The session already exists
 * as an `HttpOnly` cookie; asking the client to also hold a copy somewhere
 * JavaScript can read it would be inventing a credential that can be stolen by
 * an XSS the current design is immune to. Socket.IO sends cookies on the
 * handshake when the client is created with `withCredentials: true`, and the
 * handshake is an ordinary HTTP request — which is exactly why this works and
 * why the CORS origin list has to be the same one the REST API uses.
 *
 * In production this rides WSS, and the cookie's `Secure` attribute is what
 * keeps it there. Nothing in this file depends on the transport, but the
 * deployment does: see `13-social-endpoints.md` §11.
 */

/** The socket-side session, plus the connection's own identity. */
export interface SocketUser extends SessionUser {}

/**
 * Resolve the session on a handshake, or null.
 *
 * Null rather than throwing, because the caller — a Socket.IO middleware — has
 * to turn "no session" into a connection error rather than into a stack trace,
 * and because a database blip during a handshake should refuse the connection
 * rather than crash the gateway.
 */
export async function resolveSocketUser(socket: Socket): Promise<SocketUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(socket.handshake.headers),
    });

    if (!session) return null;

    const user = await prismaService.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, username: true },
    });

    // The Better Auth row exists but the domain row does not. Fail closed, as
    // `auth.guard.ts` does: a connection with no username has nothing to say.
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * Does this socket still have the session it connected with?
 *
 * A socket is authenticated once and then talks for hours, so the gateway
 * re-asks periodically (`SocialGateway.revalidate`). The handshake headers are
 * kept by Socket.IO for the life of the connection, which is what makes this
 * possible at all — the cookie is re-checked against the session store rather
 * than taken on trust from the first check.
 *
 * The user id is compared as well as the session's existence: a browser that
 * signed out and straight back in as somebody else would otherwise keep a
 * socket that is *authenticated*, and authenticated as the wrong person.
 *
 * **Fails closed.** A database blip returns false and the socket is closed,
 * which costs somebody a reconnect. The other way round costs the guarantee.
 */
export async function sessionStillValid(
  socket: Socket,
  expectedUserId: string,
): Promise<boolean> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(socket.handshake.headers),
    });

    return session?.user.id === expectedUserId;
  } catch {
    return false;
  }
}
