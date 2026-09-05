import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { getCorsOrigins } from '../auth/auth';
import { ChatService } from '../chat/chat.service';
import type { DirectMessageView } from '../chat/chat.service';
import { FriendsService } from '../friends/friends.service';
import {
  ACTION_RATE,
  CHAT_RATE,
  HEARTBEAT_MS,
  INTERACTION_MS,
  INTERACTION_RANGE,
  MOVE_RATE,
} from '../parks/park-limits';
import { onSessionEnded } from '../auth/session-events';
import { ParksService } from '../parks/parks.service';
import type { ParkMemberView, ParkView } from '../parks/parks.service';
import {
  BadPayload,
  readDirectSend,
  readInteract,
  readJoin,
  readSay,
  readTransform,
} from './park-events';
import type { InteractionKind, PetTransform } from './park-events';
import { TokenBucket } from './rate-limit';
import { SocialBus } from './social-bus';
import { resolveSocketUser, sessionStillValid } from './socket-session';
import type { SocketUser } from './socket-session';

/**
 * The social gateway — presence, parks, pets and messages, over one socket.
 *
 * ## Why one socket and one namespace
 *
 * A client that is signed in has exactly one connection, and everything social
 * rides it: the park it is standing in, the creatures moving around it, the
 * chat beside them and any direct message that arrives while it is all
 * happening. Three namespaces would mean three handshakes, three session
 * lookups and three reconnection state machines to keep in step, in exchange
 * for a separation nothing needs.
 *
 * ## What crosses this boundary, and what does not
 *
 * `10-realtime-events.md` §1 draws the line and it is kept:
 *
 * ```text
 *   over the socket        a creature's POSITION and STATE, ten times a second
 *                          who is in a park, and when that changes
 *                          what was said
 *                          that two creatures are interacting
 *
 *   never over the socket  animation frames, poses, joint angles
 *                          appearance data (the SERVER looks that up — see below)
 *                          anything the database is the authority for
 * ```
 *
 * The simulation stays on the client, which is what
 * `/Docs/animation-approach.md` §4 requires and what makes a park cheap: the
 * server relays four numbers per creature per tick and never runs a physics
 * step.
 *
 * ## What the server is authoritative about
 *
 * A client is trusted for exactly one thing — where *its own* creature is —
 * and even that is clamped (`readTransform`). Everything that could be used
 * against somebody else is decided here:
 *
 * ```text
 *   who you are            the session cookie, resolved on the handshake.
 *                          `userId` is attached by the server and every
 *                          broadcast carries the server's copy, never the
 *                          client's claim
 *   which park you are in  a ParkParticipant row. Asked of the database, not
 *                          of the socket's memory, before every message
 *   what your pet looks    read from YOUR OWN Pet row by the server. A client
 *   like                   cannot send an appearance — not its own and
 *                          certainly not somebody else's
 *   whether you may        proximity checked against the server's last-known
 *   interact               positions, so "I am next to them" cannot be asserted
 *   whether you may        a friendship row, checked on every message
 *   message somebody
 * ```
 *
 * ## Disconnection
 *
 * Three mechanisms, because one is never enough:
 *
 *   1. `handleDisconnect` — the clean case, and the fast one.
 *   2. the heartbeat — `ParkParticipant.lastSeenAt`, touched every
 *      `HEARTBEAT_MS`, so a socket that dies without an event goes quiet
 *      rather than lingering.
 *   3. `ParksService.sweep()` — the collector, which is what actually makes
 *      (2) mean anything, and which runs on boot so a restart does not leave a
 *      list of parks full of people who are not there.
 *
 * ## Membership is a broadcast state, not a stream of deltas
 *
 * There is no `park:joined` and no `park:left`. Both existed, and both were
 * wrong in the same way: an arrival announced to a Socket.IO room reaches only
 * the sockets that have already joined that room, and two people entering a
 * park at the same moment join it in an order nobody controls — so each of
 * them could end up holding a member list the other's announcement had crossed
 * in flight. The symptom is asymmetric and looks like a rendering bug: A can
 * see B on the lawn and B cannot see A.
 *
 * `park:roster` replaces both. It carries **the whole membership, read from the
 * database**, and it is sent to the entire room on every arrival, every
 * departure and every heartbeat. Applying it is idempotent, so a duplicate
 * costs nothing; missing one costs nothing either, because the next one is
 * equally complete. See `broadcastRoster`.
 */
@Injectable()
@WebSocketGateway({
  namespace: '/social',
  // The same origin list the REST API uses, and for the same reason: the
  // handshake is an ordinary HTTP request carrying the session cookie, so it
  // is subject to CORS exactly as `/api/v1` is. `credentials` is what lets the
  // cookie arrive at all.
  cors: { origin: getCorsOrigins(), credentials: true },
  // A park's traffic is small and frequent; there is nothing to gain from
  // buffering large payloads. This is a ceiling, not a target.
  maxHttpBufferSize: 32_000,
})
export class SocialGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(SocialGateway.name);

  @WebSocketServer()
  private server!: Server;

  /**
   * Per-connection state.
   *
   * Keyed by socket id rather than by user id, because one person may have two
   * tabs open and both of them are real connections that must each be told
   * things and each be cleaned up. "Which user is this socket" is answered
   * here; "which sockets does this user have" is answered by the `user:<id>`
   * room, which Socket.IO maintains for free.
   */
  private readonly connections = new Map<string, Connection>();

  /**
   * Where everybody's creature is, right now, per park.
   *
   * **Deliberately not in the database.** This is the per-frame state
   * `10-realtime-events.md` §1 says never to persist: it changes ten times a
   * second, it is meaningless the moment its owner disconnects, and writing it
   * down would be a write per creature per tick for data nobody will ever read
   * again.
   *
   * It exists at all because the server needs it for one job: deciding whether
   * two creatures are close enough to interact. Without a server-side copy,
   * proximity would have to be taken on the client's word, and a client that
   * can assert "I am next to them" can nuzzle somebody from across the park.
   */
  private readonly positions = new Map<string, Map<string, PetTransform>>();

  /**
   * When each pair of creatures may next interact.
   *
   * A cooldown per *pair*, not per sender, so somebody cannot spam one creature
   * while still being free to greet everybody else. Keyed by the ordered pair,
   * so A→B and B→A share it — which is what stops two clients ping-ponging an
   * interaction between them at full tilt.
   */
  private readonly interactionCooldowns = new Map<string, number>();

  private heartbeat: NodeJS.Timeout | null = null;

  /** Unsubscribes the sign-out listener. See the constructor. */
  private stopWatchingSessions: (() => void) | null = null;

  constructor(
    private readonly parks: ParksService,
    private readonly chat: ChatService,
    private readonly friends: FriendsService,
    private readonly bus: SocialBus,
  ) {
    // Messages and friendships written on the REST path still have to reach
    // whoever is connected. The bus is one-way and dependency-free — see
    // `social-bus.ts` for why it is not just an injected gateway.
    this.bus.onDirectMessage(({ senderId, recipientId, message }) => {
      this.deliverDirectMessage(senderId, recipientId, message);
    });

    this.bus.onFriendsChanged(({ userIds }) => {
      for (const userId of userIds) {
        this.server?.to(roomForUser(userId)).emit('friends:changed', {});
      }
    });

    /*
     * Somebody signed out. Close their sockets now.
     *
     * A socket authenticates once, at its handshake, and then talks for hours;
     * `revalidate` below is the backstop that eventually notices a session has
     * gone, and "eventually" is up to `REVALIDATE_MS`. That is the right
     * cadence for a session that expired quietly and much too slow for one the
     * user *ended*: a park is a room with other people in it, and staying in it
     * for ten minutes after signing out is exactly the thing a sign-out is
     * supposed to stop.
     *
     * Every socket the user has, not the one that signed out: the session is
     * gone, so none of them is authenticated any more. `disconnectSockets`
     * takes the same user room `friends:changed` uses, and the disconnect
     * cascade does the rest — `handleDisconnect` takes them out of the park and
     * broadcasts the roster, so the lawn sees them leave rather than sees them
     * stand still.
     *
     * Announced through `auth/session-events.ts` rather than called from
     * `auth.ts`, because `auth.ts` is mounted outside Nest and importing this
     * gateway from it would be a cycle.
     */
    this.stopWatchingSessions = onSessionEnded((userId) => {
      const room = this.server?.in(roomForUser(userId));
      if (!room) return;

      this.logger.log('Closing the sockets of a session that has ended.');
      // `true` closes the underlying connection rather than only the namespace,
      // so a client cannot simply carry on in another one.
      room.disconnectSockets(true);
    });
  }

  /**
   * Authenticate before the connection exists.
   *
   * A Socket.IO middleware rather than a check inside `handleConnection`, and
   * the difference is not stylistic: a middleware that calls `next(error)`
   * means the connection is *never established*, so there is no window in which
   * an unauthenticated socket has an id, can be in a room, or can have a
   * handler invoked on it. Checking after the fact leaves exactly that window.
   *
   * The client sees this as `connect_error`, which is the event it already has
   * to handle for a dropped network.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      void resolveSocketUser(socket)
        .then((user) => {
          if (!user) {
            next(new Error('UNAUTHORIZED'));
            return;
          }

          // Attached to the socket's own data rather than kept in a map keyed
          // by id: it must be impossible for a handler to run without it.
          socket.data.user = user;
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });

    // One timer for every connection, not one per connection. A few hundred
    // sockets is a few hundred `updateMany`s a minute in the worst case, and
    // one interval rather than one timer each.
    this.heartbeat = setInterval(() => {
      void this.beat().catch((error) => this.logger.warn(`Heartbeat failed: ${error}`));
    }, HEARTBEAT_MS);

    this.heartbeat.unref?.();
  }

  onModuleDestroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.stopWatchingSessions?.();
    this.stopWatchingSessions = null;
  }

  handleConnection(socket: Socket): void {
    const user = socket.data.user as SocketUser | undefined;

    // The middleware guarantees this; belt and braces, because the cost of
    // being wrong is an unauthenticated socket in a park.
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // Asked *before* this connection is recorded, so a second tab is
    // distinguishable from a first one.
    const wasOnlineBefore = this.isOnline(user.id);

    this.connections.set(socket.id, {
      user,
      parkId: null,
      authenticatedAt: Date.now(),
      moves: new TokenBucket(MOVE_RATE),
      chats: new TokenBucket(CHAT_RATE),
      actions: new TokenBucket(ACTION_RATE),
    });

    // Every socket this person has, so a direct message reaches all their tabs.
    void socket.join(roomForUser(user.id));

    // Coming online is news to the people who know you, and to nobody else.
    // Broadcast to friends rather than to everybody: presence is a fact about a
    // relationship, and a product where strangers can watch you connect is a
    // product that has told them something they were not offered.
    //
    // Skipped when this is a second tab — that person was already online, and
    // announcing it again would flicker the dot beside their name.
    if (!wasOnlineBefore) {
      void this.announcePresence(user.id, true).catch(() => undefined);
    }
  }

  /**
   * Somebody's connection went away — cleanly, or because their laptop shut.
   *
   * Both look identical here, which is the point: there is no "clean leave"
   * path that does more than this one, so nothing depends on the client having
   * managed to say goodbye.
   *
   * `void`-ed rather than awaited because Socket.IO does not wait for this
   * handler, and a park that takes a moment longer to notice is not a problem.
   * What must not happen is an unhandled rejection, hence the `catch`.
   */
  handleDisconnect(socket: Socket): void {
    const connection = this.connections.get(socket.id);
    this.connections.delete(socket.id);

    if (!connection) return;
    const { user, parkId } = connection;

    // Their last window. Anything else they still have open means they have not
    // actually gone anywhere.
    if (!this.isOnline(user.id)) {
      void this.announcePresence(user.id, false).catch(() => undefined);
    }

    if (!parkId) return;

    void this.departPark(user.id, parkId, socket.id).catch((error) =>
      this.logger.warn(`Leave on disconnect failed: ${error}`),
    );
  }

  /**
   * Which of my friends are here right now.
   *
   * Answered from the connection table rather than from anything stored: being
   * online is not a fact worth a column, because it is wrong the instant the
   * process holding it restarts. Asked on demand, and pushed as it changes.
   *
   * The friend list is re-read from the database on every call rather than
   * cached on the socket — caching an authorization decision is stale
   * authorization (AGENTS.md, Caching), and "who may see that I am online" is
   * exactly that.
   */
  @SubscribeMessage('friends:presence')
  async onPresenceQuery(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ online: string[] }> {
    const connection = this.connections.get(socket.id);
    if (!connection) return { online: [] };

    const friendIds = await this.friends.friendIds(connection.user.id);
    return { online: friendIds.filter((id) => this.isOnline(id)) };
  }

  // --- Parks ----------------------------------------------------------------

  /**
   * Walk into a park.
   *
   * The whole admission decision — the park exists, the passcode is right,
   * there is room — belongs to `ParksService.join`, which takes a row lock to
   * make the capacity check safe against a simultaneous joiner. Nothing about
   * it is repeated here, because a rule implemented twice is a rule with two
   * answers.
   *
   * What this adds is the socket half: the room membership, the state the new
   * arrival needs to draw the park, and telling everybody already there that
   * somebody has arrived — with the creature the *server* looked up, not one
   * the client offered.
   *
   * Replies through an acknowledgement rather than an event, so the client's
   * "join" is one promise that either resolves into a park or rejects with a
   * reason it can show.
   */
  @SubscribeMessage('park:join')
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<JoinReply> {
    const connection = this.connections.get(socket.id);
    if (!connection) return { ok: false, code: 'UNAUTHORIZED', message: 'Not connected.' };

    try {
      const { parkId, passcode } = readJoin(payload);

      // One park at a time. Leaving first is not a courtesy to the old park —
      // it is what stops one socket relaying its creature into two places.
      if (connection.parkId && connection.parkId !== parkId) {
        await this.departPark(connection.user.id, connection.parkId, socket.id);
      }

      const admission = await this.parks.join(connection.user.id, parkId, passcode ?? undefined);

      connection.parkId = parkId;
      await socket.join(roomForPark(parkId));

      /*
       * Everybody in the park re-reads the roster, including the person who
       * just walked in.
       *
       * This replaces a per-arrival `park:joined` announcement, and the reason
       * is a race that produced exactly the reported symptom — *some* people in
       * a park could not see *some* of the others, asymmetrically.
       *
       * ```text
       *   B  reads the roster   → [B]        (A has not inserted yet)
       *   A  inserts, joins the socket room, announces itself
       *      …to a room B is not in yet, so B never hears it
       *   B  joins the socket room
       *   B  announces itself   → A sees B
       *
       *   A sees B. B never sees A. Nobody is wrong; the events crossed.
       * ```
       *
       * Broadcasting the roster *after* `socket.join`, to the whole room rather
       * than to everybody-but-the-sender, closes it: whoever joins the room
       * last reads a roster that already contains everybody in it, and their
       * broadcast reaches every earlier arrival. There is no interleaving in
       * which the last write is a stale one.
       *
       * It is also self-healing in a way an arrival event can never be. A
       * client that missed one packet, slept through an eviction, or came back
       * on a new socket does not need a replay — the next roster is the whole
       * truth, read from the database, and applying it fixes whatever it had.
       */
      await this.broadcastRoster(parkId);

      return {
        ok: true,
        park: admission.park,
        members: admission.members,
        // Where everybody currently is, so the new arrival draws them standing
        // where they are rather than piled at the entrance until each of them
        // next moves.
        positions: this.snapshotPositions(parkId),
      };
    } catch (error) {
      return this.asReply(error);
    }
  }

  /**
   * Who is in this park, according to the database.
   *
   * The client's way of asking the question the roster broadcast normally
   * answers unprompted — used on a reconnect, and when a tab comes back to the
   * foreground after the browser has been throttling it. Both are moments where
   * a client has good reason to distrust what it is holding, and neither is
   * worth inventing a second mechanism for: this is the same read, on demand.
   *
   * Answered for the park **this socket is standing in** and no other. A park's
   * membership is not public, and a park id is a uuid somebody may still have
   * from a park they have left.
   */
  @SubscribeMessage('park:roster')
  async onRoster(@ConnectedSocket() socket: Socket): Promise<RosterReply> {
    const connection = this.connections.get(socket.id);
    if (!connection?.parkId) {
      return { ok: false, code: 'PARK_CLOSED', message: 'You are not in a park.' };
    }

    try {
      return { ok: true, ...(await this.roster(connection.parkId)) };
    } catch (error) {
      return this.asReply(error) as RosterReply;
    }
  }

  /** Walk out. The same path a disconnect takes. */
  @SubscribeMessage('park:leave')
  async onLeave(@ConnectedSocket() socket: Socket): Promise<{ ok: true }> {
    const connection = this.connections.get(socket.id);

    if (connection?.parkId) {
      await this.departPark(connection.user.id, connection.parkId, socket.id);
      connection.parkId = null;
    }

    return { ok: true };
  }

  /**
   * Where my creature is now.
   *
   * The hot path: about ten of these per second per person. Everything about it
   * is arranged so that the common case does no I/O at all —
   *
   *   the rate limit is a number in memory
   *   membership is the socket's own `parkId`, set at join and cleared at leave
   *   the broadcast is Socket.IO's room fan-out
   *
   * — because a database read per position update would be ten reads per second
   * per person in every park in the product, to answer a question that was
   * already answered when they joined.
   *
   * That is a deliberate trade with one consequence: a socket swept out of a
   * park by the collector could keep broadcasting until it notices. It cannot
   * do anything *persistent* on that basis — chat and interactions both re-ask
   * the database — so the worst case is a creature that lingers for a few
   * seconds in a park it has been evicted from, and the eviction event that is
   * already on its way tells the room to forget it.
   */
  @SubscribeMessage('park:move')
  onMove(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): void {
    const connection = this.connections.get(socket.id);
    if (!connection?.parkId) return;
    if (!connection.moves.take()) return;

    let transform: PetTransform;
    try {
      transform = readTransform(payload);
    } catch {
      // A malformed position is dropped, not answered. There is nothing useful
      // to say back to a client at 10 Hz.
      return;
    }

    const parkId = connection.parkId;
    let park = this.positions.get(parkId);
    if (!park) {
      park = new Map();
      this.positions.set(parkId, park);
    }
    park.set(connection.user.id, transform);

    // `socket.to` rather than `server.to`: everybody except the sender, who
    // already knows where its own creature is and must never be corrected by a
    // round trip through the network.
    socket.to(roomForPark(parkId)).emit('park:moved', {
      userId: connection.user.id,
      ...transform,
    });
  }

  /**
   * Two creatures do something to each other.
   *
   * The one place the server referees the simulation, and the checks are in
   * this order because each is cheaper than the next:
   *
   *   1. the rate limit (memory)
   *   2. the target is somebody else, in this park (memory)
   *   3. the two are actually close together (memory — the server's own copy of
   *      where everyone is, never a distance the client asserts)
   *   4. the pair is off cooldown (memory)
   *   5. the sender really is a member (the database — the authoritative check,
   *      paid once per interaction rather than once per frame)
   *
   * Broadcast to the whole park including the sender, because an interaction is
   * a thing that happens *between* two creatures: both of them animate, and
   * everybody watching sees the same event at the same time rather than each
   * client deciding for itself.
   */
  @SubscribeMessage('park:interact')
  async onInteract(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean }> {
    const connection = this.connections.get(socket.id);
    if (!connection?.parkId) return { ok: false };
    if (!connection.actions.take()) return { ok: false };

    let request: { targetUserId: string; kind: InteractionKind };
    try {
      request = readInteract(payload);
    } catch {
      return { ok: false };
    }

    const parkId = connection.parkId;
    const fromId = connection.user.id;
    const toId = request.targetUserId;

    if (fromId === toId) return { ok: false };

    const here = this.positions.get(parkId);
    const mine = here?.get(fromId);
    const theirs = here?.get(toId);

    // Neither creature has reported a position yet, or the target is not in
    // this park at all. Either way there is nothing to be next to.
    if (!mine || !theirs) return { ok: false };

    if (Math.hypot(mine.x - theirs.x, mine.z - theirs.z) > INTERACTION_RANGE) {
      return { ok: false };
    }

    const key = pairKey(fromId, toId);
    const now = Date.now();
    if ((this.interactionCooldowns.get(key) ?? 0) > now) return { ok: false };

    if (!(await this.parks.isMember(fromId, parkId))) return { ok: false };

    this.interactionCooldowns.set(key, now + INTERACTION_MS);

    this.server.to(roomForPark(parkId)).emit('park:interaction', {
      parkId,
      fromUserId: fromId,
      toUserId: toId,
      kind: request.kind,
      /** So both clients run the same length of animation from the same instant. */
      durationMs: INTERACTION_MS,
    });

    return { ok: true };
  }

  /**
   * Say something in the park.
   *
   * Persisted before it is delivered, and that order is the whole of "refreshing
   * does not erase the chat": what everybody sees is a row that exists, so the
   * client that reconnects and asks for history gets exactly the conversation
   * the others watched happen.
   *
   * Membership is re-checked in the service against the database, unlike the
   * movement path — a message is a write, and a write is worth a read.
   */
  @SubscribeMessage('park:say')
  async onSay(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; message?: string }> {
    const connection = this.connections.get(socket.id);
    if (!connection?.parkId) return { ok: false, message: 'You are not in a park.' };

    if (!connection.chats.take()) {
      return { ok: false, message: 'Slow down a moment.' };
    }

    try {
      const { body } = readSay(payload);
      const message = await this.parks.say(connection.user.id, connection.parkId, body);

      // `server.to`, not `socket.to`: the sender sees the *stored* row, with
      // its id and its server timestamp, rather than an optimistic copy that
      // would then have to be reconciled with the real one.
      this.server.to(roomForPark(connection.parkId)).emit('park:message', message);

      return { ok: true };
    } catch (error) {
      const reply = this.asReply(error);
      return { ok: false, message: reply.ok ? undefined : reply.message };
    }
  }

  // --- Direct messages ------------------------------------------------------

  /**
   * Message a friend.
   *
   * The friendship check, the thread and the row are all `ChatService`'s — the
   * same code the REST fallback runs — so there is exactly one implementation
   * of "may these two talk", and it is asked of the database every time rather
   * than cached on the socket. A friendship ended mid-conversation stops the
   * next message, not the next reconnect.
   */
  @SubscribeMessage('dm:send')
  async onDirectMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; message?: string; sent?: DirectMessageView }> {
    const connection = this.connections.get(socket.id);
    if (!connection) return { ok: false, message: 'Not connected.' };

    if (!connection.chats.take()) return { ok: false, message: 'Slow down a moment.' };

    try {
      const { toUserId, body } = readDirectSend(payload);
      const message = await this.chat.send(connection.user.id, toUserId, body);

      this.deliverDirectMessage(connection.user.id, toUserId, message);

      return { ok: true, sent: message };
    } catch (error) {
      const reply = this.asReply(error);
      return { ok: false, message: reply.ok ? undefined : reply.message };
    }
  }

  /**
   * Push a stored message to both people's sockets.
   *
   * Both, and every tab of both: the sender's other windows need it as much as
   * the recipient does, or a conversation open in two tabs disagrees with
   * itself. Called from here and from the REST fallback, via the bus.
   *
   * `withUserId` is rewritten per recipient, because "who this conversation is
   * with" is a different person depending on who is reading it — and computing
   * it on the client would mean every client reimplementing the same
   * conditional.
   */
  deliverDirectMessage(
    senderId: string,
    recipientId: string,
    message: DirectMessageView,
  ): void {
    if (!this.server) return;

    this.server
      .to(roomForUser(recipientId))
      .emit('dm:message', { ...message, withUserId: senderId });

    this.server
      .to(roomForUser(senderId))
      .emit('dm:message', { ...message, withUserId: recipientId });
  }

  /** Whether this user has any socket connected right now. */
  isOnline(userId: string): boolean {
    for (const connection of this.connections.values()) {
      if (connection.user.id === userId) return true;
    }

    return false;
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Tell this user's friends that they have arrived or gone.
   *
   * One event per friend's personal room, which Socket.IO delivers only to the
   * tabs that friend actually has open. Somebody with two hundred friends and
   * none of them online costs one database read and no messages.
   */
  private async announcePresence(userId: string, online: boolean): Promise<void> {
    const friendIds = await this.friends.friendIds(userId);

    for (const friendId of friendIds) {
      this.server?.to(roomForUser(friendId)).emit('friends:presence', { userId, online });
    }
  }

  /**
   * Take somebody out of a park, and tell the park.
   *
   * One implementation for every way of leaving — the button, a navigation, a
   * closed tab, a dead connection — because a "leave" that only some exits go
   * through is a leave that leaves rows behind.
   */
  private async departPark(
    userId: string,
    parkId: string,
    socketId: string,
  ): Promise<void> {
    const socket = this.server?.sockets?.sockets?.get(socketId);
    if (socket) await socket.leave(roomForPark(parkId));

    // Another tab of the same person may still be standing there. Their
    // membership row and their creature both belong to the *user*, so neither
    // may be removed while any of their sockets is still in the park.
    if (this.hasAnotherSocketIn(userId, parkId, socketId)) return;

    this.positions.get(parkId)?.delete(userId);

    const { removed, empty } = await this.parks.leave(userId, parkId);

    // Only if there was something to remove. Leaving is said twice in the
    // ordinary case — the Leave button and then the unmount — and a park should
    // not be told about one departure twice.
    //
    // The room is told by being handed the roster again rather than by a
    // "so-and-so left" event, for the same reason an arrival is: one message
    // that says who is here cannot disagree with itself, and a client that
    // missed the previous one is repaired by this one instead of drifting
    // further. See `broadcastRoster`.
    if (removed && !empty) {
      await this.broadcastRoster(parkId);
    }

    if (empty) {
      // Nothing to broadcast to — the room is gone with the last person in it.
      // Dropping the position map here is what stops a long-running process
      // accumulating one empty Map per park it has ever hosted.
      this.positions.delete(parkId);
      this.forgetCooldownsFor(userId);
    }
  }

  private hasAnotherSocketIn(userId: string, parkId: string, exceptId: string): boolean {
    for (const [id, connection] of this.connections) {
      if (id === exceptId) continue;
      if (connection.user.id === userId && connection.parkId === parkId) return true;
    }

    return false;
  }

  /**
   * Keep every live participant's heartbeat fresh.
   *
   * One `updateMany` per park with somebody in it, rather than one per socket:
   * a park of six is one statement, and the `(parkId, userId)` unique index
   * makes it an index update rather than a scan.
   *
   * This is the only thing standing between the sweeper and a park full of
   * people who are actually still there — so it runs on an interval that is a
   * third of `PARTICIPANT_STALE_MS`, and both numbers live in one file
   * (`park-limits.ts`) so they cannot drift apart.
   */
  private async beat(): Promise<void> {
    // Isolated, and it has to be: a session lookup that fails is a reason to
    // keep the socket, not a reason to skip the heartbeat — and skipping the
    // heartbeat is how the sweeper evicts a park full of people who are
    // standing right there.
    await this.revalidate().catch((error) =>
      this.logger.warn(`Session revalidation failed: ${error}`),
    );

    const byPark = new Map<string, Set<string>>();

    for (const connection of this.connections.values()) {
      if (!connection.parkId) continue;

      const users = byPark.get(connection.parkId) ?? new Set<string>();
      users.add(connection.user.id);
      byPark.set(connection.parkId, users);
    }

    await Promise.all(
      [...byPark].map(([parkId, users]) =>
        Promise.all([...users].map((userId) => this.parks.touch(userId, parkId))),
      ),
    );

    /*
     * And then tell every park what it looks like.
     *
     * The backstop, and the only thing in the design that repairs a park
     * nobody is arriving at or leaving. Two things can put a client out of step
     * without any event being emitted at all: the sweeper deleting a
     * participant row (it deletes rows, it does not announce them), and a
     * dropped packet on a park that then goes quiet. Both would otherwise
     * persist until somebody happened to walk in.
     *
     * One query per occupied park per heartbeat is the price, and it is the
     * right one: the alternative is every client polling for the same answer.
     */
    await Promise.all([...byPark.keys()].map((parkId) => this.broadcastRoster(parkId)));
  }

  /**
   * Check that long-lived sockets still have a session behind them.
   *
   * A socket is authenticated once, on the handshake, and then trusted for as
   * long as it stays connected — which is right for the ninety-nine percent
   * case and wrong for the one that matters: a session signed out from another
   * device, or one that simply expired, would keep a connection talking.
   *
   * Every `REVALIDATE_MS`, and no more often, because this is a session lookup
   * per connection and the *normal* end of a session is the client closing its
   * own socket (`lib/teardown.ts`). This is the backstop for when it cannot —
   * a crashed tab, a revocation from elsewhere — not the mechanism.
   *
   * The interval is a deliberate parallel to the five-minute `cookieCache`
   * window on the REST path (`auth.ts`): both are "how long a revoked session
   * keeps working", and both are chosen rather than accidental.
   */
  private async revalidate(): Promise<void> {
    const now = Date.now();

    const stale = [...this.connections].filter(
      ([, connection]) => now - connection.authenticatedAt >= REVALIDATE_MS,
    );

    await Promise.all(
      stale.map(async ([socketId, connection]) => {
        const socket = this.server?.sockets?.sockets?.get(socketId);
        if (!socket) return;

        if (await sessionStillValid(socket, connection.user.id)) {
          connection.authenticatedAt = now;
          return;
        }

        this.logger.log(`Closing a socket whose session has gone.`);
        socket.disconnect(true);
      }),
    );
  }

  /** One read of everything a client needs to draw a park. See `Roster`. */
  private async roster(parkId: string): Promise<Roster> {
    const [park, members] = await Promise.all([
      this.parks.view(parkId),
      this.parks.members(parkId),
    ]);

    return { parkId, park, members, positions: this.snapshotPositions(parkId) };
  }

  /**
   * Hand the whole park the same answer at the same moment.
   *
   * Sent on every arrival, every departure and every heartbeat, and it is
   * deliberately the *entire* membership rather than a delta. A delta has to be
   * applied to the right previous state to mean anything, which is precisely
   * what a client that dropped a packet does not have — and a park where two
   * people disagree about who is on the lawn is the bug this replaced.
   *
   * Failure is logged and swallowed. A roster that could not be read is a park
   * that keeps running on what its clients already had, which is very much
   * better than a disconnect: the next beat carries the same truth twenty
   * seconds later.
   */
  private async broadcastRoster(parkId: string): Promise<void> {
    if (!this.server) return;

    try {
      this.server.to(roomForPark(parkId)).emit('park:roster', await this.roster(parkId));
    } catch (error) {
      this.logger.warn(`Could not broadcast the roster for a park: ${error}`);
    }
  }

  /** Where everybody in a park currently is, for a new arrival. */
  private snapshotPositions(parkId: string): (PetTransform & { userId: string })[] {
    const here = this.positions.get(parkId);
    if (!here) return [];

    return [...here].map(([userId, transform]) => ({ userId, ...transform }));
  }

  private forgetCooldownsFor(userId: string): void {
    for (const key of this.interactionCooldowns.keys()) {
      if (key.includes(userId)) this.interactionCooldowns.delete(key);
    }
  }

  /**
   * Turn a thrown error into something a client can act on.
   *
   * The service throws the same `AppException`s the REST API does, carrying the
   * same stable codes (`error-codes.ts`) — so a client handles "that park is
   * full" identically whether it heard about it over HTTP or over a socket, and
   * there is no second vocabulary of socket errors to keep in step.
   *
   * Anything unrecognised becomes a flat "something went wrong": an internal
   * message is not something to hand a stranger's browser.
   */
  private asReply(error: unknown): JoinReply {
    if (error instanceof BadPayload) {
      return { ok: false, code: 'VALIDATION_FAILED', message: error.message };
    }

    const response = (error as { getResponse?: () => unknown })?.getResponse?.();

    if (response && typeof response === 'object') {
      const body = response as { code?: string; message?: string };
      if (body.code && body.message) {
        return { ok: false, code: body.code, message: body.message };
      }
    }

    this.logger.warn(`Socket handler failed: ${error}`);
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }
}

/** One live connection's server-side state. */
interface Connection {
  user: SocketUser;
  /** The park this socket is standing in, or null. */
  parkId: string | null;
  /**
   * When this socket's session was last confirmed to exist.
   *
   * A socket is authenticated once, at the handshake, and then talks for as
   * long as it likes — so signing out, or a session expiring, would otherwise
   * leave a connection speaking on behalf of a session that is gone. The client
   * closes its own socket on sign-out (`lib/teardown.ts`), and this is what
   * covers the cases where it cannot: a session revoked from another device, a
   * client that crashed, a tab that was killed mid-sign-out.
   */
  authenticatedAt: number;
  moves: TokenBucket;
  chats: TokenBucket;
  actions: TokenBucket;
}

/**
 * What a join attempt resolves to.
 *
 * A discriminated union rather than a throw, because a refusal here is
 * ordinary — the park filled up while you were deciding, the passcode was
 * wrong — and a client needs the reason to show it. The failure shape carries
 * the same stable `code` the REST API uses (`error-codes.ts`), so a client's
 * handling of PARK_FULL does not depend on which transport told it.
 */
type JoinReply =
  | {
      ok: true;
      park: ParkView;
      members: ParkMemberView[];
      positions: (PetTransform & { userId: string })[];
    }
  | { ok: false; code: string; message: string };

/**
 * Who is in a park, and where they are standing.
 *
 * Two of those come from Postgres and one from memory, which is the whole
 * design of the feature in one type: **who is here** outlives a socket and is
 * therefore a row; **where they are** changes ten times a second and is
 * therefore never written down.
 */
interface Roster {
  parkId: string;
  park: ParkView;
  members: ParkMemberView[];
  positions: (PetTransform & { userId: string })[];
}

/** What `park:roster` resolves to — the roster, or why there isn't one. */
type RosterReply = ({ ok: true } & Roster) | { ok: false; code: string; message: string };

/**
 * How long a socket may go without its session being re-checked.
 *
 * Ten minutes. The same kind of number as the REST path's five-minute
 * `cookieCache` (`auth.ts`) — the window in which a revoked session still
 * works — and longer, because a socket's normal end is the client closing it
 * rather than a check catching it.
 */
const REVALIDATE_MS = 10 * 60 * 1000;

/** Socket.IO room names. Prefixed so a park id can never collide with a user id. */
function roomForPark(parkId: string): string {
  return `park:${parkId}`;
}

function roomForUser(userId: string): string {
  return `user:${userId}`;
}

/** The cooldown key for a pair, order-independent. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
