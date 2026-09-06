import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { PetHabitatHandle } from '../habitat/PetHabitat';
import { fetchParkMessages } from './api';
import { onSignOut } from '../../lib/teardown';
import { forgetPark, rememberPark } from './parkMemory';
import { tintFor } from './tints';
import {
  askSocial,
  emitSocial,
  isRefusal,
  onSocial,
  onSocialReconnect,
  onSocialStatus,
  socialStatus,
} from './socket';
import type {
  InteractionKind,
  ParkAdmission,
  ParkMember,
  ParkMessage,
  ParkRoster,
  ParkSummary,
  PetTransform,
  SocialStatus,
} from './socket';

/**
 * Being in a park.
 *
 * The one place in the product where the client is a *participant* in something
 * rather than the owner of it, and the whole hook is arranged around what that
 * implies:
 *
 * ```text
 *   the server decides    who is here, who may speak, whether an interaction
 *                         happened. This hook asks and then renders the answer
 *   the scene draws       creatures, positions, clips. Handed to it imperatively
 *                         (`PetHabitat`'s handle) because a position stream at
 *                         10 Hz per creature is not React's business
 *   React holds           the member list and the chat — the two things a person
 *                         reads rather than watches
 * ```
 *
 * ## Who is here comes from the database, every time
 *
 * There is one input to the member list and it is `park:roster`: the whole
 * membership, read from Postgres, broadcast to everybody in the park on every
 * arrival, every departure and every heartbeat, and available on request.
 *
 * It replaced a pair of "somebody arrived" / "somebody left" events, and the
 * reason is the bug they caused. An arrival announced into a Socket.IO room
 * only reaches the sockets that have already joined that room; two people
 * entering a park at the same moment join it in an order nobody controls; so
 * each could miss the other's announcement and stand on the same lawn holding
 * different ideas of who was on it. It looked like a rendering fault and was
 * not one.
 *
 * A whole roster has no such failure mode. Missing one costs nothing because
 * the next is equally complete, applying a duplicate costs nothing because
 * `applyRoster` is idempotent, and there is no accumulated state for a dropped
 * packet to corrupt. The list is not patched; it is *replaced*, and the scene
 * is reconciled to it.
 *
 * ## What is not here
 *
 * Any decision. There is no local capacity check, no local proximity check that
 * gates the request, no client-side membership set that a message is validated
 * against. Every one of those exists on the server, and a copy here would be a
 * second answer that is wrong the moment the two disagree — which, in a shared
 * space, is the moment two people do something at once.
 *
 * The one place this hook *does* look at a distance is to grey out the
 * interaction buttons for a creature that is too far away, and that is a
 * courtesy rather than a rule: the server checks it again against its own
 * positions, and pressing the button anyway simply gets a no.
 *
 * ## Reconnection, and refreshing
 *
 * A dropped socket is a client that is no longer in the park as far as the
 * server is concerned, and its own membership row is on a heartbeat that has
 * stopped. So a reconnect **re-joins** — the same call, the same passcode — and
 * then re-reads the chat, because everything said in between was missed. It
 * does not resume; there is nothing to resume.
 *
 * A page reload is the same thing with a longer gap, and it is handled by the
 * same path: the park id is remembered for the tab (`parkMemory.ts`) and the
 * rejoin needs no passcode, because the participant row that outlived the
 * socket is what admits it.
 */

export type ParkPhase = 'joining' | 'in' | 'refused' | 'left';

export interface ParkSession {
  phase: ParkPhase;
  park: ParkSummary | null;
  members: ParkMember[];
  messages: ParkMessage[];
  /** Set when the phase is `refused` — the reason, in the server's words. */
  refusal: string | null;
  status: SocialStatus;
  /** The visitor the user has tapped in the room, if any. */
  selected: string | null;
  select: (userId: string | null) => void;
  say: (body: string) => Promise<boolean>;
  interact: (targetUserId: string, kind: InteractionKind) => Promise<boolean>;
  /**
   * Put somebody out of this park. The host's, and refused for anybody else.
   *
   * Resolves to a message when the server said no, and to null when it worked.
   * The member list is not touched here: the removal is broadcast as a roster
   * like every other change to who is in a park, so the list repairs itself
   * from the server's answer rather than from an optimistic guess that would
   * have to be reconciled with it.
   */
  remove: (userId: string) => Promise<string | null>;
  leave: () => void;
}

interface UseParkOptions {
  parkId: string;
  passcode?: string;
  /** The signed-in user, so their own creature is never added as a visitor. */
  selfId: string;
  habitat: RefObject<PetHabitatHandle | null>;
  /** Called once the user is out, for whatever reason. */
  onLeft?: () => void;
}

/** How many lines of chat are kept in memory. The rest are a request away. */
const CHAT_WINDOW = 120;

export function usePark(options: UseParkOptions): ParkSession {
  const { parkId, passcode, selfId, habitat, onLeft } = options;

  const [phase, setPhase] = useState<ParkPhase>('joining');
  const [park, setPark] = useState<ParkSummary | null>(null);
  const [members, setMembers] = useState<ParkMember[]>([]);
  const [messages, setMessages] = useState<ParkMessage[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [status, setStatus] = useState<SocialStatus>(socialStatus());
  const [selected, setSelected] = useState<string | null>(null);

  const alive = useRef(true);
  const onLeftRef = useRef(onLeft);
  useEffect(() => {
    onLeftRef.current = onLeft;
  }, [onLeft]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => onSocialStatus(setStatus), []);

  /**
   * Whose creature is currently standing in the scene.
   *
   * A ref rather than state, because it is not something anything renders: it
   * is this hook's record of what it has already told PixiJS, and the only
   * question it answers is "does this member need adding, and does this
   * creature need taking away". Keeping it in state would re-render the panel
   * every time the roster arrived unchanged, which is every twenty seconds.
   */
  const shown = useRef<Set<string>>(new Set());

  /**
   * Make the lawn match the roster.
   *
   * Idempotent by construction, and that is the property the whole membership
   * design rests on: the same roster applied twice does nothing the second
   * time, and a roster applied after three were missed produces the correct
   * lawn rather than a partially-repaired one.
   *
   * `addVisitor` is called **only for members not already standing there**.
   * It is idempotent on the scene's side too, but not free — it rebuilds the
   * creature's rig — and the server sends a roster every heartbeat, so calling
   * it unconditionally would rebuild every rig in the park three times a
   * minute.
   *
   * A member with no creature is skipped rather than given a default one: an
   * account that has not been to the creator has not decided who they are, and
   * inventing a blob for them would be the product answering on their behalf.
   * They stay in the list — they are in the park — they simply have nothing to
   * draw.
   */
  const applyRoster = useCallback(
    (roster: { members: ParkMember[]; positions?: (PetTransform & { userId: string })[] }) => {
      setMembers(roster.members);

      const here = new Set<string>();

      for (const member of roster.members) {
        if (member.userId === selfId || !member.pet) continue;
        here.add(member.userId);

        if (shown.current.has(member.userId)) continue;

        habitat.current?.addVisitor({
          userId: member.userId,
          username: member.username,
          petName: member.pet.name,
          // The appearance comes from the *server* — it read it from that
          // user's own `Pet` row — and is normalized here through the same
          // function the local creature goes through, so a rig saved before a
          // part existed draws as a creature rather than failing.
          appearance: createPetAppearance(member.pet.appearanceData as never),
          tint: tintFor(member.userId),
        });

        shown.current.add(member.userId);
      }

      // Anybody the scene is still holding who is no longer in the park. This
      // is the half a "somebody left" event used to do, and it now also covers
      // the departures nothing ever announced — a participant swept for a dead
      // heartbeat leaves no event behind, only a shorter roster.
      for (const userId of [...shown.current]) {
        if (here.has(userId)) continue;
        habitat.current?.removeVisitor(userId);
        shown.current.delete(userId);
      }

      // Where everybody is, so a creature that has just been added stands where
      // its owner left it rather than at the origin until they next move.
      for (const position of roster.positions ?? []) {
        if (position.userId === selfId) continue;
        habitat.current?.moveVisitor(position.userId, position);
      }

      setSelected((current) => (current && !here.has(current) ? null : current));
    },
    // `habitat` is deliberately absent: it is a ref object, its identity never
    // changes, and listing it makes the React Compiler refuse to optimize the
    // component ("the inferred dependency was habitat.current"). The same
    // disable the dashboard uses for the same class of dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selfId],
  );

  /**
   * Walk in.
   *
   * Also the reconnect path and the after-a-refresh path, unchanged: a
   * reconnected socket is in no park, so getting back in is the same request
   * with the same arguments. Nothing is cleared first — the admission reply is
   * a roster, and reconciling to it leaves the creatures that are still there
   * standing where they are instead of flickering out and back in.
   */
  const join = useCallback(async () => {
    setPhase('joining');

    const reply = await askSocial<ParkAdmission>('park:join', {
      parkId,
      passcode: passcode ?? null,
    });

    if (!alive.current) return;

    if (isRefusal(reply)) {
      setRefusal(reply.message);
      setPhase('refused');
      // Not somewhere to come back to on the next reload.
      forgetPark();
      return;
    }

    setPark(reply.park);
    applyRoster(reply);
    setRefusal(null);
    setPhase('in');
    rememberPark(parkId);

    // What was said before we arrived, or while we were away. A request, not a
    // replay: the socket never carried this and the rows are the truth.
    try {
      const history = await fetchParkMessages(parkId);
      if (alive.current) setMessages(history);
    } catch {
      // A park you can be in but whose backlog would not load is still a park
      // you are in. The live messages will arrive regardless.
    }
  }, [parkId, passcode, applyRoster]);

  /*
   * Join once there is a socket to join over.
   *
   * Gated on the status rather than fired on mount, and it is load-bearing
   * rather than tidy: `askSocial` refuses immediately when the socket is not
   * yet connected, so a park entered in the same beat the connection was opened
   * — which is every park entered on a page that has just loaded — would be
   * answered "you are not connected" and shown as a refusal that retrying
   * nothing would fix.
   */
  useEffect(() => {
    if (status !== 'connected') return;

    // Wrapped rather than called directly, matching `useGoals` and
    // `useRoomStyle`: an effect body must not set state synchronously, and this
    // one's first act is to say it is joining.
    void (async () => {
      await join();
    })();
    // Leaving is handled by the unmount effect below, not here: this effect
    // re-runs whenever `join` changes identity, and leaving in its cleanup
    // would walk the user out of the park they just re-entered.
  }, [join, status]);

  // A reconnected socket is a new socket in no park. Get back in.
  useEffect(() => onSocialReconnect(() => void join()), [join]);

  /*
   * Ask again when the tab comes back.
   *
   * A backgrounded tab has its timers throttled and its frames stopped, and it
   * can come back to a park that has changed completely. The server's heartbeat
   * roster would repair it within twenty seconds; asking on the way back in
   * makes it immediate, for one request at a moment the user is definitely
   * looking.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;

      void (async () => {
        const reply = await askSocial<{ ok: true } & ParkRoster>('park:roster');
        if (!alive.current || isRefusal(reply) || reply.parkId !== parkId) return;
        setPark(reply.park);
        applyRoster(reply);
      })();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [parkId, applyRoster]);

  // --- What the server says -------------------------------------------------
  useEffect(() => {
    const stops = [
      /*
       * Who is here. The only thing that changes the member list.
       *
       * Arrives on every arrival, every departure and every heartbeat, and is
       * applied wholesale — see `applyRoster` for why this is a replacement
       * rather than a patch.
       */
      onSocial('park:roster', (roster) => {
        if (roster.parkId !== parkId) return;
        setPark(roster.park);
        applyRoster(roster);
      }),

      /*
       * The position stream.
       *
       * Straight to the scene, never into React state. Six creatures at 10 Hz
       * is sixty events a second; routing those through `setState` would be
       * sixty renders a second of a component tree that is drawing none of it —
       * PixiJS is.
       */
      onSocial('park:moved', (transform) => {
        if (transform.userId === selfId) return;
        habitat.current?.moveVisitor(transform.userId, transform as PetTransform);
      }),

      onSocial('park:interaction', (event) => {
        if (event.parkId !== parkId) return;

        // `null` means "the local creature" to the scene, which is how one call
        // plays both halves whichever side of it we are on.
        habitat.current?.playInteraction(
          event.fromUserId === selfId ? null : event.fromUserId,
          event.toUserId === selfId ? null : event.toUserId,
          event.kind,
          event.durationMs,
        );
      }),

      onSocial('park:message', (message) => {
        if (message.parkId !== parkId) return;
        setMessages((current) => [...current, message].slice(-CHAT_WINDOW));
      }),

      /*
       * The host removed us.
       *
       * Handled as a refusal rather than as a departure, and the distinction is
       * the whole of what the user sees: `left` is a thing you did and needs no
       * explanation, `refused` carries a reason and is already wired to put the
       * person back in front of the park list with it shown (`ParkStage`'s
       * `onRefused`). Being removed is much more like being turned away at the
       * gate than like walking out of it.
       *
       * The park is forgotten too, so a reload does not try to walk back into
       * somewhere we have just been asked to leave.
       */
      onSocial('park:removed', (event) => {
        if (event.parkId !== parkId) return;

        habitat.current?.clearVisitors();
        shown.current.clear();
        forgetPark();
        setRefusal(event.message);
        setPhase('refused');
      }),
    ];

    return () => {
      for (const stop of stops) stop();
    };
  }, [parkId, selfId, applyRoster, habitat]);

  const remove = useCallback(async (userId: string): Promise<string | null> => {
    const reply = await askSocial<{ ok: true; removed: boolean }>('park:kick', { userId });
    return isRefusal(reply) ? reply.message : null;
  }, []);

  // --- Leaving --------------------------------------------------------------
  const leave = useCallback(() => {
    void askSocial('park:leave');
    habitat.current?.clearVisitors();
    shown.current.clear();
    forgetPark();
    setPhase('left');
    onLeftRef.current?.();
    // `habitat` omitted for the reason given on `applyRoster`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * The unmount.
   *
   * Tells the server on the way out — which is a courtesy rather than the
   * mechanism, and it matters that it is only a courtesy: a closed tab sends
   * nothing at all, and the heartbeat plus the sweeper are what actually empty
   * the seat (`ParkParticipant.lastSeenAt`). This just makes the common case
   * instant instead of taking a minute.
   *
   * Deliberately not `leave()`: this runs on unmount, and calling `onLeft` from
   * here would fire a navigation callback into a component that is going away.
   *
   * Deliberately does **not** forget the remembered park either. An unmount is
   * also what a page reload looks like from in here, and forgetting on the way
   * out would defeat the one thing `parkMemory` exists for. Leaving on purpose
   * forgets, above; being closed does not.
   */
  useEffect(() => {
    return () => {
      emitSocial('park:leave');
    };
  }, []);

  /*
   * Signing out is leaving the park, and it is the one exit that has to be
   * taken *deliberately*.
   *
   * An unmount is ambiguous — it is also what a reload looks like — so the
   * effect above only says goodbye to the server and keeps the remembered park,
   * on purpose. A sign-out is not ambiguous: the person is going, and what
   * outlives them is somebody else's problem. Two things follow, and both were
   * bugs before this existed:
   *
   *   the park is forgotten, so the next account signed into *this tab* is not
   *   walked onto a lawn it was never invited to. That was the reported one
   *
   *   the seat is given up now rather than when the sweeper next runs, and the
   *   `park:leave` reaches the server because `runSignOutTeardowns` unwinds in
   *   reverse registration order (`lib/teardown.ts`) — this hook registered
   *   after the socket did, so it goes first and the socket is still open
   */
  useEffect(() => {
    return onSignOut(() => {
      emitSocial('park:leave');
      forgetPark();
    });
  }, []);

  const say = useCallback(async (body: string): Promise<boolean> => {
    const text = body.trim();
    if (!text) return false;

    const reply = await askSocial<{ ok: boolean }>('park:say', { body: text });
    // Nothing is added to the list here. The message arrives through
    // `park:message` like everybody else's, carrying its stored id and the
    // server's timestamp — so what the sender sees is the row, not an
    // optimistic copy that would then have to be reconciled with it.
    return !isRefusal(reply) && reply.ok === true;
  }, []);

  const interact = useCallback(
    async (targetUserId: string, kind: InteractionKind): Promise<boolean> => {
      const reply = await askSocial<{ ok: boolean }>('park:interact', {
        targetUserId,
        kind,
      });
      // No local playback on success either: the animation comes back as
      // `park:interaction`, so both creatures start on the same event and
      // everybody in the park sees the same thing at the same moment.
      return !isRefusal(reply) && reply.ok === true;
    },
    [],
  );

  return {
    phase,
    park,
    members,
    messages,
    refusal,
    status,
    selected,
    select: setSelected,
    say,
    interact,
    remove,
    leave,
  };
}
