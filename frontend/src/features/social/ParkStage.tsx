import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  Crown,
  Hand,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  PartyPopper,
  SendHorizonal,
  Sparkles,
  UserMinus,
  Users,
  WifiOff,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs } from '../../components/ui/tabs';
import type { TabItem } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';
import { useStickToBottom } from '../../lib/useStickToBottom';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import { DEFAULT_ROOM_STYLE } from '../../world/RoomStyle';
import type { RoomStyle } from '../../world/RoomStyle';
// Imported here rather than looked up in the environment registry, on purpose:
// this module is inside the lazily-loaded social chunk, so the park's sky,
// treeline, fence and lawn are downloaded by somebody going to a park and by
// nobody else. See `world/environments/index.ts`.
import { park as parkEnvironment } from '../../world/environments/Park';
import { PetHabitat } from '../habitat/PetHabitat';
import type { PetHabitatHandle } from '../habitat/PetHabitat';
import { PetPortrait } from '../pets/PetPortrait';
import type { VisitorHit, VisitorTransform } from '../../scenes/room/Visitors';
import { cssTintFor } from './tints';
import { emitSocial, onSocial } from './socket';
import type { InteractionKind, ParkMember } from './socket';
import type { WorldChrome } from './SocialLayer';
import { usePark } from './usePark';

/**
 * A park, live — in the room's own window.
 *
 * ## Why this is two slots and not one panel
 *
 * The park used to be a small canvas inside a 28rem overlay sitting on top of
 * the page, which meant the product had two worlds: the big one you live in and
 * a postage stamp you visit people in. It also meant two PixiJS applications
 * alive at once, each with its own WebGL context, each resizing — which is what
 * the room "glitching" on the way into a park actually was.
 *
 * So the park does not bring a window with it. It **borrows the one that is
 * already there**: the lawn is rendered through a portal into the dashboard's
 * world column, exactly where the creature's room was a moment ago, and the
 * panel this component returns takes the place of the Goals/Memories/Pet/Room
 * tabs on the right. The dashboard unmounts its own habitat while a place is
 * open, so there is never more than one world on the page.
 *
 * ```text
 *   world column   ← createPortal(the lawn, worldHost)
 *   tools column   ← what this component returns: who is here, and the chat
 * ```
 *
 * ## Two tabs, because they are two jobs
 *
 * The panel used to be one column: a strip of portraits, then whatever the
 * selection was, then the chat and its composer in whatever height was left.
 * That works while the only thing you can do to a person is greet their
 * creature. It stops working the moment the host can *remove* somebody —
 * a destructive control a thumb-width away from a text field is a control
 * somebody will hit on the way to typing, and on a phone the chat was already
 * squeezed to about four lines by the things above it.
 *
 * ```text
 *   People   who is here, whose creature is whose, what yours can do to
 *            theirs, and — for the host — the way to ask somebody to go
 *   Chat     the conversation, and nothing else, at full height
 * ```
 *
 * The chat tab carries an unread dot rather than a count: a number would be a
 * second thing to read on a strip whose whole job is to be glanceable, and the
 * question anybody actually has is "has anyone said anything", not "how many".
 *
 * ## The pets are the interface
 *
 * There is no "wave at user" button anywhere. You **tap a creature on the
 * lawn** — the scene picks it, the same way tapping a chair picks the chair —
 * or tap its portrait in the strip, and the panel becomes about that creature:
 * whose it is, what it is called, and the four things your pet can do to it.
 * Everything a person does here they do to an animal, which is the brief's §11
 * and is most of what stops this reading as a contact list with a background.
 *
 * The creatures also get on with it by themselves. Nothing in this file tells a
 * pet to walk toward another pet: the brain does that, because another creature
 * is the most interesting thing on a lawn (`PetBrain`'s `ANOTHER_CREATURE`), and
 * two animals converging on each other is emergent rather than scripted.
 *
 * ## What travels
 *
 * Out: this creature's position, ten times a second, from the scene itself
 * (`PetRoom.transmit`) — never from React, which does not know where it is.
 * In: everybody else's, straight back into the scene. React never sees a
 * coordinate; it holds the member list and the chat, which are the two things a
 * person reads rather than watches.
 */

interface ParkStageProps {
  parkId: string;
  passcode?: string;
  selfId: string;
  /** The user's own creature — the one that walks in. */
  appearance: PetAppearance;
  petName: string;
  compact: boolean;
  /** How the room is dressed and sized on this screen. See `WorldChrome`. */
  world: WorldChrome;
  /**
   * The dashboard's world column.
   *
   * Null for exactly one render — the callback ref that fills it in runs after
   * the first commit — and the lawn simply is not mounted until it arrives.
   */
  worldHost: HTMLElement | null;
  onLeave: () => void;
  /**
   * The park would not have us.
   *
   * Handed back rather than shown here, and the reason is the world column: by
   * the time this component exists the dashboard has already given its window
   * away, so a refusal rendered in place would leave the page with a panel and
   * no world at all. The layer above puts the user back in front of the list
   * — which is where they can act on the answer — and shows the reason there.
   */
  onRefused: (message: string) => void;
  /**
   * Where to leave the way out, for somebody who is not in this tree.
   *
   * The dashboard's Focus slot has to be able to end an outing it did not
   * start — an hour cannot begin from a park — and "leave" is an *event*, not a
   * state anything can render from. A prop that went true would have to be put
   * back afterwards by whoever set it, after a departure they cannot observe;
   * an effect watching one is a `setState` in an effect, which is the shape
   * React asks you not to write. So the departure is handed *upward* as a
   * function instead, and the caller invokes it from the click that meant it.
   *
   * It is `session.leave` rather than `onLeave`, and the difference is a page
   * reload: leaving on purpose forgets the park, while merely unmounting keeps
   * it so a refresh comes back to the same lawn (`parkMemory.ts`).
   */
  leaveRef?: React.RefObject<(() => void) | null>;
}

/**
 * What the park looks like, for everybody.
 *
 * Fixed rather than taken from the visitor's own room, and that is the point: a
 * shared space has to look the same to the people sharing it, or "meet me by
 * the bench" means something different to each of them. Midday, lights on,
 * nothing hanging on a wall there is not.
 *
 * A module constant, not built per render — `PetHabitat` hands it to a scene
 * built once, and a fresh object every render is the identity trap the
 * Rendering rules warn about.
 */
const PARK_STYLE: RoomStyle = {
  ...DEFAULT_ROOM_STYLE,
  ambience: 'day',
  lightsOn: true,
  decor: [],
  removed: [],
};

/** The two halves of the park panel. See the note at the top of the file. */
type PanelTab = 'people' | 'chat';

/** Nothing about a park is saved by anybody standing in it. */
const NO_WRITE = () => undefined;

/**
 * How close two creatures have to be before the buttons light up.
 *
 * The same number the server enforces, and it is here *only* to grey a button
 * out — the server checks it again against its own positions, so pressing
 * anyway gets a polite no rather than an interaction from across the lawn. A
 * client-side copy of a rule is a courtesy; the rule is the server's.
 */
const INTERACTION_RANGE = 260;

const INTERACTIONS: {
  kind: InteractionKind;
  label: string;
  hint: string;
  icon: typeof Hand;
}[] = [
  { kind: 'greet', label: 'Say hello', hint: 'A bow, and a reply', icon: Hand },
  { kind: 'play', label: 'Play', hint: 'Both of them bounce', icon: PartyPopper },
  { kind: 'nuzzle', label: 'Nuzzle', hint: 'Lean in for a moment', icon: Sparkles },
  { kind: 'copy', label: 'Copy them', hint: 'Do it, then watch them do it', icon: Copy },
];

export function ParkStage({
  parkId,
  passcode,
  selfId,
  appearance,
  petName,
  compact,
  world,
  worldHost,
  onLeave,
  onRefused,
  leaveRef,
}: ParkStageProps) {
  const habitat = useRef<PetHabitatHandle | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * How far apart the two creatures are, right now.
   *
   * State rather than something derived during render, because the positions
   * live in the *scene* and not in React — reading a ref while rendering is a
   * value React has no way to know changed, so it would go stale the moment the
   * creatures moved without anything else re-rendering.
   *
   * Infinity when nothing is selected, which reads correctly everywhere it is
   * compared without a special case.
   */
  const [distance, setDistance] = useState(Number.POSITIVE_INFINITY);

  const session = usePark({ parkId, passcode, selfId, habitat, onLeft: onLeave });

  /**
   * Which half of the panel is showing.
   *
   * People first: arriving somewhere, the question is who is here. The chat is
   * one tap away and says so when it has something to say.
   */
  const [tab, setTab] = useState<PanelTab>('people');


  // Publish the way out, and take it back down on the way out. A stale
  // function left in the ref would be a "leave" that leaves a park nobody is
  // in — harmless, and still a lie about what the button does.
  const leave = session.leave;

  useEffect(() => {
    if (!leaveRef) return;
    leaveRef.current = leave;
    return () => {
      leaveRef.current = null;
    };
  }, [leaveRef, leave]);

  /*
   * The position stream, outbound.
   *
   * A module-stable callback handed to a scene that is built once, which is why
   * it is a `useCallback` with no dependencies rather than an inline arrow: the
   * scene keeps the first function it is given forever, and one that closed over
   * a stale `parkId` would keep broadcasting into a park the user had left.
   * `emitSocial` reads the current socket every call, so there is nothing to
   * close over.
   */
  const transmit = useCallback((transform: VisitorTransform) => {
    emitSocial('park:move', transform);
  }, []);

  const select = session.select;

  const picked = useCallback(
    (hit: VisitorHit | null) => select(hit?.userId ?? null),
    [select],
  );

  /** Ask the scene how far apart they are. Only ever called from an effect. */
  const measure = useCallback((otherId: string | null) => {
    if (!otherId) return Number.POSITIVE_INFINITY;

    const mine = habitat.current?.localPosition();
    const theirs = habitat.current?.visitorPosition(otherId);
    if (!mine || !theirs) return Number.POSITIVE_INFINITY;

    return Math.hypot(mine.x - theirs.x, mine.z - theirs.z);
  }, []);

  /*
   * Re-measure while somebody is selected.
   *
   * Twice a second, and only while there is a selection — the distance decides
   * whether the buttons are live, and creatures wander. A `requestAnimationFrame`
   * loop would re-render this panel sixty times a second to move a word.
   */
  useEffect(() => {
    const selected = session.selected;

    // Always on a timer, including when nothing is selected — `measure` answers
    // Infinity for null, and one interval that always runs is simpler than an
    // effect body that has to set state on its way out.
    const timer = window.setInterval(() => setDistance(measure(selected)), 500);
    return () => window.clearInterval(timer);
  }, [session.selected, measure]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /*
   * Something was said while the chat was not on screen.
   *
   * Set from the socket's own callback rather than by watching the message
   * list, and that is the difference between a subscription and a derivation.
   * Watching the list would mean a `setState` inside an effect — a render, then
   * a second render to correct it — and it could not tell "a message arrived"
   * from "the window slid": the log is capped at `CHAT_WINDOW`, so once it is
   * full every new message leaves its length exactly where it was, and a
   * length-watching version goes quiet precisely when a park is busiest.
   *
   * A second subscription to `park:message` alongside the hook's, on purpose.
   * They are different questions — the hook asks what was said, this asks
   * whether to draw a dot — and the socket's listeners are a set, so the cost
   * of the second one is a function call.
   *
   * Your own message is not unread. It arrives back through the same event as
   * everybody else's (the server echoes the stored row rather than the client
   * appending an optimistic copy — see `usePark.say`), so it has to be excluded
   * by hand or sending a line from the chat tab would light the dot you are
   * looking at.
   */
  const [unread, setUnread] = useState(false);

  /*
   * The visible tab, readable from a callback.
   *
   * Written in an effect and read only inside the socket handler below —
   * never during render, which is what keeps it a legitimate ref rather than
   * state pretending to be one.
   */
  const showing = useRef(tab);
  useEffect(() => {
    showing.current = tab;
  }, [tab]);

  useEffect(
    () =>
      onSocial('park:message', (message) => {
        if (message.parkId !== parkId || message.senderId === selfId) return;
        if (showing.current !== 'chat') setUnread(true);
      }),
    [parkId, selfId],
  );

  /*
   * Turned away at the gate.
   *
   * The park was full, the passcode was wrong, or it closed while the user was
   * deciding. Reported upward rather than drawn here — see `onRefused`.
   */
  const refusal = session.phase === 'refused' ? session.refusal : null;
  const refused = useRef(false);
  useEffect(() => {
    if (session.phase !== 'refused' || refused.current) return;
    refused.current = true;
    onRefused(refusal ?? 'You could not get into that park.');
  }, [session.phase, refusal, onRefused]);

  const selectedMember =
    session.members.find((member) => member.userId === session.selected) ?? null;

  const inRange = distance <= INTERACTION_RANGE;

  /**
   * Whether this is our park.
   *
   * Compared against the park the *server* described, never against anything
   * remembered from having created one — a client that decided locally it was
   * the host would render a button the server refuses, which is a worse
   * interface than no button. `ParksService.kick` re-reads `hostId` from the
   * row regardless; this only decides whether the control is drawn.
   */
  const isHost = session.park?.hostId === selfId;

  /** Who is being asked to leave, pending a confirmation. */
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (member: ParkMember) => {
    setRemoving(null);
    const failure = await session.remove(member.userId);
    setNotice(failure ?? `${member.username} has left the park.`);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    const sent = await session.say(text);
    setSending(false);

    if (sent) setDraft('');
    else setNotice('That did not go through. Try again in a moment.');
  };

  const doInteract = async (kind: InteractionKind) => {
    if (!session.selected) return;

    const done = await session.interact(session.selected, kind);
    if (!done) {
      setNotice(
        inRange
          ? 'Not just yet — give them a moment.'
          : `Too far away. Walk over to ${selectedMember?.pet?.name ?? 'them'} first.`,
      );
    }
  };

  /*
   * The lawn, in the dashboard's own window.
   *
   * The same habitat the dashboard mounts, built on the park environment
   * instead of the farmhouse — one prop, because a park is an
   * `EnvironmentDefinition` and the scene already knew how to run one.
   */
  const lawn =
    worldHost &&
    createPortal(
      <PetHabitat
        ref={habitat}
        appearance={appearance}
        petName={petName}
        placements={EMPTY_PLACEMENTS}
        roomStyle={PARK_STYLE}
        onRoomStyleChange={NO_WRITE}
        environment={parkEnvironment}
        onTransform={transmit}
        onVisitorPicked={picked}
        compact={compact}
        {...world}
      />,
      worldHost,
    );

  const others = session.members.filter((member) => member.userId !== selfId);

  const tabs: TabItem<PanelTab>[] = [
    { value: 'people', label: 'Guests', count: others.length, icon: Users },
    { value: 'chat', label: 'Chat', icon: MessageCircle },
  ];


  return (
    <>
      {lawn}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* --- Where you are ---------------------------------------------- */}
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 truncate text-base font-semibold tracking-tight">
              {session.park?.isPrivate && (
                <Lock aria-label="Private" className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {session.park?.name ?? 'A park'}
            </h3>

            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {session.phase === 'joining' ? (
                <>
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  Finding a gap in the fence…
                </>
              ) : (
                <>
                  <Users aria-hidden className="size-3.5" />
                  {session.members.length} of {session.park?.capacity ?? '?'}
                </>
              )}

              {session.status === 'offline' && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <WifiOff aria-hidden className="size-3.5" />
                  reconnecting
                </span>
              )}
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={session.leave}
            className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          >
            <LogOut aria-hidden className="size-3.5" />
            Leave
          </Button>
        </header>

        {notice && (
          <p
            role="status"
            className="animate-rise shrink-0 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent"
          >
            {notice}
          </p>
        )}

        <div className="relative shrink-0">
          <Tabs
            items={tabs}
            value={tab}
            onValueChange={(next) => {
              setTab(next);
              // Looking at the chat is the only thing that honestly clears the
              // dot, so it is cleared here and nowhere else.
              if (next === 'chat') setUnread(false);
            }}
            dense={compact}
          />
          {unread && (
            <span
              aria-hidden
              className="absolute top-1 right-2 size-2 rounded-full bg-primary"
            />
          )}
        </div>

        {/* --- Who is on the lawn ----------------------------------------- */}
        {tab === 'people' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {others.length === 0 ? (
              <p className="shrink-0 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                Just {petName} so far. Somebody may wander in.
              </p>
            ) : (
              <ul className="shrink-0 space-y-1.5">
                {others.map((member) => (
                  <li key={member.userId}>
                    <GuestRow
                      member={member}
                      selected={session.selected === member.userId}
                      isHost={member.userId === session.park?.hostId}
                      /*
                        The control is drawn for the host and for nobody else,
                        and it is drawn *here* rather than inside the selection
                        panel below on purpose: removing somebody is a thing you
                        do to a person in a list, not a thing you do to a
                        creature you have tapped, and putting it beside the four
                        friendly interactions would make it the fifth one.
                      */
                      onRemove={isHost ? () => setRemoving(member.userId) : undefined}
                      onClick={() =>
                        select(session.selected === member.userId ? null : member.userId)
                      }
                    />
                  </li>
                ))}
              </ul>
            )}

            {/* --- The creature you tapped, and what yours can do about it -- */}
            {selectedMember && (
              <section className="animate-rise shrink-0 space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {selectedMember.pet?.name ?? selectedMember.username}
                    <span className="text-muted-foreground"> · {selectedMember.username}</span>
                  </p>

                  <button
                    type="button"
                    onClick={() => select(null)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>

                <p className={cn('text-xs', inRange ? 'text-accent' : 'text-muted-foreground')}>
                  {inRange
                    ? `${petName} is close enough`
                    : `${petName} is too far away — walk over`}
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  {INTERACTIONS.map((interaction) => (
                    <Button
                      key={interaction.kind}
                      size="sm"
                      variant="secondary"
                      disabled={!inRange}
                      title={interaction.hint}
                      className="h-9 justify-start gap-1.5 px-2.5 text-xs"
                      onClick={() => void doInteract(interaction.kind)}
                    >
                      <interaction.icon aria-hidden className="size-3.5 shrink-0" />
                      {interaction.label}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            {!selectedMember && others.length > 0 && (
              <p className="shrink-0 rounded-xl border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
                Tap a creature — on the lawn or above — to say hello to it.
              </p>
            )}

            {isHost && others.length > 0 && (
              <p className="shrink-0 text-[0.65rem] text-muted-foreground">
                <Crown aria-hidden className="mr-1 inline size-3 align-[-1px]" />
                This is your park — you can ask anybody here to leave.
              </p>
            )}
          </div>
        )}

        {/* --- What is being said ----------------------------------------- */}
        {tab === 'chat' && (
          <>
            <ChatLog messages={session.messages} selfId={selfId} />

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
                placeholder="Say something…"
                name="message"
                autoComplete="off"
                enterKeyHint="send"
                maxLength={400}
                disabled={session.phase !== 'in'}
                aria-label="Say something in the park"
              />
              <Button
                type="submit"
                size="sm"
                className="shrink-0 px-3"
                aria-label="Send"
                disabled={sending || !draft.trim() || session.phase !== 'in'}
              >
                <SendHorizonal aria-hidden className="size-4" />
              </Button>
            </form>
          </>
        )}

        {/* --- Asking somebody to go -------------------------------------- */}
        {removing && (
          <RemoveDialog
            member={others.find((member) => member.userId === removing) ?? null}
            onCancel={() => setRemoving(null)}
            onConfirm={(member) => void remove(member)}
          />
        )}
      </div>
    </>
  );
}

/**
 * One person in the park, as a row.
 *
 * It was a chip in a horizontally scrolling strip, which was the right shape
 * when this shared a column with a chat log that wanted every pixel. It is a
 * row now because the guests have a tab of their own: there is height to
 * spend, a row can carry a name that is not truncated to eight characters, and
 * — the reason the change was needed at all — it has somewhere to put a Remove
 * control that is not on top of something else.
 *
 * The tint ring stays and is the whole point of the portrait: it is the same
 * colour as the ring drawn under that creature's feet on the lawn
 * (`tints.ts`), so matching a name to an animal is a glance rather than a
 * puzzle.
 */
function GuestRow({
  member,
  selected,
  isHost,
  onRemove,
  onClick,
}: {
  member: ParkMember;
  selected: boolean;
  /** Whether *this* member is the park's host. Not whether the viewer is. */
  isHost: boolean;
  /** Present only for the host, and never for their own row. */
  onRemove?: () => void;
  onClick: () => void;
}) {
  /*
   * Normalized once per member rather than on every render.
   *
   * `PetPortrait` keys its cache on the object it is handed and
   * `createPetAppearance` returns a new one every call — so without this, every
   * re-render of this panel (a keystroke in the chat box, a roster beat) would
   * miss the cache and redraw every creature in the park.
   */
  const appearance = useMemo(
    () => (member.pet ? createPetAppearance(member.pet.appearanceData as never) : null),
    [member.pet],
  );

  return (
    /*
     * A row of two controls, not a button containing a button.
     *
     * Nesting an interactive element inside another is invalid HTML and the
     * browser's recovery from it is to move one out, which is how a Remove
     * button ends up somewhere nobody put it. The div carries the styling; the
     * two buttons inside it carry the behaviour.
     */
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border p-1.5 pr-2 transition-colors',
        selected ? 'border-primary/60 bg-primary/10' : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          'press flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {/*
          The tint as a ring, drawn with `box-shadow` rather than a border so it
          costs no layout and cannot change the portrait's size by two pixels.
        */}
        <span
          className="shrink-0 rounded-lg"
          style={{ boxShadow: `0 0 0 2px ${cssTintFor(member.userId)}` }}
        >
          {appearance ? (
            <PetPortrait appearance={appearance} size={36} alt={`${member.username}'s creature`} />
          ) : (
            <span aria-hidden className="grid size-9 place-items-center text-muted-foreground">
              ·
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate text-sm leading-tight font-medium">
            {member.pet?.name ?? member.username}
            {isHost && (
              <Crown
                aria-label="Host"
                className="size-3 shrink-0 text-muted-foreground"
              />
            )}
          </span>
          <span className="block truncate text-[0.65rem] leading-tight text-muted-foreground">
            {member.username}
          </span>
        </span>
      </button>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${member.username} from the park`}
          title={`Remove ${member.username}`}
          className={cn(
            'press grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground',
            'transition-colors hover:bg-destructive/10 hover:text-destructive',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          <UserMinus aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Are you sure?
 *
 * Asked, because this is the one thing in the park that happens *to* somebody
 * else and cannot be undone from here — they are put out mid-conversation, and
 * the only apology available is not doing it by accident. One tap to ask, one
 * to confirm.
 *
 * Rendered in the panel's own flow rather than as a modal over the page: the
 * lawn is in the other column and the person being talked about is standing on
 * it, so covering the window would hide the thing the decision is about.
 */
function RemoveDialog({
  member,
  onCancel,
  onConfirm,
}: {
  member: ParkMember | null;
  onCancel: () => void;
  onConfirm: (member: ParkMember) => void;
}) {
  // Gone already — the roster arrived while the question was on screen.
  if (!member) return null;

  return (
    <div
      role="alertdialog"
      aria-label={`Remove ${member.username}?`}
      className="animate-rise shrink-0 space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
    >
      <p className="text-xs text-foreground">
        Remove <span className="font-medium">{member.username}</span> from your park? They
        can join again if the park is public.
      </p>

      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 flex-1 text-xs"
          onClick={onCancel}
        >
          Keep them
        </Button>
        <Button
          size="sm"
          className="h-8 flex-1 bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90"
          onClick={() => onConfirm(member)}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

/**
 * The conversation, newest at the bottom, scrolled to it.
 *
 * Its own component so the scroll effect depends on the messages and nothing
 * else — inside `ParkStage` it would re-run on every position tick, and a chat
 * log that jumps to the bottom twice a second is a chat log nobody can read the
 * top of.
 *
 * `flex-1` rather than a fixed height, because this now lives in a full-height
 * column instead of a scrolling overlay: the chat takes whatever the roster and
 * the selection have not, which on a quiet park is most of the screen.
 */
function ChatLog({
  messages,
  selfId,
}: {
  messages: { id: string; senderId: string; senderUsername: string; body: string }[];
  selfId: string;
}) {
  const scroller = useStickToBottom<HTMLDivElement>(messages);

  return (
    <div
      ref={scroller}
      className={cn(
        'relative min-h-24 flex-1 space-y-1.5 overflow-y-auto rounded-xl border border-border',
        'bg-card/60 p-2.5',
      )}
    >
      {messages.length === 0 ? (
        /*
          Centred in the box rather than pinned to the top of it.

          The log takes whatever height the roster has not, which on a quiet
          park is most of the column — so a line of grey text sitting at the top
          of three hundred empty points read as a list that had failed to load
          rather than as a conversation nobody has started. `absolute inset-0`
          rather than a height on the paragraph, so the moment a message arrives
          this contributes nothing to the scroll the log sticks to the bottom of.
        */
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Nothing said yet.
            <span className="mt-0.5 block text-[0.65rem] text-muted-foreground/70">
              Say hello — everyone on the lawn will see it.
            </span>
          </p>
        </div>
      ) : (
        messages.map((message) => (
          <p key={message.id} className="text-xs leading-relaxed">
            <span
              className={cn(
                'font-medium',
                message.senderId === selfId ? 'text-primary' : 'text-foreground',
              )}
              style={
                message.senderId === selfId
                  ? undefined
                  : { color: cssTintFor(message.senderId) }
              }
            >
              {message.senderUsername}
            </span>
            <span className="text-muted-foreground"> · </span>
            <span className="text-foreground/90">{message.body}</span>
          </p>
        ))
      )}
    </div>
  );
}

/**
 * A park has no furniture of its own beyond what the environment places.
 *
 * A module constant rather than `[]` inline: `PetHabitat` diffs this against
 * the previous render to decide what to add and remove, and a fresh array every
 * render is a diff every render.
 */
const EMPTY_PLACEMENTS: never[] = [];
