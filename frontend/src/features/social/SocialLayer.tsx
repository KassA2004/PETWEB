import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessagesSquare, Trees, UserRound } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import type { TabItem } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { MessagesPanel } from './MessagesPanel';
import { ParksPanel } from './ParksPanel';
import type { CreatureGate } from './ParksPanel';
import { ParkStage } from './ParkStage';
import { PeoplePanel } from './PeoplePanel';
import { VisitStage } from './VisitStage';
import { rememberedPark } from './parkMemory';
import type { Park } from './api';
import { connectSocial, onSocial, onSocialStatus, socialStatus } from './socket';
import type { SocialStatus } from './socket';
import { useFriends } from './useFriends';

/**
 * The social layer.
 *
 * ## It is a mode of the page, not a sheet over it
 *
 * This used to be a 28rem panel that slid over everything, carrying its own
 * small copy of the world inside it. That was wrong in three ways at once: the
 * park was a postage stamp next to the room it was supposed to be an outing
 * from, two PixiJS applications were alive whenever it was open (which is what
 * the room "glitching" on the way in actually was), and the room behind the
 * scrim was a room you could see and not use.
 *
 * Now the social layer swaps the *tools*, and borrows the *world*:
 *
 * ```text
 *   before                          after
 *   ────────────────────────────    ────────────────────────────────────────
 *   [ room ][ tabs ] + overlay      [ room OR park OR their room ][ tabs ]
 *   two canvases, one covered       one canvas, showing wherever you are
 *   Goals/Memories/Pet/Room         …swapped for Parks/People/Messages
 * ```
 *
 * The right-hand column keeps working exactly as it did — one tab strip, one
 * scrolling panel under it — and the only thing that changes is which four
 * options are in the strip. Going to a park is then the same gesture as opening
 * the Room tab, which is the point: other people are somewhere this product
 * goes, not a feature it bolts on the side.
 *
 * ## Two slots, filled by portal
 *
 * This component renders nothing where it sits. It renders into two elements
 * the dashboard owns:
 *
 * ```text
 *   asideHost   the tools column — tabs and panels, or the park's own panel
 *   worldHost   the world column — passed down to whichever stage needs it
 * ```
 *
 * Portals rather than lifting the state into `Dashboard`, because all of this —
 * the socket, the friend list, the park session — must stay behind the `lazy()`
 * boundary. A hook cannot be lazily loaded; a component can.
 *
 * ## Staying mounted
 *
 * Once opened, this stays mounted for the rest of the session even while the
 * user is back on their Goals, and that is deliberate: a park you are standing
 * in is not something you should fall out of because you looked at your goal
 * list. The park keeps rendering in the world column, the socket keeps its seat
 * warm, and switching back to Friends puts you where you were.
 *
 * ## The connection
 *
 * Opened here, on mount, and not before. A visitor who never presses the button
 * never opens a WebSocket, never authenticates one, and never downloads
 * `socket.io-client` — this whole feature is behind a `lazy()` boundary in the
 * dashboard, so the entry bundle does not carry any of it (Architecture and
 * layers: the code-split boundaries).
 *
 * It is *not* closed when the user goes back to their room. Somebody who has
 * been in the social layer once should keep hearing about a message or a friend
 * request for the rest of the session. Sign-out is what closes it, which is the
 * one event that genuinely invalidates the session it authenticated with.
 */

type SocialTab = 'parks' | 'people' | 'messages';

/** Where the panel currently is. A park and a visit are places, not tabs. */
type Screen =
  | { kind: 'browse' }
  | { kind: 'park'; parkId: string; passcode?: string }
  | { kind: 'visit'; userId: string; username: string };

/** What the dashboard needs to know about where the user is standing. */
export interface SocialPlace {
  kind: 'park' | 'visit';
  /** For the "you are still out" hint in the header. */
  label: string;
}

/** The habitat props that describe the *screen* rather than the room. */
export interface WorldChrome {
  bleed?: boolean;
  fill?: boolean;
  zoom?: number;
}

interface SocialLayerProps {
  /**
   * Who is signed in.
   *
   * Handed down from `AuthGate` through `Dashboard`, and **not** read from
   * `useSession()` here. That is not a preference: a second `useSession`
   * subscription refetches on mount, the refetch flips `isPending` in
   * `AuthGate`, and `AuthGate` responds by unmounting the dashboard and
   * rebuilding the entire world — so opening this panel tore down the room and
   * refetched five endpoints. Measured in the network log, then fixed by
   * passing the value that was already in hand.
   *
   * Used only to answer "is this row me": to keep the local creature out of the
   * visitor list, and to align the user's own chat lines. Nothing is authorized
   * by it — the server takes every identity from the session cookie and never
   * from anything a client says about itself.
   */
  selfId: string;
  /** The user's own creature, so it can walk into a park. */
  appearance: PetAppearance;
  petName: string;
  /**
   * Whether that creature has been saved, and a way to save it.
   *
   * A park shows everybody's creature from their `Pet` row — the server reads
   * it, so no client can send a rig — which means an unsaved working copy is
   * one nobody else can be shown. See `CreatureGate`.
   */
  creature: CreatureGate;
  compact: boolean;
  /**
   * Somebody is typing on a small screen, so the chrome stands down.
   *
   * The tab strip goes with the dashboard's header, for the same reason: a
   * phone with a keyboard up has about 300 points left and a row of tabs is a
   * seventh of it, spent on navigation nobody uses mid-sentence.
   */
  typing: boolean;
  /**
   * How the room is dressed and sized on this screen.
   *
   * Passed straight through to whichever stage is standing somewhere, so a park
   * on a phone is edge-to-edge and nudged the same few percent the creature's
   * own room is. The dashboard decides it once (`Dashboard`'s `world`) because
   * it is a fact about the *screen*, not about the park — and a park that came
   * to its own conclusion about it would be the one screen in the product where
   * the room is framed differently for no reason.
   */
  world: WorldChrome;
  /** True while the tools column belongs to this layer rather than to the room. */
  active: boolean;
  /** The dashboard's two slots. Null on the very first render only. */
  asideHost: HTMLElement | null;
  worldHost: HTMLElement | null;
  /** Somewhere else is on screen, or is not any more. */
  onPlaceChange: (place: SocialPlace | null) => void;
  /** How many things are waiting to be looked at, for the header's badge. */
  onAttention: (count: number) => void;
}

export function SocialLayer({
  selfId,
  appearance,
  petName,
  creature,
  compact,
  typing,
  world,
  active,
  asideHost,
  worldHost,
  onPlaceChange,
  onAttention,
}: SocialLayerProps) {
  const [tab, setTab] = useState<SocialTab>('parks');
  /*
   * Where we are, restored from the tab's own memory.
   *
   * A reload used to walk the user out of whatever park they were standing in,
   * which is not what refreshing a page means. The park id is remembered for
   * the lifetime of the tab and the rejoin needs no passcode — the participant
   * row that outlived the socket is what re-admits them. See `parkMemory.ts`.
   */
  const [screen, setScreen] = useState<Screen>(() => {
    const parkId = rememberedPark();
    return parkId ? { kind: 'park', parkId } : { kind: 'browse' };
  });
  const [status, setStatus] = useState<SocialStatus>(socialStatus());
  /** Who to open a conversation with, when arriving from elsewhere. */
  const [messageTarget, setMessageTarget] = useState<string | null>(null);
  /**
   * Why the last attempt to get into a park did not work.
   *
   * Held here rather than inside the park screen, because a refusal is
   * something you read *back at the list*: by the time a park has said no there
   * is nothing to stand in, and the useful next thing on screen is the other
   * parks.
   */
  const [refusal, setRefusal] = useState<string | null>(null);
  /*
   * What the park we are in is called, once the server has said.
   *
   * Stored *with* the id it belongs to rather than as a bare string, so that
   * "the name of the park we are in" can be derived during render instead of
   * having to be cleared by an effect when the screen changes. An effect whose
   * job is to unset a piece of state is a render behind, and React says so.
   */
  const [named, setNamed] = useState<{ parkId: string; name: string } | null>(null);
  const parkName =
    screen.kind === 'park' && named?.parkId === screen.parkId ? named.name : null;

  const friends = useFriends();

  /**
   * Which friends have a window open.
   *
   * Held here rather than in `useFriends` because it is not a fact about the
   * friendship — it is a fact about right now, it is never stored anywhere, and
   * it is gone the moment this layer unmounts. The server answers the question
   * on request and pushes every change (`friends:presence`), so there is no
   * poll and nothing to reconcile.
   */
  const [online, setOnline] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    connectSocial();
    return onSocialStatus(setStatus);
  }, []);

  useEffect(() => {
    return onSocial('friends:presence', ({ userId, online: isOnline }) => {
      setOnline((current) => {
        const next = new Set(current);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
  }, []);

  // Ask once the connection is up, and again after every reconnection — a
  // socket that dropped missed every arrival and departure in between.
  useEffect(() => {
    if (status !== 'connected') return;

    let cancelled = false;
    void import('./socket').then(async ({ askSocial }) => {
      const reply = await askSocial<{ online: string[] }>('friends:presence');
      if (cancelled || !reply || !('online' in reply)) return;
      setOnline(new Set(reply.online));
    });

    return () => {
      cancelled = true;
    };
  }, [status]);

  // The park's own name arrives with its roster, so the header can say where
  // the user still is after they have wandered back to their goals.
  useEffect(() => {
    if (screen.kind !== 'park') return;
    const parkId = screen.parkId;

    return onSocial('park:roster', (roster) => {
      if (roster.parkId === parkId) setNamed({ parkId, name: roster.park.name });
    });
  }, [screen]);

  /*
   * Tell the dashboard where the user is standing.
   *
   * In an effect rather than during render, because it sets state in a parent
   * — and it is what decides whether the dashboard keeps its own world mounted.
   * A place being open means the world column belongs to a stage in here.
   *
   * **A layout effect specifically**, which is the difference between one world
   * on screen and two. The stage's world is portalled into the dashboard's host
   * during this commit; the dashboard unmounts its own room in response to this
   * call. A passive effect runs *after* paint, so the browser would draw one
   * frame with both of them in the column — the room, and the box the park is
   * about to appear in, stacked. `useLayoutEffect` runs before that paint, so
   * the handover is never seen.
   */
  useLayoutEffect(() => {
    if (screen.kind === 'park') {
      onPlaceChange({ kind: 'park', label: parkName ?? 'a park' });
    } else if (screen.kind === 'visit') {
      onPlaceChange({ kind: 'visit', label: `${screen.username}'s room` });
    } else {
      onPlaceChange(null);
    }
  }, [screen, parkName, onPlaceChange]);

  /** Anything asking to be looked at, for the badge on the header's switch. */
  const attention = friends.friends.incoming.length;
  useEffect(() => onAttention(attention), [attention, onAttention]);

  // Escape steps back out of a place, the way "back" means when you are
  // standing somewhere. From the browsing screens it does nothing — there is
  // nothing to close any more, because this is a mode rather than a sheet.
  useEffect(() => {
    if (screen.kind === 'browse' || !active) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScreen({ kind: 'browse' });
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen.kind, active]);

  const tabs = useMemo<TabItem<SocialTab>[]>(
    () => [
      { value: 'parks', label: 'Parks', icon: Trees },
      {
        value: 'people',
        label: 'People',
        icon: UserRound,
        count: friends.friends.incoming.length || undefined,
      },
      { value: 'messages', label: 'Messages', icon: MessagesSquare },
    ],
    [friends.friends.incoming.length],
  );

  const visit = (user: { id: string; username: string }) =>
    setScreen({ kind: 'visit', userId: user.id, username: user.username });

  const message = (user: { id: string; username: string }) => {
    setMessageTarget(user.id);
    setTab('messages');
    setScreen({ kind: 'browse' });
  };

  /*
   * The stages stay mounted while the user is on their own tabs.
   *
   * Only the *panel* is hidden by the dashboard; the park session, its socket
   * membership and the lawn in the world column all carry on. Unmounting them
   * when the user glanced at their goal list would be walking them out of a
   * park for looking away.
   */
  const body = (
    <>
      {screen.kind === 'park' && (
        <ParkStage
          parkId={screen.parkId}
          passcode={screen.passcode}
          selfId={selfId}
          appearance={appearance}
          petName={petName}
          compact={compact}
          world={world}
          worldHost={worldHost}
          onLeave={() => setScreen({ kind: 'browse' })}
          onRefused={(message) => {
            setRefusal(message);
            setTab('parks');
            setScreen({ kind: 'browse' });
          }}
        />
      )}

      {screen.kind === 'visit' && (
        <VisitStage
          userId={screen.userId}
          username={screen.username}
          compact={compact}
          world={world}
          worldHost={worldHost}
          onClose={() => setScreen({ kind: 'browse' })}
          onMessage={message}
        />
      )}

      {screen.kind === 'browse' && (
        <>
          {status === 'unauthorized' && (
            <p className="shrink-0 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Your session has expired. Sign in again to meet anybody.
            </p>
          )}

          {!typing && (
            <Tabs
              items={tabs}
              value={tab}
              onValueChange={setTab}
              dense={compact}
              className={cn('shrink-0', compact && 'text-xs')}
            />
          )}

          {/*
            The panel body, and it scrolls in two of the three tabs.

            Messages is the exception and it has to be: a conversation manages
            its own height — header pinned, log scrolling, composer at the
            bottom — and nesting that inside an outer scroller is what put the
            composer under the keyboard on a phone. So the messages tab is
            handed the column and fills it; Parks and People are ordinary lists
            and scroll as one.

            `relative` in both cases, for the reason `controls.tsx`'s SwatchRow
            documents: a clipping container without a containing block lets an
            absolutely positioned descendant escape to <html> and grow the
            document.
          */}
          <div
            className={cn(
              'relative min-h-0 flex-1',
              tab === 'messages'
                ? 'flex flex-col'
                : '-mr-1 overflow-y-auto pr-1 pb-4',
            )}
          >
            {tab === 'parks' && (
              <ParksPanel
                creature={creature}
                status={status}
                fullScreen={compact}
                refusal={refusal}
                onDismissRefusal={() => setRefusal(null)}
                onEnter={(park: Park, passcode?: string) => {
                  setRefusal(null);
                  setScreen({ kind: 'park', parkId: park.id, passcode });
                }}
              />
            )}

            {tab === 'people' && (
              <PeoplePanel
                friends={friends}
                online={online}
                onVisit={visit}
                onMessage={message}
              />
            )}

            {tab === 'messages' && (
              <MessagesPanel
                friends={friends}
                selfId={selfId}
                fullScreen={compact}
                initialUserId={messageTarget}
                onVisit={visit}
              />
            )}
          </div>
        </>
      )}
    </>
  );

  if (!asideHost) return null;

  return createPortal(
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3', !active && 'hidden')}>{body}</div>,
    asideHost,
  );
}
