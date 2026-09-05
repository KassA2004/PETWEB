import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, BookHeart, Home, PawPrint, Sparkles, Target, Users } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import type { TabItem } from '../../components/ui/tabs';
import { UserBadge } from '../auth/UserBadge';
import { ShopButton } from '../shop/ShopButton';
import { AffectionMeter } from '../focus/AffectionMeter';
import { useFocus } from '../focus/useFocus';
import { CelebrationDialog } from '../goals/CelebrationDialog';
import { GoalCompletionDialog } from '../goals/GoalCompletionDialog';
import { GoalsPanel } from '../goals/GoalsPanel';
import { useGoals } from '../goals/useGoals';
import type { CompletionMemory, Goal as GoalRecord } from '../goals/api';
import { PetHabitat } from '../habitat/PetHabitat';
import type { PetHabitatHandle, Placement } from '../habitat/PetHabitat';
import { RoomStylePanel } from '../habitat/RoomStylePanel';
import { useRoomObjects } from '../habitat/useRoomObjects';
import { useRoomStyle } from '../habitat/useRoomStyle';
import type { PlacedObject } from '../habitat/api';
import { PetLibraryPanel } from '../pets/PetLibraryPanel';
import { usePetLibrary } from '../pets/usePetLibrary';
import { useProgress } from '../progress/useProgress';
import { Customizer } from '../customization/Customizer';
import { prefetchPanels } from './prefetch';
import type { PrefetchHandle } from './prefetch';
import type { PreviewRoom } from '../habitat/objectPreviews';
import { useWorldProgress } from '../habitat/useWorldProgress';
import { WorldLoader } from '../habitat/WorldLoader';
import { useDelayedVisible } from '../../lib/useDelayedVisible';
import { OBJECT_TYPES } from '../../assets/objects/ObjectRenderer';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { audio } from '../../lib/audio';
import { useViewport } from '../../lib/useViewport';
import { cn } from '../../lib/utils';
import type { SocialPlace } from '../social/SocialLayer';
/*
 * The one thing about the social layer the entry bundle is allowed to know.
 *
 * `parkMemory` has no imports at all — it is three `sessionStorage` calls — so
 * pulling it in here costs the bundle nothing and buys the thing a refresh
 * needs: the dashboard has to know, before it renders, whether this tab was
 * standing in a park, because that decides whether the social chunk is fetched
 * at all. Asking the chunk would mean loading the chunk to find out whether to
 * load the chunk.
 */
import { rememberedPark } from '../social/parkMemory';

/** The book of memories — a secondary tab, not on the load path. */
const MemoriesPanel = lazy(() =>
  import('../memories/MemoriesPanel').then((m) => ({ default: m.MemoriesPanel })),
);

/**
 * Other people, and everything that talks to them.
 *
 * The third code-split boundary inside the dashboard, and the one that most
 * earns it: this chunk carries `socket.io-client`, the park view and the whole
 * social surface, none of which a visitor who never presses the button
 * downloads — and, more to the point, none of which opens a WebSocket until
 * they do.
 *
 * Deliberately **not** in `prefetch.ts` beside the customizer and the memory
 * book. Those two are prefetched because the dashboard's own tabs lead to them
 * and most people open one; the social layer is a place somebody chooses to go,
 * and spending a signed-in visitor's bandwidth on a screen they may never open
 * is the kind of quiet regression the Performance Rules are about.
 */
const SocialLayer = lazy(() =>
  import('../social/SocialLayer').then((m) => ({ default: m.SocialLayer })),
);

/**
 * The application shell.
 *
 * The world sits on the left as one framed object and the tools sit on the
 * right, because the creature is something that lives in the page rather than
 * something the page is. Everything shares one appearance object: the
 * customizer writes it, the room panel writes the room, and the habitat renders
 * both.
 *
 * What is saved, and where it lives
 * --------------------------------
 * ```text
 *   the creature      usePetLibrary   → /pets            (explicit, named presets)
 *   the room's look   useRoomStyle    → /environments    (autosaved, debounced)
 *   the furniture     useRoomObjects  → /environments/:id/objects
 *   the goals         useGoals        → /goals
 *   the focus session useFocus        → /focus
 *   the memories      MemoriesPanel   → /memories
 * ```
 *
 * **There is no inventory.** There used to be a tab of things the user owned
 * but could not see, and every one of them was already either furniture (which
 * belongs in the room) or a hat (which belongs on the creature). The Room panel
 * is now the object store and the Pet panel is the wardrobe, so the mock that
 * backed the inventory is gone rather than replaced.
 *
 * **The page does not scroll.** The shell is exactly one viewport tall and the
 * only thing inside it that scrolls is the tools column. The world is a fixed
 * object you look into, and a page that could scroll it out of view would be a
 * page where the main thing can be lost by touching the wheel.
 *
 * Two shapes, not one shape scaled
 * --------------------------------
 * On a small screen the creature goes to the top and stays there, and the
 * tools become a single column beneath it. That is not the desktop layout
 * narrowed: the wall-decor drag is not mounted at all (it needs a pointer and
 * a canvas bigger than a thumb), the hints change to touch ones, and the frame
 * is taller because on a phone the creature *is* the page.
 */

type TabValue = 'goals' | 'memories' | 'pet' | 'room';

/** Objects that start out already in the room, so it is not bare on day one. */
const INITIAL_PLACEMENTS: Placement[] = [];

const OBJECT_TYPE_SET = new Set<string>(OBJECT_TYPES);

/** Whatever the database hands back, only if it is still a thing we can draw. */
function isKnownType(type: string): type is ObjectType {
  return OBJECT_TYPE_SET.has(type);
}

interface DashboardProps {
  /**
   * Who is signed in.
   *
   * Passed down from `AuthGate` rather than read from `useSession` here, and
   * the reason is load-bearing: `useSession` is a subscription that can
   * refetch, and a refetch flips `isPending` in `AuthGate`, which unmounts this
   * component and rebuilds the entire world. See the comment there.
   */
  userId: string;
}

export function Dashboard({ userId }: DashboardProps) {
  // The creature, its saved presets, and which one is selected. Survives a
  // reload and a fresh sign-in, which local state never did.
  const library = usePetLibrary();
  const {
    appearance,
    name: petName,
    updateAppearance,
    setName: setPetName,
  } = library;

  const [placements, setPlacements] = useState<Placement[]>(INITIAL_PLACEMENTS);
  const [tab, setTab] = useState<TabValue>('goals');
  const [celebrate, setCelebrate] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  /** True while the room is being rearranged rather than played with. */
  const [editing, setEditing] = useState(false);
  /**
   * The goal just finished, and what it was worth.
   *
   * Held rather than derived, because the celebration outlives the completion:
   * the dialog it belongs to is still dancing several seconds after the goal
   * list has moved on.
   */
  const [celebration, setCelebration] = useState<{ gained: number } | null>(null);
  /** Bumped when a memory is written, so the book reloads. */
  const [memoryToken, setMemoryToken] = useState(0);
  /** The goal whose completion flow is open, or null. */
  const [completing, setCompleting] = useState<GoalRecord | null>(null);

  /*
   * Other people, as a mode of the same page.
   *
   * Three pieces of state and they are not the same thing:
   *
   * ```text
   *   socialOpened   has the social chunk ever been asked for. Once true it
   *                  stays true, because the socket, the friend list and any
   *                  park the user is standing in must outlive a glance back
   *                  at their goals
   *   mode           which set of options the tools column is showing right
   *                  now. This is the only thing the Home/Friends switch moves
   *   place          somewhere else is on screen — a park, or somebody's room.
   *                  While it is set the world column belongs to the social
   *                  layer and the dashboard does not mount a world of its own,
   *                  so the page never holds two PixiJS applications at once
   * ```
   */
  /*
   * Both start open when the tab was in a park, because a reload is not a
   * departure. The park id outlives the page (`parkMemory.ts`) and the
   * participant row outlives the socket, so the honest thing for a refresh to
   * do is put the user back on the lawn they were standing on — which means
   * fetching the social chunk on load, but only for the one visitor in a
   * hundred who was actually out.
   */
  const [socialOpened, setSocialOpened] = useState(() => rememberedPark() !== null);
  const [mode, setMode] = useState<'home' | 'social'>(() =>
    rememberedPark() !== null ? 'social' : 'home',
  );
  const [place, setPlace] = useState<SocialPlace | null>(null);
  /**
   * The social layer's way out, once it has one.
   *
   * A function handed up rather than a flag pushed down, because leaving is an
   * event: a boolean would have to be put back afterwards by whoever raised it,
   * after a departure it cannot observe. One caller — the Focus slot, which
   * cannot start an hour while the user is standing in a park — and the social
   * layer is the only thing that knows how to leave whichever kind of place is
   * on screen.
   */
  const goHome = useRef<(() => void) | null>(null);
  /** Friend requests waiting, for the badge on the switch. */
  const [attention, setAttention] = useState(0);

  /*
   * The two slots the social layer renders into.
   *
   * Held as state rather than as refs, because a portal needs its host to exist
   * during render and a ref's `.current` changing does not cause one. A
   * callback ref into `useState` is React's own answer for "I need to render
   * against a node I just mounted".
   */
  const [worldHost, setWorldHost] = useState<HTMLDivElement | null>(null);
  const [asideHost, setAsideHost] = useState<HTMLDivElement | null>(null);

  const openSocial = useCallback(() => {
    setSocialOpened(true);
    setMode('social');
  }, []);

  /*
   * Come home.
   *
   * Two halves, and both are needed. The token tells the social layer to
   * actually leave — a park is a membership row and a socket, not a screen you
   * can navigate away from — and the mode switch puts the room back in front of
   * the user, because the reason they are being brought home is that they were
   * trying to start an hour in it.
   */
  const headHome = useCallback(() => {
    goHome.current?.();
    setMode('home');
  }, []);

  /*
   * Which of the three shapes the page is in, and how much of the screen is
   * actually available.
   *
   * `landscape` is a real third case rather than a narrow desktop: a phone on
   * its side is compact by width and has 375 pixels of height, which is less
   * than the room alone needs in the column layout. See `useLayoutMode`.
   */
  const { layout, keyboardOpen } = useViewport();
  const compact = layout !== 'desktop';
  const landscape = layout === 'landscape';

  /**
   * Somebody is typing on a small screen.
   *
   * The rule this turns on is one sentence: **while a keyboard is up, the thing
   * being typed into owns the screen.** A phone with a keyboard has about 300
   * points left, and the page was spending eighty of them on a title, a
   * where-am-I switch and a row of tabs — none of which anybody is looking at
   * while they are writing a message, naming a park or naming their creature.
   *
   * So they go, and they come back the moment the keyboard does. Nothing has to
   * be dismissed and nothing can be got stuck in: the exit is the keyboard's own
   * exit, which is the one control on a phone that everybody already knows.
   */
  const typing = compact && keyboardOpen;

  // The room's appearance is loaded from the server and saved back to it, so
  // the hour, the paint and everything on the walls survive a refresh and a
  // fresh sign-in. Owned here rather than inside the habitat frame, because
  // both the frame (rendering it) and the Room tab (editing it) need it.
  const room = useRoomStyle();
  const goals = useGoals();
  // The one slot, its clock, and how the creature feels about how it has been
  // going. Owned here because a session is a fact about the whole page: it
  // darkens the room, locks the world and takes the tools away.
  const focus = useFocus();
  /**
   * What the user has earned, and therefore what the object catalogue offers.
   *
   * Owned here for the same reason the focus session is: the three events that
   * move it all pass through this component. It is read once on load and then
   * only when one of them happens — a session ended, a goal was finished, a
   * memory was shared or taken back — so there is no polling and no second
   * copy of the numbers anywhere below.
   */
  const rewards = useProgress();
  /*
   * Pulled out so the effects below can depend on it by name.
   *
   * `refresh` is a `useCallback` with no dependencies and therefore stable for
   * the life of the page; naming it here is what lets the exhaustive-deps rule
   * see that, instead of asking for the whole handle in a dependency array and
   * re-running the effect on every progress read.
   */
  const refreshRewards = rewards.refresh;
  /*
   * Pulled out for the same reason `refreshRewards` is.
   *
   * `reload` is a `useCallback` with no dependencies and therefore stable for
   * the life of the page; naming it here is what lets the exhaustive-deps rule
   * see that, instead of asking for the whole goals handle in a dependency
   * array and re-running the effect on every keystroke in the goal field.
   */
  const reloadGoals = goals.reload;
  const habitatRef = useRef<PetHabitatHandle>(null);

  /** True once the room has drawn. Gates background work. */
  const [worldReady, setWorldReady] = useState(false);
  const progress = useWorldProgress();
  const handleWorldReady = useCallback(() => {
    setWorldReady(true);
    progress.complete('world');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reported once, on mount: by the time this component exists, `AuthGate` has
  // a session and this is already rendering.
  useEffect(() => {
    progress.complete('session');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A world that never reports ready must not leave the user staring at a
  // creature on a veil. After eight seconds the overlay goes regardless; if the
  // canvas really did fail, the room behind it shows that honestly.
  //
  // `settled` is included alongside `world`/`data`: it normally completes one
  // `requestAnimationFrame` after `world`, but a hidden/backgrounded tab can
  // have that frame throttled indefinitely by the browser, and without this
  // the loader would sit at 80% forever instead of actually going "regardless".
  useEffect(() => {
    const timer = window.setTimeout(() => {
      progress.complete('world');
      progress.complete('data');
      progress.complete('settled');
    }, 8000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * The overlay obeys the same anti-flash rule as every other loading state.
   *
   * It used to be `{ delay: 0, minVisible: 600 }`, which is a promise that the
   * product can never load quickly: `delay: 0` shows the veil on every load
   * however fast, and `minVisible: 600` then pins it there. Measured against a
   * world that was ready at 123ms, that spent 482ms covering a room that was
   * already drawn, plus the fade — the loading screen *was* the load time.
   *
   * With a real delay, a fast load never shows it at all, which is the correct
   * behaviour for a fast load. A genuinely slow one still gets a settled
   * indicator rather than a flicker.
   */
  const showLoader = useDelayedVisible(progress.loading, { delay: 150, minVisible: 300 });

  /*
   * Background-load the tabs the user is most likely to open next, once the
   * room they are actually looking at has finished. See `prefetch.ts`.
   *
   * How the room is dressed is handed over as a getter rather than a value, and
   * the effect deliberately does not depend on it: a room pass previews floors
   * and walls in whatever colour and hour the room has *now*, but repainting
   * must not tear the whole queue down and start it again from the first hat.
   */
  const dressingRef = useRef<PreviewRoom>({
    tint: room.style.tint,
    ambience: room.style.ambience,
  });
  const prefetch = useRef<PrefetchHandle | null>(null);

  useEffect(() => {
    dressingRef.current = { tint: room.style.tint, ambience: room.style.ambience };
  }, [room.style.tint, room.style.ambience]);

  useEffect(() => {
    if (!worldReady) return;

    const handle = prefetchPanels(() => dressingRef.current);
    prefetch.current = handle;

    return () => {
      prefetch.current = null;
      handle.cancel();
    };
  }, [worldReady]);

  // --- What is standing in the room ----------------------------------------
  // Stable identities, because they are handed to a PixiJS scene that is built
  // once: a new function every render would leave the scene holding a stale
  // one, and the scene is not going to re-read it.
  const snapshotObjects = useCallback(
    () => habitatRef.current?.snapshotObjects() ?? [],
    [],
  );

  /**
   * Put the saved room back.
   *
   * Adds to the placement list rather than talking to the scene, and that is
   * the fix for a race rather than a stylistic preference: the arrangement
   * comes back from the network long before PixiJS has finished initialising,
   * so an imperative call would be handed to a scene that does not exist yet
   * and the room would silently come back empty. `PetHabitat` already queues
   * placements made before the world existed; this uses that queue.
   *
   * Anything whose type the client no longer knows how to draw is skipped
   * rather than failing the whole restore — the same trust boundary
   * `normalizeRoomStyle` applies to the room's appearance, and for the same
   * reason: one retired object type should cost one object, not the room.
   */
  const restoreObjects = useCallback((objects: PlacedObject[]) => {
    setPlacements((current) => {
      const known = new Set(current.map((placement) => placement.id));

      const restored: Placement[] = objects
        .filter((object) => isKnownType(object.type) && !known.has(object.key))
        .map((object) => ({
          id: object.key,
          type: object.type as ObjectType,
          cell: { col: object.col, row: object.row },
          definition: (object.definition ?? {}) as Record<string, number>,
        }));

      return restored.length > 0 ? [...current, ...restored] : current;
    });
  }, []);

  const roomObjects = useRoomObjects({
    environmentId: room.environmentId,
    snapshot: snapshotObjects,
    onLoaded: restoreObjects,
  });

  // The data phase is done once everything the room and its tools need has
  // settled — independent requests, so this is just "are they all in yet".
  useEffect(() => {
    if (library.loading || room.loading || goals.loading || focus.loading || roomObjects.loading) {
      return;
    }
    progress.complete('data');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.loading, room.loading, goals.loading, focus.loading, roomObjects.loading]);

  // --- Goals ---------------------------------------------------------------
  const beginComplete = (goal: GoalRecord) => {
    setCompleting(goal);
    // The creature looks up when something appears over its world.
    habitatRef.current?.react('notice');
  };

  /**
   * Actually finish it.
   *
   * Nothing is celebrated until the server has confirmed the completion. An
   * optimistic party that has to be taken back is worse than a moment's wait,
   * and this is the one place in the product where the user is being told "yes,
   * that counted".
   *
   * The creature reacts in the room *and* in the dialog, which is not a
   * duplicate: the room is where it lives and the dialog is where it is looking
   * at you.
   */
  const confirmComplete = async (memory?: CompletionMemory) => {
    const goal = completing;
    if (!goal) return null;

    const done = await goals.complete(goal.id, memory);
    if (!done) return null;

    setCompleting(null);
    if (done.memory) setMemoryToken((token) => token + 1);

    // The number is the server's — affection gains shrink as the creature warms
    // to you, so only the code that applied it knows what this one was worth.
    setCelebration({ gained: done.affectionGained });

    // And it hears about it, so the affection meter moves too.
    focus.refresh();
    // A goal just landed, and possibly a shared memory with it. Two of the
    // three counters can have moved, so the catalogue is asked again — a tile
    // that unlocked itself while the celebration was on screen is the whole
    // point of the system.
    refreshRewards();

    setCelebrate((count) => count + 1);

    return done;
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // --- The hour ------------------------------------------------------------
  /**
   * The room going quiet.
   *
   * Watches `active` rather than the act of starting one, and that is what
   * makes recovery free: a page loaded into the middle of a session takes this
   * path too, so the lights are already out and the creature already asleep by
   * the time the first frame is drawn. Nothing here is a "focus mode" — the
   * habitat turns the lights off through the same switch the lamp uses, and the
   * creature goes to bed because it is dark (`PetRoom.setFocus`).
   */
  useEffect(() => {
    if (!focus.active) return;
    audio.ui.hush();
    habitatRef.current?.react('settle');
  }, [focus.active]);

  /**
   * How it ended, and what the creature makes of that.
   *
   * Keyed on the token rather than on the kind, because two sessions can end
   * the same way and the second one still happened. The reaction itself is the
   * brain's — `greet` scales with affection, `sulk` is a few seconds of turning
   * away — and neither of them is a cutscene.
   */
  useEffect(() => {
    if (!focus.outcome) return;

    if (focus.outcome.kind === 'completed') {
      audio.ui.restore();
      habitatRef.current?.react('greet');
      // The minutes are banked. This fires for a session that ran out while the
      // laptop was shut too, because `useFocus` reports that one through the
      // same outcome token — which is exactly why the refresh hangs off the
      // token rather than off the button that stops the clock.
      refreshRewards();
      // And the goal it was served against now shows more time on it. Re-read
      // rather than added to in the browser: the total is the server's sum over
      // its own session rows (`GoalView.focusedMinutes`), and a client that
      // incremented its copy would be a second, divergent tally — wrong after a
      // refresh, wrong in a second tab, and wrong about a session that resolved
      // while the app was closed, which is the case this token exists for.
      reloadGoals();
      return;
    }

    // Nothing to re-read for an abandoned session: time not served banks
    // nothing, and the creature turning away is the whole of the feedback.
    habitatRef.current?.react('sulk');
  }, [focus.outcome, refreshRewards, reloadGoals]);

  // The line under the room, derived from the token rather than synchronised to
  // it. React's own answer for state that follows a prop: doing it in an effect
  // paints one frame of the previous message first. Nothing is said about an
  // abandoned session — the creature turning away is the whole of the feedback,
  // and a sentence about it would be the product commenting on an afternoon.
  const outcomeToken = focus.outcome?.token ?? 0;
  const [seenOutcome, setSeenOutcome] = useState(outcomeToken);

  if (outcomeToken !== seenOutcome) {
    setSeenOutcome(outcomeToken);
    setToast(
      focus.outcome?.kind === 'completed'
        ? `That's the time done. ${petName} is up.`
        : null,
    );
  }

  // --- Objects in the room -------------------------------------------------
  /**
   * Put one in the room.
   *
   * A fresh id every time, because the catalog is a catalog rather than a
   * cupboard: asking for a second chair means a second chair, not a refusal
   * that the first one is already out.
   */
  const placeObject = (type: ObjectType) => {
    const id = `object-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setPlacements((current) => [...current, { id, type }]);
  };

  /**
   * Something was dragged out of the frame and put away.
   *
   * The scene has already removed it; this keeps the page's own list honest.
   * Without it the next render would look at `placements`, see an id the scene
   * no longer has, and put the object straight back.
   */
  const forgetObject = useCallback((id: string) => {
    setPlacements((current) => current.filter((placement) => placement.id !== id));
  }, []);

  // --- Layout --------------------------------------------------------------
  /**
   * The tools, and the fact that most of them are gone during a session.
   *
   * Removed rather than disabled. A row of greyed-out tabs is a row of things
   * the user is being told they cannot have, which is a busier interface than
   * the one they were promised — and the promise was that the page would get
   * out of the way for an hour.
   */
  const tabs = useMemo<TabItem<TabValue>[]>(() => {
    if (focus.active) return [{ value: 'goals', label: 'Focus', icon: Target }];

    const always: TabItem<TabValue>[] = [
      { value: 'goals', label: 'Goals', icon: Target, count: goals.open.length },
      { value: 'memories', label: 'Memories', icon: BookHeart },
    ];

    /*
     * The wardrobe and the furniture are about a room that is not on screen.
     *
     * While the user is standing in a park or in somebody else's room, the
     * world column is showing that place — so a Room tab would be a set of
     * controls for something they cannot see, and dragging a lamp into a room
     * that is not there is a control with no feedback at all. Removed rather
     * than disabled, the same way a focus session removes them: a row of greyed
     * tabs is a row of things the user is being told they cannot have.
     *
     * Goals and Memories stay, because neither is about the room.
     */
    if (place) return always;

    return [
      ...always,
      { value: 'pet', label: 'Pet', icon: PawPrint },
      { value: 'room', label: 'Room', icon: Armchair, count: placements.length },
    ];
  }, [focus.active, goals.open.length, placements.length, place]);

  /**
   * Whatever they were looking at, they are looking at the timer now.
   *
   * Derived rather than assigned, which buys two things for one line: a page
   * that loads straight into a session it did not start needs no special case,
   * and when the hour is up the user is put back on the tab they were on rather
   * than somewhere the product chose for them.
   */
  const shownTab: TabValue =
    focus.active || (place && (tab === 'pet' || tab === 'room')) ? 'goals' : tab;

  /*
   * An hour cannot be started from somewhere else.
   *
   * The room going dark is only half of what a session promises; the other half
   * is that nothing reaches you, and a park is a lawn full of other people's
   * creatures with chat arriving in the panel beside it. The Goals panel is
   * still there and still usable from out there — ticking something off in a
   * park is fine — but the one slot is not, and it says so and offers the way
   * home rather than sitting there greyed out.
   *
   * The server refuses the same thing (`FocusService.nowhereElse`), which is
   * what makes this a rule rather than a suggestion: this decides what the slot
   * looks like, and a second tab that got past it still cannot start one.
   */
  const away = useMemo(
    () => (place ? { label: place.label, leave: headHome } : null),
    [place, headHome],
  );

  /*
   * Opening a panel is the strongest signal there is about what to draw next.
   *
   * Until this fires the queue is guessing, and it guesses conservatively —
   * one tile per idle callback, so the room keeps every frame it has. A user
   * standing in the Pet panel is no longer a guess: they are about to press
   * Ears or Face, and the tiles behind those tabs stop being speculative.
   */
  useEffect(() => {
    if (shownTab === 'pet') prefetch.current?.promote('pet');
    if (shownTab === 'room') prefetch.current?.promote('room');
  }, [shownTab]);

  const saveTrouble = room.error ?? roomObjects.error;

  /*
   * How the room is dressed and sized, per shape.
   *
   * One object, spread into every habitat on the page — the dashboard's own and
   * the social layer's park and visits — so a park on a phone is edge-to-edge
   * for the same reason the room is, and nobody has to remember to pass three
   * props in four places.
   *
   * ```text
   *   desktop    a card in the middle of a column. Unchanged
   *   portrait   edge to edge, sized by width, nudged 4% larger
   *   landscape  edge to edge, sized by the box — height is the scarce axis
   * ```
   *
   * **The zoom is small on purpose.** Past about 1.06 the overscale starts
   * eating the wall-decor rail, and a room whose pictures are half off the top
   * of the screen is worse than a room that is 4% smaller. What it spends is
   * the empty plaster above the shelf line, which is the only part of the view
   * nothing is ever placed in.
   */
  const world: { bleed?: boolean; fill?: boolean; zoom?: number } = !compact
    ? {}
    : landscape
      ? { bleed: true, fill: true, zoom: 1.02 }
      : { bleed: true, zoom: 1.04 };

  const habitat = (
    <PetHabitat
      ref={habitatRef}
      appearance={appearance}
      petName={petName}
      placements={placements}
      celebrate={celebrate}
      roomStyle={room.style}
      onRoomStyleChange={room.update}
      onArrangementChange={roomObjects.changed}
      focused={focus.active}
      affection={focus.affection.value}
      editing={editing}
      onObjectRemoved={forgetObject}
      compact={compact}
      {...world}
      /*
       * The room stops drawing while a phone keyboard has it collapsed.
       *
       * Only in the column layout: turned on its side the room keeps the left
       * of the row and stays perfectly visible, keyboard or not. This is the
       * one place in the product that knows the frame has been clipped to
       * nothing, because it is the thing doing the clipping — the habitat
       * inside keeps its own box on purpose, so it cannot find out by measuring
       * itself. See `PetHabitat`'s `shown`.
       */
      shown={!(keyboardOpen && compact && !landscape)}
      onReady={handleWorldReady}
      overlay={
        showLoader ? (
          <WorldLoader
            appearance={appearance}
            progress={progress.value}
            leaving={!progress.loading}
            petName={petName}
          />
        ) : null
      }
    />
  );

  const panels = (
    <>
      {shownTab === 'goals' && (
        <GoalsPanel
          goals={goals}
          focus={focus}
          petName={petName}
          onBeginComplete={beginComplete}
          onDropped={() => habitatRef.current?.react('notice')}
          away={away}
        />
      )}

      {shownTab === 'memories' && (
        <Suspense
          fallback={
            <p className="px-1 py-3 text-sm text-muted-foreground">Opening the book…</p>
          }
        >
          <MemoriesPanel
            refreshToken={memoryToken}
            appearance={appearance}
            onSharedChange={refreshRewards}
          />
        </Suspense>
      )}

      {shownTab === 'pet' && (
        <div className="space-y-4">
          <PetLibraryPanel library={library} />

          {/*
            The relationship, among the things that describe the creature —
            which is where it belongs. It is not a statistic about the user's
            productivity, and putting it beside the goal list would have made it
            one.
          */}
          <section className="rounded-xl border border-border bg-card/60 p-4">
            <AffectionMeter petName={petName} affection={focus.affection} />
          </section>

          <Customizer
            appearance={appearance}
            onChange={updateAppearance}
            petName={petName}
            onPetNameChange={setPetName}
          />
        </div>
      )}

      {shownTab === 'room' && (
        <RoomStylePanel
          style={room.style}
          onChange={room.update}
          error={room.error}
          compact={compact}
          onWallDragStart={(kind) => habitatRef.current?.startWallDrag(kind)}
          onHangWallDecor={(kind) => habitatRef.current?.hangWallDecor(kind) ?? false}
          onPlaceObject={placeObject}
          editing={editing}
          onEditingChange={setEditing}
          progress={rewards.progress}
          progressLoading={rewards.loading}
        />
      )}
    </>
  );


  /*
   * Whether the creature in the room is one other people can be shown.
   *
   * It is not, until it is saved: `usePetLibrary` holds a working copy and Save
   * is what writes the `Pet` row. The park reads that row on the server — a
   * client may not send a rig — so somebody who has never pressed Save would
   * walk into a park invisible. The social panel puts a one-button gate in
   * front of that rather than letting it happen quietly.
   */
  const creatureGate = {
    saved: library.activePetId !== null,
    name: petName,
    busy: library.busy,
    save: () => library.savePreset(petName),
  };

  /*
   * Other people.
   *
   * Mounted from the first time the switch is pressed and never unmounted
   * after, and both halves of that matter. Not before: the connection is opened
   * by this chunk and lives until sign-out, so somebody who never presses the
   * button never opens a WebSocket — and, because the chunk is lazy, never
   * downloads `socket.io-client` either. Not after: a park the user is standing
   * in has to survive them switching back to look at a goal, and unmounting
   * this would walk them out of it.
   *
   * It renders nothing where it sits. Everything it draws goes through a portal
   * into `asideHost` (the tools column) or `worldHost` (the world column). See
   * `SocialLayer`.
   */
  const socialLayer = socialOpened ? (
    <Suspense fallback={null}>
      <SocialLayer
        selfId={userId}
        appearance={appearance}
        petName={petName}
        creature={creatureGate}
        compact={compact}
        typing={typing}
        world={world}
        active={mode === 'social'}
        asideHost={asideHost}
        worldHost={worldHost}
        onPlaceChange={setPlace}
        onAttention={setAttention}
        homeRef={goHome}
      />
    </Suspense>
  ) : null;

  /*
   * The world column's contents.
   *
   * Exactly one world, ever. When the social layer has somewhere on screen the
   * dashboard's own habitat is *unmounted* rather than hidden — a hidden PixiJS
   * application still holds a WebGL context, still ticks, and still resizes
   * itself against a zero-height box, which is precisely the combination that
   * made entering a park look like the room breaking.
   *
   * The host below is always in the tree, because a portal needs its target to
   * exist before the thing being portalled renders.
   */
  const worldColumn = (
    <>
      {!place && habitat}

      {/*
        `empty:hidden`, not `hidden` when `place` is null.

        The difference is one render and it is the whole bug. `place` is
        reported *upward* by the social layer, from an effect, so it arrives a
        render after the stage has already portalled its world in here — which
        meant a park's canvas was created inside a `display: none` box and
        initialised at 0×0. The CSS `:empty` selector stops applying the moment
        React appends the portal's child, in the same commit, so the box has a
        size before anything is drawn into it.

        `PetHabitat` also watches its own host now, so a canvas that starts at
        no size recovers rather than staying wrong. Both: this stops it
        happening, that stops it mattering.
      */}
      <div ref={setWorldHost} className="flex min-h-0 flex-1 flex-col empty:hidden" />
    </>
  );

  /*
   * The tools column's contents, in whichever mode it is in.
   *
   * One strip and one scroller, and the social layer takes them over rather
   * than opening a second set beside them — which is what makes "go and see
   * other people" the same gesture as "open the Room tab" rather than a
   * different kind of thing.
   */
  const toolsColumn = (
    <>
      <div className={cn('flex min-h-0 flex-1 flex-col gap-3', mode !== 'home' && 'hidden')}>
        {/*
          The strip goes while a keyboard is up, for the same reason the header
          does: naming a creature or adding a goal is typing, and forty points
          of tabs is a seventh of what a phone has left to show the field in.
        */}
        {!typing && (
        <Tabs
          items={tabs}
          value={shownTab}
          onValueChange={setTab}
          // Smaller type on a phone, so four labels fit a 375-pixel strip
          // rather than scrolling. `cn` merges this over the strip's own
          // `text-sm`, which is the size the desktop column wants.
          dense={compact}
          className={cn('shrink-0', compact && 'text-xs')}
        />
        )}

        {/* The one scrollable region in this mode. */}
        {/*
          `relative` makes this column a containing block, so an absolutely
          positioned descendant (Tailwind's `sr-only`, a popover, a badge) is clipped
          by this scroller instead of escaping to <html> and growing the page. See
          `controls.tsx` SwatchRow for the bug this prevents recurring.
        */}
        <div className="relative -mr-1 min-h-0 flex-1 overflow-y-auto pr-1 pb-4">{panels}</div>
      </div>

      {/*
        Hidden rather than unmounted, and it has to be: this is a portal target,
        so it must stay in the document for the social layer to keep rendering
        into it while the user is looking at their goals — which is what lets
        them stand in a park and check a goal without leaving the park.
      */}
      <div
        ref={setAsideHost}
        className={cn('flex min-h-0 flex-1 flex-col', mode !== 'social' && 'hidden')}
      />
    </>
  );

  const completionDialog = (
    <>
      <GoalCompletionDialog
        goal={completing}
        onCancel={() => setCompleting(null)}
        onConfirm={confirmComplete}
      />

      <CelebrationDialog
        open={celebration !== null}
        petName={petName}
        appearance={appearance}
        gained={celebration?.gained ?? null}
        onClose={() => setCelebration(null)}
      />
    </>
  );

  /*
   * One viewport, one scrollbar.
   *
   * `h-svh` plus `overflow-hidden` on the shell is the whole rule: the page is
   * exactly as tall as the window and nothing can make it taller, so the world
   * cannot be scrolled out of view by a stray wheel or an over-enthusiastic
   * flick. The single scrollable thing in the product is the tools column, and
   * it is marked as such below.
   *
   * Every ancestor of that column carries `min-h-0`. Without it a flex child
   * refuses to shrink below its content's height, the column grows past the
   * viewport, and `overflow-hidden` at the top simply clips the bottom of it —
   * which looks like the panel is broken rather than like the page is fixed.
   */

  /*
   * --- Phone and tablet: ONE tree, two shapes ------------------------------
   *
   * Portrait and landscape used to be two `return`s, and that was the bug
   * behind two separate reports. React reconciles by position, so two different
   * trees mean **everything under them is unmounted and rebuilt** when the mode
   * changes — the PixiJS world, the social layer with whatever park you were
   * standing in, the half-typed form. It looked exactly like the app crashing
   * and restarting, and on a phone it happened constantly, because an on-screen
   * keyboard shrinks the layout viewport enough to look like a rotation
   * (`useLayoutMode` now refuses to be fooled by that, which is the other half
   * of the fix).
   *
   * So there is one tree, and the two shapes differ only in classes and props:
   *
   * ```text
   *   portrait    body is a column   room band on top (fixed height), tools under
   *   landscape   body is a row      room fills the left, tools are a fixed column
   * ```
   *
   * The header stays at the top in both. In landscape that costs 44 of 375
   * pixels of height, which is worth paying to keep the tree identical — a
   * rotation now re-lays-out the room instead of rebuilding it.
   */
  if (compact) {
    return (
      <div
        className="flex w-full flex-col overflow-hidden"
        style={{ height: 'var(--app-height)' }}
      >
        {/*
          Gone while a keyboard is up. See `typing`.

          Unmounted rather than hidden: a header that is merely invisible is
          still in the tab order, and the first thing a keyboard user would
          reach from a field is a control they cannot see.
        */}
        {!typing && (
          <header
            className={cn(
              'flex shrink-0 items-center justify-between gap-2 px-3 py-2',
              'pt-[max(0.5rem,env(safe-area-inset-top))]',
            )}
          >
          {/*
            Smaller than the desktop wordmark, and the size is load-bearing
            rather than decorative: this row holds the wordmark, the Home /
            Friends switch, the shop and the account on 351 points of a 375-wide
            phone, and at `text-base` the four of them do not fit — the name of
            the product is the thing that gets an ellipsis. Fourteen points is a
            perfectly ordinary size for a wordmark on a phone; "Digital Pet …"
            is not a perfectly ordinary name for anything.
          */}
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Digital Pet World
          </h1>

          <div className="flex shrink-0 items-center gap-1.5">
            {/*
              The way out to other people is taken away for the hour, like every
              other tool: a session is the page getting out of the way, and a
              door to a park in the middle of it is the product interrupting the
              thing it just promised to protect.
            */}
            {!focus.active && (
              <>
                <ModeSwitch
                  value={mode}
                  place={place}
                  attention={attention}
                  onHome={() => setMode('home')}
                  onSocial={openSocial}
                  compact
                />
                <ShopButton compact />
              </>
            )}
            <UserBadge />
            </div>
          </header>
        )}

        <div
          className={cn('flex min-h-0 flex-1', landscape ? 'flex-row' : 'flex-col')}
        >
          {/*
            The room, edge to edge.

            Upright, its height is stated rather than measured — `100vw × 9/16`
            is the same number the habitat's own aspect ratio arrives at, and
            having it here as well is what lets it *animate* to nothing when a
            keyboard opens. On its side, height is the scarce axis, so the room
            takes whatever is left of the row and is measured into it (`fill`).

            The room is never unmounted when it collapses: the habitat inside
            keeps its own box and is clipped by this one, because a PixiJS
            application resized to zero height is a renderer being asked to draw
            nothing, and it does not always come back.
          */}
          <div
            className={cn(
              'relative overflow-hidden bg-card',
              landscape
                ? 'flex min-h-0 min-w-0 flex-1 flex-col'
                : 'shrink-0 shadow-sm shadow-foreground/10',
            )}
            style={
              landscape
                ? undefined
                : {
                    /*
                     * The room gives up exactly what the keyboard takes, frame
                     * by frame, and there is no transition on it at all.
                     *
                     * There used to be: `height: keyboardOpen ? 0 : …` with a
                     * 300ms ease. That is a *second* animation of the same
                     * distance as the system's keyboard animation, started at a
                     * different moment (`keyboardOpen` only flips once the
                     * keyboard is 140px up), on a different clock, with a
                     * different easing — and every frame of it re-laid-out the
                     * tools column growing into the space. Two disagreeing
                     * animations over one layout is what the ~23fps report
                     * actually was.
                     *
                     * `--keyboard-inset` is the keyboard's own position,
                     * published continuously by `useViewport`. Subtracting it
                     * means the collapse is not animated by us at all: it is
                     * *driven* by the thing it is supposed to be following, on
                     * frames the browser is already laying out for. `max()`
                     * floors it at nothing once the keyboard is taller than the
                     * room, which on a phone it always ends up being.
                     *
                     * Containment removes the rest of the bill. The habitat
                     * inside is absolutely positioned and sized from the
                     * viewport, so nothing in here depends on this box's height
                     * — the browser can be told not to re-lay-out or repaint the
                     * subtree while the box shrinks. `size` is deliberately not
                     * included: this element's own height is what is changing.
                     *
                     * And the world inside stops drawing for the duration —
                     * see `shown` on the habitat above — so the frames of this
                     * collapse are not also spending a quarter of themselves
                     * rendering a room nobody can see.
                     */
                    height: 'max(0px, calc(100vw * 9 / 16 - var(--keyboard-inset, 0px)))',
                    contain: 'layout paint',
                  }
            }
            aria-hidden={!landscape && keyboardOpen}
          >
            <div
              className={cn(
                landscape ? 'flex min-h-0 flex-1 flex-col' : 'absolute inset-x-0 top-0',
              )}
            >
              {worldColumn}
            </div>
          </div>

          {/*
            The tools.

            `pb` carries the home indicator, so the last row of a list is not
            under it. When a keyboard is open the shell has already shrunk to the
            visible area, which is what keeps a composer clear of the bottom edge.
          */}
          <div
            className={cn(
              'flex min-h-0 flex-col gap-3 text-xs',
              landscape
                ? 'w-[21rem] shrink-0 border-l border-border p-2.5 pr-[max(0.625rem,env(safe-area-inset-right))]'
                : 'flex-1 px-3 pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]',
            )}
          >
            {toolsColumn}
          </div>
        </div>

        {toast && (
          <p className="animate-rise mx-3 mb-2 inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent">
            <Sparkles aria-hidden className="size-3.5" />
            {toast}
          </p>
        )}

        {saveTrouble && (
          <div className="shrink-0 px-3 pb-2">
            <SaveTrouble message={saveTrouble} />
          </div>
        )}

        {completionDialog}
        {socialLayer}
      </div>
    );
  }

  // --- Desktop: the world beside the tools ---------------------------------
  return (
    <div className="mx-auto flex h-svh max-w-[1500px] flex-col gap-4 overflow-hidden p-4 lg:p-6">
      {/*
        One line, not two.

        Every pixel this bar takes is a pixel off the room, and the room is now
        sized by the height left over — so the strapline sits beside the title
        rather than under it. It is the same words; it is not the same 28px.
      */}
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Digital Pet World</h1>
          <p className="hidden truncate text-xs text-muted-foreground xl:block">
            A small creature lives here. Be nice to it.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {!focus.active && (
            <>
              <ModeSwitch
                value={mode}
                place={place}
                attention={attention}
                onHome={() => setMode('home')}
                onSocial={openSocial}
              />
              <ShopButton />
            </>
          )}
          <UserBadge />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        {/*
          The world column does not scroll and does not need to: the habitat
          fills whatever height is left, and PixiJS resizes its canvas to the
          host rather than to a fixed aspect ratio.
        */}
        {/*
          Messages float over the world rather than sitting under it.

          A reserved strip underneath would cost the room forty pixels of
          height permanently, to be used for a few seconds an hour — and letting
          it appear and disappear in the flow would resize the room every time
          something was saved, which is worse than either.
        */}
        <main className="relative flex min-h-0 flex-col overflow-hidden">
          {worldColumn}

          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center gap-2">
            {toast && (
              <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/95 px-4 py-2 text-sm text-accent-foreground shadow-lg">
                <Sparkles aria-hidden className="size-4" />
                {toast}
              </p>
            )}

            {saveTrouble && <SaveTrouble message={saveTrouble} />}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">{toolsColumn}</aside>
      </div>

      {completionDialog}
      {socialLayer}
    </div>
  );
}

/**
 * Home, or everybody else.
 *
 * One control, two states, and it is the *only* way between the two halves of
 * the product — which is what makes the tools column legible: whichever set of
 * tabs is under it, this says which world they belong to.
 *
 * It replaced a small icon button that opened a sheet. A sheet is a thing you
 * dismiss; this is a place you are, and a segmented switch is what says so. The
 * badge is friend requests waiting, because that is the only social event that
 * is *still there* when you get round to it — a message you have already been
 * shown does not need a number on a button.
 *
 * While the user is standing somewhere — a park, somebody's room — the Friends
 * half says where, quietly, so that going back to Goals never means losing the
 * thread of having gone out.
 */
function ModeSwitch({
  value,
  place,
  attention,
  onHome,
  onSocial,
  compact = false,
}: {
  value: 'home' | 'social';
  place: SocialPlace | null;
  attention: number;
  onHome: () => void;
  onSocial: () => void;
  compact?: boolean;
}) {
  const item = (selected: boolean) =>
    cn(
      'press relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
      'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
      selected
        ? 'bg-card text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <div
      role="group"
      aria-label="Where you are"
      className="flex shrink-0 items-center gap-1 rounded-xl bg-muted/70 p-1"
    >
      <button type="button" onClick={onHome} className={item(value === 'home')}>
        <Home aria-hidden className="size-4" />
        {!compact && 'Home'}
      </button>

      <button
        type="button"
        onClick={onSocial}
        className={item(value === 'social')}
        aria-label={place ? `Friends — you are in ${place.label}` : 'Friends'}
      >
        <Users aria-hidden className="size-4" />
        {!compact && (place ? shorten(place.label) : 'Friends')}

        {/*
          Two marks, never both. The dot says "you are out there right now",
          which is a state; the number says "these are waiting for you", which
          is a queue. Showing both at once on a control this small would make
          neither readable.
        */}
        {place ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-muted"
          />
        ) : (
          attention > 0 && (
            <span
              aria-hidden
              className={cn(
                'absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full',
                'bg-primary px-1 text-[0.6rem] leading-4 text-primary-foreground ring-2 ring-muted',
              )}
            >
              {attention}
            </span>
          )
        )}
      </button>
    </div>
  );
}

/** Keep the switch one line wide whatever a park has been called. */
function shorten(label: string): string {
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

/**
 * The room is not being saved.
 *
 * Quiet, and never destructive. The scene still holds everything the user
 * arranged and they can carry on arranging it; what they cannot do is close the
 * tab and expect it back, and that is worth one sentence. Rolling the room back
 * to the last successful save would be the product punishing them for its own
 * network.
 */
function SaveTrouble({ message }: { message: string }) {
  return (
    <p
      role="status"
      className={cn(
        'animate-rise rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2',
        'text-xs text-destructive',
      )}
    >
      {message} Your room is still here — it just isn't being written down.
    </p>
  );
}
