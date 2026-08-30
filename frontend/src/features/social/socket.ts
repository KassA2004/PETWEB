/**
 * The one socket.
 *
 * Everything social rides a single connection to `/social` — the park, the
 * creatures in it, the chat beside them and any direct message that arrives
 * while it is all happening. One connection rather than one per feature,
 * matching the gateway on the other end (see its class comment): three sockets
 * would be three handshakes, three session lookups and three reconnection state
 * machines to keep in step, for a separation nothing needs.
 *
 * ## What this file is, and what it is not
 *
 * It is a *transport*, and deliberately nothing more. It holds no park, no
 * member list and no messages, because none of those are its to hold:
 *
 * ```text
 *   authoritative        the server. Membership, capacity, who may speak
 *   durable              Postgres. Messages, friendships, memories
 *   this file            a socket, its status, and a way to listen to it
 *   React state          a cache of the two above, discarded on unmount
 * ```
 *
 * A client-side store of "who is in my park" would be a fourth copy of a fact
 * the server already owns, and the moment it disagreed — a dropped event, a
 * reconnect — it would be the one the user was looking at.
 *
 * ## Why it is a module singleton
 *
 * Because a socket is a connection, not a component. Two panels mounting would
 * otherwise open two sockets, and the server would see one person in a park
 * twice. `connect()` is idempotent and reference-counted by nothing at all —
 * the connection lives until sign-out, which is the only event that actually
 * invalidates it.
 *
 * ## Reconnection
 *
 * Socket.IO's own, with backoff, and this file adds the one thing it cannot
 * know: **what to do afterwards.** A reconnected socket is a *new* connection
 * to the server — it is in no park and no rooms — so anything that was true
 * before has to be re-established by asking again, which is what `onReconnect`
 * is for. Nothing is replayed from a buffer, because a buffer of park positions
 * from thirty seconds ago is worse than nothing.
 */

import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { onSignOut } from '../../lib/teardown';

/*
 * Closed when the session ends.
 *
 * Registered at module load — which, because this module is only reachable from
 * the lazily-loaded social panel, means it costs a visitor who never opens that
 * panel nothing at all. See `lib/teardown.ts` for why the dependency points
 * this way round rather than the header importing this file.
 */
onSignOut(() => disconnectSocial());

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type SocialStatus = 'idle' | 'connecting' | 'connected' | 'offline' | 'unauthorized';

/** Where a creature is, and what it is doing. Matches the server's reader. */
export interface PetTransform {
  x: number;
  z: number;
  facing: -1 | 1;
  state: 'idle' | 'walk' | 'run' | 'sit' | 'sleep' | 'play' | 'notice';
}

export type InteractionKind = 'greet' | 'play' | 'nuzzle' | 'copy';

/** A refusal from the server, carrying the same codes the REST API uses. */
export interface SocialRefusal {
  ok: false;
  code: string;
  message: string;
}

export interface ParkMember {
  userId: string;
  username: string;
  pet: { id: string; name: string; species: string; appearanceData: unknown } | null;
  joinedAt: string;
}

export interface ParkSummary {
  id: string;
  name: string;
  hostId: string;
  hostUsername: string;
  capacity: number;
  isPrivate: boolean;
  occupancy: number;
  createdAt: string;
}

export interface ParkAdmission {
  ok: true;
  park: ParkSummary;
  members: ParkMember[];
  positions: (PetTransform & { userId: string })[];
}

/**
 * Who is in a park, in full, as the database has it.
 *
 * The only thing that ever changes a member list. There is no "somebody
 * arrived" event and no "somebody left" event, and their absence is the fix
 * for a real bug rather than a simplification: an arrival announced into a
 * Socket.IO room only reaches the sockets already in it, so two people entering
 * at once could each miss the other's announcement and end up looking at
 * different parks. A whole roster cannot be missed in a way that matters — the
 * next one is equally complete — so applying it is a repair as well as an
 * update. The server sends one on every arrival, every departure and every
 * heartbeat; `askSocial('park:roster')` asks for one.
 */
export interface ParkRoster {
  parkId: string;
  park: ParkSummary;
  members: ParkMember[];
  positions: (PetTransform & { userId: string })[];
}

export interface ParkMessage {
  id: string;
  parkId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  withUserId: string;
  body: string;
  createdAt: string;
}

/** Everything the server can say, so a listener cannot mistype an event name. */
export interface SocialEvents {
  'park:roster': ParkRoster;
  'park:moved': PetTransform & { userId: string };
  'park:message': ParkMessage;
  'park:interaction': {
    parkId: string;
    fromUserId: string;
    toUserId: string;
    kind: InteractionKind;
    durationMs: number;
  };
  'dm:message': DirectMessage;
  'friends:changed': Record<string, never>;
  'friends:presence': { userId: string; online: boolean };
}

type Listener<K extends keyof SocialEvents> = (payload: SocialEvents[K]) => void;

let socket: Socket | null = null;
let status: SocialStatus = 'idle';

const statusListeners = new Set<(status: SocialStatus) => void>();
const reconnectListeners = new Set<() => void>();

function setStatus(next: SocialStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener(next);
}

/**
 * Open the connection, or hand back the one that is already open.
 *
 * `withCredentials` is the load-bearing option: the handshake is an ordinary
 * HTTP request, and without it the session cookie does not travel, so every
 * connection is refused as unauthenticated. It is also why the backend's
 * Socket.IO CORS list has to be the same one the REST API uses.
 *
 * WebSocket only, with no long-polling fallback. Polling *would* work and is
 * exactly the thing this feature is not allowed to be built on: a transport
 * that repeatedly asks the server whether anything happened is the shape the
 * brief rules out, and silently falling back to it under a strict proxy would
 * mean shipping that shape without noticing.
 */
export function connectSocial(): Socket {
  if (socket) return socket;

  setStatus('connecting');

  socket = io(`${BASE_URL}/social`, {
    withCredentials: true,
    transports: ['websocket'],
    // Socket.IO's own backoff. Capped, because a client that has been asleep
    // for an hour should come back in seconds rather than in minutes.
    reconnection: true,
    reconnectionDelay: 600,
    reconnectionDelayMax: 8000,
  });

  socket.on('connect', () => setStatus('connected'));

  // A *re*-connection, specifically. Socket.IO fires `connect` for both, so the
  // distinction is taken from the manager, which is the only thing that knows
  // the difference — and the difference matters: a reconnected socket is a new
  // socket to the server, in no rooms and no park, and everything that was true
  // before has to be asked for again.
  socket.io.on('reconnect', () => {
    setStatus('connected');
    for (const listener of reconnectListeners) listener();
  });

  socket.on('disconnect', () => setStatus('offline'));

  socket.on('connect_error', (error: Error) => {
    // The gateway's middleware refuses an unauthenticated handshake with this
    // exact message. It is not a network problem and retrying will not fix it,
    // so the retry loop is stopped and the interface says so.
    if (error.message === 'UNAUTHORIZED') {
      setStatus('unauthorized');
      // Stop the backoff. Retrying a refused session forever is a client
      // hammering an endpoint that will keep saying no until somebody signs in.
      if (socket) socket.io.opts.reconnection = false;
      return;
    }

    setStatus('offline');
  });

  return socket;
}

/**
 * Close it, and forget it.
 *
 * Called on sign-out, which is the one event that genuinely invalidates the
 * connection: the cookie it authenticated with is gone, so the next reconnect
 * would be refused anyway, and the server should hear about the departure now
 * rather than in three heartbeats.
 */
export function disconnectSocial(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setStatus('idle');
}

export function socialStatus(): SocialStatus {
  return status;
}

export function onSocialStatus(listener: (status: SocialStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/**
 * Run something after every reconnection.
 *
 * The single most important hook in this file. A reconnected client is in no
 * park, no rooms and has missed everything said while it was away — so the park
 * view re-joins and the chat re-fetches, rather than assuming the socket picked
 * up where it left off. It did not; it is a new socket.
 */
export function onSocialReconnect(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

/** Listen for one server event. Returns the unsubscribe. */
export function onSocial<K extends keyof SocialEvents>(
  event: K,
  listener: Listener<K>,
): () => void {
  const connection = connectSocial();
  connection.on(event as string, listener as (...args: unknown[]) => void);
  return () => {
    connection.off(event as string, listener as (...args: unknown[]) => void);
  };
}

/** Fire and forget — used for the position stream, where a reply is meaningless. */
export function emitSocial(event: string, payload?: unknown): void {
  socket?.emit(event, payload);
}

/**
 * Ask, and wait for the answer.
 *
 * Every request-shaped message goes through here, with a timeout, because a
 * promise that never settles is a spinner that never stops. Five seconds is
 * generous for a local database write and short enough that a user on a dead
 * connection finds out rather than waiting.
 */
export async function askSocial<T>(
  event: string,
  payload?: unknown,
  timeoutMs = 5000,
): Promise<T | SocialRefusal> {
  const connection = connectSocial();

  if (!connection.connected) {
    return { ok: false, code: 'OFFLINE', message: 'You are not connected.' };
  }

  try {
    return (await connection.timeout(timeoutMs).emitWithAck(event, payload)) as T;
  } catch {
    return {
      ok: false,
      code: 'TIMEOUT',
      message: 'The server did not answer. Try again in a moment.',
    };
  }
}

/** Narrowing helper, so call sites read as `if (isRefusal(reply))`. */
export function isRefusal(value: unknown): value is SocialRefusal {
  return typeof value === 'object' && value !== null && (value as { ok?: boolean }).ok === false;
}
