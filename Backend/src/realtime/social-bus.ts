import { EventEmitter } from 'node:events';
import { Injectable, Module } from '@nestjs/common';
import type { DirectMessageView } from '../chat/chat.service';

/**
 * The one-way door between the request path and the socket path.
 *
 * `ChatService` writes a message and `FriendsService` changes a relationship;
 * both of them need the people involved to *hear about it* over their sockets.
 * The obvious way to arrange that — inject the gateway into those services —
 * makes a cycle, because the gateway already depends on both of them to do its
 * own authorization. Nest can be talked out of the cycle with `forwardRef`, and
 * the result is two modules that each half-exist while the other is
 * constructed, which is a thing to avoid rather than a thing to configure.
 *
 * So the dependency points one way only:
 *
 * ```text
 *   ChatService ────publish───▶  SocialBus  ◀───subscribe──── SocialGateway
 *   FriendsService ─publish──▶       (no dependencies at all)
 * ```
 *
 * The bus knows nothing about sockets and the services know nothing about
 * delivery. If nobody is listening — a process running without the gateway, a
 * test — publishing is a no-op rather than an error, which is the correct
 * behaviour for a notification: the row is already written, and the socket is
 * how somebody finds out sooner rather than whether it happened.
 *
 * **In-process only, deliberately.** This is not a message broker and must not
 * become one: it carries "tell these people to look again", never state. If
 * the product ever runs more than one backend process, what needs to become
 * distributed is the Socket.IO *adapter* (Redis — 10-realtime-events.md §5),
 * not this.
 */

/** Something happened that these users' sockets should hear about. */
export interface DirectMessageEvent {
  senderId: string;
  recipientId: string;
  message: DirectMessageView;
}

export interface FriendsChangedEvent {
  /** Everybody whose friend picture just changed. Usually two people. */
  userIds: string[];
}

@Injectable()
export class SocialBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // A listener that throws must not take the process down with it, and a
    // gateway that is not mounted must not make a chat message fail.
    this.emitter.setMaxListeners(20);
    this.emitter.on('error', () => undefined);
  }

  publishDirectMessage(event: DirectMessageEvent): void {
    this.emitter.emit('dm', event);
  }

  onDirectMessage(listener: (event: DirectMessageEvent) => void): void {
    this.emitter.on('dm', listener);
  }

  publishFriendsChanged(event: FriendsChangedEvent): void {
    this.emitter.emit('friends', event);
  }

  onFriendsChanged(listener: (event: FriendsChangedEvent) => void): void {
    this.emitter.on('friends', listener);
  }
}

/**
 * A module with no imports, on purpose.
 *
 * Every other social module may depend on this one, and it may depend on none
 * of them — which is what makes the cycle above impossible rather than merely
 * avoided.
 */
@Module({
  providers: [SocialBus],
  exports: [SocialBus],
})
export class SocialBusModule {}
