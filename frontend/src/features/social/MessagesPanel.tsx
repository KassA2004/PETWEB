import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  DoorOpen,
  MessagesSquare,
  SendHorizonal,
  Users,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Sheet } from '../../components/ui/sheet';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { ApiError } from '../../lib/api';
import { useDelayedVisible } from '../../lib/useDelayedVisible';
import { useStickToBottom } from '../../lib/useStickToBottom';
import { cn } from '../../lib/utils';
import { fetchConversations, fetchMessages, sendMessage } from './api';
import type { Conversation, DirectMessageRecord } from './api';
import { PersonRow } from './PersonRow';
import { askSocial, isRefusal, onSocial, onSocialReconnect } from './socket';
import type { UseFriends } from './useFriends';

/**
 * Talking to a friend.
 *
 * ## Where the conversation actually lives
 *
 * In Postgres, and nowhere else. This panel holds a *window* onto it — the last
 * page — and everything that arrives, arrives as a row that has already been
 * written:
 *
 * ```text
 *   history        GET /chat/conversations/:userId/messages   (a page of rows)
 *   live           dm:message                                 (a row, pushed)
 *   sending        dm:send over the socket, or POST as a fallback
 * ```
 *
 * There is no `localStorage`, no draft cache and no optimistic message. A line
 * appears in the log when the server says it exists, which is what makes
 * refreshing, reconnecting and opening a second tab all show the same
 * conversation rather than three different ones.
 *
 * ## Why sending has two paths
 *
 * The socket is the normal one: it writes the row *and* delivers it to the
 * other person in one round trip. But a socket can be down while the page is
 * perfectly usable, and a message the user typed should not be lost to that —
 * so a refusal that is about the connection rather than about the message falls
 * back to the REST route, which writes the same row through the same service
 * and lets the server push it to whoever is connected.
 *
 * ## Missed messages
 *
 * A reconnect re-reads the open thread. Not a replay from a buffer — the socket
 * has no memory of what it did not deliver, and the rows do.
 */

interface MessagesPanelProps {
  friends: UseFriends;
  selfId: string;
  /**
   * A conversation is a *place* on this screen, not a panel.
   *
   * True on a phone. The thread then takes the whole viewport with one way back
   * — which is what every phone does with a conversation, and what makes it
   * readable once a keyboard has taken half the screen. False on a desktop,
   * where the column is tall enough and covering the room to read two lines
   * would be worse than not.
   */
  fullScreen?: boolean;
  /** A conversation to open on mount, when arriving from "Message" elsewhere. */
  initialUserId?: string | null;
  onVisit: (user: { id: string; username: string }) => void;
}

export function MessagesPanel({
  friends,
  selfId,
  fullScreen = false,
  initialUserId,
  onVisit,
}: MessagesPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ userId: string; username: string } | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadConversations = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchConversations(signal);
      if (!signal?.aborted && alive.current) setConversations(next);
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) return;
    } finally {
      if (!signal?.aborted && alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await loadConversations(controller.signal);
    })();
    return () => controller.abort();
  }, [loadConversations]);

  // A new message anywhere reorders the list and changes a preview.
  useEffect(() => onSocial('dm:message', () => void loadConversations()), [loadConversations]);

  /*
   * Open whatever the caller pointed at — "Message" from the friends list.
   *
   * Derived during render rather than assigned in an effect, which is React's
   * own answer for state that follows a prop: doing it in an effect paints one
   * frame of the conversation list first, and the flicker is exactly what this
   * is here to avoid. `Dashboard` handles the focus outcome the same way.
   *
   * `handled` remembers which request has been acted on, so closing the thread
   * does not immediately reopen it.
   */
  const [handled, setHandled] = useState<string | null>(null);

  if (initialUserId && initialUserId !== handled) {
    const friend = friends.friends.friends.find((item) => item.userId === initialUserId);
    setHandled(initialUserId);
    if (friend) setOpen({ userId: friend.userId, username: friend.username });
  }

  const showSkeleton = useDelayedVisible(loading, { delay: 150, minVisible: 400 });

  if (open) {
    const thread = (
      <Thread
        userId={open.userId}
        username={open.username}
        selfId={selfId}
        chrome={!fullScreen}
        onBack={() => setOpen(null)}
        onVisit={() => onVisit({ id: open.userId, username: open.username })}
      />
    );

    if (!fullScreen) return thread;

    return (
      <Sheet
        title={open.username}
        backLabel="Back to the conversations"
        onBack={() => setOpen(null)}
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="size-9 p-0"
            aria-label={`Visit ${open.username}`}
            onClick={() => onVisit({ id: open.userId, username: open.username })}
          >
            <DoorOpen aria-hidden className="size-4" />
          </Button>
        }
      >
        {thread}
      </Sheet>
    );
  }

  /*
   * Every friend is a possible conversation.
   *
   * The list is friends first, with whatever has been said shown as a preview —
   * rather than only threads that already exist. A messages screen that is empty
   * until you have messaged somebody is a screen with no way to start.
   */
  const rows = friends.friends.friends.map((friend) => {
    const thread = conversations.find((item) => item.userId === friend.userId);
    return { friend, preview: thread?.preview ?? null, at: thread?.lastMessageAt ?? null };
  });

  rows.sort((a, b) => {
    if (a.at && b.at) return a.at < b.at ? 1 : -1;
    if (a.at) return -1;
    if (b.at) return 1;
    return a.friend.username.localeCompare(b.friend.username);
  });

  return (
    <div className="relative min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
      {showSkeleton && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {!showSkeleton && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <MessagesSquare aria-hidden className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-2 text-xs text-muted-foreground">
            Messages are for friends. Find somebody in People first.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <h3 className="flex items-center gap-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Users aria-hidden className="size-3.5" />
          Your friends
        </h3>
      )}

      <ul className="stagger space-y-2">
        {rows.map(({ friend, preview }) => (
          <li key={friend.userId}>
            <PersonRow
              username={friend.username}
              pet={friend.pet}
              detail={preview ?? 'Say something'}
              onClick={() => setOpen({ userId: friend.userId, username: friend.username })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One conversation.
 *
 * Keyed on the *person*, not on a thread id, because that is what the caller
 * has — and because the server can resolve the thread from two user ids without
 * the client having to learn one first.
 */
function Thread({
  userId,
  username,
  selfId,
  chrome,
  onBack,
  onVisit,
}: {
  userId: string;
  username: string;
  selfId: string;
  /**
   * Draw the thread's own title bar.
   *
   * False inside a `Sheet`, which has already drawn one — two rows of back
   * arrow and name would be the sheet apologising for itself.
   */
  chrome: boolean;
  onBack: () => void;
  onVisit: () => void;
}) {
  const [messages, setMessages] = useState<DirectMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follows the newest line, and keeps following it when the box shrinks under
  // a keyboard — which is the case a `[messages]` effect cannot see. See
  // `useStickToBottom`.
  const scroller = useStickToBottom<HTMLDivElement>(messages);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const page = await fetchMessages(userId, undefined, signal);
        if (!signal?.aborted && alive.current) {
          setMessages(page);
          setError(null);
        }
      } catch (cause) {
        if (signal?.aborted) return;
        if (alive.current) {
          setError(
            cause instanceof ApiError ? cause.message : 'That conversation would not open.',
          );
        }
      } finally {
        if (!signal?.aborted && alive.current) setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load]);

  // Everything said while the socket was down. Re-read, not replayed.
  useEffect(() => onSocialReconnect(() => void load()), [load]);

  /*
   * Live delivery.
   *
   * Both directions arrive here — the server echoes the sender's own message
   * back to every tab they have open — so a conversation open twice does not
   * disagree with itself, and the sender sees the *stored* row rather than an
   * optimistic copy that would have to be reconciled with it later.
   */
  useEffect(
    () =>
      onSocial('dm:message', (message) => {
        if (message.withUserId !== userId) return;
        setMessages((current) =>
          current.some((existing) => existing.id === message.id)
            ? current
            : [...current, message],
        );
      }),
    [userId],
  );

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    // The socket first: one round trip writes the row and delivers it.
    const reply = await askSocial<{ ok: boolean; message?: string }>('dm:send', {
      toUserId: userId,
      body,
    });

    if (!isRefusal(reply) && reply.ok) {
      if (alive.current) {
        setDraft('');
        setSending(false);
      }
      return;
    }

    /*
     * The socket said no. Whether to fall back depends on *why*.
     *
     * A connection problem is worth retrying over HTTP — the message is fine,
     * the pipe is not. A refusal about the message itself ("you are not friends
     * with them") would get the identical answer from the REST route, because
     * both go through the same service, so retrying would be a second request
     * for the same no.
     */
    const transportProblem =
      isRefusal(reply) && (reply.code === 'OFFLINE' || reply.code === 'TIMEOUT');

    if (!transportProblem) {
      if (alive.current) {
        setError(
          (isRefusal(reply) && reply.message) || 'That message could not be sent.',
        );
        setSending(false);
      }
      return;
    }

    try {
      const stored = await sendMessage(userId, body);
      if (alive.current) {
        // Added here, because the socket that would have echoed it is down.
        // Guarded against the id arriving twice if it comes back up mid-flight.
        setMessages((current) =>
          current.some((existing) => existing.id === stored.id)
            ? current
            : [...current, stored],
        );
        setDraft('');
      }
    } catch (cause) {
      if (alive.current) {
        setError(
          cause instanceof ApiError ? cause.message : 'That message could not be sent.',
        );
      }
    } finally {
      if (alive.current) setSending(false);
    }
  };

  /*
   * A column, not a tall block.
   *
   * This used to be a fixed-height log inside the panel's own scroller, which
   * worked on a desktop and broke on a phone the moment a keyboard came up: the
   * shell shrank to what was left of the screen, the log kept its 22rem, and
   * the composer — the one part of a chat that has to be reachable — was
   * pushed below the fold of a scroller nobody thinks to scroll while typing.
   *
   * Now the header and the composer are fixed at the two ends and the *log* is
   * the thing that gives, which is what every messaging app does and what makes
   * the keyboard a non-event: whatever height is left, the composer is at the
   * bottom of it.
   */
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3', !chrome && 'p-3')}>
      {chrome && (
      <header className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="size-8 shrink-0 p-0"
          aria-label="Back to the conversations"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Button>

        <p className="min-w-0 flex-1 truncate text-sm font-medium">{username}</p>

        <Button
          variant="ghost"
          size="sm"
          className="size-8 shrink-0 p-0"
          aria-label={`Visit ${username}`}
          title={`Visit ${username}`}
          onClick={onVisit}
        >
          <DoorOpen aria-hidden className="size-4" />
        </Button>
      </header>
      )}

      <div
        ref={scroller}
        className={cn(
          'relative min-h-24 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3',
          // A card inside a panel, or the page itself.
          //
          // In the desktop column the log is one object among several and the
          // border says where it ends. On a phone it *is* the screen, and a
          // rounded box drawn inside a screen that is already the conversation
          // is a frame around nothing — it also spends eight points a side that
          // a 300-point screen has better uses for.
          chrome && 'rounded-xl border border-border bg-card/60',
        )}
      >
        {loading && (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-8 w-2/3 rounded-xl" />
            <Skeleton className="ml-auto h-8 w-1/2 rounded-xl" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nothing yet. Say hello.
          </p>
        )}

        {messages.map((message) => (
          <p
            key={message.id}
            className={cn(
              'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
              message.senderId === selfId
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-muted text-foreground',
            )}
          >
            {message.body}
          </p>
        ))}
      </div>

      {error && (
        <p className="animate-shake shrink-0 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </p>
      )}

      <form
        className="flex shrink-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${username}…`}
          name="message"
          autoComplete="off"
          enterKeyHint="send"
          maxLength={1000}
          aria-label={`Message ${username}`}
        />
        <Button
          type="submit"
          size="sm"
          className="shrink-0 px-3"
          aria-label="Send"
          disabled={sending || !draft.trim()}
        >
          <SendHorizonal aria-hidden className="size-4" />
        </Button>
      </form>
    </div>
  );
}
