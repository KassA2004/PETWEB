import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tabs } from '../../components/ui/tabs';
import type { TabItem } from '../../components/ui/tabs';
import { UserBadge } from '../auth/UserBadge';
import { CustomizerPanel } from '../customization/CustomizerPanel';
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
import { MemoriesPanel } from '../memories/MemoriesPanel';
import { PetLibraryPanel } from '../pets/PetLibraryPanel';
import { usePetLibrary } from '../pets/usePetLibrary';
import { OBJECT_TYPES } from '../../assets/objects/ObjectRenderer';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { audio } from '../../lib/audio';
import { useIsCompact } from '../../lib/useMediaQuery';
import { cn } from '../../lib/utils';

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

export function Dashboard() {
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

  const compact = useIsCompact();

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
  const habitatRef = useRef<PetHabitatHandle>(null);

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
      return;
    }

    habitatRef.current?.react('sulk');
  }, [focus.outcome]);

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
  const tabs = useMemo<TabItem<TabValue>[]>(
    () =>
      focus.active
        ? [{ value: 'goals', label: 'Focus' }]
        : [
            { value: 'goals', label: 'Goals', count: goals.open.length },
            { value: 'memories', label: 'Memories' },
            { value: 'pet', label: 'Pet' },
            { value: 'room', label: 'Room', count: placements.length },
          ],
    [focus.active, goals.open.length, placements.length],
  );

  /**
   * Whatever they were looking at, they are looking at the timer now.
   *
   * Derived rather than assigned, which buys two things for one line: a page
   * that loads straight into a session it did not start needs no special case,
   * and when the hour is up the user is put back on the tab they were on rather
   * than somewhere the product chose for them.
   */
  const shownTab: TabValue = focus.active ? 'goals' : tab;

  const saveTrouble = room.error ?? roomObjects.error;

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
        />
      )}

      {shownTab === 'memories' && <MemoriesPanel refreshToken={memoryToken} />}

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

          <CustomizerPanel
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
          onPlaceObject={placeObject}
          editing={editing}
          onEditingChange={setEditing}
          objectCount={placements.length}
        />
      )}
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

  // --- Mobile: the creature on top, one column of tools under it -----------
  if (compact) {
    return (
      <div className="mx-auto flex h-svh w-full max-w-2xl flex-col gap-3 overflow-hidden p-3">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <h1 className="text-base font-semibold tracking-tight">Digital Pet World</h1>
          <UserBadge />
        </header>

        {/* Fixed, not sticky: on a phone the creature is the page, and it now
            physically cannot leave. */}
        <div className="shrink-0">{habitat}</div>

        {toast && (
          <p className="animate-rise inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent">
            <span aria-hidden>✦</span>
            {toast}
          </p>
        )}

        <Tabs
          items={tabs}
          value={shownTab}
          onValueChange={setTab}
          className="shrink-0 text-xs"
        />

        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1 pb-6">{panels}</div>

        {saveTrouble && <SaveTrouble message={saveTrouble} />}
        {completionDialog}
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
      <header className="flex shrink-0 items-baseline justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Digital Pet World</h1>
          <p className="truncate text-xs text-muted-foreground">
            A small creature lives here. Be nice to it.
          </p>
        </div>
        <UserBadge />
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
          {habitat}

          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center gap-2">
            {toast && (
              <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/95 px-4 py-2 text-sm text-accent-foreground shadow-lg">
                <span aria-hidden>✦</span>
                {toast}
              </p>
            )}

            {saveTrouble && <SaveTrouble message={saveTrouble} />}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <Tabs items={tabs} value={shownTab} onValueChange={setTab} className="shrink-0" />

          {/* The one scrollable region in the product. */}
          <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">{panels}</div>
        </aside>
      </div>

      {completionDialog}
    </div>
  );
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
