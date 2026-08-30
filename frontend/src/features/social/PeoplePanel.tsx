import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock3,
  DoorOpen,
  MessageCircle,
  Search,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  Users,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { ApiError } from '../../lib/api';
import { useDelayedVisible } from '../../lib/useDelayedVisible';
import { cn } from '../../lib/utils';
import { searchUsers } from './api';
import type { PublicUser } from './api';
import { PersonRow } from './PersonRow';
import { onSocial } from './socket';
import type { UseFriends } from './useFriends';

/**
 * Finding people, and the people you have already found.
 *
 * Two halves of one panel rather than two tabs, because they are the same
 * activity at two moments: you search for somebody once, and after that they
 * are simply *there*. A friends list that lived behind its own tab would make
 * the common case — open the social layer, see who is about — the one that
 * costs a click.
 *
 * The search is a prefix search on username and the server says so
 * (`UsersService.search`): substring matching over usernames is an enumeration
 * tool, and the feature being built is "find the person whose name you know".
 *
 * ## The order of the sections is the argument
 *
 * Search, then what is waiting on *you*, then your friends, then what you are
 * waiting on. Requests you can answer come second because they are the only
 * thing on this screen that somebody else is held up by; the ones you have sent
 * come last because there is nothing to do about them. Every heading carries
 * the same mark as the button that gets you there, so the section a badge is
 * counting is findable without reading.
 */

interface PeoplePanelProps {
  friends: UseFriends;
  /** Presence, from the socket. Which friends have a window open right now. */
  online: ReadonlySet<string>;
  /** Go and look at somebody's room. */
  onVisit: (user: { id: string; username: string }) => void;
  /** Open a conversation with a friend. */
  onMessage: (user: { id: string; username: string }) => void;
}

/**
 * How long the search waits after the last keystroke.
 *
 * A request per character is a request per character, and the Performance Rules
 * are explicit that anything driven by typing is debounced. 260 ms is under the
 * threshold where a person notices a delay and over the interval at which they
 * type, so a five-letter name costs one request rather than five.
 */
const DEBOUNCE_MS = 260;

export function PeoplePanel({ friends, online, onVisit, onMessage }: PeoplePanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // --- The search ----------------------------------------------------------
  useEffect(() => {
    const term = query.trim();

    if (term.length < 2) {
      // Nothing to search for. Cleared inside a microtask rather than in the
      // effect body: an effect that sets state synchronously cascades a render,
      // and the rule that forbids it is the same one the loaders obey.
      queueMicrotask(() => {
        setResults(null);
        setSearching(false);
      });
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const found = await searchUsers(term, controller.signal);
          if (controller.signal.aborted) return;
          setResults(found);
          setSearchError(null);
        } catch (cause) {
          if (controller.signal.aborted) return;
          setSearchError(
            cause instanceof ApiError ? cause.message : 'That search did not work.',
          );
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /*
   * A result's relationship is a snapshot, and it goes stale.
   *
   * Adding somebody changes what their row should offer, and so does the other
   * person accepting while the results are still on screen. Rather than patch
   * the row from the mutation's answer — which would be this panel maintaining
   * its own idea of a relationship the server owns — the search is simply run
   * again, from the same effect, on the same debounce.
   */
  const rerunSearch = () => setQuery((current) => `${current}`);

  useEffect(() => onSocial('friends:changed', rerunSearch), []);

  const act = async (id: string, action: () => Promise<boolean>) => {
    setBusy(id);
    await action();
    if (alive.current) {
      setBusy(null);
      rerunSearch();
    }
  };

  const showSkeleton = useDelayedVisible(searching && results === null, {
    delay: 150,
    minVisible: 400,
  });

  const { incoming, outgoing, friends: list } = friends.friends;

  return (
    <div className="space-y-5">
      {/* --- Search ------------------------------------------------------- */}
      <section className="space-y-2">
        <label htmlFor="social-search" className="sr-only">
          Find someone by username
        </label>

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="social-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find someone by username…"
            type="search"
            name="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            enterKeyHint="search"
            className="pr-9 pl-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear the search"
              onClick={() => setQuery('')}
              className={cn(
                'absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full',
                'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </div>

        {searchError && (
          <p className="animate-shake text-xs text-destructive">{searchError}</p>
        )}

        {showSkeleton && (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((row) => (
              <div
                key={row}
                className="flex items-center gap-3 rounded-xl border border-border p-2.5"
              >
                <Skeleton className="size-[52px] rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {results !== null && !showSkeleton && (
          <ul className="stagger space-y-2">
            {results.length === 0 && (
              <li className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nobody by that name. Usernames have to match from the start.
              </li>
            )}

            {results.map((person) => (
              <li key={person.id}>
                <PersonRow
                  username={person.username}
                  pet={person.pet}
                  detail={detailFor(person)}
                  actions={
                    <>
                      <IconButton
                        label={`Visit ${person.username}`}
                        icon={DoorOpen}
                        onClick={() => onVisit({ id: person.id, username: person.username })}
                      />
                      <RelationshipAction
                        person={person}
                        busy={busy === person.id}
                        onAdd={() => void act(person.id, () => friends.add({ userId: person.id }))}
                        onAccept={() =>
                          person.requestId &&
                          void act(person.id, () => friends.accept(person.requestId!))
                        }
                      />
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Waiting for an answer ---------------------------------------- */}
      {incoming.length > 0 && (
        <section className="space-y-2">
          <SectionHeading icon={UserPlus} accent>
            Wants to be friends
          </SectionHeading>
          <ul className="stagger space-y-2">
            {incoming.map((request) => (
              <li key={request.id}>
                <PersonRow
                  username={request.username}
                  pet={request.pet}
                  detail="Asked to be friends"
                  className="border-accent/40 bg-accent/5"
                  actions={
                    <>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 px-2.5 text-xs"
                        disabled={busy === request.id}
                        onClick={() => void act(request.id, () => friends.accept(request.id))}
                      >
                        <Check aria-hidden className="size-3.5" />
                        Accept
                      </Button>
                      <IconButton
                        label={`Decline ${request.username}`}
                        icon={UserRoundX}
                        disabled={busy === request.id}
                        onClick={() => void act(request.id, () => friends.decline(request.id))}
                      />
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Friends ------------------------------------------------------- */}
      <section className="space-y-2">
        <SectionHeading icon={Users} count={list.length}>
          Friends
        </SectionHeading>

        {friends.error && (
          <p className="animate-shake rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {friends.error}
          </p>
        )}

        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <UserRoundCheck aria-hidden className="mx-auto size-7 text-muted-foreground/60" />
            <p className="mt-2 text-xs text-muted-foreground">
              Nobody yet. Search for a username above, or meet somebody in a park.
            </p>
          </div>
        ) : (
          <ul className="stagger space-y-2">
            {list.map((friend) => {
              const here = online.has(friend.userId);
              return (
                <li key={friend.userId}>
                  <PersonRow
                    username={friend.username}
                    pet={friend.pet}
                    detail={
                      here
                        ? `${friend.pet?.name ?? 'Their creature'} · about now`
                        : (friend.pet?.name ?? 'No creature yet')
                    }
                    tint={here ? 'var(--color-primary)' : undefined}
                    actions={
                      <>
                        <IconButton
                          label={`Message ${friend.username}`}
                          icon={MessageCircle}
                          onClick={() =>
                            onMessage({ id: friend.userId, username: friend.username })
                          }
                        />
                        <IconButton
                          label={`Visit ${friend.username}`}
                          icon={DoorOpen}
                          onClick={() =>
                            onVisit({ id: friend.userId, username: friend.username })
                          }
                        />
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Asked, not yet answered --------------------------------------- */}
      {outgoing.length > 0 && (
        <section className="space-y-2">
          <SectionHeading icon={Clock3}>Waiting on</SectionHeading>
          <ul className="space-y-2">
            {outgoing.map((request) => (
              <li key={request.id}>
                <PersonRow
                  username={request.username}
                  pet={request.pet}
                  detail="Asked — no answer yet"
                  className="opacity-70"
                  actions={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      disabled={busy === request.userId}
                      onClick={() =>
                        void act(request.userId, () => friends.remove(request.userId))
                      }
                    >
                      Cancel
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One heading, four sections, one shape.
 *
 * The sections in this panel used to differ by a word and nothing else, which
 * left a long scroll of small grey capitals with no way in. A mark and an
 * optional count make each one findable at a glance, and having exactly one
 * component for it is what stops the four drifting apart again.
 */
function SectionHeading({
  icon: Icon,
  count,
  accent = false,
  children,
}: {
  icon: typeof Users;
  count?: number;
  /** For the one section somebody else is waiting on. */
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <h3
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase',
        accent ? 'text-accent' : 'text-muted-foreground',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] leading-none text-foreground">
          {count}
        </span>
      )}
    </h3>
  );
}

/**
 * An action that fits in a row of creatures.
 *
 * Visit and Message were words, and two words plus a portrait plus a name plus
 * a line of detail is more than a 26rem column holds — the rows wrapped, and a
 * wrapped row of people is a list you cannot scan. The mark carries the meaning
 * and the accessible name carries the words, which is the trade a tooltip is
 * for; nothing here is an action somebody has to discover, because both of them
 * are also offered in full inside the screen they lead to.
 */
function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: typeof Users;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="size-8 shrink-0 p-0"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden className="size-4" />
    </Button>
  );
}

/** The one line under a search result's name. */
function detailFor(person: PublicUser): string {
  const creature = person.pet ? person.pet.name : 'No creature yet';
  const memories =
    person.publicMemories > 0
      ? ` · ${person.publicMemories} shared ${person.publicMemories === 1 ? 'memory' : 'memories'}`
      : '';

  return `${creature}${memories}`;
}

/**
 * What a search result offers, given where you already stand with that person.
 *
 * Five states and five different buttons, because "Add" on somebody who already
 * asked *you* is the interface making the user do the work of noticing. The
 * relationship comes from the server on every row of every search — one query
 * for the page, not one per person — so this is a render of a fact rather than
 * a guess.
 *
 * A component rather than a function called during render, which matters to
 * more than tidiness: a helper invoked mid-render that closes over refs and
 * callbacks is opaque to the React Compiler, and it says so.
 */
function RelationshipAction({
  person,
  busy,
  onAdd,
  onAccept,
}: {
  person: PublicUser;
  busy: boolean;
  onAdd: () => void;
  onAccept: () => void;
}) {
  const pending = busy;

  switch (person.relationship) {
    case 'friends':
      return (
        <span
          className="flex items-center gap-1 px-1.5 text-xs text-muted-foreground"
          title="You are friends"
        >
          <UserRoundCheck aria-hidden className="size-3.5" />
        </span>
      );

    case 'requested':
      return (
        <span
          className="flex items-center gap-1 px-1.5 text-xs text-muted-foreground"
          title="Asked — no answer yet"
        >
          <Clock3 aria-hidden className="size-3.5" />
        </span>
      );

    case 'incoming':
      return (
        <Button
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          disabled={pending || !person.requestId}
          onClick={onAccept}
        >
          <Check aria-hidden className="size-3.5" />
          Accept
        </Button>
      );

    case 'declined':
      // They said no. The product does not offer a way to ask again — see
      // `friendship.prisma` on why the refusal is kept rather than deleted.
      return <span className="px-2 text-xs text-muted-foreground">—</span>;

    case 'self':
      return null;

    default:
      return (
        <Button
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          disabled={pending}
          onClick={onAdd}
        >
          <UserPlus aria-hidden className="size-3.5" />
          {pending ? '…' : 'Add'}
        </Button>
      );
  }
}
