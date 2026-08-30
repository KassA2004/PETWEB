import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Application } from 'pixi.js';
import { PetRoom } from '../../scenes/PetRoom';
import type { PetReaction, PlacedObjectSnapshot, RoomStatus } from '../../scenes/PetRoom';
import type { SocialClipKind } from '../../animation/clips/Social';
import type { VisitorHit, VisitorSpec, VisitorTransform } from '../../scenes/room/Visitors';
import type { EnvironmentDefinition } from '../../world/environments';
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

  // --- Other people's creatures, in a park ---------------------------------
  // Imperative rather than declarative, and deliberately: these arrive from a
  // socket at ten events a second, and routing them through React state would
  // mean a render per packet per creature for something PixiJS is going to draw
  // sixty times a second anyway. The scene is the right owner of a stream.
  addVisitor: (spec: VisitorSpec) => void;
  moveVisitor: (userId: string, transform: VisitorTransform) => void;
  removeVisitor: (userId: string) => void;
  clearVisitors: () => void;
  /** Play both halves of an interaction the server has confirmed. */
  playInteraction: (
    fromUserId: string | null,
    toUserId: string | null,
    kind: SocialClipKind,
    durationMs: number,
  ) => void;
  /** Where the local creature is, for a proximity check before asking. */
  localPosition: () => { x: number; z: number };
  visitorPosition: (userId: string) => { x: number; z: number } | null;
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
  /**
   * Nothing in the room answers the pointer.
   *
   * True while visiting somebody else's room: you can watch their creature and
   * see how they have arranged things, and you cannot pick either up. Passed
   * through to the scene rather than handled here, because the scene is the
   * trust boundary — see `PetRoom.setInteractive`.
   */
  readOnly?: boolean;
  /**
   * Which environment to build. Defaults to the farmhouse.
   *
   * The definition itself rather than an id, so that a caller who needs an
   * environment the first screen does not — the park — can `import` it in their
   * own lazily-loaded chunk instead of the registry pulling it onto everybody's
   * load path (`world/environments/index.ts` documents the measurement).
   *
   * Read once, at mount, and never again: the room is built from it, and
   * swapping it live would tear the world down and put the creature back where
   * it started. Not a limitation in practice — the park and the room are
   * different screens, so entering one is a fresh mount either way.
   */
  environment?: EnvironmentDefinition;
  /**
   * Where the local creature is, ten times a second, for the network.
   *
   * Absent outside a park, and then nothing is sent at all. Must be stable —
   * the scene is built once and will hold the first one forever (AGENTS.md,
   * Rendering).
   */
  onTransform?: (transform: VisitorTransform) => void;
  /** Somebody tapped another person's creature in the room. */
  onVisitorPicked?: (hit: VisitorHit | null) => void;
  /** Small screen: a taller frame and touch-shaped hints. */
  compact?: boolean;
  /**
   * The room reaches the edges of the screen instead of sitting in a card.
   *
   * A phone's version of the frame, and the reason is arithmetic rather than
   * taste. On a 375-pixel screen the card cost 48 pixels of width — 24 of page
   * padding and 24 of border and inset — which took the canvas to 327 wide and
   * therefore 184 tall: a room occupying 23% of a screen the creature is
   * supposed to *live* in. Full-bleed is 375 and 211, a third more room for
   * nothing but the removal of a picture frame around a window.
   *
   * The frame is not merely dropped: it moves. The pet's name, its mood and the
   * light switch become chips floating over the top of the room, which is where
   * a game puts them and which costs the room no height at all.
   */
  bleed?: boolean;
  /**
   * How much larger than its box the room is drawn. 1 is exactly fitted.
   *
   * See `PetRoomOptions.zoom`. Used for two things: a few percent on a phone,
   * where a 16:9 room in a 9:19.5 screen is a letterbox however wide it is made
   * and the top of the back wall is the cheapest thing to spend; and focus mode,
   * which changes it live.
   */
  zoom?: number;
  /**
   * Size the room to the box it is given, rather than to its own width.
   *
   * The difference between the two sizing strategies, and why both exist:
   *
   * ```text
   *   fluid (default on a phone)   width is whatever the column gives; height
   *                                follows from the 16:9 ratio. No measuring,
   *                                no ResizeObserver, correct before paint
   *   fill                         measure the box and take the largest 16:9
   *                                that fits BOTH axes. Needed the moment
   *                                height is the constraint — a phone on its
   *                                side, and focus mode
   * ```
   *
   * A phone held upright has more height than it knows what to do with, so the
   * cheap strategy is the right one. Turn it sideways and height is suddenly
   * the scarce axis: a fluid room at 812 wide is 457 tall inside a 375-tall
   * screen, which is how the landscape layout used to push everything below it
   * off the bottom of a shell that does not scroll.
   */
  fill?: boolean;
  className?: string;
  /**
   * The world exists and has drawn. Fired once per mount, after the scene is
   * on the stage and the saved arrangement has been placed.
   *
   * The dashboard uses it to start background work (`prefetch.ts`) only once
   * the thing the user is actually looking at is finished.
   */
  onReady?: () => void;
  /**
   * Something to show over the frame, inside its own positioning context —
   * the loading overlay (`WorldLoader`), and nothing else today.
   */
  overlay?: ReactNode;
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
    readOnly = false,
    environment,
    onTransform,
    onVisitorPicked,
    compact = false,
    bleed = false,
    zoom = 1,
    fill = false,
    className,
    onReady,
    overlay,
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
  /**
   * Park traffic that arrived before the world existed.
   *
   * The same queue the placements and the reaction use, for the same reason and
   * against a sharper deadline. `Application.init` is asynchronous and takes
   * tens of milliseconds; a `park:join` round trip to a server on the same
   * machine takes fewer. So on any fast connection the admission reply — which
   * carries *everybody already in the park* — arrives before there is a scene
   * to put them in, and without this every creature present at the moment of
   * joining is silently dropped. The park looks empty and stays empty until
   * somebody else walks in.
   *
   * That was a real bug, found by joining a park a second client was already
   * standing in, and it is exactly the failure the placement queue above was
   * written to prevent for furniture.
   *
   * Operations rather than state, so they replay in the order they happened: an
   * add followed by a move followed by a remove has to end with the creature
   * gone, and a set of "latest values" cannot express that.
   */
  const pendingWorld = useRef<((room: PetRoom) => void)[]>([]);

  /** Run something against the scene, or queue it until there is one. */
  const withRoom = useCallback((run: (room: PetRoom) => void) => {
    const room = roomRef.current;
    if (room) {
      run(room);
      return;
    }

    // Bounded. A park whose scene never initialises should not accumulate a
    // position update ten times a second for ever.
    if (pendingWorld.current.length < 200) pendingWorld.current.push(run);
  }, []);
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
  const onReadyRef = useRef(onReady);
  const onTransformRef = useRef(onTransform);
  const onVisitorPickedRef = useRef(onVisitorPicked);
  /** Read once, at mount. Swapping environments live is not a thing. */
  const environmentRef = useRef(environment);
  /**
   * The overscale the scene is built with.
   *
   * A ref for the *first* value only — unlike the environment, this one does
   * change afterwards, through `setZoom` in the effect below. It has to be a ref
   * as well as a prop because the scene is built inside an async effect that
   * runs once, and reading the prop there would bake in whatever it was when
   * the component first rendered.
   */
  const zoomRef = useRef(zoom);

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

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onTransformRef.current = onTransform;
  }, [onTransform]);

  useEffect(() => {
    onVisitorPickedRef.current = onVisitorPicked;
  }, [onVisitorPicked]);

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
    if (compact && !fill) return;

    const box = boxRef.current;
    if (!box) return;

    const measure = () => {
      const { width, height } = box.getBoundingClientRect();
      const chrome = bleed ? 0 : FRAME;
      const available = { w: width - chrome, h: height - chrome };
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
  }, [compact, fill, bleed]);

  // --- Mount the world -----------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;
    let hostObserver: ResizeObserver | null = null;

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
        environment: environmentRef.current,
        zoom: zoomRef.current,
        // Both of these go through refs for the reason AGENTS.md gives: the
        // scene is built once and will hold whatever function it was handed
        // forever, so handing it a fresh closure every render would leave it
        // calling the first one for the rest of the session.
        onTransform: (transform) => onTransformRef.current?.(transform),
        onVisitorPicked: (hit) => onVisitorPickedRef.current?.(hit),
        // The frame is a window into the room, so show all of it.
        fit: 'contain',
        onStatus: setStatus,
        onWallDecorChange: (decor) => onRoomStyleChangeRef.current({ decor }),
        onRemovedChange: (removed) => onRoomStyleChangeRef.current({ removed }),
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

      // Everybody who was already in the park when we joined, plus wherever
      // they have moved since. Replayed in order — see `pendingWorld`.
      for (const run of pendingWorld.current) run(scene);
      pendingWorld.current = [];

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

      /*
       * Keep the renderer the size of its host.
       *
       * PixiJS's `resizeTo` sounds like it does this and does not: it reads the
       * element on `init` and then only on a *window* resize. An application
       * that started life inside a box of no size therefore stays at no size
       * forever, however large the box becomes.
       *
       * Which is not hypothetical. The social layer renders a park through a
       * portal into a host the dashboard is still hiding — it stops hiding it
       * one render later, when the layer reports where the user is standing —
       * so the park's canvas initialises at 0×0 and, on a desktop where no
       * window resize follows, never recovers. That is the reported "the park
       * does not fill the room properly", and it was intermittent because it
       * depended on which side of that render the async `Application.init`
       * happened to land.
       *
       * A `ResizeObserver` closes it for every cause rather than that one: a
       * portal that was hidden, a phone turning over, a keyboard opening under
       * a room that is still on screen. `app.resize()` re-reads `resizeTo`, so
       * this is the mechanism PixiJS already has, merely told when to run.
       */
      const canvasBox = new ResizeObserver(() => {
        // A box that has gone to nothing is one that has been hidden, not one
        // that has been resized. Drawing into it is a renderer allocating a
        // zero-sized buffer, which some drivers do not come back from.
        if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
        instance.resize();
      });
      canvasBox.observe(host);
      hostObserver = canvasBox;

      // The world is on the stage and the saved room is in it. Anything the
      // dashboard wants to do in the background can start now, and not before —
      // the room is what the user is looking at.
      onReadyRef.current?.();

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
        // Every *live* world, in mount order, so a page with two of them — the
        // room and a park — can be inspected one at a time rather than through
        // whichever handle happened to be written last. Destroyed ones are
        // dropped on each push, so an afternoon of opening and closing parks
        // does not leave a console handle full of corpses.
        const worlds = (
          (dev.__petWorlds as { app: Application; scene: PetRoom }[]) ?? []
        ).filter((world) => world.app.renderer);
        worlds.push({ app: instance, scene });
        dev.__petWorlds = worlds;
      }
    };

    void start();

    return () => {
      disposed = true;
      hostObserver?.disconnect();
      hostObserver = null;
      roomRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, []);

  /*
   * Focus mode, and the phone's few percent.
   *
   * `setZoom` rather than a rebuild, and that is the whole point of it being a
   * method on the scene: growing the room to fill the screen must not put the
   * creature back at the door. The scene re-lays-out around the same centre and
   * everything in it carries on doing what it was doing.
   */
  useEffect(() => {
    zoomRef.current = zoom;
    roomRef.current?.setZoom(zoom);
  }, [zoom]);

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

  // Visiting: look, do not touch.
  useEffect(() => {
    roomRef.current?.setInteractive(!readOnly);
  }, [readOnly]);

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

      // Park traffic. Every one of these is a no-op before the scene exists,
      // and that is correct rather than a gap: the park view only starts
      // listening once it has joined, and a join cannot complete before the
      // frame it is rendered inside has mounted.
      addVisitor: (spec) => withRoom((room) => room.addVisitor(spec)),
      moveVisitor: (userId, transform) =>
        withRoom((room) => room.moveVisitor(userId, transform)),
      removeVisitor: (userId) => withRoom((room) => room.removeVisitor(userId)),
      clearVisitors: () => {
        // Also drops anything queued: "forget everybody" has to mean the
        // arrivals that have not been applied yet as well as the ones that have.
        pendingWorld.current = [];
        roomRef.current?.clearVisitors();
      },
      playInteraction: (fromUserId, toUserId, kind, durationMs) =>
        withRoom((room) => room.playInteraction(fromUserId, toUserId, kind, durationMs)),
      localPosition: () => roomRef.current?.localPosition() ?? { x: 0, z: 0 },
      visitorPosition: (userId) => roomRef.current?.visitorPosition(userId) ?? null,
    }),
    [beginWallDrag, withRoom],
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
    // The scene decides for itself whether this is a discard, from the carried
    // thing's own height — see `PetRoom.pointerMove` and `DISCARD_LIFT`. The
    // page used to measure its own DOM rect and guess at "outside", which
    // treated a drag toward the front corner of the room the same as a drag
    // out of it.
    roomRef.current?.pointerMove(point.x, point.y);
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

  /*
   * What the creature is called, and what it is up to.
   *
   * Two placements of the same information, and which one is used is the whole
   * difference between the framed room and the full-bleed one:
   *
   * ```text
   *   card    a line ABOVE the frame. The frame then contains the room and
   *           nothing else, which is what makes it read as a window
   *   bleed   chips floating OVER the room, on a scrim. The room has already
   *           taken the whole width, and a bar above it would be forty pixels
   *           of a phone screen spent saying something two pills say inside
   * ```
   */
  const identity = (
    <div className="flex min-w-0 items-baseline gap-2">
      <h2 className="truncate text-base font-semibold tracking-tight">{petName}</h2>
      <span className="truncate text-xs text-muted-foreground">is {status.mood}</span>
    </div>
  );

  const lights = (
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
  );

  const placementPill = placementLabel ? (
    <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[0.65rem] font-medium tracking-wide text-primary uppercase">
      {placementLabel}
    </span>
  ) : null;

  return (
    <div
      className={cn(
        'flex flex-col',
        !bleed && 'gap-2',
        (!compact || fill) && 'min-h-0 flex-1',
        className,
      )}
    >
      {!bleed && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-2">
          {identity}

          <div className="flex shrink-0 items-center gap-2">
            {placementPill}
            {lights}
          </div>
        </div>
      )}

      {/*
        The space the frame is measured against, and centred in.

        In bleed it also carries the room's own field colour. That is what makes
        the expanded room read as a *room* rather than as a picture of one on a
        card: a 16:9 world in a 9:19.5 screen has to letterbox, and a letterbox
        painted in the light the room is lit by is the wall carrying on past the
        edge of the view. Painted in `bg-card` it was two cream slabs with a
        photograph between them.

        It follows the hour, like every other surface here — see `fieldFor`.
      */}
      <div
        ref={boxRef}
        style={bleed ? { backgroundColor: field } : undefined}
        className={cn(
          'flex justify-center transition-colors duration-700',
          // Centred in both axes: when the column's width is what limits the
          // room, the height left over is shared above and below rather than
          // pooled underneath, where it reads as the frame having slipped.
          (!compact || fill) && 'min-h-0 flex-1 items-center',
        )}
      >
        <div
          className={cn(
            'relative',
            bleed
              ? // No border, no padding, no radius, no ring: every one of those
                // is a pixel of width the room does not get, and the shadow of
                // a card that touches both edges falls off the screen anyway.
                'w-full bg-card'
              : 'rounded-[2rem] border-8 border-card bg-card p-1 shadow-xl shadow-foreground/10 ring-1 ring-border',
            !bleed && compact && !fill && 'w-full',
            bleed && compact && !fill && 'w-full',
          )}
          style={
            (compact && !fill) || !frame
              ? undefined
              : {
                  width: frame.width + (bleed ? 0 : FRAME),
                  height: frame.height + (bleed ? 0 : FRAME),
                }
          }
        >
          {/*
            The removal area.

            A ring around the whole frame rather than a bin somewhere else on
            the page, because "out of the room" is a place the user can already
            see. What decides it is height, not position on screen: the scene
            reports `isDiscarding` once the carried thing has been lifted above
            every row of wall hanging space (`DISCARD_LIFT`), which is a
            gesture no floor placement — including one in a front corner —
            can trigger by accident. It exists only while something is
            actually in hand, so the room is not permanently ringed by a
            warning.
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
                {status.discarding
                  ? 'Let go to put it away'
                  : 'Lift it out of the room to remove'}
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
              // On a phone held upright the width is the constraint and there
              // is nothing to measure against, so the shape is stated and the
              // height follows from it. Everywhere height can be the limit — a
              // desktop column, a phone on its side, focus mode — the card has
              // already been measured to the room's ratio and the canvas simply
              // fills it.
              ...(compact && !fill ? { aspectRatio: ROOM_ASPECT } : null),
            }}
            className={cn(
              'relative h-full w-full touch-none overflow-hidden',
              bleed ? 'rounded-none' : 'rounded-[1.4rem]',
              'transition-colors duration-700',
              // Nothing in here can be picked up while the hour is running, and
              // the cursor has to say so before the user finds out by trying.
              focused || readOnly
                ? 'cursor-default'
                : status.holding
                  ? 'cursor-grabbing'
                  : 'cursor-grab',
            )}
            role="presentation"
          />

          {/*
            The name and the light switch, over the room.

            Only in bleed. The scrim is a gradient rather than a bar because the
            room behind it is a different colour at every hour of its day, and a
            solid strip that matched the noon wall would be a stripe at
            midnight. It is `pointer-events-none` down to the chips themselves,
            so the top of the room is still somewhere you can throw a ball.
          */}
          {bleed && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent" />

              <div className="relative flex items-start justify-between gap-2 p-2.5">
                <span
                  className={cn(
                    'flex min-w-0 items-baseline gap-1.5 rounded-full px-2.5 py-1',
                    'bg-background/80 backdrop-blur-sm',
                  )}
                >
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {petName}
                  </span>
                  <span className="truncate text-[0.7rem] text-muted-foreground">
                    is {status.mood}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-1.5">
                  {placementPill}
                  {lights}
                </span>
              </div>
            </div>
          )}

          {overlay}
        </div>
      </div>
    </div>
  );
});
