import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Application } from 'pixi.js';
import { PetRoom } from '../../scenes/PetRoom';
import type { PetReaction, PlacedObjectSnapshot, RoomStatus } from '../../scenes/PetRoom';
import { audio } from '../../lib/audio';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import type { WallDecorKind } from '../../assets/environment/walls/WallDecor';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { cellLabel } from '../../world/FloorGrid';
import { fieldColor, getAmbience } from '../../world/Ambience';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../world/Projection';
import type { RoomStyle } from '../../world/RoomStyle';
import { cn, toCssHex } from '../../lib/utils';

/**
 * The habitat — the creature's home, framed as an object on the page.
 *
 * The world is a small lit box you look into, not a full-screen game. React
 * owns everything around the frame; PixiJS owns everything inside it, and the
 * two never share a tree (/Docs/project-overview.md §10).
 *
 * There are no buttons for making the creature do things. Everything you can do
 * to it, you do to it directly: pick it up, throw it, throw a toy at it, turn
 * off its light. The strip underneath says what those things are, then gets out
 * of the way.
 */

/**
 * Matches the room's own field colour, so the letterboxing disappears.
 *
 * It has to follow the mood: the frame is a window into the room, and a window
 * whose surround stays orange at midnight stops being a window and becomes a
 * picture of one.
 */
function fieldFor(style: RoomStyle): number {
  return fieldColor({ ambience: getAmbience(style.ambience), tint: style.tint });
}

export interface Placement {
  id: string;
  type: ObjectType;
  /**
   * The cell it was saved on, for an object being restored.
   *
   * Absent for something the inventory has just put in the room, which gets
   * the depth band its type prefers and arrives from above so you can watch it
   * land. Present for everything read back out of the database, which has to
   * come back exactly where it was — a room that rains furniture every time
   * you sign in is a room that has forgotten where things were.
   */
  cell?: { col: number; row: number };
  /** The saved seed and colours, so a restored object looks like itself. */
  definition?: Record<string, number>;
}

/**
 * The shape the room is drawn to be.
 *
 * Taken from the projection rather than written down, so the frame cannot
 * drift out of step with the world inside it. The scene fits itself
 * `contain`ed into whatever box it is given — which never distorts the room,
 * but pads it, and a 16:9 room in a 3:2 frame is two grey bands the eye reads
 * as the room having been stretched sideways. Matching the ratio removes the
 * bands rather than disguising them.
 */
const ROOM_ASPECT = `${SCREEN_WIDTH} / ${SCREEN_HEIGHT}`;

/**
 * How much of the card is frame rather than room, per axis.
 *
 * `border-8` on both sides is 16px, `p-1` on both sides is 8px: 24 in total.
 * The ratio has to hold for the *canvas*, not for the card around it — the
 * project sets `box-sizing: border-box`, so a size put on the card describes
 * its outside, and getting this number wrong by six pixels leaves the room at
 * 1.788 instead of 1.778 and a sliver of letterbox down one side. Small enough
 * to read as a rendering fault rather than as a layout one, which is exactly
 * why it is written down here instead of inlined.
 */
const FRAME = 24;

/** How often the creature is allowed to make a small noise to itself. */
const IDLE_VOICE_MS = 26_000;

/**
 * How close to the frame's edge counts as "out of the room", in pixels.
 *
 * Inside the frame rather than outside it, and the inset is the whole reason
 * removal feels reachable: a target you have to leave the element to hit is a
 * target you discover by accident, and on a touch screen the finger is already
 * past the edge before the browser says so. Twenty-eight pixels is a band you
 * can aim at without being one you fall into.
 */
const EDGE = 28;

export interface PetHabitatHandle {
  /**
   * Start hanging a new piece from the palette, or picking up an already-hung
   * one to move it. The room's own canvas drives the rest — this only has to
   * exist because the palette lives outside the frame (in the Room tab), so
   * the drag has to be able to start somewhere else and still land here.
   */
  startWallDrag: (kind: WallDecorKind, existingId?: string) => void;
  /** Everything in the room, for saving. */
  snapshotObjects: () => PlacedObjectSnapshot[];
  /** Make the creature respond to something that happened on the page. */
  react: (kind: PetReaction) => void;
}

interface PetHabitatProps {
  appearance: PetAppearance;
  petName: string;
  /** Objects the inventory has put in the room. */
  placements: Placement[];
  /** Bump this number to make the creature celebrate (a goal was completed). */
  celebrate?: number;
  /**
   * Everything the user has decided about the room. Owned by the caller
   * (`useRoomStyle`) rather than the habitat itself, so the Room tab can edit
   * the same value the frame is rendering without the two needing a channel
   * of their own.
   */
  roomStyle: RoomStyle;
  onRoomStyleChange: (patch: Partial<RoomStyle>) => void;
  /**
   * Something in the room was set down, added or taken away.
   *
   * Settled placements only — not every frame of a drag, and not the creature
   * nudging a ball around. The caller debounces (`useRoomObjects`).
   */
  onArrangementChange?: () => void;
  /**
   * A focus session owns the room.
   *
   * The lights go out, the creature goes to bed and nothing in the frame
   * answers the pointer. Passed in rather than discovered, because the session
   * belongs to the account and not to the canvas — the room is a thing the
   * session happens *to*.
   */
  focused?: boolean;
  /**
   * How the creature feels about the user, 0..1.
   *
   * Only ever read. It is made of goals kept and hours served, which happen on
   * a server; the room's business is what that looks like.
   */
  affection?: number;
  /**
   * The room is being rearranged.
   *
   * Its one consequence: a thing dragged out of the frame is put away instead
   * of snapping back. Owned by the page, because the switch that turns it on
   * lives in the Room panel.
   */
  editing?: boolean;
  /** Something was dragged out and put away. */
  onObjectRemoved?: (id: string) => void;
  /** Small screen: a taller frame and touch-shaped hints. */
  compact?: boolean;
  className?: string;
}

export const PetHabitat = forwardRef<PetHabitatHandle, PetHabitatProps>(function PetHabitat(
  {
    appearance,
    petName,
    placements,
    celebrate = 0,
    roomStyle,
    onRoomStyleChange,
    onArrangementChange,
    focused = false,
    affection = 0.5,
    editing = false,
    onObjectRemoved,
    compact = false,
    className,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<PetRoom | null>(null);
  /** The space the frame is allowed to occupy, measured. */
  const boxRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  /** Only the value the world is BUILT with; edits arrive via the effect below. */
  const initialAppearance = useRef(appearance);
  const placementsRef = useRef(placements);
  /**
   * Placements the scene has already acted on.
   *
   * A placement is realised exactly once. It has to be *once* rather than
   * *every render* because realising one carries the saved cell, and a
   * restored object is only at its saved cell until the user moves it —
   * re-applying the list on the next re-render (a reward landing, a tab
   * changing) would yank every piece of furniture back to where it was when
   * the page loaded. And it has to be *at least* once because the scene mounts
   * asynchronously, long after the arrangement arrives from the network.
   */
  const realised = useRef(new Set<string>());
  const dragging = useRef(false);
  /**
   * A reaction that arrived before the world existed.
   *
   * The same queue the placements use, for the same reason: `Application.init`
   * resolves long after the first render, and the one reaction most likely to
   * be early is the most important one — a session that ran out while the app
   * was closed is reported by the very first `/focus` response, which routinely
   * beats PixiJS to the finish. Without this the user comes back to a room that
   * has quietly reset itself instead of a creature waking up.
   *
   * One deep, not a list. If two things happened, the creature does the second.
   */
  const pendingReaction = useRef<PetReaction | null>(null);
  /** True while a wall-decor piece is being dragged, from anywhere. */
  const wallDragging = useRef(false);

  /**
   * The style the world is BUILT with.
   *
   * The mount effect runs once and must not depend on the style, or every
   * change of paint would tear the whole world down and put the creature back
   * where it started. It reads the current value through a ref instead, and
   * the effect below pushes every later change in.
   */
  const styleRef = useRef(roomStyle);
  /** Reads current props from inside stable callbacks (window listeners, the room's own event). */
  const onRoomStyleChangeRef = useRef(onRoomStyleChange);
  const onArrangementChangeRef = useRef(onArrangementChange);
  const onObjectRemovedRef = useRef(onObjectRemoved);

  useEffect(() => {
    styleRef.current = roomStyle;
  }, [roomStyle]);

  useEffect(() => {
    onRoomStyleChangeRef.current = onRoomStyleChange;
  }, [onRoomStyleChange]);

  useEffect(() => {
    onArrangementChangeRef.current = onArrangementChange;
  }, [onArrangementChange]);

  useEffect(() => {
    onObjectRemovedRef.current = onObjectRemoved;
  }, [onObjectRemoved]);

  const [status, setStatus] = useState<RoomStatus>({
    mood: 'settling in',
    behavior: 'idle',
    lightsOn: true,
    style: roomStyle,
    holding: null,
    holdingCell: null,
    editing: false,
    discarding: false,
  });

  // Read by the idle-voice timer, which must not be torn down and rebuilt
  // every time the creature changes what it is doing.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const field = toCssHex(fieldFor(roomStyle));

  // Which tile of the floor the thing in your hand is over. The floor says this
  // too, in the guide under the pointer; saying it in words as well is what
  // makes the room's depth learnable rather than merely visible.
  const placementLabel = status.holdingCell
    ? cellLabel(status.holdingCell, status.holdingCell.footprint)
    : null;

  /**
   * Fit the room's own shape into whatever space is left.
   *
   * Measured rather than expressed in CSS, and not for want of trying: the
   * frame wants its width to come from its height (so the room grows with the
   * window without changing shape) while a `w-fit` card wants its height to
   * come from its content's width. That is a genuine circular dependency, and
   * the browser resolves it by giving the canvas an intrinsic width of nearly
   * zero — a tall grey sliver where the room should be.
   *
   * One `ResizeObserver` and two multiplications have no such problem, and the
   * result is exact: the canvas is always 16:9, always as large as it can be,
   * and never padded.
   */
  useEffect(() => {
    if (compact) return;

    const box = boxRef.current;
    if (!box) return;

    const measure = () => {
      const { width, height } = box.getBoundingClientRect();
      const available = { w: width - FRAME, h: height - FRAME };
      if (available.w <= 0 || available.h <= 0) return;

      // Whichever axis runs out first decides the size.
      const scale = Math.min(available.w / SCREEN_WIDTH, available.h / SCREEN_HEIGHT);

      // The height is derived from the rounded width rather than rounded
      // separately: rounding both independently leaves the box off the ratio
      // by a pixel or three, and `fit: 'contain'` answers that with a thin
      // asymmetric band down one side — the exact artefact this is here to
      // remove, just small enough to look like a rendering bug instead.
      const frameWidth = Math.floor(SCREEN_WIDTH * scale);

      setFrame({
        width: frameWidth,
        height: Math.round((frameWidth * SCREEN_HEIGHT) / SCREEN_WIDTH),
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [compact]);

  // --- Mount the world -----------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;

    const start = async () => {
      const instance = new Application();
      await instance.init({
        background: fieldFor(styleRef.current),
        resizeTo: host,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });

      // React 19 StrictMode mounts effects twice; bail if we lost the race.
      if (disposed) {
        instance.destroy(true);
        return;
      }

      app = instance;
      host.appendChild(instance.canvas);

      const scene = new PetRoom(instance, {
        appearance: initialAppearance.current,
        style: styleRef.current,
        // The frame is a window into the room, so show all of it.
        fit: 'contain',
        onStatus: setStatus,
        onWallDecorChange: (decor) => onRoomStyleChangeRef.current({ decor }),
        onArrangementChange: () => onArrangementChangeRef.current?.(),
        onObjectRemoved: (id) => onObjectRemovedRef.current?.(id),
        // The room reports what happened; the mixer decides what it sounds
        // like and whether there is room for it (`lib/audio`). The scene never
        // touches an AudioContext, which is also what lets the preview harness
        // render it silently in a background tab.
        onSound: (event) => audio.room(event),
      });
      instance.stage.addChild(scene.root);
      roomRef.current = scene;

      if (pendingReaction.current) {
        scene.react(pendingReaction.current);
        pendingReaction.current = null;
      }

      // Anything placed before the world existed — which, on a normal load, is
      // the whole saved arrangement: the room's objects come back from the
      // network long before PixiJS has finished initialising, and an imperative
      // "put this in the room" would have been handed to a scene that did not
      // exist yet. The queue was already here for the inventory; restoring uses
      // it rather than inventing a second way in.
      for (const placement of placementsRef.current) {
        realised.current.add(placement.id);
        scene.placeObject(placement.id, placement.type, {
          cell: placement.cell,
          definition: placement.definition,
        });
      }

      if (import.meta.env.DEV) {
        // Handles for poking at the world from the console during development.
        // `__audio` is the application's own mixer instance: a dynamic
        // `import()` from a console gets a *different* module record, which is
        // an excellent way to spend twenty minutes concluding the ambience is
        // broken when it is only unreachable.
        const dev = window as unknown as Record<string, unknown>;
        dev.__petApp = instance;
        dev.__petRoom = scene;
        dev.__audio = audio;
      }
    };

    void start();

    return () => {
      disposed = true;
      roomRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, []);

  // --- Style: everything the user has decided about the room ---------------
  // The scene redresses itself and repaints the canvas behind it; the page only
  // has to keep the frame around it in step, so the two read as one lit space.
  // One effect for every axis, because the room's appearance is one value.
  useEffect(() => {
    roomRef.current?.setStyle(roomStyle);
  }, [roomStyle]);

  // --- The light switch is in the world, not on the page -------------------
  // Clicking the lamp turns the lights out — the lamp *is* the switch — so
  // that choice is made inside PixiJS and has to travel back out to be saved
  // like every other thing the user has decided about the room. The guard
  // makes the round trip settle rather than oscillate.
  useEffect(() => {
    if (status.lightsOn !== roomStyle.lightsOn) {
      onRoomStyleChangeRef.current({ lightsOn: status.lightsOn });
    }
  }, [status.lightsOn, roomStyle.lightsOn]);

  // --- The room's sound ----------------------------------------------------
  // What is outside the window decides the ambience and the hour decides the
  // music's register, so both come from the same value the scenery is built
  // from. Idempotent on the audio side, which matters because this fires on
  // every style change and most of them are neither.
  useEffect(() => {
    audio.setScene(roomStyle.window, roomStyle.ambience);
  }, [roomStyle.window, roomStyle.ambience]);

  /**
   * The creature says something to itself, occasionally.
   *
   * Twenty-six seconds apart, and only while it is actually idle — a chirp
   * over a chase reads as a reaction to the chase, which it is not. The mixer
   * throttles on top of this; between the two it is genuinely rare, which is
   * the only way an idle noise stays charming past the third minute.
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const behavior = statusRef.current.behavior;
      if (behavior !== 'idle' && behavior !== 'wander' && behavior !== 'sit') return;
      roomRef.current?.react('notice');
      audio.room({ kind: 'pet-idle', strength: 0.5, pan: 0, distance: 0.35 });
    }, IDLE_VOICE_MS);

    return () => window.clearInterval(timer);
  }, []);

  // --- Push appearance edits into the world --------------------------------
  useEffect(() => {
    roomRef.current?.setAppearance(appearance);
  }, [appearance]);

  // --- The hour ------------------------------------------------------------
  // One line, because the room already knows how to be dark and the creature
  // already knows what to do about darkness. Everything a session does to the
  // world it does through the systems that were there before it.
  useEffect(() => {
    roomRef.current?.setFocus(focused);
  }, [focused]);

  useEffect(() => {
    roomRef.current?.setEditing(editing);
  }, [editing]);

  // How the creature feels about the user. Pushed in on every change, including
  // the first — a fond creature should already be fond when the page loads,
  // rather than warming up over the first minute of the session.
  useEffect(() => {
    roomRef.current?.setAffection(affection);
  }, [affection]);

  // --- Add and remove placed objects ---------------------------------------
  useEffect(() => {
    const room = roomRef.current;
    const previous = placementsRef.current;
    placementsRef.current = placements;
    if (!room) return;

    for (const placement of placements) {
      if (realised.current.has(placement.id)) continue;
      realised.current.add(placement.id);

      // Not `hasObject`: a restored placement often names something the
      // environment has *already* put in the room (`Farmhouse.ts` furnishes it
      // before the save arrives), and skipping those is how the saved position
      // of the starting furniture used to be thrown away. `placeObject` knows
      // the difference between adding one and moving one.
      room.placeObject(placement.id, placement.type, {
        cell: placement.cell,
        definition: placement.definition,
      });
    }

    for (const gone of previous) {
      if (!placements.some((placement) => placement.id === gone.id)) {
        realised.current.delete(gone.id);
        room.removeObject(gone.id);
      }
    }
  }, [placements]);

  // --- Celebrate when something good happens elsewhere in the app ----------
  useEffect(() => {
    if (celebrate === 0) return;
    roomRef.current?.celebrate();
  }, [celebrate]);

  // --- Pointer: this is the whole interaction model -------------------------
  const toCanvas = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /** The same conversion, for pointer events the host div never sees. */
  const toCanvasFromClient = (clientX: number, clientY: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /**
   * Wall decor is dragged from outside the frame — a palette in the Room tab,
   * not the canvas — so once it starts, tracking has to survive the pointer
   * leaving the host element entirely. Window-level listeners do that; pointer
   * capture on the host would not, because capture only ever redelivers to the
   * element that set it.
   */
  const beginWallDrag = useCallback((kind: WallDecorKind, existingId?: string) => {
    if (wallDragging.current) return;
    wallDragging.current = true;
    roomRef.current?.wallDragStart(kind, existingId);

    const move = (event: PointerEvent) => {
      const point = toCanvasFromClient(event.clientX, event.clientY);
      if (point) roomRef.current?.wallDragMove(point.x, point.y);
    };

    const end = () => {
      wallDragging.current = false;
      roomRef.current?.wallDragEnd();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      startWallDrag: beginWallDrag,
      snapshotObjects: () => roomRef.current?.snapshotObjects() ?? [],
      react: (kind) => {
        if (roomRef.current) roomRef.current.react(kind);
        else pendingReaction.current = kind;
      },
    }),
    [beginWallDrag],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Browsers will not start an AudioContext outside a gesture. The world is
    // the thing people touch first, so this is where the room gains a voice.
    void audio.unlock();

    const point = toCanvas(event);

    // The room first, the wall behind it second. Anything standing on the
    // floor is in front of the plaster, so a tall shelf whose top overlaps the
    // bottom row of the wall grid has to win the click — asking the wall first
    // meant clicking the shelf picked up whatever was hung behind it.
    if (roomRef.current?.pointerDown(point.x, point.y)) {
      // Capture, so a throw that leaves the frame still ends properly.
      event.currentTarget.setPointerCapture(event.pointerId);
      dragging.current = true;
      return;
    }

    // An already-hung piece can be picked straight off the wall and redragged,
    // the same gesture as picking up a piece of furniture.
    const hit = roomRef.current?.pickWallDecorAt(point.x, point.y);
    if (hit) beginWallDrag(hit.kind, hit.id);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = toCanvas(event);

    // Always, drag or no drag: the creature noticing your hand is something
    // that happens while you are merely looking at it, and it is most of what
    // makes affection legible without a number anywhere on the screen.
    roomRef.current?.pointerHover(point.x, point.y);

    if (!dragging.current) return;
    roomRef.current?.pointerMove(point.x, point.y);

    /*
     * Is the hand outside the room?
     *
     * Answered here rather than in the scene because the frame is a DOM
     * element and its edges are a DOM fact — the scene would have to
     * un-project a coordinate to ask the same question, and would get a
     * slightly different answer at the corners.
     *
     * Pointer capture is what makes this work at all: the drag is captured on
     * the host, so moves *past* its edge still arrive here. Without it the
     * events would stop at the boundary and the removal area could never be
     * reached.
     */
    const rect = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < rect.left + EDGE ||
      event.clientX > rect.right - EDGE ||
      event.clientY < rect.top + EDGE ||
      event.clientY > rect.bottom - EDGE;

    roomRef.current?.setDiscarding(outside);
  };

  const handlePointerLeave = () => {
    roomRef.current?.pointerLeft();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    roomRef.current?.pointerUp();
  };

  return (
    <div
      className={cn('flex flex-col gap-2', !compact && 'min-h-0 flex-1', className)}
    >
      {/*
        The creature's name and what it is up to, above the frame rather than
        inside it.

        It used to be a bar within the card, and that cost the room height
        twice: the bar took the pixels, and then the room had to be fitted into
        what was left of a box whose shape the bar had changed. Outside it, the
        frame contains the room and nothing else.
      */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-base font-semibold tracking-tight">{petName}</h2>
          <span className="truncate text-xs text-muted-foreground">is {status.mood}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {placementLabel ? (
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[0.65rem] font-medium tracking-wide text-primary uppercase">
              {placementLabel}
            </span>
          ) : null}
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[0.65rem] font-medium tracking-wide uppercase transition-colors',
              status.lightsOn && !focused
                ? 'bg-muted text-muted-foreground'
                : 'bg-foreground text-background',
            )}
          >
            {focused ? 'Do not disturb' : status.lightsOn ? 'Lights on' : 'Lights out'}
          </span>
        </div>
      </div>

      {/* The space the frame is measured against, and centred in. */}
      <div
        ref={boxRef}
        className={cn(
          'flex justify-center',
          // Centred in both axes: when the column's width is what limits the
          // room, the height left over is shared above and below rather than
          // pooled underneath, where it reads as the frame having slipped.
          !compact && 'min-h-0 flex-1 items-center',
        )}
      >
        <div
          className={cn(
            'relative rounded-[2rem] border-8 border-card bg-card p-1 shadow-xl shadow-foreground/10 ring-1 ring-border',
            compact && 'w-full',
          )}
          style={
            compact || !frame
              ? undefined
              : { width: frame.width + FRAME, height: frame.height + FRAME }
          }
        >
          {/*
            The removal area.

            Drawn as a band inside the frame's own edge rather than as a bin
            somewhere else on the page, because "outside the room" is a place
            the user can already see — and a drop target that is part of the
            thing you are dragging out of needs no explaining. It exists only
            while something is actually in hand, so the room is not permanently
            ringed by a warning.
          */}
          {status.editing && status.holding === 'prop' && (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-1 z-10 rounded-[1.4rem] transition-all duration-200',
                status.discarding
                  ? 'bg-destructive/15 ring-4 ring-destructive ring-inset'
                  : 'ring-2 ring-primary/40 ring-inset',
              )}
            >
              <span
                className={cn(
                  'absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5',
                  'text-[0.7rem] font-medium whitespace-nowrap transition-all duration-200',
                  status.discarding
                    ? 'scale-105 bg-destructive text-destructive-foreground shadow-lg'
                    : 'bg-foreground/80 text-background',
                )}
              >
                {status.discarding ? 'Let go to put it away' : 'Drag to the edge to remove'}
              </span>
            </div>
          )}

          <div
            ref={hostRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            style={{
              backgroundColor: field,
              // On a phone the width is the constraint and there is nothing to
              // measure against, so the shape is stated and the height follows
              // from it. On a desktop the card has already been sized to the
              // room's ratio and the canvas simply fills it.
              ...(compact ? { aspectRatio: ROOM_ASPECT } : null),
            }}
            className={cn(
              'relative h-full w-full touch-none overflow-hidden rounded-[1.4rem]',
              'transition-colors duration-700',
              // Nothing in here can be picked up while the hour is running, and
              // the cursor has to say so before the user finds out by trying.
              focused
                ? 'cursor-default'
                : status.holding
                  ? 'cursor-grabbing'
                  : 'cursor-grab',
            )}
            role="presentation"
          />
        </div>
      </div>
    </div>
  );
});
