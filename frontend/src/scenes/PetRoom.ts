/**
 * PetRoom — the cozy farmhouse, alive.
 *
 * This is where the systems meet, in the order /Docs/animation-approach.md
 * §3 lays out:
 *
 *   PHYSICS      where everything is, and what just hit what
 *        ↓
 *   SIMULATION   what the creature wants (PetBrain)
 *        ↓
 *   NAVIGATION   how to get there from here (simulation/navigation)
 *        ↓
 *   ANIMATION    how that looks (PetAnimationController)
 *        ↓
 *   PIXI         draw it
 *
 * The room has no behaviour of its own. It perceives on the brain's behalf,
 * carries out the brain's intent as movement, and turns pointer input into
 * forces. Nothing here decides what the creature wants.
 *
 * Movement is deliberately *not* the solver's job. The brain names a place or
 * a thing, the navigator turns that into the next corner to walk to, and the
 * character controller leans the creature at it; collisions then happen to the
 * creature rather than steering it. That separation is what stops a target
 * behind a chair from becoming an afternoon spent leaning on the chair.
 *
 * Coordinates: the room is a box. Everything in it has an `x` across the room,
 * a `y` above the floor and a `z` into the room, and those three numbers are
 * real in the physics — collision, gravity and distance all use all three. The
 * camera (world/Projection.ts) turns them into a screen position and a scale,
 * so a chair at the back is drawn where a chair at the back would be, and
 * smaller. Draw order is a consequence of depth rather than a substitute for
 * it.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { PALETTE } from '../assets/shared/color';
import { createAtmosphere } from '../assets/environment/Atmosphere';
import type { AtmosphereView } from '../assets/environment/Atmosphere';
import { applyShadowHeight } from '../assets/environment/Shadows';
import { createCritters } from '../assets/environment/Critters';
import type { CrittersView } from '../assets/environment/Critters';
import {
  acceptsPropsOn,
  colliderFor,
  getObjectTraits,
  renderObject,
} from '../assets/objects/ObjectRenderer';
import type {
  Affordance,
  AffordanceKind,
  ObjectDefinition,
  ObjectTraits,
  ObjectType,
} from '../assets/objects/ObjectRenderer';
import { updateLife } from '../assets/objects/ObjectLife';
import { readState } from '../assets/objects/ObjectState';
import type { SuppliedState } from '../assets/objects/ObjectState';
import { PetRenderer } from '../assets/pets/PetRenderer';
import type { PetAppearanceInput } from '../assets/pets/customization/PetAppearance';
import { PetAnimationController } from '../animation/PetAnimationController';
import type { PetStateName } from '../animation/PetAnimationController';
import { createLandClip, createSmashClip } from '../animation/clips/Impacts';
import {
  POUNCE_TIMING,
  createPounceClip,
  createShakeClip,
} from '../animation/clips/Handling';
import { createInteractionClip } from '../animation/clips/Interactions';
import { createSocialClip } from '../animation/clips/Social';
import type { SocialClipKind, SocialRole } from '../animation/clips/Social';
import { PetBrain } from '../simulation/PetBrain';
import type { Intent, PetBehavior, PerceivedObject } from '../simulation/PetBrain';
import { NavGrid, Navigator } from '../simulation/navigation';
import type { Destination, Walker } from '../simulation/navigation';
import {
  PhysicsWorld,
  createBody,
  halfX,
  halfZ,
  topOf,
} from '../simulation/physics';
import type {
  CharacterController,
  PhysicsBody,
  SurfaceSpec,
  Vec3,
} from '../simulation/physics';
import {
  ROOM_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  farness,
  heightAt,
  project,
  scaleAt,
  screenVelocityX,
  unprojectGround,
  unprojectWall,
  unprojectX,
} from '../world/Projection';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  anchorCenter,
  cellCenter,
  snapFootprint,
} from '../world/FloorGrid';
import type { Footprint, GridAnchor, GridPlacement } from '../world/FloorGrid';
import { rowForBand } from '../world/FloorGrid';
import {
  WALL_COLUMNS,
  WALL_ROWS,
  WALL_TOP_Y,
  normalizeWallFootprint,
  snapWall,
  wallCellKey,
  wallCells,
  wallQuadAt,
} from '../world/WallGrid';
import type { WallAnchor } from '../world/WallGrid';
import { DEFAULT_ENVIRONMENT } from '../world/environments';
import type { EnvironmentDefinition, PlacedProp } from '../world/environments';
import { fieldColor, graded } from '../world/Ambience';
import type { AmbienceId, RoomMood } from '../world/Ambience';
import {
  DEFAULT_ROOM_STYLE,
  normalizeRoomStyle,
  occupiedWallCells,
  placeWallDecor,
  resolveMood,
  sameRoomStyle,
} from '../world/RoomStyle';
import type { RoomStyle, WallDecorPlacement } from '../world/RoomStyle';
import { getWallDecor } from '../assets/environment/walls/WallDecor';
import type { WallDecorKind } from '../assets/environment/walls/WallDecor';
import { PICK_PAD, depthTintOf, overlaps, pickAt, screenRectOf, sortKeyOf } from './room/BodyView';
import { createDepthGuide } from './room/DepthGuide';
import { swipeImpulse } from './room/Swipe';
import type { Blocker } from './room/Swipe';
import type { DepthGuideView } from './room/DepthGuide';
import type { RoomSound, RoomSoundKind } from './room/RoomSound';
import { createWallGuide } from './room/WallGuide';
import type { WallGuideView } from './room/WallGuide';
import { PropMotion, motionStyleFor } from './room/PropMotion';
import { VisitorPets } from './room/Visitors';
import type {
  VisitorHit,
  VisitorSpec,
  VisitorState,
  VisitorTransform,
} from './room/Visitors';

const PET_SCALE = 0.8;

/**
 * How often the local creature's position leaves the machine, in a park.
 *
 * Ten a second. Not sixty, because the receiving end interpolates anyway
 * (`room/Visitors.ts`) and fifty of those updates would be discarded by the
 * smoothing; not two, because at that rate the smoothing has to guess for half
 * a second at a time and a creature changing direction visibly overshoots.
 *
 * `10-realtime-events.md` §1 forbids per-frame animation data over the socket.
 * This is not that: it is a position and a word for what the creature is doing,
 * which the far end animates itself.
 */
const TRANSMIT_HZ = 10;

/**
 * The animation controller's vocabulary, narrowed to the network's.
 *
 * Two vocabularies rather than one, and the mapping is deliberately lossy: the
 * wire format has to survive this codebase adding an animation state without
 * every other client in the world needing to understand it, and several states
 * are nobody else's business. Being *held* is between a creature and the person
 * holding it; being dizzy is a private matter.
 */
function syncStateFor(state: PetStateName): VisitorState {
  switch (state) {
    case 'hop':
      return 'walk';
    case 'run':
      return 'run';
    case 'sit':
      return 'sit';
    case 'sleep':
      return 'sleep';
    case 'play':
      return 'play';
    case 'discover':
      return 'notice';
    default:
      return 'idle';
  }
}

/**
 * How fast a contact has to be before the room reports it as a noise.
 *
 * Not a volume floor — a filter on what counts as an event at all. A ball
 * resting against a chair leg generates a steady stream of contacts as the
 * solver holds it there; they are physically real and acoustically nothing, and
 * a mixer handed all of them has already lost. The threshold is set just above
 * "settling" and well below "somebody threw that".
 */
const AUDIBLE_IMPACT_SPEED = 140;

/**
 * Gravity, in px/s².
 *
 * Named here rather than left to the physics default because the room needs it
 * too: working out how hard to jump to land on the bed is `sqrt(2 g h)`, and
 * that has to be the same g the solver is using or the creature misses.
 */
const GRAVITY = 2600;

/** How hard the creature can move, and how fast it is allowed to get. */
const WALK_ACCELERATION = 1100;
const WALK_SPEED = 185;
/** Chasing a toy is worth breaking into a run for. */
const RUN_SPEED = 320;

/**
 * Shake detection.
 *
 * A shake is not a fast drag — it is a fast drag that keeps changing its mind.
 * Counting direction reversals above a speed threshold separates "carrying the
 * creature briskly across the room" from "shaking the daylights out of it".
 */
const SHAKE_SWING_SPEED = 320;
const SHAKE_TRIGGER = 0.45;

/** A press shorter and stiller than this is a click, not a drag. */
const CLICK_MS = 350;
const CLICK_DISTANCE = 10;

/** Below this release speed, letting go is *placing* rather than throwing. */
const PLACE_SPEED = 150;

/**
 * How far outside a toy's own artwork you can still grab it, in room units.
 *
 * **Only while edit mode is off.** Outside edit mode the only things that move
 * are the creature and its toys, and a toy is exactly the thing that ends up
 * wedged: it rolls under the table, behind the bookshelf, into the gap between
 * the bed and the wall, and what is left of it on screen is a few pixels the
 * furniture in front is also claiming. Asking somebody to hit that is asking
 * them to lose a ball permanently.
 *
 * Room units rather than screen pixels, so the reach is the same fraction of
 * the room on a phone as on a monitor — the pointer is already in this space
 * by the time `pickAt` sees it. Thirty is about half a toy's width: enough to
 * roughly double the target, not enough to reach the next tile.
 *
 * Edit mode gets none of it. Arranging furniture is precision work, and a
 * toy with a halo around it would start intercepting drops meant for the
 * table it is sitting under.
 */
const TOY_REACH = 30;

/**
 * How high a carried thing has to be lifted before letting go throws it away.
 *
 * Above every row of hanging space, so it is unambiguously *out of the room*
 * rather than merely high up a wall. Derived from the wall grid rather than
 * typed as a number, so adding a row of hanging space cannot quietly put the
 * discard zone underneath the top row of pictures.
 *
 * The height is what makes this safe: a placement on the floor is `lift: 0` by
 * construction, so no amount of dragging toward a corner can reach it. An
 * earlier version measured the pointer against the frame's screen edges
 * instead, which is exactly what someone dragging a chair toward the front
 * corner of the room does — and deleted the chair.
 */
const DISCARD_LIFT = WALL_TOP_Y;

/**
 * How visible a toy is when something is standing in front of it.
 *
 * Present rather than gone, dim rather than full strength — the visual
 * language for "it is there, it is just behind that" (`occludedToys`).
 */
const GHOST_ALPHA = 0.45;

/** How close a toy has to be, edge to edge, before it is worth pouncing on. */
const POUNCE_RANGE = 120;

/**
 * How far outside a thing's edge the creature aims to stand when it goes to it.
 *
 * Not zero, and not the middle: a creature that walks at the centre of the
 * ball spends the last stride shoving it, and a creature that stops exactly at
 * the edge is inside its own footprint the moment either of them wobbles. A
 * hand's breadth of room, and the navigator is free to take any side of the
 * object that offers it.
 */
const APPROACH_GAP = 20;

/**
 * How long a batted toy stays the creature's own shot, in seconds.
 *
 * Long enough for the ball to come off a wall and back into the creature,
 * which is the rebound that would otherwise read as an invitation to play.
 */
const OWN_SWIPE_TIME = 1.8;

/**
 * Closing speed at which walking into something becomes a stumble.
 *
 * Below it, contact is just contact — the creature brushes the bed and carries
 * on. Above it, there was some intent behind the walk and the collision should
 * cost the creature its balance for a moment.
 */
const STUMBLE_SPEED = 110;

/**
 * How long a still cursor keeps the creature's attention, in seconds.
 *
 * A hand that has stopped moving is a hand that has stopped being about the
 * creature — somebody is reading the panel beside the room. Treating a parked
 * mouse as attention is how "occasionally follows the cursor" becomes "stares".
 */
const POINTER_ATTENTION = 2.5;

/** One thing in the room: art, a body, and a shadow that stays on the floor. */
interface Entity {
  id: string;
  type: ObjectType | 'pet';
  /**
   * The document this was drawn from: seed and colours.
   *
   * Kept so the arrangement can be written down without the scene having to
   * reverse-engineer an object's colours out of its Graphics. Empty for the
   * creature, which is saved by an entirely different route.
   */
  definition: Omit<ObjectDefinition, 'type'>;
  view: Container;
  /** Everything except the contact shadow, so the art can lift on its own. */
  art: Container;
  body: PhysicsBody;
  shadow: Graphics | null;
  motion: PropMotion;
  isToy: boolean;
  /** Scenery: can be looked at and wondered about, never walked to. */
  reachable: boolean;
  /**
   * Whether the pointer may take hold of it.
   *
   * Not the same question as `reachable`, and conflating the two is what made
   * the rug immovable. `reachable` answers *the creature's*: somewhere it can
   * walk to and stand on, which a five-unit-tall piece of floor is not. This
   * answers *the user's*, and the only thing in the room the user may not pick
   * off the floor is something that is not on it — wall decor, which has its
   * own pass (`pickWallDecorAt`) because it is dragged against the wall grid
   * rather than the floor one.
   */
  grabbable: boolean;
  /**
   * What the creature can do with this, if anything.
   *
   * Resolved once when the object enters the room rather than looked up every
   * frame: an object's affordances are a property of its type and never change
   * while it is standing there.
   */
  affordance: Affordance | null;
}

/**
 * Something that happened on the page, as far as the creature is concerned.
 *
 * The room is a box on a page and most of the product happens outside it — a
 * goal is finished in a panel, an hour is committed to in a dialog. These are
 * the handful of those events the creature is entitled to know about.
 */
export type PetReaction =
  /** Something good happened. */
  | 'celebrate'
  /** Something appeared over the world; look up, then carry on. */
  | 'notice'
  /** Something arrived at speed. */
  | 'startle'
  /** The lights went out for an hour. */
  | 'settle'
  /** They came back, and the creature has an opinion about how it has gone. */
  | 'greet'
  /** They said they would spend an hour and then did not. */
  | 'sulk';

export interface RoomStatus {
  mood: string;
  behavior: PetBehavior;
  lightsOn: boolean;
  /** Everything the user has chosen about the room, for the interface. */
  style: RoomStyle;
  /** What the pointer currently has hold of. */
  holding: 'pet' | 'prop' | null;
  /** Whether the room is in its rearranging state. */
  editing: boolean;
  /**
   * Whether letting go right now would put the carried thing away.
   *
   * The interface draws the removal area from this, so the frame and the object
   * in the user's hand agree about what is about to happen.
   */
  discarding: boolean;
  /**
   * Which cells of the floor grid the carried thing will land on.
   *
   * The snapped answer rather than the pointer's, so the words in the
   * interface and the highlight on the floor can never disagree. Null when
   * nothing is being carried, and null while something is held above the back
   * wall, where there is no floor under it to name.
   */
  holdingCell: { row: number; col: number; footprint: Footprint } | null;
}

/** One object in the room, as something that can be written to a database. */
export interface PlacedObjectSnapshot {
  /** The scene's own id for it, stable across saves. */
  key: string;
  type: ObjectType;
  /** Back-left cell of its footprint on the floor grid. */
  col: number;
  row: number;
  definition: Omit<ObjectDefinition, 'type'>;
}

export interface PetRoomOptions {
  appearance?: PetAppearanceInput;
  fit?: 'cover' | 'contain';
  /**
   * How much larger than the fit the room is drawn. 1 is exactly fitted.
   *
   * A phone's problem is that a 16:9 room in a 9:19.5 screen is a letterbox
   * however wide it is made, and the interesting part of the room — the floor,
   * and the creature standing on it — is in the middle. A few percent of
   * overscale spends the top of the back wall, which is empty plaster, on making
   * everything else bigger. Anything past about 1.06 starts eating the wall
   * decor rail, so this is a nudge and not a camera.
   *
   * Multiplied into the fit rather than applied to the container, so the
   * projection, the pointer mapping (`root.toLocal`) and the depth scale all
   * stay in agreement — there is one transform, and this is part of it.
   */
  zoom?: number;
  onStatus?: (status: RoomStatus) => void;
  /** Which room the creature lives in. Defaults to the farmhouse. */
  environment?: EnvironmentDefinition;
  /** What the room looks like. Anything omitted falls back to the default. */
  style?: Partial<RoomStyle>;
  /** A wall-decor drag was just committed; the caller owns saving `RoomStyle`. */
  onWallDecorChange?: (decor: WallDecorPlacement[]) => void;
  /** A starting prop was taken out; the caller owns saving `RoomStyle`. */
  onRemovedChange?: (removed: string[]) => void;
  /**
   * Something was set down, added or taken away.
   *
   * Fires on settled placements only — not while a thing is being dragged and
   * not while the creature is knocking a ball around. The caller decides what
   * to do about it, and debounces (`features/habitat/useRoomObjects.ts`).
   */
  onArrangementChange?: () => void;
  /**
   * Something was dragged out of the room and put away.
   *
   * Reported rather than assumed, because the page holds its own list of what
   * it has put in the room (`Dashboard.placements`) and a scene that quietly
   * removed a row from under it would re-add the object on the next render.
   */
  onObjectRemoved?: (id: string) => void;
  /** Somewhere for the room to send things worth hearing. */
  onSound?: (event: RoomSound) => void;
  /**
   * Where the local creature is, for the network to relay.
   *
   * Fired on a fixed schedule (`TRANSMIT_HZ`) rather than every frame, because
   * this is the one thing in the room that leaves the machine and the receiving
   * end interpolates anyway (`room/Visitors.ts`). Sixty updates a second would
   * be fifty of them thrown away by the smoothing at the far end.
   *
   * Absent outside a park, and then nothing is sent at all.
   */
  onTransform?: (transform: VisitorTransform) => void;
  /**
   * Somebody tapped another person's creature.
   *
   * The room reports the hit and has no opinion about what it means — whether
   * an interaction is allowed is the server's decision, and the panel beside
   * the room is where it is asked for.
   */
  onVisitorPicked?: (hit: VisitorHit | null) => void;
}

/**
 * One generation of dressed room.
 *
 * A mood is not tweened shape by shape — it is rebuilt, and the two
 * generations cross-fade for a beat. The room is a few dozen flat shapes, so
 * rebuilding it costs less than the bookkeeping of animating every one of them
 * would, and it means an environment can change *anything* between moods
 * rather than only the things somebody remembered to make tweenable.
 */
interface Dressing {
  ground: Container;
  haze: Container;
  ambient: Container;
  overlay: Container;
  atmosphere: AtmosphereView;
}

export class PetRoom {
  readonly root: Container;
  readonly pet: PetRenderer;
  readonly animation: PetAnimationController;
  readonly brain: PetBrain;

  private app: Application;
  private stageLayer: Container;
  private nightOverlay: Graphics;
  private tick: (ticker: { deltaMS: number }) => void;
  private fit: 'cover' | 'contain';
  private zoom: number;
  private onStatus?: (status: RoomStatus) => void;
  private onObjectRemoved?: (id: string) => void;
  private onWallDecorChange?: (decor: WallDecorPlacement[]) => void;
  private onRemovedChange?: (removed: string[]) => void;
  private onArrangementChange?: () => void;
  private onSound?: (event: RoomSound) => void;
  private onTransform?: (transform: VisitorTransform) => void;
  private onVisitorPicked?: (hit: VisitorHit | null) => void;

  /**
   * Other people's creatures, when there are any.
   *
   * Built unconditionally and empty outside a park, because a `Map` with
   * nothing in it costs one allocation and the alternative is a null check on
   * the hot path of every frame and every pointer event. See `room/Visitors.ts`
   * for why they are puppets rather than simulations.
   */
  private visitors: VisitorPets;

  /** Seconds until the local creature's position is next sent. */
  private transmitIn = 0;
  /** What was last sent, so an unchanged creature is not re-sent. */
  private lastSent: VisitorTransform | null = null;
  /** The last direction the local creature was travelling, for the network. */
  private facing: -1 | 1 = 1;

  /**
   * The room the creature is currently living in, and the containers it built.
   *
   * Everything the scene knows about *this particular* room comes through
   * these two: the bounds, the light, the scenery and the starting furniture
   * are all the environment's business, and swapping one for another is
   * `setEnvironment`.
   */
  private environment: EnvironmentDefinition;

  /**
   * Everything the user has decided about the room.
   *
   * The environment says what is *there*; the style says what light is on it,
   * what it is painted, what the floor and walls are made of, what is outside
   * the window and what is hanging up (world/RoomStyle.ts). Keeping them apart
   * is what lets one room be a hundred rooms — and the style is a single
   * serialisable value, which is what lets those hundred rooms survive a
   * refresh.
   */
  private style: RoomStyle;

  /** The light and surface colours the current style resolves to. */
  private mood: RoomMood;

  /** The room as currently dressed, plus any generation still fading out. */
  private dressing!: Dressing;
  private fading: Dressing[] = [];
  /** Crossfade progress, 1 when nothing is fading. */
  private dressFade = 1;

  /** The slots scenery goes into, so it can be swapped without churn. */
  private groundLayer: Container;
  private hazeLayer: Container;
  private ambientLayer: Container;
  private atmosphereLayer: Container;
  private overlayLayer: Container;

  private world: PhysicsWorld;
  private legs: CharacterController;

  /**
   * Where the creature can walk, and how it is getting where it is going.
   *
   * The grid is rebuilt from the room whenever anything solid moves; the
   * navigator holds the current route and the question of whether to keep
   * believing in it (`simulation/navigation`).
   */
  private navGrid: NavGrid;
  private navigator: Navigator;
  private critters!: CrittersView;
  private guide: DepthGuideView;
  private wallGuide: WallGuideView;
  /** A piece being dragged onto the wall grid, from the palette or off it. */
  private wallDrag: {
    kind: WallDecorKind;
    existingId: string | null;
    anchor: WallAnchor | null;
    /** Over the window, or something else that is not hanging space. */
    blocked: boolean;
    /**
     * Above every row of hanging space: the piece is being lifted off the
     * wall rather than moved along it. Only meaningful for a piece that is
     * already hung — dragging a new one off the top of the palette is simply
     * a drag that never landed.
     */
    discarding: boolean;
  } | null = null;
  /** The environment's non-hanging cells, resolved once. */
  private wallReserved: ReadonlySet<string> | null = null;
  private entities = new Map<string, Entity>();
  private petEntity!: Entity;
  /** Seconds since the room opened, for everything that ticks on its own. */
  private time = 0;

  /**
   * Whether the *user* has left a light on.
   *
   * Not the same question as whether the room is lit, and keeping the two apart
   * is what stops a focus session from quietly rewriting somebody's room. A
   * session dims the room; it does not change the choice they made about it, so
   * when the hour is up the lamp is however they left it.
   */
  private lightsOn = true;
  /** True while a focus session owns the room. See `setFocus`. */
  private focused = false;
  /**
   * Whether anything in the room answers the pointer.
   *
   * False while visiting somebody else's room, and that is the whole of the
   * read-only mode: you can look at their creature and their arrangement, and
   * you cannot pick either up. Enforced here rather than by not attaching the
   * page's pointer handlers, for the same reason `focused` is — this is the
   * trust boundary, and a lock that lives in a React component is a lock the
   * next entry point forgets about (there are three ways in: the canvas, the
   * wall palette and the habitat's own imperative handle).
   *
   * Not the same switch as `focused`, deliberately. A focus session also turns
   * the lights out and puts the creature to bed; a visit changes nothing about
   * the room except that it is not yours to rearrange.
   */
  private interactive = true;
  /**
   * True while the user is rearranging rather than playing.
   *
   * The room behaves the same in both states with one exception, and the
   * exception is the whole reason the mode exists: a thing dragged out of the
   * frame is put away rather than snapped back to where it came from. Outside
   * editing, dragging a chair off the edge of the world is a slip; inside it,
   * it is the way you throw the chair out.
   */
  private editing = false;
  /** True while the carried thing is over the removal area. */
  private discarding = false;
  /** What `applyLights` last pushed out, so a no-op change stays a no-op. */
  private wasLit = true;
  private nightAlpha = 0;

  /** Pointer drag state. */
  private grabbed: Entity | null = null;
  /**
   * A locked object under the pointer, waiting to see whether this is a tap.
   *
   * Separate from `grabbed` because a locked object is never in the physics
   * manipulator's hands: there is nothing to release, nothing to settle and
   * nothing to snap. Reusing `grabbed` would mean every branch of `pointerUp`
   * having to ask whether this one was real.
   */
  private tapped: { entity: Entity; time: number; moved: number; x: number; y: number } | null =
    null;
  /**
   * The carried thing, while it is over somewhere it may not be set down.
   *
   * The floor guide already says so by turning red under it, but a marking on
   * the floor is a caption and the thing the user is looking at is the object
   * in their hand — so the object says it too (`syncEntity`). Held here rather
   * than on the entity because it is a fact about the *drag*, not about the
   * object, and it has to be forgotten the moment the drag ends.
   */
  private refusedDrop: string | null = null;
  private grabStart = { time: 0, moved: 0 };
  /** Where the grabbed thing was standing, so a click can put it back. */
  private grabOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private pointer = { x: 0, y: 0 };
  /**
   * Where the pointer last was over the room, and when — room-local, and
   * independent of whether anything is being dragged.
   *
   * Null when it is somewhere else on the page. Fed to the brain by
   * `pointerOnFloor`, which is what lets a fond creature come over and a wary
   * one keep its distance.
   */
  private hover: { x: number; y: number; at: number } | null = null;
  /** Sideways pointer speed, for the shake test. */
  private swing = 0;

  /** Shake tracking, fed by the pointer and drained every frame. */
  private shake = { energy: 0, peak: 0, lastDirection: 0, active: false };

  /** Pouncing on toys while playing, on the clip's own schedule. */
  private pounce = {
    cooldown: 1.2,
    leapTimer: 0,
    batTimer: 0,
    targetId: null as string | null,
  };

  /**
   * The toy the creature last batted, and how long the rebound is its own.
   *
   * A toy hitting the creature is normally a game — that is how throwing
   * something at it works — but a toy the creature has just walloped itself is
   * not somebody playing with it. Without this exception a pounce tops up the
   * playfulness that the pounce spent, the appetite never runs out, and the
   * creature plays with the same ball until the tab is closed (§32: appetites
   * have to be able to run out).
   */
  private ownSwipe = { id: null as string | null, until: 0 };

  /** Climbing onto furniture. One jump at a time, with a breath in between. */
  private mountCooldown = 0;

  /** Which interaction clip is running, so it is started and stopped once. */
  private interaction: { kind: AffordanceKind | null } = { kind: null };

  /**
   * Seconds left of a stumble.
   *
   * The creature keeps walking through one — that is the point of it being a
   * stumble rather than a stop — but the navigator's patience is paused, since
   * a second spent tripping over the basket is not a second spent failing to
   * find a way round it.
   */
  private stagger = 0;

  /**
   * Seconds since the creature launched itself.
   *
   * A landing it did not choose is a fright; a landing at the end of its own
   * jump is just a landing. Without this the creature scares itself every time
   * it climbs onto the bed, and then spends a minute being cross about it.
   */
  private selfLaunched = 0;

  private lastStatus: RoomStatus | null = null;

  constructor(app: Application, options: PetRoomOptions = {}) {
    this.app = app;
    this.fit = options.fit ?? 'cover';
    this.zoom = options.zoom ?? 1;
    this.onStatus = options.onStatus;
    this.onWallDecorChange = options.onWallDecorChange;
    this.onRemovedChange = options.onRemovedChange;
    this.onArrangementChange = options.onArrangementChange;
    this.onObjectRemoved = options.onObjectRemoved;
    this.onSound = options.onSound;
    this.onTransform = options.onTransform;
    this.onVisitorPicked = options.onVisitorPicked;
    this.environment = options.environment ?? DEFAULT_ENVIRONMENT;
    this.style = normalizeRoomStyle(options.style ?? DEFAULT_ROOM_STYLE);
    this.mood = resolveMood(this.style);
    this.lightsOn = this.style.lightsOn;
    this.wasLit = this.style.lightsOn;

    this.root = new Container();
    this.root.label = 'pet-room';

    this.world = new PhysicsWorld({
      bounds: this.environment.bounds,
      gravity: GRAVITY,
    });
    this.brain = new PetBrain(this.brainBounds());

    // --- The display list, built once and reused across environments -------
    // Slots, not contents. Whatever the current room draws goes into these
    // three containers, and swapping rooms empties and refills them rather
    // than rebuilding the stack.
    this.groundLayer = new Container();
    this.groundLayer.label = 'scenery';
    this.root.addChild(this.groundLayer);

    // Aerial haze sits on the scenery but under everything standing in it, so
    // the back of the room recedes without the furniture in front of it
    // receding too.
    this.hazeLayer = new Container();
    this.hazeLayer.label = 'scenery-haze';
    this.root.addChild(this.hazeLayer);

    this.ambientLayer = new Container();
    this.ambientLayer.label = 'scenery-light';
    this.root.addChild(this.ambientLayer);

    // The drag affordance sits on the floor, under everything that stands on
    // it — it is a mark on the ground, not an overlay on the room.
    this.guide = createDepthGuide();
    this.root.addChild(this.guide.root);

    this.stageLayer = new Container();
    this.stageLayer.label = 'stage';
    this.stageLayer.sortableChildren = true;
    this.root.addChild(this.stageLayer);

    // Visitors go into the same sortable layer as the furniture and the local
    // creature, which is the whole reason they sort correctly against both.
    this.visitors = new VisitorPets(this.stageLayer);

    this.atmosphereLayer = new Container();
    this.atmosphereLayer.label = 'atmosphere';
    this.root.addChild(this.atmosphereLayer);

    // Lights-out is one flat translucent sheet over the whole room. Cheap, and
    // it reads instantly as "the light went off" rather than as a filter.
    this.nightOverlay = new Graphics();
    this.nightOverlay.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.nightOverlay.fill({ color: 0xffffff });
    this.nightOverlay.alpha = 0;
    this.root.addChild(this.nightOverlay);

    this.overlayLayer = new Container();
    this.overlayLayer.label = 'scenery-overlay';
    this.root.addChild(this.overlayLayer);

    // The wall drag preview sits above everything — furniture, the creature,
    // the overlay — because it is telling the user about a piece that is
    // about to hang in front of all of it.
    this.wallGuide = createWallGuide();
    this.root.addChild(this.wallGuide.root);

    // --- The creature ------------------------------------------------------
    this.pet = new PetRenderer(options.appearance ?? {});
    this.legs = this.addPetEntity();

    // The grid is measured in creature-widths, so it cannot be built until
    // there is a creature to measure.
    this.navGrid = new NavGrid(this.navBounds());
    this.navigator = new Navigator(this.navGrid);

    this.enterEnvironment();

    // --- Simulation --------------------------------------------------------
    this.animation = new PetAnimationController(this.pet.rig);

    this.tick = (ticker) => this.update(Math.min(ticker.deltaMS, 50) / 1000);
    this.app.ticker.add(this.tick);

    this.layout();
    this.app.renderer.on('resize', this.onResize);
  }

  // --- Environment ----------------------------------------------------------

  /** Where the creature is allowed to wander, given the room it is in. */
  private brainBounds() {
    const { minX, maxX, minZ, maxZ } = this.environment.bounds;
    return {
      minX: minX + 90,
      maxX: maxX - 90,
      minZ: minZ + 40,
      maxZ: maxZ - 20,
    };
  }

  /** Build the current environment's scenery, props and wildlife. */
  private enterEnvironment(): void {
    const environment = this.environment;
    this.dress(false);

    // Anything the user has already thrown out of a previous session does not
    // come back just because the environment was rebuilt. `removed` is the
    // only thing that makes deleting a piece of the starting furniture stick
    // — the saved arrangement omits it too, but "not in the arrangement" is
    // also what an untouched piece of starting furniture looks like.
    const removed = new Set(this.style.removed);
    for (const prop of environment.props) {
      if (removed.has(prop.id)) continue;
      this.addProp(prop);
    }

    // The room's own wildlife. Not physics bodies: they weigh nothing and are
    // never in the way. Each carries its own container so it sorts among the
    // furniture.
    const { minX, maxX, minZ, maxZ } = environment.bounds;
    this.critters = createCritters({
      minX: minX + 40,
      maxX: maxX - 40,
      minZ,
      maxZ,
      ceiling: environment.ceiling,
      seed: 4711,
    });

    for (const critter of this.critters.critters) {
      this.stageLayer.addChild(critter.view);
    }

    this.world.place(this.petEntity.body, {
      x: environment.petStart.x,
      y: 0,
      z: environment.petStart.z,
    });
  }

  /** Tear the current environment down, leaving the creature and the slots. */
  private leaveEnvironment(): void {
    for (const entity of [...this.entities.values()]) {
      if (entity.id === 'pet') continue;
      this.removeObject(entity.id);
    }

    for (const critter of this.critters.critters) critter.view.destroy({ children: true });

    for (const dressing of this.fading) this.destroyDressing(dressing);
    this.fading = [];
    this.destroyDressing(this.dressing);
    this.dressFade = 1;
  }

  // --- Mood -----------------------------------------------------------------

  /**
   * Build the room's scenery for the current mood.
   *
   * The new generation goes *under* the outgoing one on the ground layer —
   * ground is opaque, so the old dressing simply fades off the top of it — and
   * *over* it everywhere else, where both are translucent and a cross dissolve
   * is the only thing that reads as a change of light rather than as a flash.
   */
  private dress(crossfade: boolean): void {
    const scenery = this.environment.createScenery(this.style);

    const ground = new Container();
    ground.label = 'scenery-ground';
    for (const layer of scenery.ground) ground.addChild(layer);

    const atmosphere = createAtmosphere({
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      air: this.mood.ambience.air,
    });

    const next: Dressing = {
      ground,
      haze: scenery.haze,
      ambient: scenery.ambient,
      overlay: scenery.overlay,
      atmosphere,
    };

    this.groundLayer.addChildAt(ground, 0);
    this.hazeLayer.addChild(next.haze);
    this.ambientLayer.addChild(next.ambient);
    this.atmosphereLayer.addChild(atmosphere.root);
    this.overlayLayer.addChild(next.overlay);

    if (crossfade) {
      this.fading.push(this.dressing);
      this.dressFade = 0;
      for (const view of [next.haze, next.ambient, next.overlay, atmosphere.root]) {
        view.alpha = 0;
      }
    }

    this.dressing = next;
    this.nightOverlay.tint = this.environment.night.color;

    // The frame letterboxes whenever it is not the room's aspect ratio, so the
    // canvas behind the room has to be the room's own field colour. A window
    // whose surround stays orange at midnight stops being a window and becomes
    // a picture of one.
    this.app.renderer.background.color = fieldColor(this.mood);
  }

  private destroyDressing(dressing: Dressing): void {
    for (const view of [
      dressing.ground,
      dressing.haze,
      dressing.ambient,
      dressing.overlay,
      dressing.atmosphere.root,
    ]) {
      view.destroy({ children: true });
    }
  }

  /** Advance a redress, and retire whatever it replaced. */
  private updateDressing(dt: number): void {
    this.dressing.atmosphere.update(dt);

    if (this.dressFade >= 1) return;

    this.dressFade = Math.min(1, this.dressFade + dt / 1.1);
    const t = this.dressFade * this.dressFade * (3 - 2 * this.dressFade);

    for (const view of [
      this.dressing.haze,
      this.dressing.ambient,
      this.dressing.overlay,
      this.dressing.atmosphere.root,
    ]) {
      view.alpha = t;
    }

    for (const dressing of this.fading) {
      dressing.atmosphere.update(dt);
      for (const view of [
        dressing.ground,
        dressing.haze,
        dressing.ambient,
        dressing.overlay,
        dressing.atmosphere.root,
      ]) {
        view.alpha = 1 - t;
      }
    }

    if (this.dressFade >= 1) {
      for (const dressing of this.fading) this.destroyDressing(dressing);
      this.fading = [];
    }
  }

  /**
   * Change the room's appearance.
   *
   * One entry point for every axis — the hour, the paint, the floor, the
   * walls, the window, what is hanging up — because they are one value. A
   * redress is a rebuild: the room is a few dozen flat shapes, so rebuilding
   * it costs less than the bookkeeping of tweening every one of them would,
   * and it means a change can alter *anything* rather than only the things
   * somebody remembered to make tweenable. Two generations cross-fade.
   *
   * The furniture, the creature and everything it remembers stay exactly where
   * they are — this is the room changing, not a new room (§17).
   */
  setStyle(next: Partial<RoomStyle>): void {
    const merged = normalizeRoomStyle({ ...this.style, ...next });
    if (sameRoomStyle(this.style, merged)) return;

    // The light switch composes with the hour rather than being part of it, so
    // it is applied through its own path and never triggers a rebuild.
    const relit = merged.lightsOn !== this.style.lightsOn;

    // Neither the light switch nor the tombstone list is worth a full rebuild
    // for: the light composes with the hour through its own path, and a
    // `removed` change is handled below by pruning exactly the entities it
    // names — cheaper than a redress, and a cross-fade for furniture the user
    // never saw this session would be a rebuild with no visible reason.
    // Without this exclusion, deleting a chair would set `removed` on the very
    // style that is about to be compared, and the room would tear itself down
    // and cross-fade back in every time.
    const redress = !sameRoomStyle(
      { ...this.style, lightsOn: merged.lightsOn, removed: merged.removed },
      merged,
    );

    this.style = merged;
    this.mood = resolveMood(merged);

    // A removed id that still has a live entity means the room was furnished
    // before this tombstone was known — the common case is the very first
    // frame: the scene is built from whatever style the page had on hand
    // (typically `DEFAULT_ROOM_STYLE`) while the real one is still in flight
    // from the server, and this is where the fetched list catches up. Without
    // it, the redress exclusion above would leave an already-deleted piece of
    // starting furniture sitting in a freshly loaded room until something
    // else happened to trigger a full `dress(true)`.
    for (const id of merged.removed) {
      if (this.entities.has(id)) this.removeEntity(id);
    }

    if (relit) this.setLights(merged.lightsOn);
    if (redress) this.dress(true);

    this.emitStatus();
  }

  /** What the room currently looks like. Serialisable, and worth saving. */
  get roomStyle(): RoomStyle {
    return this.style;
  }

  setAmbience(id: AmbienceId): void {
    this.setStyle({ ambience: id });
  }

  /** Change what the room is painted and built from. */
  setRoomTint(color: number): void {
    this.setStyle({ tint: color });
  }

  get ambienceId(): AmbienceId {
    return this.style.ambience;
  }

  get roomTint(): number {
    return this.style.tint;
  }

  /**
   * Move the creature to a different room.
   *
   * The creature itself survives — same body, same brain, same memories of who
   * has thrown it — and everything around it is replaced. Anything the user
   * had placed goes with the old room, because it was placed *in* that room.
   */
  setEnvironment(environment: EnvironmentDefinition): void {
    if (environment.id === this.environment.id) return;

    this.leaveEnvironment();
    this.environment = environment;
    // A different room has its holes in different places.
    this.wallReserved = null;

    this.world.environment.bounds = environment.bounds;
    this.brain.setBounds(this.brainBounds());
    this.navigator.clear();

    this.enterEnvironment();
    this.emitStatus();
  }

  get environmentId(): string {
    return this.environment.id;
  }

  // --- Entities ------------------------------------------------------------

  /**
   * Split a rendered object into its contact shadow and everything else.
   *
   * Every renderer in the project puts a labelled contact shadow at the base,
   * so lifting the art while leaving the shadow on the floor works for any
   * object without the factories knowing physics exists.
   */
  private splitArt(view: Container): { art: Container; shadow: Graphics | null } {
    const shadow = view.getChildByLabel('contact-shadow') as Graphics | null;

    const art = new Container();
    art.label = 'art';
    for (const child of [...view.children]) {
      if (child !== shadow) art.addChild(child);
    }
    view.addChild(art);

    return { art, shadow };
  }

  private addPetEntity(): CharacterController {
    const { art, shadow } = this.splitArt(this.pet.root);
    const start = this.environment.petStart;
    const body = this.world.add(this.createPetBody(start.x, start.z, 0));

    this.petEntity = {
      id: 'pet',
      type: 'pet',
      definition: {},
      view: this.pet.root,
      art,
      body,
      shadow,
      motion: new PropMotion('tumble', this.petRadius()),
      isToy: false,
      reachable: true,
      grabbable: true,
      affordance: null,
    };

    this.entities.set('pet', this.petEntity);
    this.stageLayer.addChild(this.pet.root);
    this.syncEntity(this.petEntity);

    return this.world.addCharacter(body, {
      walkSpeed: WALK_SPEED,
      runSpeed: RUN_SPEED,
      acceleration: WALK_ACCELERATION,
      airControl: 0.2,
      arriveRadius: 26,
      stepHeight: 30,
    });
  }

  private petRadius(): number {
    return this.pet.rig.proportions.bodyWidth * 0.3 * PET_SCALE;
  }

  /**
   * The creature's body, physically: one upright cylinder.
   *
   * It used to be a two-node ragdoll, and the ragdoll was also what walked it
   * across the room. That is the single change this rewrite is really about.
   * A creature is not a pile of circles that happens to move; it is a thing
   * with an intention, and the intention belongs to a controller
   * (`CharacterController`) while the physics only ever answers for gravity,
   * the floor and the furniture. Everything expressive about the creature —
   * the lean, the swing, the squash on landing — is the animation layer's
   * business and always was.
   */
  private createPetBody(x: number, z: number, y: number): PhysicsBody {
    const radius = this.petRadius();
    const height = this.pet.rig.proportions.bodyHeight * PET_SCALE * 0.92;

    return createBody({
      id: 'pet',
      type: 'character',
      position: { x, y, z },
      collider: { shape: 'cylinder', radius, height },
      mass: 3.4,
      restitution: 0.18,
      friction: 0.85,
      drag: 0.2,
      stepHeight: 30,
    });
  }

  /**
   * How many cells this type of thing takes up.
   *
   * Asked for by every part of placement — the snap, the drag guide and the
   * status line all need the same answer, and it lives in exactly one place.
   */
  private footprintOfType(type: ObjectType): Footprint {
    return getObjectTraits(type).footprint;
  }

  /**
   * The one thing this object offers, or null.
   *
   * A type may declare several; the room takes the first, because nothing in
   * the catalog needs two yet and a chooser with one option is a chooser
   * nobody has thought about properly. When something does need two, this is
   * where the choosing goes — not in the brain, which should keep asking
   * "what can I do here" rather than "what kind of thing is that".
   */
  private pickAffordance(traits: ObjectTraits): Affordance | null {
    return traits.affordances?.[0] ?? null;
  }

  private addProp(prop: PlacedProp): Entity {
    const traits = getObjectTraits(prop.definition.type);

    const view = renderObject(prop.definition);
    const { art, shadow } = this.splitArt(view);

    // The collision volume comes from the same grid footprint the artwork was
    // drawn to (`colliderFor`), so the space a thing occupies and the space it
    // looks like it occupies are the same box by construction. Nothing here
    // scales anything: an object is the size of its cells.
    const collider = colliderFor(traits);
    const surface: SurfaceSpec | undefined = traits.surface;

    const body = this.world.add(
      createBody({
        id: prop.id,
        type: traits.body,
        position: {
          x: prop.x,
          // Wall-hung decor never touches the floor.
          y: traits.mount ?? 0,
          z: prop.z,
        },
        collider,
        mass: traits.mass,
        restitution: traits.restitution,
        friction: traits.friction,
        drag: traits.drag,
        // Whether the creature has to walk around it, or straight through it.
        // Toys and the furniture it uses are solid; the plant is a picture of
        // a plant.
        solidity: traits.solidity ?? 'solid',
        surface: surface ?? null,
        // Wall decor is the one thing in the room that is legitimately in
        // mid-air, so it is exempt from the check that drops unsupported
        // furniture back onto whatever is under it.
        anchored: traits.mount !== undefined,
      }),
    );

    const entity: Entity = {
      id: prop.id,
      type: prop.definition.type,
      definition: {
        seed: prop.definition.seed,
        color: prop.definition.color,
        secondaryColor: prop.definition.secondaryColor,
        accentColor: prop.definition.accentColor,
      },
      view,
      art,
      body,
      shadow,
      motion: new PropMotion(
        motionStyleFor({
          rolls: traits.rolls,
          isStatic: traits.body === 'static',
          height: collider.height,
        }),
        collider.shape === 'cylinder' ? collider.radius : collider.halfX,
      ),
      isToy: traits.category === 'toy',
      reachable: traits.mount === undefined && collider.height > 6,
      grabbable: traits.mount === undefined,
      affordance: this.pickAffordance(traits),
    };

    this.entities.set(prop.id, entity);
    this.stageLayer.addChild(view);
    this.syncEntity(entity);

    return entity;
  }

  /**
   * Drop an object into the room.
   *
   * Two callers, and the difference between them is the whole of why `cell`
   * exists. The inventory puts something *new* down and does not care where —
   * it gets the depth band its type prefers and a column across the middle,
   * and it arrives from above so you can watch it land. A room being restored
   * from the database knows exactly which cell every object was on, and has to
   * get that cell back: `cell` is that answer, and an object given one is
   * placed rather than dropped, because a room that rains furniture every time
   * you sign in is a room that has forgotten where things were.
   */
  placeObject(
    id: string,
    type: ObjectType,
    options: {
      x?: number;
      z?: number;
      /** The saved cell. Anything with one skips the arrival animation. */
      cell?: GridAnchor;
      /** The saved seed and colours, for an object being restored. */
      definition?: Omit<ObjectDefinition, 'type'>;
    } = {},
  ): void {
    const traits = getObjectTraits(type);
    const mounted = traits.mount !== undefined;
    const footprint = traits.footprint;

    const existing = this.entities.get(id);
    if (existing) {
      // Already here. That is the ordinary case for a *restore*: the
      // environment furnishes the room with its own starting props
      // (`Farmhouse.ts`) before the saved arrangement arrives, so every one of
      // them is already standing somewhere by the time the database answers.
      //
      // Bailing out here — which is what this used to do — meant the saved
      // position of anything the room shipped with was silently discarded:
      // move the bed, come back tomorrow, and the bed is where the product put
      // it rather than where you did. A restore that only works for furniture
      // the user added is not a restore.
      if (options.cell && !mounted) {
        const centre = anchorCenter(options.cell, footprint);
        this.world.place(existing.body, { x: centre.x, z: centre.z });
        this.settlePlacement(existing);
      }
      return;
    }

    // A new object arrives on whole cells: the row band its type prefers, and
    // a column somewhere across the middle of the room. `rowForBand` is told
    // how deep the thing is, so a two-row object asked for the front row is
    // given the last row it actually fits in rather than one it overhangs.
    const column = Math.floor(
      (GRID_COLUMNS - footprint.cols) * (0.3 + Math.random() * 0.4),
    );
    const home = anchorCenter(
      options.cell ?? {
        col: column,
        row: rowForBand(traits.home ?? 'front', footprint.rows),
      },
      footprint,
    );

    const entity = this.addProp({
      id,
      definition: { type, seed: id.length * 7 + 3, ...options.definition },
      x: options.x ?? home.x,
      z: options.z ?? (mounted ? 8 : home.z),
    });

    if (mounted) return;

    if (entity.body.type === 'static' || options.cell) {
      // Furniture is never integrated, so dropping it from a height would
      // leave it hanging there. It is placed instead — and so is anything
      // being restored to a cell it was already on.
      this.settlePlacement(entity);
      this.arrangementChanged();
      return;
    }

    // Arrives from above, so you can see it land.
    this.world.place(entity.body, { y: 300 });
    this.arrangementChanged();
  }

  /**
   * Where everything in the room is, as saveable data.
   *
   * Cells rather than coordinates, and that is not a compression — the cell IS
   * the user's decision (`world/FloorGrid.ts`), and a float would only record
   * which way the physics happened to be rounding when the snapshot was taken.
   * A ball that has rolled somewhere between two cells is snapped by the same
   * `snapFootprint` a drop would use, so reloading puts it where letting go of
   * it there would have.
   *
   * Wall decor is not here: it lives in `RoomStyle.decor` and is saved with the
   * room's appearance, because a painting is something the room is wearing
   * rather than something standing in it.
   */
  snapshotObjects(): PlacedObjectSnapshot[] {
    const out: PlacedObjectSnapshot[] = [];

    for (const entity of this.entities.values()) {
      if (entity.id === 'pet') continue;

      const definition = entity.definition;
      const placement = snapFootprint(
        entity.body.position.x,
        entity.body.position.z,
        this.footprintOfType(entity.type as ObjectType),
      );

      out.push({
        key: entity.id,
        type: entity.type as ObjectType,
        col: placement.col,
        row: placement.row,
        definition: {
          seed: definition.seed,
          color: definition.color,
          secondaryColor: definition.secondaryColor,
          accentColor: definition.accentColor,
        },
      });
    }

    return out;
  }

  /**
   * Report something worth hearing.
   *
   * One place that knows how to turn a position in the room into the stereo
   * image and the falloff, so no caller ever has to. `ROOM_WIDTH / 2` is the
   * centre line, and `farness` is the same depth term the aerial-perspective
   * tint uses — a thing at the back of the room should sound as far away as it
   * looks.
   */
  private emitSound(
    kind: RoomSoundKind,
    strength: number,
    at: { x: number; z: number },
    type?: ObjectType,
  ): void {
    if (!this.onSound) return;

    this.onSound({
      kind,
      strength: Math.max(0, Math.min(1, strength)),
      pan: Math.max(-1, Math.min(1, (at.x - ROOM_WIDTH / 2) / (ROOM_WIDTH / 2))),
      distance: farness(at.z),
      type,
    });
  }

  /**
   * Something about the arrangement changed and is worth writing down.
   *
   * Fired on a *settled* placement, never per frame: the creature nudges a ball
   * across the floor for its own reasons all afternoon, and a save on every
   * position change would be a request per frame for a room nobody is editing.
   * The caller debounces on top of this (`features/habitat/useRoomObjects.ts`).
   */
  private arrangementChanged(): void {
    this.onArrangementChange?.();
  }

  /** Take an object back out of the room. */
  /**
   * Put something away, with the small ceremony that makes it feel deliberate.
   *
   * The artwork shrinks and fades over a fifth of a second rather than
   * vanishing on the frame the pointer came up. Nothing waits for it — the
   * object is gone from the physics and from the arrangement immediately, and
   * what is animating is a picture of something that has already left, which is
   * the only way an exit animation can never gate a state change
   * (`Docs/audio-and-feedback.md` §7).
   */
  /**
   * The user threw something out.
   *
   * Two things happen that a silent sync (`setStyle`'s pruning, below) does
   * not do: a sound, because this is a moment the user caused, and — for a
   * piece of the starting furniture — a tombstone, so the environment does not
   * simply furnish it again on the next load.
   */
  private discardObject(entity: Entity): void {
    this.emitSound('prop-place', 0.55, entity.body.position, entity.type as ObjectType);

    const id = entity.id;

    // Only the starting furniture needs a tombstone. Anything the user added
    // exists solely as a saved row, so leaving it out of the arrangement is
    // already enough — furnishing never puts it back because furnishing never
    // knew about it.
    const isStartingProp = this.environment.props.some((prop) => prop.id === id);

    this.removeEntity(id);

    if (isStartingProp && !this.style.removed.includes(id)) {
      const removed = [...this.style.removed, id];
      // Updated locally as well as reported upward: the scene's own
      // `sameRoomStyle` checks (`setStyle`'s redress guard) must agree with
      // this the moment it happens, not once the round trip through React and
      // back has finished.
      this.style = { ...this.style, removed };
      this.onRemovedChange?.(removed);
    }

    this.arrangementChanged();
  }

  /**
   * Take an entity out of the physics and fade its artwork away. No sound, no
   * tombstone, no arrangement save — those are for whichever caller means
   * something by the removal. `discardObject` is the interactive one;
   * `setStyle` calls this silently to prune a starting prop that was already
   * furnished before its tombstone was known (typically the first frame after
   * load, when the scene is built from whatever style the page had on hand
   * while the real one is still arriving from the server).
   */
  private removeEntity(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    const view = entity.view;

    // Out of the world first, so nothing can collide with a thing that is on
    // its way out and no save can catch it half-removed.
    this.world.remove(entity.body.id);
    this.entities.delete(id);
    if (this.grabbed?.id === id) this.grabbed = null;

    const fade = { t: 0 };
    const shrink = (ticker: { deltaMS: number }) => {
      fade.t += ticker.deltaMS / 200;

      if (fade.t >= 1 || view.destroyed) {
        this.app.ticker.remove(shrink);
        if (!view.destroyed) view.destroy({ children: true });
        return;
      }

      const eased = 1 - (1 - fade.t) * (1 - fade.t);
      view.alpha = 1 - eased;
      view.scale.set(view.scale.x * (1 - eased * 0.12));
    };

    this.app.ticker.add(shrink);

    this.onObjectRemoved?.(id);
  }

  removeObject(id: string): void {
    const entity = this.entities.get(id);
    if (!entity || entity.id === 'pet') return;

    if (this.world.manipulator.held === entity.body) this.world.release();
    if (this.grabbed === entity) this.grabbed = null;

    this.world.remove(id);
    this.entities.delete(id);
    entity.view.destroy({ children: true });
    this.arrangementChanged();
  }

  hasObject(id: string): boolean {
    return this.entities.has(id);
  }

  /** Every lamp in the room, whichever room it is. */
  // --- Other people's creatures ---------------------------------------------

  /**
   * Somebody else's creature walks in.
   *
   * The appearance comes from the caller, which got it from the *server*, which
   * read it from that user's own `Pet` row. Nothing on this path ever takes a
   * rig from a client — see the gateway's class comment for why that matters.
   *
   * Arrivals are spread around the environment's `petStart` rather than dropped
   * on it, so six creatures joining a park in the same second do not appear as
   * one creature with a lot of ears. The spread is deterministic in the user's
   * id, so everybody watching sees each arrival in the same place.
   */
  addVisitor(spec: VisitorSpec, at?: { x: number; z: number }): void {
    this.visitors.add(spec, at ?? this.arrivalSpot(spec.userId));
  }

  /** A position update from the network. */
  moveVisitor(userId: string, transform: VisitorTransform): void {
    this.visitors.move(userId, transform);
  }

  /** Somebody else's creature walks out. */
  removeVisitor(userId: string): void {
    this.visitors.remove(userId);
    if (this.selectedVisitor === userId) this.selectVisitor(null);
  }

  /** Everybody leaves — the park closed, or this client did. */
  clearVisitors(): void {
    this.visitors.clear();
    this.selectVisitor(null);
  }

  /** Where a visitor's creature is, so the caller can measure a distance. */
  visitorPosition(userId: string): { x: number; z: number } | null {
    return this.visitors.positionOf(userId);
  }

  /** Where the local creature is, in the same terms a visitor reports. */
  localPosition(): { x: number; z: number } {
    const body = this.petEntity.body;
    return { x: body.position.x, z: body.position.z };
  }

  /**
   * Two creatures do something to each other.
   *
   * The server said it happened; this makes it visible. Both halves are played
   * from here — the local creature's on its own controller, a visitor's on
   * theirs — because they are one event and their timing has to agree: the same
   * clip factory, the same duration, and each one turned toward the other.
   *
   * Silently does nothing when neither party is in this room. That is not a
   * swallowed error: a `park:interaction` is broadcast to everybody in the
   * park, and a client that has just left is entitled to receive one for two
   * creatures it no longer has.
   */
  playInteraction(
    fromUserId: string | null,
    toUserId: string | null,
    kind: SocialClipKind,
    durationMs: number,
  ): void {
    const at = (userId: string | null) =>
      userId === null ? this.localPosition() : this.visitors.positionOf(userId);

    const from = at(fromUserId);
    const to = at(toUserId);
    if (!from || !to) return;

    const half = (userId: string | null, role: SocialRole, self: { x: number; z: number }, other: { x: number; z: number }) => {
      if (userId === null) {
        this.animation.play(
          createSocialClip({
            kind,
            role,
            direction: this.visitors.screenDirection(self, other),
            duration: durationMs / 1000,
          }),
        );
        // The creature stops what it was doing to do this. Without it the brain
        // walks it away mid-greeting, which reads as being snubbed.
        this.brain.noticeObject(`visitor:${toUserId ?? fromUserId ?? ''}`, 0.3);
        return;
      }

      this.visitors.play(userId, kind, role, other, durationMs);
    };

    half(fromUserId, 'actor', from, to);
    half(toUserId, 'target', to, from);

    // Something happened between two creatures; the room says so, and the
    // mixer decides what that sounds like (AGENTS.md — Audio Rules).
    this.emitSound('pet-happy', 0.5, from);
  }

  /**
   * Which visitor the user currently has selected, if any.
   *
   * Held here rather than in React because the selection is made *in the room*,
   * by tapping a creature, and the ring drawn under it is part of the room.
   */
  private selectedVisitor: string | null = null;

  private selectVisitor(userId: string | null): void {
    if (this.selectedVisitor === userId) return;
    this.selectedVisitor = userId;

    const hit = userId ? this.visitors.hitFor(userId) : null;
    this.onVisitorPicked?.(hit);
  }

  /**
   * Where an arriving creature stands.
   *
   * Deterministic in the user's id, so every client places the same arrival in
   * the same spot without the server having to say — one less thing to
   * synchronise, and one less packet on a join.
   */
  private arrivalSpot(userId: string): { x: number; z: number } {
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) {
      hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    }

    const spread = Math.abs(hash % 1000) / 1000;
    const start = this.environment.petStart;
    const bounds = this.world.bounds;

    return {
      x: Math.min(
        bounds.maxX - 60,
        Math.max(bounds.minX + 60, start.x + (spread - 0.5) * 620),
      ),
      z: Math.min(
        bounds.maxZ - 40,
        Math.max(bounds.minZ + 40, start.z - ((hash >> 10) % 3) * 110),
      ),
    };
  }

  /**
   * Send where the local creature is, at a fixed rate.
   *
   * Two things keep this cheap. It runs on a timer rather than every frame, and
   * it does not send an update that says the same thing as the last one — a
   * creature asleep in the corner of a park costs nothing at all, which matters
   * because most creatures in most parks are doing nothing most of the time.
   */
  private transmit(dt: number): void {
    if (!this.onTransform) return;

    this.transmitIn -= dt;
    if (this.transmitIn > 0) return;
    this.transmitIn = 1 / TRANSMIT_HZ;

    const body = this.petEntity.body;

    // Screen velocity, not world x: a creature walking straight at the viewer
    // has no world-x velocity at all, and the last non-zero sign is kept so a
    // creature that has stopped still reports which way it came to rest — the
    // same reasoning `PetRoom.update` gives for driving the lean from this
    // number rather than from `velocity.x`.
    const vx = screenVelocityX(
      body.position.x,
      body.position.z,
      body.velocity.x,
      body.velocity.z,
    );

    if (Math.abs(vx) > 12) this.facing = vx > 0 ? 1 : -1;

    const next: VisitorTransform = {
      x: Math.round(body.position.x),
      z: Math.round(body.position.z),
      facing: this.facing,
      state: syncStateFor(this.animation.state),
    };

    const last = this.lastSent;
    if (
      last &&
      last.state === next.state &&
      last.facing === next.facing &&
      Math.abs(last.x - next.x) < 2 &&
      Math.abs(last.z - next.z) < 2
    ) {
      return;
    }

    this.lastSent = next;
    this.onTransform(next);
  }

  private lamps(): Entity[] {
    return [...this.entities.values()].filter((entity) => entity.type === 'lamp');
  }

  // --- Public interactions --------------------------------------------------

  setAppearance(appearance: PetAppearanceInput): void {
    const rig = this.pet.setAppearance(appearance);
    this.animation.setRig(rig);

    // setAppearance rebuilt the pet's children, so re-split and re-measure.
    const { art, shadow } = this.splitArt(this.pet.root);
    this.petEntity.art = art;
    this.petEntity.shadow = shadow;

    // A new shape needs a new collider, and the controller has to be pointed
    // at the new body.
    const old = this.petEntity.body;
    const body = this.createPetBody(old.position.x, old.position.z, old.position.y);

    this.world.remove('pet');
    this.world.add(body);
    this.petEntity.body = body;
    this.legs = this.world.addCharacter(body, {
      walkSpeed: WALK_SPEED,
      runSpeed: RUN_SPEED,
      acceleration: WALK_ACCELERATION,
      airControl: 0.2,
      arriveRadius: 26,
      stepHeight: 30,
    });

    if (old.held) this.world.grab(body);
  }

  /**
   * Whether the room is actually lit right now.
   *
   * The user's switch AND the absence of a session. Everything that draws,
   * perceives or decides reads this; only the interface and the saved
   * `RoomStyle` read `lightsOn`.
   */
  private get lit(): boolean {
    return this.lightsOn && !this.focused;
  }

  /**
   * A focus session took the room, or gave it back.
   *
   * Reuses the lighting the lamp already uses and the sleep the darkness
   * already causes — there is no "focus mode" in the brain, and there must not
   * be. The creature goes to bed because the lights went out, which is what it
   * would have done anyway; the only new thing here is *who* turned them off
   * and the fact that the room stops answering the pointer while they are.
   */
  setFocus(on: boolean): void {
    if (this.focused === on) return;
    this.focused = on;

    if (on) {
      // Whatever was in the user's hand is put down before the room locks, or
      // it stays welded to the pointer for the next hour.
      if (this.grabbed) this.pointerUp();
      this.tapped = null;
      this.wallDragCancel();
    }

    this.applyLights();
  }

  /** True while the room is refusing to be handled. */
  get isFocused(): boolean {
    return this.focused;
  }

  /**
   * Turn rearranging on or off.
   *
   * Everything that makes an object draggable was already true — the room has
   * always let you pick a chair up. This adds one thing: somewhere to put it
   * down that means "away".
   */
  /**
   * Look, but do not touch.
   *
   * Turns the pointer off across the whole room — dragging, tapping, the wall
   * palette and the light switch — without changing anything about how the room
   * looks or what the creature is doing. It carries on living its life; you are
   * simply a visitor.
   */
  setInteractive(on: boolean): void {
    if (this.interactive === on) return;
    this.interactive = on;

    // Anything in hand is put back where it came from. Leaving a chair floating
    // because the mode changed mid-drag would be a room the user cannot fix.
    if (!on) {
      if (this.grabbed) this.pointerUp();
      this.wallDragCancel();
      this.hover = null;
    }

    this.emitStatus();
  }

  setEditing(on: boolean): void {
    if (this.editing === on) return;
    this.editing = on;
    this.tapped = null;

    if (!on && this.discarding) this.setDiscarding(false);
    this.emitStatus();
  }

  get isEditing(): boolean {
    return this.editing;
  }

  /**
   * The carried thing has been lifted high enough to throw away, or has come
   * back down.
   *
   * Called from `pointerMove` with `carry.lift >= DISCARD_LIFT` — a fact about
   * world-space height, not about the pointer's position on screen. The scene
   * decides this itself now rather than being told by the page: the page would
   * have had to measure its own DOM rect and guess at "outside", which is
   * exactly the coordinate that turned "drag to the front corner" into "drag to
   * delete".
   *
   * Says so on the object itself as well as in the interface around it: the
   * thing the user is looking at is the object in their hand, and a caption
   * somewhere else is a caption they are not reading (the same argument as the
   * refused-drop tint, `refusedDrop`).
   */
  setDiscarding(over: boolean): void {
    const next = over && this.editing && this.grabbed !== null && this.grabbed.id !== 'pet';
    if (this.discarding === next) return;

    this.discarding = next;
    if (next) this.emitSound('prop-lift', 0.35, this.grabbed!.body.position);
    this.emitStatus();
  }

  get isDiscarding(): boolean {
    return this.discarding;
  }

  setLights(on: boolean): void {
    if (this.lightsOn === on) return;
    this.lightsOn = on;
    this.style = { ...this.style, lightsOn: on };
    this.applyLights();
  }

  /**
   * Push the effective lighting into everything that cares.
   *
   * One path, called by both the switch and the session, so the two can never
   * disagree about whether the lamps are on — which they did, briefly, when
   * each owned its own copy of the answer.
   */
  private applyLights(): void {
    const lit = this.lit;
    if (this.wasLit === lit) return;
    this.wasLit = lit;

    this.brain.lightsChanged(lit);
    this.emitSound('lights', 0.5, this.environment.light);

    // Every lamp in the room, whichever room it is. Deep search, because the
    // lamp's art was moved under its own container when the entity was split
    // from its shadow.
    for (const lamp of this.lamps()) {
      // Every lamp draws more than one lit shape — the glow around the shade
      // and the pool it throws on the floor — so all of them are switched, not
      // the first one found.
      for (const glow of lamp.view.getChildrenByLabel('lamp-glow', true)) {
        glow.visible = lit;
      }
    }

    this.emitStatus();
  }

  toggleLights(): void {
    this.setLights(!this.lightsOn);
  }

  /** Something good happened elsewhere in the app. */
  celebrate(): void {
    this.react('celebrate');
  }

  /**
   * How the creature feels about the user, from the server.
   *
   * A pass-through, and it should stay one. Affection is made of goals kept and
   * hours served — facts that live in a database and outlast any tab — so
   * nothing in the room is allowed an opinion about what it should be, only
   * about what it looks like.
   */
  setAffection(value: number): void {
    this.brain.setAffection(value);
  }

  /**
   * The creature notices something that happened on the page.
   *
   * The world is a box on a page, and the page is where most of the product
   * actually happens — a goal is finished in a panel, not in the room. A
   * creature that carries on gnawing a toy while the user finishes something
   * they have been working at for a fortnight is a creature that is not really
   * there.
   *
   * Deliberately small. `notice` is the one used most often (a dialog opened),
   * and all it does is give the brain something to be briefly curious about and
   * flick the ears — the creature looks up, and then gets on with its
   * afternoon. Anything more and a modal-heavy session becomes a creature
   * having a nervous breakdown.
   */
  react(kind: PetReaction): void {
    const at = this.petEntity.body.position;

    switch (kind) {
      case 'celebrate':
        this.brain.celebrate();
        this.animation.impulse(0.9);
        this.emitSound('pet-happy', 0.9, at);
        return;

      case 'settle':
        // Going to bed because the room went dark, which is what the brain
        // already does about darkness — this only adds the yawn.
        this.emitSound('pet-sleepy', 0.6, at);
        return;

      case 'greet': {
        // The one reaction that is not the same every time. How pleased it is
        // to see you is how it has been treated, and the brain owns that
        // number; all the room does is scale the wobble to match.
        this.brain.greet();
        const warmth = this.brain.fondness;
        this.animation.impulse(0.3 + warmth * 0.7);
        this.emitSound(warmth > 0.45 ? 'pet-happy' : 'pet-glum', 0.4 + warmth * 0.5, at);
        return;
      }

      case 'sulk':
        this.brain.disappointed();
        this.animation.impulse(0.2);
        this.emitSound('pet-glum', 0.5, at);
        return;

      case 'startle':
        this.brain.hitBy(320, false);
        this.animation.impulse(0.7);
        this.emitSound('pet-startled', 0.7, at);
        return;

      case 'notice':
      default:
        // Curious about the front of the room, which is where the viewer is —
        // so it looks *out*, toward whatever just appeared over the world.
        this.brain.noticeObject('pet', 0.3);
        this.animation.impulse(0.28);
        return;
    }
  }

  // --- Pointer --------------------------------------------------------------

  /**
   * @param canvasX @param canvasY in canvas (screen) space.
   *
   * Two different questions are asked of the pointer, and keeping them apart
   * is what makes the interaction legible. *What did you click on* is answered
   * in screen space, against the artwork. *Where did you put it* is answered
   * on the floor, by projecting the cursor back into the room — so dragging
   * upward walks a thing away from you into the room, which is exactly what
   * the perspective has already told the eye that direction means.
   */
  /**
   * @returns whether it actually took hold of something, so a caller that has
   *   a second thing to try — the wall behind the room — knows the floor said
   *   no first. The bookshelf stands 262 units tall against the back wall, so
   *   its top overlaps the bottom row of the wall grid on screen; asking the
   *   wall first meant clicking the top shelf could pick up the painting hung
   *   behind it. Whatever is in front of the wall gets asked first.
   */
  pointerDown(canvasX: number, canvasY: number): boolean {
    // The room is not available. Refused here rather than in the page, because
    // this is the trust boundary: the habitat, the wall palette and the room's
    // own canvas all arrive through these three methods, and a lock that lives
    // in a React component is a lock the next entry point forgets about.
    //
    // Two ways to be unavailable, and they mean different things: an hour is
    // running (`focused`), or this room belongs to somebody else
    // (`interactive`).
    if (this.focused || !this.interactive) return false;

    const point = this.root.toLocal({ x: canvasX, y: canvasY });

    // Other people's creatures first. They stand in front of the furniture
    // rather than among it — they have no physics body, so `pickAt` cannot see
    // them at all — and a tap on somebody's pet has to mean *that pet* even
    // where it is overlapping a chair.
    //
    // Selecting is all that happens here. Whether an interaction is allowed is
    // the server's decision (proximity, cooldown, membership), and it is asked
    // for from the panel beside the room. A scene that decided for itself would
    // be the client claiming an authority it does not have.
    const visitor = this.visitors.pick(point.x, point.y);
    if (visitor) {
      this.selectVisitor(visitor.userId);
      // The creature looks over at whoever was just pointed at, which is the
      // whole of "my pet noticed the one you tapped".
      this.brain.noticeObject(`visitor:${visitor.userId}`, 0.35);
      return false;
    }

    const bodies = this.world.bodies;

    const grabbable = (candidate: PhysicsBody): boolean => {
      const entity = this.entities.get(candidate.id);
      return entity !== undefined && entity.grabbable;
    };

    /*
     * Outside edit mode, ask the things that can actually be picked up first.
     *
     * Two passes, and the order is the fix. One pass over everything sorts by
     * depth, so a ball that has rolled under the table loses the click to the
     * table — which is not even a competition worth having, because outside
     * edit mode the table cannot be moved anyway. The click would land as a
     * tap on the furniture and the ball would stay where it is, for ever.
     *
     * So: the creature and its toys, front to back, with a toy allowed
     * `TOY_REACH` of slack around it. Only if none of them is under the
     * pointer does the second pass run, unchanged, over everything reachable
     * — which is what keeps a tap on the bookshelf still being a tap on the
     * bookshelf.
     *
     * The creature is in the first pass rather than above it, at its ordinary
     * pad: it is the biggest thing in the room and it sorts by depth like
     * everything else, so a toy behind it cannot take a click aimed at it.
     *
     * In edit mode this whole branch is skipped and the single pass below is
     * exactly what it always was. Precision is the point of edit mode.
     */
    let body: PhysicsBody | null = null;

    if (!this.editing) {
      body = pickAt(
        bodies,
        point.x,
        point.y,
        (candidate) => {
          const entity = this.entities.get(candidate.id);
          if (!entity || !entity.grabbable) return false;
          return entity.id === 'pet' || entity.isToy;
        },
        (candidate) => (this.entities.get(candidate.id)?.isToy ? TOY_REACH : PICK_PAD),
      );
    }

    body ??= pickAt(bodies, point.x, point.y, grabbable);

    if (!body) {
      // Tapping the grass deselects. A selection you cannot clear is a
      // selection that eventually points at somebody who has left.
      this.selectVisitor(null);
      return false;
    }

    const entity = this.entities.get(body.id);
    if (!entity) return false;

    // Outside edit mode, only the creature and its toys move — everything
    // else is furniture, and furniture that shifts every time somebody means
    // to throw a ball is a room nobody can leave arranged. A tap still lands:
    // it just does not pick anything up (§ handleClick, the existing twitch).
    const movable = this.editing || entity.id === 'pet' || entity.isToy;
    if (!movable) {
      this.tapped = { entity, time: performance.now(), moved: 0, x: point.x, y: point.y };
      return true;
    }

    this.grabbed = entity;
    this.grabStart = { time: performance.now(), moved: 0 };
    this.grabOrigin = { ...body.position };
    this.pointer = { x: point.x, y: point.y };
    this.swing = 0;

    this.world.grab(body);
    entity.motion.knock(0.3);
    this.emitSound('prop-lift', 0.5, body.position, entity.type as ObjectType);

    if (entity.id === 'pet') {
      // Wherever it was walking, it is not walking there from here.
      this.navigator.clear();
      this.brain.pickedUp();
    }

    this.emitStatus();
    return true;
  }

  pointerMove(canvasX: number, canvasY: number): void {
    if (this.tapped) {
      const point = this.root.toLocal({ x: canvasX, y: canvasY });
      this.tapped.moved += Math.abs(point.x - this.tapped.x) + Math.abs(point.y - this.tapped.y);
      this.tapped.x = point.x;
      this.tapped.y = point.y;
      return;
    }

    const entity = this.grabbed;
    if (!entity) return;

    const point = this.root.toLocal({ x: canvasX, y: canvasY });
    const carry = this.carryTarget(point.x, point.y);
    this.world.manipulator.moveTo(carry.x, carry.z, carry.lift);

    // Lifted out of the room, not toward its edge. `setDiscarding` already
    // refuses anything that is not editable furniture (the pet, a locked
    // object) — this only ever has to say how high the carried thing is.
    this.setDiscarding(carry.lift >= DISCARD_LIFT);

    const dx = point.x - this.pointer.x;
    const dy = point.y - this.pointer.y;
    this.grabStart.moved += Math.abs(dx) + Math.abs(dy);
    this.pointer = { x: point.x, y: point.y };

    // Every reversal above the swing threshold is one shake.
    if (entity.id === 'pet') {
      const dt = Math.max(1 / 120, this.app.ticker.deltaMS / 1000);
      this.swing += (dx / dt - this.swing) * 0.5;

      const direction = Math.sign(dx);
      if (direction !== 0 && direction !== this.shake.lastDirection) {
        const speed = Math.abs(this.swing);
        if (speed > SHAKE_SWING_SPEED) {
          this.shake.energy = Math.min(1.5, this.shake.energy + 0.3 + speed / 4000);
          this.shake.peak = Math.max(this.shake.peak, this.shake.energy);
        }
        this.shake.lastDirection = direction;
      }
    }
  }

  /**
   * Where a screen point is asking a carried thing to be.
   *
   * Inside the room this is simply the floor under the cursor. Past the back
   * wall there is no more floor to walk onto, so the pointer's remaining
   * travel up the screen becomes height instead: the thing stays pinned to the
   * back of the room and rises. That is what makes lifting and throwing the
   * same gesture as sliding something around — you just keep going — and it is
   * continuous at the join, because at the exact moment the floor runs out the
   * height it converts to is zero.
   *
   * The same for the creature and for a toy. Depth works one way in this room.
   */
  private carryTarget(
    screenX: number,
    screenY: number,
  ): { x: number; z: number; lift: number } {
    const bounds = this.world.bounds;
    const ground = unprojectGround(screenX, screenY);

    if (ground.z >= bounds.minZ) {
      return { x: ground.x, z: Math.min(ground.z, bounds.maxZ), lift: 0 };
    }

    // Pinned to the back wall. Read x and height at *that* depth, or the
    // object would jump sideways at the moment it stopped going backward.
    const z = bounds.minZ;
    return {
      x: unprojectX(screenX, z),
      z,
      lift: Math.max(0, heightAt(screenY, z)),
    };
  }

  pointerUp(): void {
    if (this.tapped) {
      const { entity, time, moved } = this.tapped;
      this.tapped = null;
      // The same tap test the drag path uses below, so "what counts as a
      // click" has one answer in this file.
      if (performance.now() - time < CLICK_MS && moved < CLICK_DISTANCE) {
        this.handleClick(entity);
      }
      return;
    }

    const entity = this.grabbed;
    if (!entity) return;

    this.grabbed = null;

    // Let go over the removal area: the thing is put away rather than dropped.
    // Checked before anything else, because every branch below is about *where
    // in the room* it lands, and this is the branch where it does not.
    if (this.discarding && entity.id !== 'pet') {
      this.discarding = false;
      this.world.release();
      this.discardObject(entity);
      this.emitStatus();
      return;
    }

    const heldFor = performance.now() - this.grabStart.time;
    const wasClick = heldFor < CLICK_MS && this.grabStart.moved < CLICK_DISTANCE;

    const released = this.world.release();
    if (!released) return;

    const { body, velocity } = released;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);

    if (wasClick) {
      // A click still spent a third of a second as a carry, and a carry lifts
      // things clear of whatever is under them. Put it back exactly where it
      // was rather than "placing" it, so clicking the lamp does not also
      // rearrange the corner it stands in.
      this.world.place(body, this.grabOrigin);
      this.world.setVelocity(body, { x: 0, y: 0, z: 0 });
      this.handleClick(entity);
      this.emitStatus();
      return;
    }

    // Set down gently, or thrown? A placement snaps to a row and settles onto
    // whatever is underneath it, so the room stays arranged rather than
    // drifting a few pixels deeper every time anything is moved. A throw is
    // left entirely alone, because a ball that snapped to a row mid-bounce
    // would look broken.
    if (speed < PLACE_SPEED || body.type === 'static') {
      this.settlePlacement(entity, this.grabOrigin);
    } else {
      entity.motion.fling((velocity.x / 260) * (Math.random() * 2 + 1));
      this.critters.disturb(body.position.x, body.position.z, speed / 700);
    }

    if (entity.id === 'pet') {
      this.shake.lastDirection = 0;
      this.navigator.disturb();
      this.brain.thrown(speed);
    }

    this.emitStatus();
  }

  /**
   * Would setting something down on this cell stand it on an object that does
   * not accept things on top of it?
   *
   * `acceptsPropsOn` is the whole rule, and it is a property of the type: a
   * tabletop or a shelf is a surface *for things*, so a plant pot may be put
   * on the table. A lamp, a plant, a bed, a chair or a basket is not, so a
   * prop set down over one is refused rather than balanced on it.
   *
   * Only objects with real height are asked about — a zero-height decal is not
   * a surface, and blocking a placement over one would make the floor itself
   * feel broken. Nothing in the catalog is one today; the check stays general
   * rather than a special case for whichever object last was.
   */
  private cellBlocked(x: number, z: number, ignoreId: string): boolean {
    const holder = this.world.surfaceBodyAt(x, z, ignoreId);
    if (!holder || holder.type !== 'static' || holder.collider.height <= 4) return false;

    const holderEntity = this.entities.get(holder.id);
    if (!holderEntity || holderEntity.id === 'pet') return false;

    return !acceptsPropsOn(getObjectTraits(holderEntity.type as ObjectType));
  }

  /**
   * The nearest cell this footprint may actually be set down on.
   *
   * Searched outward from the one that was asked for, so an object arriving on
   * an occupied tile ends up beside it rather than somewhere across the room.
   * Returns the requested placement unchanged if nothing is free — a room with
   * no legal cell left is a room where refusing to place the object at all
   * would be worse than overlapping something.
   */
  private nearestFreeCell(placement: GridPlacement, ignoreId: string): GridPlacement {
    if (!this.stackBlockedAt(placement, ignoreId)) return placement;

    const { cols, rows } = placement.footprint;
    const maxCol = GRID_COLUMNS - cols;
    const maxRow = GRID_ROWS - rows;
    let best: GridPlacement | null = null;
    let bestDistance = Infinity;

    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        const distance = Math.abs(col - placement.col) + Math.abs(row - placement.row);
        if (distance >= bestDistance) continue;

        const candidate: GridPlacement = {
          col,
          row,
          footprint: placement.footprint,
          ...anchorCenter({ col, row }, placement.footprint),
        };

        if (this.stackBlockedAt(candidate, ignoreId)) continue;

        best = candidate;
        bestDistance = distance;
      }
    }

    return best ?? placement;
  }

  /**
   * The same question, asked of every cell a placement would occupy.
   *
   * One point was not enough, and the case that proves it is a bed dropped
   * across a lamp: an even-width footprint centres on the seam *between* its
   * two cells, so the one point the check used to look at fell in the gap
   * between the two things it was supposed to notice and the bed went straight
   * through the lamp. A footprint claims whole cells — that is the entire
   * premise of the grid — so what it has to be clear of is whole cells.
   */
  private stackBlockedAt(placement: GridPlacement, ignoreId: string): boolean {
    for (let row = 0; row < placement.footprint.rows; row++) {
      for (let col = 0; col < placement.footprint.cols; col++) {
        const centre = cellCenter(placement.col + col, placement.row + row);
        if (this.cellBlocked(centre.x, centre.z, ignoreId)) return true;
      }
    }

    return false;
  }

  /**
   * Put a set-down object where it belongs: on whole cells, on top of whatever
   * is underneath it.
   *
   * The whole placement system, in four lines, and it is worth saying what is
   * *not* here any more. There used to be a clamp: snap the centre to a tile,
   * then pull the object back inside the room by its own half-extents. Those
   * two steps disagreed — the clamp did not know about cells — so a bed set
   * down in a corner snapped to the last column and was then shoved a hundred
   * units back off it, and the corners of the room were unreachable by
   * anything larger than a chair.
   *
   * `snapFootprint` cannot produce an illegal placement, so there is nothing
   * left to correct. The grid is the authority on where things go.
   */
  /**
   * @param handBackTo where a refused placement should return the object to.
   *   The position it was picked up from, for a drag. **Omitted for anything
   *   that was not being dragged**, and that distinction is load-bearing: this
   *   used to read `this.grabOrigin` unconditionally, which is only meaningful
   *   during a drag. An object *arriving* in the room — new from the inventory,
   *   or restored from the database onto a cell something else now occupies —
   *   was therefore teleported to whatever was dragged last, or to (0, 0, 0) if
   *   nothing ever had been, which is not even inside the grid. An arrival has
   *   nowhere to be handed back to; it needs somewhere to go instead.
   */
  private settlePlacement(entity: Entity, handBackTo?: Vec3): void {
    const body = entity.body;
    if (entity.id === 'pet') return;

    const snapped = snapFootprint(
      body.position.x,
      body.position.z,
      this.footprintOfType(entity.type as ObjectType),
    );

    if (handBackTo && this.stackBlockedAt(snapped, body.id)) {
      // Not somewhere this can go. Hand it back rather than stacking it on
      // something that does not want it stood on.
      this.world.place(body, handBackTo);
      this.world.setVelocity(body, { x: 0, y: 0, z: 0 });
      entity.motion.knock(0.5, Math.random() < 0.5 ? -1 : 1);
      this.emitSound('prop-refused', 0.8, body.position, entity.type as ObjectType);
      return;
    }

    // An arrival takes the nearest cell it is allowed to have.
    const placement = handBackTo ? snapped : this.nearestFreeCell(snapped, body.id);

    const rest = this.world.surfaceHeightAt(placement.x, placement.z, body.id);

    if (body.type === 'static') {
      this.world.place(body, { x: placement.x, y: rest, z: placement.z });
      this.world.setVelocity(body, { x: 0, y: 0, z: 0 });
    } else {
      // Dynamic things are only nudged onto the cell — they still have to fall
      // the last few pixels themselves, which is how you can tell they are
      // objects and not stickers.
      this.world.place(body, { x: placement.x, z: placement.z });
      this.world.setVelocity(body, { x: 0, z: 0 });
    }

    this.emitSound('prop-place', 0.55, body.position, entity.type as ObjectType);

    // Anything that was resting on this needs to notice it moved.
    for (const rider of this.world.occupants(body.id)) this.world.wake(rider);

    // The room is different now, and somebody may want to write that down.
    this.arrangementChanged();
  }

  /** A press that never became a drag. */
  private handleClick(entity: Entity): void {
    if (entity.type === 'lamp') {
      this.toggleLights();
      return;
    }

    if (entity.id === 'pet') {
      this.brain.poked();
      this.emitSound('pet-poked', 0.7, entity.body.position);
      return;
    }

    // Nudging anything else is a small shove — which the creature notices.
    entity.motion.knock(0.8, Math.random() < 0.5 ? -1 : 1);
    this.world.push(entity.body, {
      y: 240,
      x: (Math.random() - 0.5) * 140,
    });

    // Repeatedly prodding something is how you point at it. The brain already
    // has a channel for "that thing is worth a look" — this is that channel,
    // and the curiosity it adds accumulates across taps until the creature
    // acts on it.
    this.brain.noticeObject(entity.id, 0.25);
  }

  // --- Wall decor -------------------------------------------------------------

  /**
   * Which hung piece, if any, sits under this canvas point.
   *
   * Screen-space only — the wall is one flat plane, so unlike a floor prop
   * this never needs the physics world at all. Used so an already-hung piece
   * can be picked up and redragged, not just a new one from the palette.
   *
   * Answers only while the room is being edited, for the reason `wallDragStart`
   * gives: taking something off the wall is manipulating the room, and the room
   * is only manipulable in edit mode. The guard is here as well as there
   * because there are two ways in and a lock that lives in one of them is a
   * lock the other one forgets — the same argument that put the focus-session
   * lock in this class rather than in React.
   */
  pickWallDecorAt(canvasX: number, canvasY: number): WallDecorPlacement | null {
    if (this.focused || !this.interactive || !this.editing) return null;

    const point = this.root.toLocal({ x: canvasX, y: canvasY });

    for (const placement of this.style.decor) {
      const spec = getWallDecor(placement.kind);
      const quad = wallQuadAt(placement, spec.footprint);
      const xs = quad.map((corner) => corner.x);
      const ys = quad.map((corner) => corner.y);

      if (
        point.x >= Math.min(...xs) &&
        point.x <= Math.max(...xs) &&
        point.y >= Math.min(...ys) &&
        point.y <= Math.max(...ys)
      ) {
        return placement;
      }
    }

    return null;
  }

  /**
   * The cells of the wall that are not hanging space.
   *
   * The window, and whatever else the environment has cut into its plaster.
   * Computed once per environment rather than per pointer move: the wall does
   * not gain a window while you are dragging a painting across it.
   */
  private reservedWallCells(): ReadonlySet<string> {
    if (!this.wallReserved) {
      this.wallReserved = new Set(
        this.environment.wallReserved.flatMap((area) =>
          wallCells(area, area.footprint).map(wallCellKey),
        ),
      );
    }

    return this.wallReserved;
  }

  /**
   * Hang a piece in the first free space, without a drag.
   *
   * The catalogue's other half. Dragging is the good gesture on a desktop —
   * you put the painting where you want it and watch it land — and it is not
   * available at all to a thumb: the frame is a third of a phone screen and the
   * finger doing the dragging covers the thing being dragged. So the Room
   * panel's wall pieces are tapped, exactly like every other object in the
   * catalogue, and the room chooses the first cell that will take it.
   *
   * Left to right, bottom row first, because that is where a bare wall looks
   * emptiest and because it keeps the pieces off the ceiling.
   *
   * @returns whether it found anywhere to put it.
   */
  hangWallDecor(kind: WallDecorKind): boolean {
    if (this.focused || !this.interactive) return false;

    const spec = getWallDecor(kind);
    const size = normalizeWallFootprint(spec.footprint);
    const reserved = this.reservedWallCells();
    const occupied = occupiedWallCells(this.style.decor);

    for (let row = 0; row + size.rows <= WALL_ROWS; row++) {
      for (let col = 0; col + size.cols <= WALL_COLUMNS; col++) {
        const cells = wallCells({ col, row }, size).map(wallCellKey);
        if (cells.some((key) => reserved.has(key) || occupied.has(key))) continue;

        this.emitSound('prop-place', 0.6, { x: ROOM_WIDTH / 2, z: 0 });
        this.onWallDecorChange?.(placeWallDecor(this.style.decor, kind, { col, row }));
        return true;
      }
    }

    return false;
  }

  /**
   * Start hanging a new piece, or picking up an already-hung one to move it.
   *
   * **Moving something already on the wall needs edit mode; hanging a new one
   * does not.** That is the same line the floor draws — `pointerDown` will only
   * pick up furniture while `editing`, and outside it a press on the lamp turns
   * the light off instead — and the wall was the one surface that had never
   * been held to it. A painting could be dragged off its hook, and dragged off
   * the top of the room and thrown away, at any moment, by a click that landed
   * a few pixels high of a bookshelf.
   *
   * Adding is not manipulating. Tapping a wall tile in the catalogue, or
   * dragging one out of it, is the same act as tapping a chair — it puts a new
   * thing in the room, and nothing already in the room can be lost to it. So a
   * palette drag (`existingId` absent) is allowed exactly as before.
   */
  wallDragStart(kind: WallDecorKind, existingId?: string): void {
    if (this.focused || !this.interactive) return;
    if (existingId !== undefined && !this.editing) return;

    this.wallDrag = {
      kind,
      existingId: existingId ?? null,
      anchor: null,
      blocked: false,
      discarding: false,
    };
  }

  /** Point the drag at a canvas position; snaps to the wall grid as it goes. */
  wallDragMove(canvasX: number, canvasY: number): void {
    const drag = this.wallDrag;
    if (!drag) return;

    const point = this.root.toLocal({ x: canvasX, y: canvasY });
    const wall = unprojectWall(point.x, point.y);
    const spec = getWallDecor(drag.kind);
    const snapped = snapWall(wall.x, wall.y, spec.footprint);
    drag.anchor = { col: snapped.col, row: snapped.row };

    // Above every row of hanging space: the piece is being lifted off the wall
    // to be thrown away, the wall's own answer to `PetRoom.DISCARD_LIFT` for
    // the floor. Only a piece that is already hung can be discarded — a new
    // one from the palette dragged off the top has simply not landed yet.
    drag.discarding = drag.existingId !== null && wall.y > WALL_TOP_Y;

    const reserved = this.reservedWallCells();
    const occupied = occupiedWallCells(this.style.decor, drag.existingId ?? undefined);
    const cells = wallCells(drag.anchor, snapped.footprint).map(wallCellKey);

    // Occupied is a refusal now, not a takeover: dropping on a cell that
    // already holds something used to resolve the clash by silently removing
    // the other piece (`placeWallDecor`), which is the one wall interaction
    // that had no undo. The floor already refuses a stack it cannot accept;
    // this is the same rule for the wall.
    drag.blocked = cells.some((key) => reserved.has(key) || occupied.has(key));

    const wallColor = graded(this.mood.tint, this.mood.ambience);

    this.wallGuide.update({
      anchor: drag.anchor,
      footprint: snapped.footprint,
      kind: drag.kind,
      seed: this.wallDragSeed(drag.kind, drag.existingId),
      palette: { wall: wallColor, tint: this.style.tint, accent: PALETTE.punch },
      // Shown as taken, so the refusal is never a surprise: the same set
      // decides both the shading here and `blocked` above, so the two can
      // never disagree.
      occupied: new Set(occupied.keys()),
      reserved,
      // Discarding reuses the exact same red as a blocked drop — it is a
      // refusal to hang here, for a different reason, and the user should not
      // have to learn a second colour for it.
      blocked: drag.blocked || drag.discarding,
    });
  }

  /** Commit the drag to the room's style, or drop it if it never landed anywhere. */
  wallDragEnd(): void {
    const drag = this.wallDrag;
    this.wallDrag = null;
    this.wallGuide.update(null);
    if (!drag) return;

    if (drag.discarding && drag.existingId) {
      const next = this.style.decor.filter((item) => item.id !== drag.existingId);
      this.emitSound('prop-place', 0.5, { x: ROOM_WIDTH / 2, z: 0 });
      this.onWallDecorChange?.(next);
      return;
    }

    // Never landed on the wall at all, or landed on the window or something
    // already hanging: either way nothing changes, which is what the red said
    // would happen.
    if (!drag.anchor || drag.blocked) return;

    const next = placeWallDecor(
      this.style.decor,
      drag.kind,
      drag.anchor,
      drag.existingId ?? undefined,
    );
    this.onWallDecorChange?.(next);
  }

  /** Abandon the drag without changing anything — released off the wall entirely. */
  wallDragCancel(): void {
    this.wallDrag = null;
    this.wallGuide.update(null);
  }

  /** A stable-enough seed for the live preview; the committed piece gets its own. */
  private wallDragSeed(kind: WallDecorKind, existingId: string | null): number {
    const source = existingId ?? kind;
    let hash = 0;
    for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) | 0;
    return Math.abs(hash) % 1000;
  }

  // --- The loop -------------------------------------------------------------

  private update(dt: number): void {
    this.time += dt;

    const { impacts, walls, ground } = this.world.step(dt);
    const petBody = this.petEntity.body;

    // Objects that move on their own: the plant's sway, the lamp's flicker.
    // Some of them have things to say.
    const life = { time: this.time, lightsOn: this.lit, now: new Date() };

    for (const entity of this.entities.values()) {
      for (const event of updateLife(entity.view, dt, life)) {
        this.onObjectEvent(entity, event);
      }
    }

    // A lamp is barely visible at noon and is the whole room at midnight. Its
    // own life sets the glow every frame, so the mood scales what it decided
    // rather than fighting it for the value.
    const lampMood = this.mood.ambience.lamp;
    for (const lamp of this.lamps()) {
      const glow = lamp.view.getChildByLabel('lamp-glow', true);
      if (glow) glow.alpha *= lampMood;
    }

    // Anything that hits the creature is news (§26 surprise, §24 interaction).
    for (const impact of impacts) {
      const hitA = this.entities.get(impact.a.id);
      const hitB = this.entities.get(impact.b.id);
      hitA?.motion.knock(Math.min(1.6, impact.speed / 500), -1);
      hitB?.motion.knock(Math.min(1.6, impact.speed / 500), 1);

      // A knock only counts as a noise if it was one. Below this the solver is
      // still resolving a resting contact — a ball settling against a chair
      // leg produces a stream of tiny impacts that are physically real and
      // acoustically nothing, and reporting them would make the mixer's job
      // impossible however good its throttling was.
      if (impact.speed >= AUDIBLE_IMPACT_SPEED) {
        const source = hitA?.isToy ? hitA : (hitB?.isToy ? hitB : (hitA ?? hitB));
        if (source && source.id !== 'pet') {
          this.emitSound(
            'prop-bump',
            impact.speed / 900,
            source.body.position,
            source.type as ObjectType,
          );
        }
      }

      const other =
        impact.a.id === 'pet' ? impact.b : impact.b.id === 'pet' ? impact.a : null;
      if (!other) continue;

      // Even a light bump makes the ears jump.
      this.animation.impulse(Math.min(1.4, impact.speed / 700));

      // Being hit is frightening. Walking into the furniture is not — the
      // creature did that to itself, and a pet that sulks every time it
      // brushes a chair leg spends its whole life cross with the room.
      const isToy = this.entities.get(other.id)?.isToy ?? false;
      const theirs = Math.hypot(other.velocity.x, other.velocity.y, other.velocity.z);
      const ours = Math.hypot(petBody.velocity.x, petBody.velocity.y, petBody.velocity.z);

      // It walked into the furniture rather than the furniture arriving at it:
      // not frightening, but it should cost the creature its footing (§5).
      //
      // Walked into, specifically. Coming down on top of the table is a
      // landing — it has its own squash, and the creature meant to do it —
      // and it registers here too because an arrival is also a collision.
      if (!isToy && theirs < ours * 0.7) {
        const walkedInto =
          petBody.support?.id !== other.id &&
          Math.hypot(petBody.velocity.x, petBody.velocity.z) > 45;

        if (walkedInto && impact.speed > STUMBLE_SPEED && !petBody.held) {
          this.stumble(impact.speed, other);
        }
        continue;
      }

      // Its own shot coming back off the wall is not somebody playing with it.
      const ricochet =
        isToy && other.id === this.ownSwipe.id && this.time < this.ownSwipe.until;

      if (!ricochet) this.brain.hitBy(impact.speed, isToy);
    }

    for (const wall of walls) {
      if (wall.speed < AUDIBLE_IMPACT_SPEED || wall.body.id === 'pet') continue;
      const entity = this.entities.get(wall.body.id);
      if (!entity) continue;

      this.emitSound(
        'prop-wall',
        wall.speed / 900,
        wall.body.position,
        entity.type as ObjectType,
      );
    }

    for (const landing of ground) {
      // Anything landing hard enough scatters whatever was sitting near it.
      if (landing.speed >= 500) {
        this.critters.disturb(
          landing.body.position.x,
          landing.body.position.z,
          landing.speed / 900,
        );
      }

      if (landing.body.id !== 'pet') {
        const entity = this.entities.get(landing.body.id);
        entity?.motion.knock(landing.speed / 900);

        if (entity && landing.speed >= AUDIBLE_IMPACT_SPEED) {
          this.emitSound(
            'prop-land',
            landing.speed / 800,
            landing.body.position,
            entity.type as ObjectType,
          );
        }
        continue;
      }

      // Landing after a fall: squash, and stay down in proportion to the drop.
      const force = Math.min(1, landing.speed / 1400);
      this.animation.play(createLandClip(force));
      this.animation.impulse(0.6 + force * 1.8);

      // Only a fall it did not intend is frightening.
      if (this.selfLaunched <= 0) this.brain.landed(landing.speed);
    }

    // Hitting a wall: pivot off it. The clip keeps the silhouette intact.
    for (const hit of walls) {
      if (hit.body.id !== 'pet' || hit.direction === 0) continue;

      const force = Math.min(1, hit.speed / 1500);
      this.animation.play(createSmashClip(force, hit.direction));
      this.animation.impulse(0.8 + force * 1.8, -hit.direction);
      this.brain.hitBy(hit.speed, false);
    }

    this.selfLaunched = Math.max(0, this.selfLaunched - dt);

    // The climb is over the moment it arrives, or the moment it runs out.
    if (
      petBody.passThrough &&
      (this.selfLaunched <= 0 || petBody.support?.id === petBody.passThrough)
    ) {
      petBody.passThrough = null;
    }

    this.updateShake(dt);

    // The room's wildlife runs before perception, so the creature reacts to
    // where the beetle is now rather than where it was last frame.
    const lamp = this.lamps()[0];
    this.critters.update(dt, {
      lightsOn: this.lit,
      lampX: lamp?.body.position.x ?? this.environment.light.x,
      lampY: lamp ? topOf(lamp.body) * 0.9 : this.environment.light.y,
      petX: petBody.position.x,
      petZ: petBody.position.z,
    });

    const intent = this.brain.update(dt, this.perceive());

    // What the room looks like to something trying to cross it. Rebuilt only
    // when something that blocks the creature has actually moved, which in a
    // settled room is never.
    this.navGrid.sync(this.world.bodies, this.walker(), this.navBounds());

    this.stagger = Math.max(0, this.stagger - dt);

    this.applyMovement(dt, intent);
    this.updateMount(dt, intent.mountId);
    this.animation.setState(this.stateFor(intent.behavior));
    this.animation.setEmotion(intent.emotion, intent.emotionStrength);

    // The animation layer reads the physics rather than guessing: leaning,
    // spring lag and gait speed all come from these numbers.
    //
    // `vx` is the creature's speed *across the screen*, not along the room's x
    // axis, and the difference is the whole of "aligned with the physics" for
    // a room with depth in it. A creature walking straight toward the viewer
    // has no x velocity at all; driving its lean and its facing from that
    // number would have it gliding forward, feet still, facing whichever way
    // it happened to have been going last.
    const above = petBody.position.y - (petBody.support?.top ?? 0);
    this.animation.setMotion({
      vx: screenVelocityX(
        petBody.position.x,
        petBody.position.z,
        petBody.velocity.x,
        petBody.velocity.z,
      ),
      speed: Math.hypot(petBody.velocity.x, petBody.velocity.z),
      height: above,
      airborne: !petBody.held && !petBody.grounded && above > 12,
      held: petBody.held,
      impact: 0,
    });

    this.updatePounce(dt, intent.behavior);
    this.updateInteraction(dt, intent);

    if (intent.lookAt) {
      const at = project(intent.lookAt.x, intent.lookAt.y, intent.lookAt.z);
      const local = this.pet.root.toLocal({ x: at.x, y: at.y });
      this.animation.setLookTarget({ x: local.x, y: local.y });
    } else {
      this.animation.setLookTarget(null);
    }

    this.animation.update(dt * 1000);
    this.updateDressing(dt);

    const ghosts = this.occludedToys();
    for (const entity of this.entities.values()) {
      entity.motion.update(dt, entity.body);
      this.syncEntity(entity, ghosts);
    }

    // Other people's creatures, on the same clock as everything else in the
    // room. A separate ticker would drift, and drift between a creature and the
    // ground it is standing on is visible immediately.
    this.visitors.update(dt);

    // And ours, going the other way. Rate-limited and change-gated inside.
    this.transmit(dt);

    this.updateGuide(dt);

    // Night fades rather than snaps: the switch is instant, the room settling
    // into the dark is not.
    const dusk = this.environment.night.alpha;
    const target = this.lit ? 0 : dusk;
    this.nightAlpha += (target - this.nightAlpha) * Math.min(1, dt * 3.5);
    this.nightOverlay.alpha = this.nightAlpha;

    // The pool of window light creeps across the floor and breathes, the way
    // afternoon light does when something outside passes the window. Slow
    // enough that it is never caught moving, only noticed as having moved.
    const daylight = 1 - this.nightAlpha / Math.max(0.01, dusk);
    this.ambientLayer.alpha = daylight * (0.92 + Math.sin(this.time * 0.11) * 0.08);
    this.ambientLayer.x = Math.sin(this.time * 0.037) * 26;
    this.ambientLayer.y = Math.sin(this.time * 0.029 + 1.4) * 8;

    this.emitStatus(intent.mood, intent.behavior);
  }

  /** Describe the room for the brain (§38 environment awareness). */
  private perceive() {
    const objects: PerceivedObject[] = [];

    for (const entity of this.entities.values()) {
      if (entity.id === 'pet') continue;

      const body = entity.body;
      const surface = body.surface;

      objects.push({
        id: entity.id,
        x: body.position.x,
        z: body.position.z,
        height: body.position.y,
        speed: Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z),
        radius: this.footprintOf(body),
        isToy: entity.isToy,
        isCritter: false,
        // What the furniture offers: somewhere to be, at this height.
        restHeight: surface ? topOf(body) : null,
        comfort: surface?.comfort ?? 0,
        reachable: entity.reachable,
        // What this thing offers the creature to do, and how much of it is
        // left. Supply is the part the catalog cannot know: a bowl empties.
        affordance: entity.affordance
          ? { ...entity.affordance, supply: this.supplyOf(entity) }
          : null,
      });
    }

    // Other people's creatures, offered to the brain as things standing in the
    // room. Not a new kind of perception and not a new behaviour: "go and see
    // what that is" is a decision the brain already makes, and what is
    // different about another creature is only how interesting it is
    // (`PetBrain`'s ANOTHER_CREATURE). That one weight is the whole behavioural
    // half of the park — a creature wanders over to the others because they are
    // the most interesting things on the lawn, and nothing about it is scripted.
    //
    // `reachable` and nothing else: a visitor has no collider here, so the
    // navigator routes *to* it and the physics never has to resolve two
    // creatures occupying one another. Two simulations arguing about a contact
    // neither of them owns is exactly the class of bug this avoids.
    for (const userId of this.visitors.ids()) {
      const at = this.visitors.positionOf(userId);
      if (!at) continue;

      objects.push({
        id: `visitor:${userId}`,
        x: at.x,
        z: at.z,
        height: 0,
        speed: 0,
        radius: 42,
        isToy: false,
        isCritter: false,
        isPet: true,
        restHeight: null,
        comfort: 0,
        reachable: true,
        affordance: null,
      });
    }

    for (const critter of this.critters.critters) {
      objects.push({
        id: critter.id,
        x: critter.x,
        z: critter.z,
        height: critter.height,
        speed: critter.speed,
        radius: 10,
        isToy: false,
        isCritter: true,
        restHeight: null,
        comfort: 0,
        reachable: true,
        affordance: null,
      });
    }

    const body = this.petEntity.body;
    const above = body.position.y - (body.support?.top ?? 0);

    return {
      pet: {
        x: body.position.x,
        z: body.position.z,
        height: body.position.y,
        radius: this.footprintOf(body),
        held: body.held,
        // A jump it chose is not a fall. Without this the creature frightens
        // itself every time it hops onto the bed.
        airborne: !body.held && this.selfLaunched <= 0 && !body.grounded && above > 12,
        supportId: body.support?.id ?? null,
      },
      objects,
      lightsOn: this.lit,
      pointer: this.pointerOnFloor(),
    };
  }

  /**
   * Where the user's hand is, on the floor of the room.
   *
   * Null unless the pointer is genuinely over the world and has moved recently.
   * Both halves matter: a cursor parked on the canvas while somebody reads the
   * panel next to it is not attention, and a creature that treated it as
   * attention would spend the afternoon staring at an abandoned mouse.
   *
   * Projected through `unprojectGround`, so "where the hand is" is a place in
   * the room rather than a place on the screen — which is what lets the
   * creature walk to it, and lets "too close" mean the same thing at the back
   * of the room as at the front.
   */
  private pointerOnFloor(): { x: number; z: number } | null {
    const hover = this.hover;
    if (!hover || this.focused) return null;
    if (this.time - hover.at > POINTER_ATTENTION) return null;

    const ground = unprojectGround(hover.x, hover.y);
    const bounds = this.world.bounds;

    if (
      ground.x < bounds.minX ||
      ground.x > bounds.maxX ||
      ground.z < bounds.minZ ||
      ground.z > bounds.maxZ
    ) {
      return null;
    }

    return { x: ground.x, z: ground.z };
  }

  /**
   * The pointer moved over the room, dragging something or not.
   *
   * Separate from `pointerMove`, which is the *drag*: this fires whether or not
   * anything is in hand, because a creature noticing your cursor is something
   * that happens while you are simply looking at it. Stored in room-local
   * coordinates and stamped, so `pointerOnFloor` can forget a hand that has
   * stopped moving.
   */
  pointerHover(canvasX: number, canvasY: number): void {
    // Somebody else's creature does not react to *your* hand. Their pet's
    // fondness is a relationship with them, and having it come over to a
    // visitor's cursor would be the product telling a small lie about who it
    // likes.
    if (!this.interactive) return;

    const point = this.root.toLocal({ x: canvasX, y: canvasY });
    this.hover = { x: point.x, y: point.y, at: this.time };
  }

  /** The pointer left the room. The creature stops having an opinion about it. */
  pointerLeft(): void {
    this.hover = null;
  }

  /**
   * How much of an object's offer is left, 0..1.
   *
   * Objects that run down carry a `SuppliedState`; everything else is
   * inexhaustible. Asked for by shape rather than by type, so the room never
   * has to know which of its contents happens to be a bowl.
   */
  private supplyOf(entity: Entity): number {
    const state = readState<SuppliedState>(entity.view);
    return state ? Math.max(0, Math.min(1, state.level)) : 1;
  }

  /**
   * Start, continue or stop an interaction.
   *
   * The clip is looping and lives for exactly as long as the brain says the
   * creature is using something, which is why this is three lines rather than
   * a state machine: the animation layer already knows how to blend a looping
   * clip in and out (`animation/core/Clip.ts`).
   */
  private updateInteraction(dt: number, intent: Intent): void {
    const kind = intent.behavior === 'use' ? intent.useKind : null;

    if (kind !== this.interaction.kind) {
      // By name, never bare: `stopClip()` with no argument would also cancel
      // a landing or a pounce that happened to be running.
      if (this.interaction.kind) this.animation.stopClip(this.interaction.kind);
      this.interaction.kind = kind;
    }

    if (!kind) return;

    // Re-request the clip whenever it is not the one playing, rather than only
    // when the interaction starts.
    //
    // Interaction clips sit below impacts on purpose — walking into the
    // scratching post hard enough still knocks the creature about — but the
    // first version started the clip once and never looked again, so a single
    // bump meant the creature spent the rest of its supper standing perfectly
    // still. `play` declines while something higher-priority is running, so
    // asking every frame costs nothing and picks the interaction back up the
    // moment the impact is over.
    if (this.animation.playingClip !== kind) {
      this.animation.play(createInteractionClip(kind));
    }

    // Using something up. Eating is the only affordance that consumes
    // anything so far, and the room finds out by asking the object for a
    // supply rather than by knowing what a bowl is.
    const target = intent.useTargetId
      ? this.entities.get(intent.useTargetId)
      : undefined;
    if (!target) return;

    const state = readState<SuppliedState>(target.view);
    if (state && kind === 'eat') state.take(dt / 6);
  }

  private footprintOf(body: PhysicsBody): number {
    return body.collider.shape === 'cylinder' ? body.collider.radius : body.collider.halfX;
  }

  /**
   * Something in the room announced itself, via `ObjectLife.drain()`.
   *
   * `'chime'` was the clock striking the hour. The clock hangs on the wall
   * grid now (`WallDecor.ts`'s `clock` entry) rather than living as an entity
   * in `this.entities`, so it is never ticked here and this branch is
   * currently unreachable — left in place, rather than removed, because the
   * dispatch itself is generic and a future object type is free to raise
   * `'chime'` (or any other name a life wants to drain) and land here.
   */
  private onObjectEvent(entity: Entity, event: string): void {
    if (event !== 'chime') return;

    this.emitSound('chime', 0.7, entity.body.position, entity.type as ObjectType);

    // Not an emergency: a creature looks up when the clock strikes, and then
    // gets on with its afternoon.
    this.brain.noticeObject(entity.id, 0.35);
    this.animation.impulse(0.35);
    this.critters.disturb(entity.body.position.x, entity.body.position.z, 0.7);
  }

  /**
   * Where the creature is allowed to walk, in room coordinates.
   *
   * The room's own bounds, pulled in by the creature's radius, because the
   * physics clamps its *centre* and the navigator plans for its *edge*. Wider
   * than the patch the brain picks wander targets in (`brainBounds`) — the
   * brain is choosing somewhere pleasant to go, the navigator is working out
   * what is physically possible, and those are not the same question.
   */
  private navBounds() {
    const { minX, maxX, minZ, maxZ } = this.world.bounds;
    const radius = this.petRadius();

    return {
      minX: minX + radius,
      maxX: maxX - radius,
      minZ: minZ + radius,
      maxZ: maxZ - radius,
    };
  }

  /** What the creature is, as far as finding a way round the room goes. */
  private walker(): Walker {
    const body = this.petEntity.body;

    return {
      radius: this.petRadius(),
      stepHeight: body.stepHeight,
      mass: body.mass,
      // You cannot be blocked by the thing you are standing on top of.
      supportId: body.support?.id ?? null,
    };
  }

  /**
   * Turn the brain's intent into somewhere for the navigator to aim at.
   *
   * The interesting half is the middle branch. When the brain names a *thing*,
   * the destination tracks that thing's live position rather than wherever it
   * was when the creature made up its mind — so a ball that rolls on is still
   * being chased rather than being walked to the memory of — and it carries
   * the standing distance, so arriving means "beside it" rather than "on top
   * of it" (§8 of the movement brief).
   */
  private destinationFor(intent: Intent): Destination | null {
    const target = intent.moveTarget;
    if (!target) return null;

    const standOff = this.petRadius() + APPROACH_GAP;
    const entity = intent.moveTargetId
      ? this.entities.get(intent.moveTargetId)
      : undefined;

    if (entity) {
      return {
        x: entity.body.position.x,
        z: entity.body.position.z,
        objectId: entity.id,
        radius: this.footprintOf(entity.body),
        standOff,
      };
    }

    // Named something with no body — a beetle, a moth. It has a position and a
    // name and nothing to walk around, so it is a place that keeps moving.
    if (intent.moveTargetId) {
      return {
        x: target.x,
        z: target.z,
        objectId: intent.moveTargetId,
        radius: 0,
        standOff,
      };
    }

    return { x: target.x, z: target.z };
  }

  /**
   * Carry out the brain's intent. The brain never touches velocities.
   *
   * Three layers, and they are deliberately different sizes. The *route* is
   * the navigator's: which side of the bed to go round, and what to do when
   * that stops working. The *stride* is the character controller's. Between
   * them sits one frame of steering, for whatever has wandered into the way
   * since the route was planned — a shove past a toy, a curve around a chair —
   * which is too small and too temporary to be worth re-planning over.
   *
   * When the navigator runs out of ideas the brain is told, and the brain
   * abandons the behaviour rather than the creature abandoning the room (§9).
   */
  private applyMovement(dt: number, intent: Intent): void {
    const body = this.petEntity.body;
    const destination = this.destinationFor(intent);

    if (body.held || !destination) {
      this.navigator.clear();
      this.legs.stop();
      return;
    }

    this.navigator.setDestination(destination);

    // Tripping, falling and jumping are not failures to navigate, so the
    // navigator's patience does not run down during them.
    const suspended = this.stagger > 0 || (!body.grounded && this.selfLaunched > 0);

    const { status, waypoint } = this.navigator.update(
      dt,
      { x: body.position.x, z: body.position.z },
      { suspended },
    );

    if (status === 'failed') {
      const missed = this.navigator.targetId;
      this.navigator.clear();
      this.legs.stop();
      this.brain.couldNotReach(missed);
      return;
    }

    if (!waypoint) {
      this.legs.stop();
      return;
    }

    const dx = waypoint.x - body.position.x;
    const dz = waypoint.z - body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1) return;

    const obstruction = this.world.blocked(body, dx, dz, 30);
    if (obstruction) {
      // Perpendicular to the way it wants to go, on the side the obstacle is
      // not. Walking round a chair rather than into it.
      let px = -dz / distance;
      let pz = dx / distance;
      const ox = obstruction.body.position.x - body.position.x;
      const oz = obstruction.body.position.z - body.position.z;
      if (ox * px + oz * pz > 0) {
        px = -px;
        pz = -pz;
      }
      this.legs.steerAround(px * 1.7, pz * 1.7, 0.5);
    }

    this.legs.moveTo(waypoint.x, waypoint.z, intent.behavior === 'chase');
  }

  /**
   * Walking into something solid, at pace.
   *
   * The brief asks for a creature that is squishy, fragile and slightly
   * clumsy, and this is where that is paid for. A rigid controller resolves
   * the contact and stops dead; instead the creature bounces off along the
   * contact normal, is given a sideways bias so it scrapes past rather than
   * squaring up to the obstacle again, and its artwork is knocked out of true
   * for a moment. Nothing about its *intent* changes — it still wants to be
   * over there, and it carries on wanting that while it trips over.
   */
  private stumble(speed: number, other: PhysicsBody): void {
    if (this.stagger > 0) return;

    const body = this.petEntity.body;

    const dx = body.position.x - other.position.x;
    const dz = body.position.z - other.position.z;
    const away = Math.hypot(dx, dz) || 1;
    const nx = dx / away;
    const nz = dz / away;

    const force = Math.min(1, speed / 700);

    // Bounce off it. Small: this is a creature made of dough walking into a
    // bed frame, not a billiard ball.
    this.world.push(body, {
      x: nx * (30 + force * 70),
      z: nz * (30 + force * 70),
    });

    // And slide along it, on whichever side it was already heading.
    let px = -nz;
    let pz = nx;
    if (px * body.velocity.x + pz * body.velocity.z < 0) {
      px = -px;
      pz = -pz;
    }
    this.legs.steerAround(px * 1.6, pz * 1.6, 0.5);

    const direction = this.screenDirectionTo(other);
    this.animation.play(createSmashClip(force * 0.6, direction));
    this.animation.impulse(0.5 + force, -direction);
    this.petEntity.motion.knock(0.4 + force * 0.8, -direction);

    this.stagger = 0.28 + force * 0.35;
    // Wherever it was going, it is not going there in a straight line now.
    this.navigator.disturb();
  }

  /**
   * Climbing onto the furniture.
   *
   * The brain says *what* to climb; how hard to jump is arithmetic, and
   * whether the jump lands is the solver's business. Getting this wrong is
   * visible and fine — a creature that misjudges the bed and bounces off the
   * side of it is better company than one that teleports onto it.
   */
  private updateMount(dt: number, mountId: string | null): void {
    this.mountCooldown -= dt;

    const body = this.petEntity.body;
    if (!mountId || this.mountCooldown > 0 || body.held) return;
    if (body.support?.id === mountId || !body.grounded) return;

    const target = this.entities.get(mountId);
    if (!target || !target.body.surface) return;

    const rise = topOf(target.body) - body.position.y;
    if (rise <= 4) return;

    const direction = this.screenDirectionTo(target.body);

    // Aim the jump rather than just throwing the creature at the furniture:
    // rise high enough to clear the surface, and travel exactly far enough to
    // be over the middle of it when gravity has finished with the climb.
    const lift = Math.sqrt(2 * GRAVITY * (rise + 55));
    const climb = lift / GRAVITY;

    const across = (value: number) => Math.max(-340, Math.min(340, value / climb));

    this.legs.jump({
      y: lift,
      x: across(target.body.position.x - body.position.x),
      z: across(target.body.position.z - body.position.z),
    });

    // Let it scramble up through the thing it is climbing.
    body.passThrough = mountId;

    this.animation.play(createPounceClip(direction));
    this.mountCooldown = 1.7;
    this.selfLaunched = 1.4;
  }

  /**
   * Shaking.
   *
   * Energy accumulates on direction reversals and drains constantly, so the
   * clip starts a moment into a real shake and stops a moment after it ends.
   * The peak is what the creature remembers afterwards.
   */
  private updateShake(dt: number): void {
    this.shake.energy = Math.max(0, this.shake.energy - dt * 1.3);

    const holdingPet = this.grabbed?.id === 'pet';
    const shaking = holdingPet && this.shake.energy > SHAKE_TRIGGER;

    if (shaking && !this.shake.active) {
      this.animation.play(
        createShakeClip(() => Math.max(0, Math.min(1, this.shake.energy))),
      );
      this.shake.active = true;
    } else if (!shaking && this.shake.active) {
      this.animation.stopClip('shake');
      this.shake.active = false;

      if (this.shake.peak > 0.6) this.brain.shaken(this.shake.peak);
      this.shake.peak = 0;
    }
  }

  /**
   * Playing with toys.
   *
   * Three things happen and they all happen on the clip's own schedule, which
   * is the whole point: the crouch, then the body physically leaving the
   * ground, then the toy being struck at the instant the paws come down on it.
   * The clip publishes those two beats (`POUNCE_TIMING`) so the animation and
   * the simulation are describing one event rather than two that happen to
   * overlap — a pounce whose body never moves is a creature miming, and a toy
   * that flies at an unrelated moment is a creature with telekinesis (§24).
   */
  private updatePounce(dt: number, behavior: PetBehavior): void {
    if (this.pounce.leapTimer > 0) {
      this.pounce.leapTimer -= dt;
      if (this.pounce.leapTimer <= 0) this.leapAtToy();
    }

    if (this.pounce.batTimer > 0) {
      this.pounce.batTimer -= dt;
      if (this.pounce.batTimer <= 0) this.batToy();
    }

    this.pounce.cooldown -= dt;

    const body = this.petEntity.body;

    // Not while it is in your hand, and not while it is in the air: a pounce
    // launched mid-flight lands nowhere and looks like a glitch.
    if (behavior !== 'play' || !body.grounded || body.held) return;
    if (this.pounce.cooldown > 0 || this.pounce.targetId) return;

    const toy = this.nearestToy(POUNCE_RANGE);
    if (!toy) return;

    this.animation.play(createPounceClip(this.screenDirectionTo(toy.body)));

    this.pounce.cooldown = 1.9 + Math.random() * 1.2;
    this.pounce.leapTimer = POUNCE_TIMING.leap;
    this.pounce.batTimer = POUNCE_TIMING.contact;
    this.pounce.targetId = toy.id;
  }

  /** The moment the crouch releases: the body actually jumps. */
  private leapAtToy(): void {
    const toy = this.pounce.targetId
      ? this.entities.get(this.pounce.targetId)
      : undefined;
    const body = this.petEntity.body;
    if (!toy || body.held || !body.grounded) return;

    // Aim the hop so the creature is coming down on the toy at the moment the
    // clip says its paws arrive.
    const flight = POUNCE_TIMING.contact - POUNCE_TIMING.leap;
    const lift = (GRAVITY * flight) / 2;

    const dx = toy.body.position.x - body.position.x;
    const dz = toy.body.position.z - body.position.z;
    const gap = Math.max(1, Math.hypot(dx, dz) - this.footprintOf(toy.body));

    this.legs.jump({
      y: lift,
      x: (dx / (gap + 1)) * (gap / flight) * 0.8,
      z: (dz / (gap + 1)) * (gap / flight) * 0.8,
    });

    // It meant to do that, so landing is not a fright.
    this.selfLaunched = flight + 0.4;
  }

  /** The nearest toy within `range` of the creature's edge. */
  private nearestToy(range: number): Entity | null {
    const body = this.petEntity.body;
    const reach = this.footprintOf(body);

    let best: Entity | null = null;
    let bestGap = range;

    for (const entity of this.entities.values()) {
      if (!entity.isToy || entity.body.held) continue;

      // Edge to edge. Centre to centre would have the creature pouncing on
      // things it is nowhere near, because a big toy's middle is a long way
      // from its side.
      const gap =
        Math.hypot(
          entity.body.position.x - body.position.x,
          entity.body.position.z - body.position.z,
        ) -
        reach -
        this.footprintOf(entity.body);

      if (gap < bestGap) {
        best = entity;
        bestGap = gap;
      }
    }

    return best;
  }

  /**
   * The moment a pounce connects.
   *
   * Where the toy goes is worked out in `room/Swipe.ts`, because keeping the
   * ball out of the corners turned out to be a subject rather than a line.
   */
  private batToy(): void {
    const id = this.pounce.targetId;
    this.pounce.targetId = null;
    if (!id) return;

    const toy = this.entities.get(id);
    const body = this.petEntity.body;
    if (!toy || toy.body.held) return;

    const dx = toy.body.position.x - body.position.x;
    const dz = toy.body.position.z - body.position.z;
    const distance = Math.hypot(dx, dz);
    const gap = distance - this.footprintOf(body) - this.footprintOf(toy.body);
    if (gap > POUNCE_RANGE) return;

    // Most of whatever it was already doing is lost in the strike. Without
    // this a ball rolling hard into the corner is merely deflected by the
    // swipe, and the swipe's whole job is to be the thing that decides where
    // the ball goes next.
    this.world.setVelocity(toy.body, {
      x: toy.body.velocity.x * 0.3,
      z: toy.body.velocity.z * 0.3,
    });

    const aim = distance || 1;
    const swipe = swipeImpulse(
      { ...toy.body.position, radius: this.footprintOf(toy.body) },
      dx / aim,
      dz / aim,
      this.world.bounds,
      this.blockersFor(toy.body),
    );
    this.world.push(toy.body, swipe);

    this.ownSwipe = { id, until: this.time + OWN_SWIPE_TIME };

    const direction = this.screenDirectionTo(toy.body);
    toy.motion.fling(direction * (Math.random() * 6 + 2));
    this.animation.impulse(0.7, direction);
    this.critters.disturb(toy.body.position.x, toy.body.position.z, 0.6);
  }

  /**
   * Everything a batted toy could end up stuck behind.
   *
   * Scenery is included, and should be: the creature walks through the plant,
   * but a ball does not, so a ball can be lost behind one. The creature itself
   * is left out because it is already the direction the swipe is coming from.
   */
  private blockersFor(toy: PhysicsBody): Blocker[] {
    const blockers: Blocker[] = [];

    for (const body of this.world.bodies) {
      if (body === toy || body.held || body.type === 'character') continue;
      // Things the toy can simply roll over are not in its way.
      if (body.collider.height < toy.collider.height * 0.5) continue;

      blockers.push({
        x: body.position.x,
        z: body.position.z,
        halfX: halfX(body.collider),
        halfZ: halfZ(body.collider),
        round: body.collider.shape === 'cylinder',
      });
    }

    return blockers;
  }

  /**
   * Which way something is, as the viewer sees it.
   *
   * Not the sign of the x difference: a toy directly behind the creature is at
   * the same x and would give no direction at all, while on screen it is
   * plainly up and slightly to one side. The clips only know left and right,
   * so they get the answer the screen would give.
   */
  private screenDirectionTo(target: PhysicsBody): -1 | 1 {
    const body = this.petEntity.body;
    const here = project(body.position.x, 0, body.position.z);
    const there = project(target.position.x, 0, target.position.z);
    return there.x < here.x ? -1 : 1;
  }

  private stateFor(behavior: PetBehavior): PetStateName {
    const body = this.petEntity.body;
    const speed = Math.hypot(body.velocity.x, body.velocity.z);

    switch (behavior) {
      case 'held':
        return 'held';
      case 'scared':
        return 'scared';
      case 'angry':
        return 'angry';
      case 'dizzy':
        return 'dizzy';
      case 'sleep':
        return 'sleep';
      case 'sit':
        return 'sit';
      case 'play':
        return 'play';
      // Using something is carried entirely by its clip; underneath it the
      // creature is simply standing there, which is what a clip needs to blend
      // out onto.
      case 'use':
        return 'idle';
      case 'investigate':
        return 'discover';
      case 'chase':
        // Chasing hard enough is a run; ambling after something is a hop.
        return speed > 230 ? 'run' : speed > 12 ? 'hop' : 'idle';
      case 'wander':
      case 'rest':
        return speed > 12 ? 'hop' : 'idle';
      default:
        return 'idle';
    }
  }

  // --- Drawing --------------------------------------------------------------

  /**
   * Put one entity's artwork where its body says it is.
   *
   * Four things come out of the projection at once, and it is worth naming
   * them because between them they are the whole of the room's sense of space:
   * *where* on screen the thing stands, *how big* it is drawn, *how pale* it
   * is, and *when* it is drawn relative to everything else.
   */
  /**
   * Toys the furniture is standing in front of, and what they have to be
   * drawn above to still be seen.
   *
   * A ball that has rolled behind the bed is sorted correctly by `sortKeyOf`
   * and is therefore invisible, which is correct perspective and a bad game:
   * the one thing a user wants from a toy is to know where it is. So an
   * occluded toy is drawn *over* whatever is covering it, dimmed to
   * `GHOST_ALPHA` — present, clearly behind, findable.
   *
   * Only toys, and only against things genuinely in front of them on screen,
   * so the cost is a handful of rectangle tests a frame rather than a second
   * full sort of the room.
   */
  private occludedToys(): Map<string, number> {
    const ghosts = new Map<string, number>();

    for (const toy of this.entities.values()) {
      if (!toy.isToy || toy.body.held) continue;

      const toyKey = sortKeyOf(toy.body, null);
      const toyRect = screenRectOf(toy.body);
      let cover = -Infinity;

      for (const other of this.entities.values()) {
        if (other === toy || other.id === 'pet') continue;
        // Decals and wall decor are not "in front of" anything.
        if (other.body.collider.height <= 0 || other.body.anchored) continue;

        const otherKey = sortKeyOf(other.body, null);
        if (otherKey <= toyKey) continue;
        if (!overlaps(toyRect, screenRectOf(other.body))) continue;

        cover = Math.max(cover, otherKey);
      }

      if (cover > -Infinity) ghosts.set(toy.id, cover);
    }

    return ghosts;
  }

  private syncEntity(entity: Entity, ghosts?: ReadonlyMap<string, number>): void {
    const { body, view, art, shadow } = entity;

    const scale = scaleAt(body.position.z);
    const base = project(body.position.x, 0, body.position.z);

    // The creature's artwork is drawn at its own scale on top of the camera's,
    // so anything measured in world units has to be divided back out before it
    // is used as a coordinate inside its container.
    const unit = entity.id === 'pet' ? PET_SCALE : 1;

    view.position.set(base.x, base.y);
    view.scale.set(scale * unit);

    // Aerial perspective, unless the thing is being held somewhere it may not
    // be put down — in which case it goes red, because the object in the
    // user's hand is what they are looking at while they decide, not the
    // marking on the floor underneath it.
    //
    // The whole tint, not a blend with the depth tint: a tint multiplies, so
    // half a punch over a pink plush is still a pink plush. `punch` is the
    // same "no" the drop guide draws in, so the two read as one answer.
    const tint =
      entity.id === this.refusedDrop ? PALETTE.punch : depthTintOf(body.position.z);
    if (view.tint !== tint) view.tint = tint;

    const holder = body.support?.id ? (this.world.get(body.support.id) ?? null) : null;
    view.zIndex = sortKeyOf(body, holder);

    // A toy the furniture is standing in front of is sorted correctly and
    // therefore invisible, which is correct perspective and a bad game: the
    // one thing worth knowing about a toy is where it is. Drawn above its
    // occluder instead, and dimmed, so it still reads as *behind* the thing
    // covering it rather than as misplaced.
    const ghost = ghosts?.get(entity.id);
    if (ghost !== undefined) {
      view.zIndex = ghost + 0.25;
      view.alpha = GHOST_ALPHA;
    } else if (view.alpha !== 1) {
      view.alpha = 1;
    }

    // Artwork is anchored at the floor contact point, so lifting it is just
    // its height.
    //
    // The pivot is what a tumble rotates about — four tenths of the way up the
    // body, not its feet — and moving a pivot moves the content with it unless
    // the position pays it back. It did not, so every object was drawn
    // `height * 0.4` *below* its own contact point: the shadow and the drop
    // guide sat on the cell the grid had chosen while the artwork stood a row
    // or more in front of it, and nothing tall could be seen to reach the back
    // wall however honestly it had been placed there. The taller the thing the
    // worse it was, which is why it read as "the lamp and the shelf ignore the
    // grid" rather than as one drawing bug.
    const sink = holder?.surface?.give ?? 0;
    const pivotY = (-body.collider.height * 0.4) / unit;
    art.pivot.set(0, pivotY);
    art.position.set(
      0,
      (-body.position.y + Math.min(sink, body.position.y)) / unit + pivotY,
    );

    if (entity.id === 'pet') {
      // The creature's lean is the animation layer's business while it is on
      // its feet. Off them, it tumbles.
      const loose = body.held || (!body.grounded && body.position.y > 24);
      const target = loose ? entity.motion.angle : 0;
      art.rotation += (target - art.rotation) * 0.25;
    } else {
      art.rotation = entity.motion.angle;
    }

    if (shadow) {
      // The shadow belongs on whatever the object is standing on, not on the
      // floor: a ball on the table casts onto the table.
      const surfaceY = body.support?.top ?? 0;
      shadow.y = -surfaceY / unit;
      applyShadowHeight(shadow, Math.max(0, body.position.y - surfaceY), 240);
      // Hard noon light casts a hard shadow; moonlight barely casts one.
      shadow.alpha *= this.mood.ambience.shadow.strength;
    }
  }

  /**
   * Show where a carried thing will land, and on which cells.
   *
   * Note what is passed: the *snapped* placement, not the pointer's own
   * position. The guide is a promise about where the object is going, and the
   * only way to keep that promise is to run the same snap the drop will run.
   */
  private updateGuide(dt: number): void {
    const drop = this.world.manipulator.dropPoint();
    const body = this.world.manipulator.held;
    const entity = body ? this.entities.get(body.id) : undefined;

    if (!drop || !body || !entity || entity.id === 'pet') {
      this.refusedDrop = null;
      this.guide.update(null, dt);
      return;
    }

    const placement = snapFootprint(
      drop.x,
      drop.z,
      this.footprintOfType(entity.type as ObjectType),
    );

    const refused = this.stackBlockedAt(placement, body.id);
    this.refusedDrop = refused ? entity.id : null;

    this.guide.update(
      {
        anchor: { col: placement.col, row: placement.row },
        footprint: placement.footprint,
        x: placement.x,
        z: placement.z,
        surfaceY: this.world.surfaceHeightAt(placement.x, placement.z, body.id),
        bodyY: body.position.y,
        radius: this.footprintOf(body),
        invalid: refused,
      },
      dt,
    );
  }

  /**
   * Which cells a carried body will land on.
   *
   * The snapped answer, again — the status line and the floor guide have to
   * agree, and they agree by asking the same function. Nothing while the thing
   * is lifted past the back wall: at that point the pointer is choosing a
   * height rather than a place on the floor, and naming cells there would be
   * inventing an answer.
   */
  private holdingCell(body: PhysicsBody): (GridAnchor & { footprint: Footprint }) | null {
    if (body.position.z <= this.world.bounds.minZ + 1) return null;

    const entity = this.entities.get(body.id);
    if (!entity || entity.id === 'pet') return null;

    const placement = snapFootprint(
      body.position.x,
      body.position.z,
      this.footprintOfType(entity.type as ObjectType),
    );

    return { col: placement.col, row: placement.row, footprint: placement.footprint };
  }

  private emitStatus(mood?: string, behavior?: PetBehavior): void {
    if (!this.onStatus) return;

    const held = this.world.manipulator.held;

    const next: RoomStatus = {
      mood: mood ?? this.lastStatus?.mood ?? 'settling in',
      behavior: behavior ?? this.lastStatus?.behavior ?? 'idle',
      lightsOn: this.lightsOn,
      style: this.style,
      holding: this.grabbed ? (this.grabbed.id === 'pet' ? 'pet' : 'prop') : null,
      holdingCell: held ? this.holdingCell(held) : null,
      editing: this.editing,
      discarding: this.discarding,
    };

    const previous = this.lastStatus;
    if (
      previous &&
      previous.mood === next.mood &&
      previous.behavior === next.behavior &&
      previous.lightsOn === next.lightsOn &&
      sameRoomStyle(previous.style, next.style) &&
      previous.holding === next.holding &&
      previous.editing === next.editing &&
      previous.discarding === next.discarding &&
      previous.holdingCell?.row === next.holdingCell?.row &&
      previous.holdingCell?.col === next.holdingCell?.col &&
      previous.holdingCell?.footprint.cols === next.holdingCell?.footprint.cols &&
      previous.holdingCell?.footprint.rows === next.holdingCell?.footprint.rows
    ) {
      return;
    }

    this.lastStatus = next;
    this.onStatus(next);
  }

  // --- Layout ---------------------------------------------------------------

  private onResize = () => {
    this.layout();
  };

  /**
   * Change the overscale after the room has been built.
   *
   * Focus mode needs this: the room grows to fill the screen and shrinks back,
   * and rebuilding the scene to do it would put the creature back where it
   * started — which is the one thing a "look closer" gesture must not do.
   */
  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    this.layout();
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    const fitted =
      this.fit === 'contain'
        ? Math.min(width / SCREEN_WIDTH, height / SCREEN_HEIGHT)
        : Math.max(width / SCREEN_WIDTH, height / SCREEN_HEIGHT);

    const scale = fitted * this.zoom;

    this.root.scale.set(scale);
    this.root.position.set(
      (width - SCREEN_WIDTH * scale) / 2,
      (height - SCREEN_HEIGHT * scale) / 2,
    );
  }

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.app.renderer.off('resize', this.onResize);
    this.root.destroy({ children: true });
  }
}
