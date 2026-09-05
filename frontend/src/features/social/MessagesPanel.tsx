import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  DoorOpen,
  MessagesSquare,
  SendHorizonal,
  Users,
} from 'lucide-react';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import { Button } from '../../components/ui/button';
import { Sheet } from '../../components/ui/sheet';
import { Skeleton } from '../../components/ui/skeleton';
import { ApiError } from '../../lib/api';
import { GROUPING_WINDOW_MS, clockTime, conversationStamp, dayLabel } from '../../lib/time';
import { useDelayedVisible } from '../../lib/useDelayedVisible';
import { useStickToBottom } from '../../lib/useStickToBottom';
import { cn } from '../../lib/utils';
import { PetPortrait } from '../pets/PetPortrait';
import { fetchConversations, fetchMessages, sendMessage } from './api';
import type { Conversation, DirectMessageRecord, PublicPet } from './api';
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
 *
 * ## What the screen is made of
 *
 * The log used to be a stack of identical pills with no times, no days and no
 * sender anywhere on it — legible for four messages and unreadable for forty,
 * because nothing in it said *when*. Three things fixed that, and all three are
 * the conventions of the form rather than inventions:
 *
 * ```text
 *   day headings   a message is placed in a week before it is read
 *   runs           consecutive lines from one person, close in time, are one
 *                  thought typed in three goes — so they are drawn as one
 *                  block, with the time on the last of them only
 *   a face         the other person's creature beside their side of the
 *                  conversation, which is who they are everywhere else here
 * ```
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
  const [open, setOpen] = useState<{
    userId: string;
    username: string;
    pet: PublicPet | null;
  } | null>(null);

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
    if (friend) {
      setOpen({ userId: friend.userId, username: friend.username, pet: friend.pet });
    }
  }

  const showSkeleton = useDelayedVisible(loading, { delay: 150, minVisible: 400 });

  if (open) {
    const thread = (
      <Thread
        userId={open.userId}
        username={open.username}
        pet={open.pet}
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
    <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
      {showSkeleton && (
        <div className="space-y-2" aria-busy="true">
          {/*
            The skeleton is the row's own shape, not a generic bar: 52 points of
            portrait plus two lines of text inside a 2.5 padding is 73 points
            tall, and a placeholder of a different height means the list jumps
            when it resolves. That jump is what a loading state is supposed to
            prevent, so one that causes it is worse than none.
          */}
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
            >
              <Skeleton className="size-[52px] shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!showSkeleton && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-8 text-center">
          <MessagesSquare aria-hidden className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No one to talk to yet</p>
          <p className="mx-auto mt-1 max-w-[28ch] text-xs text-muted-foreground">
            Messages are for friends. Find somebody in People, and they will
            appear here.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Users aria-hidden className="size-3.5" />
            Your friends
          </h3>

          <ul className="stagger space-y-2">
            {rows.map(({ friend, preview, at }) => (
              <li key={friend.userId}>
                <PersonRow
                  username={friend.username}
                  pet={friend.pet}
                  /*
                    A preview, or an invitation — and they are not the same
                    sentence, so they do not look the same. "Say something" is
                    the product speaking; a preview is the other person, and
                    quoting them in the same grey as a prompt was the row's
                    second line meaning two different things.
                  */
                  detail={preview ?? 'Say something'}
                  meta={at ? conversationStamp(at) : undefined}
                  onClick={() =>
                    setOpen({
                      userId: friend.userId,
                      username: friend.username,
                      pet: friend.pet,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * One message, and everything about how it should be drawn.
 *
 * Worked out once, for the whole log, rather than by each bubble asking about
 * its neighbours: the answers depend on the message before *and* the one after,
 * and a component that reaches for both is a component that re-derives the
 * whole list on every render.
 */
interface Line {
  message: DirectMessageRecord;
  mine: boolean;
  /** The day heading to draw above it, if this is the first message of a day. */
  day: string | null;
  /** First of a run: gets the gap above it, and the face beside it. */
  opens: boolean;
  /** Last of a run: gets the time under it, and the squared-off corner. */
  closes: boolean;
}

function layOut(messages: DirectMessageRecord[], selfId: string): Line[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const at = new Date(message.createdAt).getTime();

    const newDay =
      previous === undefined ||
      dayLabel(previous.createdAt) !== dayLabel(message.createdAt);

    const runsFrom = (other: DirectMessageRecord | undefined) =>
      other !== undefined &&
      other.senderId === message.senderId &&
      Math.abs(new Date(other.createdAt).getTime() - at) < GROUPING_WINDOW_MS;

    return {
      message,
      mine: message.senderId === selfId,
      day: newDay ? dayLabel(message.createdAt) : null,
      // A day heading always breaks a run: two messages either side of midnight
      // are not one thought, whatever the clock says about the gap.
      opens: newDay || !runsFrom(previous),
      closes:
        next === undefined ||
        dayLabel(next.createdAt) !== dayLabel(message.createdAt) ||
        !runsFrom(next),
    };
  });
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
  pet,
  selfId,
  chrome,
  onBack,
  onVisit,
}: {
  userId: string;
  username: string;
  /** Their creature, for the header and beside their side of the log. */
  pet: PublicPet | null;
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

  const appearance = useMemo(
    () => (pet ? createPetAppearance(pet.appearanceData as never) : null),
    [pet],
  );

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

  const lines = useMemo(() => layOut(messages, selfId), [messages, selfId]);

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
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2', !chrome && 'p-3 pt-2')}>
      {chrome && (
        <header className="flex shrink-0 items-center gap-2 pb-1">
          <Button
            variant="ghost"
            size="sm"
            className="size-8 shrink-0 p-0"
            aria-label="Back to the conversations"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Button>

          {/*
            Their creature, at the top of their conversation.

            Small — this is a title bar, not a profile — but it is the same
            picture as the row that was pressed to get here, out of the same
            cache, so it is already drawn and the transition is continuous.
          */}
          {appearance && (
            <PetPortrait
              appearance={appearance}
              size={28}
              alt=""
              className="shrink-0"
            />
          )}

          <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            {username}
          </p>

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
          // `flex flex-col` with the content below carrying `mt-auto`: a short
          // conversation sits on the composer instead of hanging from the top
          // of an empty box, which is what every messaging app does and what
          // makes three messages look like the start of something rather than
          // like a list that failed to fill. A long one overflows and scrolls
          // exactly as before — `mt-auto` collapses to nothing once the content
          // is taller than the box.
          'relative flex min-h-24 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3',
          // A card inside a panel, or the page itself.
          //
          // In the desktop column the log is one object among several and the
          // border says where it ends. On a phone it *is* the screen, and a
          // rounded box drawn inside a screen that is already the conversation
          // is a frame around nothing — it also spends eight points a side that
          // a 300-point screen has better uses for.
          chrome && 'rounded-2xl border border-border bg-card/50',
        )}
      >
        {loading && (
          <div className="space-y-2" aria-busy="true">
            {/*
              Shaped like a conversation, not like a form: alternating sides,
              varying widths. A column of identical bars is a loading state that
              tells you nothing about what is coming.
            */}
            <Skeleton className="h-8 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-8 w-1/2 rounded-2xl" />
            <Skeleton className="h-8 w-2/5 rounded-2xl" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center">
            {appearance ? (
              <PetPortrait appearance={appearance} size={64} alt="" />
            ) : (
              <MessagesSquare aria-hidden className="size-7 text-muted-foreground/50" />
            )}
            <p className="text-sm font-medium">Say hello to {username}</p>
            <p className="max-w-[26ch] text-xs text-muted-foreground">
              Nothing has been said here yet.
            </p>
          </div>
        )}

        {lines.length > 0 && (
          <div className="mt-auto">
            {lines.map((line) => (
              <MessageLine
                key={line.message.id}
                line={line}
                username={username}
                appearance={appearance}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p
          role="status"
          className="animate-shake shrink-0 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {/*
        The composer.

        One rounded object rather than a field and a button sitting beside each
        other: the two are one control — you type in it and press the end of it
        — and drawing them as two boxes with a gap between them is what made
        this look like a form on a settings page. The field carries no border of
        its own; the shell has it, and it lights up when what is inside has
        focus, so the whole thing answers as one thing.
      */}
      <form
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full border border-border bg-card p-1 pl-4',
          'transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30',
        )}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${username}…`}
          name="message"
          autoComplete="off"
          enterKeyHint="send"
          maxLength={1000}
          aria-label={`Message ${username}`}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-sm outline-none',
            'placeholder:text-muted-foreground',
          )}
        />

        <Button
          type="submit"
          size="sm"
          className="size-9 shrink-0 rounded-full p-0"
          aria-label="Send"
          disabled={sending || !draft.trim()}
        >
          <SendHorizonal aria-hidden className="size-4" />
        </Button>
      </form>
    </div>
  );
}

/**
 * One line of the conversation, with whatever heading and time belong to it.
 *
 * The bubble's corners say who is speaking without a label: the corner nearest
 * the speaker is squared off on the *last* message of a run, which is the tail
 * every messaging app draws, and the rest of the run keeps its round corners so
 * a block of three reads as one block.
 */
function MessageLine({
  line,
  username,
  appearance,
}: {
  line: Line;
  username: string;
  appearance: ReturnType<typeof createPetAppearance> | null;
}) {
  const { message, mine, day, opens, closes } = line;

  return (
    <>
      {day && (
        /*
          A day heading, on a rule.

          Centred and small, so it is read as furniture rather than as something
          somebody said. The rule either side is what stops a lone grey word in
          the middle of a column looking like a message that failed to render.
        */
        <div className="flex items-center gap-3 py-3 first:pt-0">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
            {day}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-1.5',
          // Tight inside a run, open between runs: the gap is what says "this
          // is a new thing being said" without anything having to be written.
          opens ? 'mt-2.5 first:mt-0' : 'mt-0.5',
          mine && 'flex-row-reverse',
        )}
      >
        {/*
          Their face, once per run, at the bottom of it.

          Only on their side. Mine is on my side of the screen and I know who I
          am; drawing my own creature forty times down a column is the interface
          reminding me of something I have never wondered about.

          The blank keeps the run's later lines aligned with its first — an
          avatar that only exists on one line of three would step the block in
          and out by twenty-six points.
        */}
        {!mine &&
          (closes && appearance ? (
            <PetPortrait
              appearance={appearance}
              size={26}
              alt={`${username}'s creature`}
              className="shrink-0"
            />
          ) : (
            <span aria-hidden className="w-[26px] shrink-0" />
          ))}

        <div className={cn('flex min-w-0 max-w-[78%] flex-col', mine && 'items-end')}>
          <p
            className={cn(
              'w-fit max-w-full px-3 py-1.5 text-[0.8rem] leading-snug break-words',
              'rounded-2xl',
              // `said`, not `primary` — see the token's own note in index.css.
              // The product's pink at button contrast is not readable as a
              // paragraph, and this is a paragraph.
              mine
                ? cn('bg-said text-said-foreground', closes && 'rounded-br-md')
                : cn('bg-muted text-foreground', closes && 'rounded-bl-md'),
            )}
          >
            {message.body}
          </p>

          {/*
            The time, on the last line of a run only.

            Under the bubble rather than inside it: inside, it has to be either
            given its own corner (which makes short messages wide for no reason)
            or floated over the text. Under it, in the same grey as everything
            else quiet on this screen, it is available without being part of
            what was said.
          */}
          {closes && (
            <time
              dateTime={message.createdAt}
              className="mt-0.5 px-1 text-[0.6rem] text-muted-foreground tabular-nums"
            >
              {clockTime(message.createdAt)}
            </time>
          )}
        </div>
      </div>
    </>
  );
}
