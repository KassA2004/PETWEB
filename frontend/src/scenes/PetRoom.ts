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
import { createAtmosphere } from '../assets/environment/Atmosphere';
import type { AtmosphereView } from '../assets/environment/Atmosphere';
import { applyShadowHeight } from '../assets/environment/Shadows';
import { createCritters } from '../assets/environment/Critters';
import type { CrittersView } from '../assets/environment/Critters';
import { getObjectTraits, renderObject } from '../assets/objects/ObjectRenderer';
import type { ObjectType } from '../assets/objects/ObjectRenderer';
import { updateLife } from '../assets/objects/ObjectLife';
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
import { PetBrain } from '../simulation/PetBrain';
import type { Intent, PetBehavior, PerceivedObject } from '../simulation/PetBrain';
import { NavGrid, Navigator } from '../simulation/navigation';
import type { Destination, Walker } from '../simulation/navigation';
import {
  PhysicsWorld,
  clamp,
  createBody,
  halfX,
  halfZ,
  topOf,
} from '../simulation/physics';
import type {
  CharacterController,
  Collider,
  PhysicsBody,
  SurfaceSpec,
  Vec3,
} from '../simulation/physics';
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  heightAt,
  project,
  scaleAt,
  screenVelocityX,
  unprojectGround,
  unprojectX,
} from '../world/Projection';
import {
  GRID_COLUMNS,
  cellAt,
  cellCenter,
  rowForBand,
  snapToGrid,
} from '../world/FloorGrid';
import { DEFAULT_ENVIRONMENT } from '../world/environments';
import type { EnvironmentDefinition, PlacedProp } from '../world/environments';
import {
  DEFAULT_AMBIENCE,
  DEFAULT_ROOM_TINT,
  fieldColor,
  getAmbience,
} from '../world/Ambience';
import type { AmbienceId, RoomMood } from '../world/Ambience';
import { depthTintOf, pickAt, sortKeyOf } from './room/BodyView';
import { createDepthGuide } from './room/DepthGuide';
import { swipeImpulse } from './room/Swipe';
import type { Blocker } from './room/Swipe';
import type { DepthGuideView } from './room/DepthGuide';
import { PropMotion, motionStyleFor } from './room/PropMotion';

const PET_SCALE = 0.8;

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

/** One thing in the room: art, a body, and a shadow that stays on the floor. */
interface Entity {
  id: string;
  type: ObjectType | 'pet';
  view: Container;
  /** Everything except the contact shadow, so the art can lift on its own. */
  art: Container;
  body: PhysicsBody;
  shadow: Graphics | null;
  motion: PropMotion;
  isToy: boolean;
  /** Scenery: can be looked at and wondered about, never walked to. */
  reachable: boolean;
}

export interface RoomStatus {
  mood: string;
  behavior: PetBehavior;
  lightsOn: boolean;
  /** The hour of day the room is currently dressed for. */
  ambience: AmbienceId;
  /** The colour the room is currently built from. */
  tint: number;
  /** What the pointer currently has hold of. */
  holding: 'pet' | 'prop' | null;
  /** Which row of the room the held thing is over, for the interface. */
  /**
   * Which tile of the floor grid the carried thing is over.
   *
   * Null when nothing is being carried, and null while something is being held
   * above the back wall, where there is no floor under it to name.
   */
  holdingCell: { row: number; col: number } | null;
}

export interface PetRoomOptions {
  appearance?: PetAppearanceInput;
  fit?: 'cover' | 'contain';
  onStatus?: (status: RoomStatus) => void;
  /** Which room the creature lives in. Defaults to the farmhouse. */
  environment?: EnvironmentDefinition;
  /** What hour the room starts dressed for. */
  ambience?: AmbienceId;
  /** What colour the room is built from. */
  tint?: number;
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
  private onStatus?: (status: RoomStatus) => void;

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
   * What hour it is in the room and what the room is made of.
   *
   * The environment says what is *there*; the mood says what light is on it
   * and what colour it is painted (world/Ambience.ts). Keeping them apart is
   * what lets one room be five rooms.
   */
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
  private entities = new Map<string, Entity>();
  private petEntity!: Entity;
  /** Seconds since the room opened, for everything that ticks on its own. */
  private time = 0;

  private lightsOn = true;
  private nightAlpha = 0;

  /** Pointer drag state. */
  private grabbed: Entity | null = null;
  private grabStart = { time: 0, moved: 0 };
  /** Where the grabbed thing was standing, so a click can put it back. */
  private grabOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private pointer = { x: 0, y: 0 };
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
    this.onStatus = options.onStatus;
    this.environment = options.environment ?? DEFAULT_ENVIRONMENT;
    this.mood = {
      ambience: getAmbience(options.ambience ?? DEFAULT_AMBIENCE),
      tint: options.tint ?? DEFAULT_ROOM_TINT,
    };

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

    for (const prop of environment.props) this.addProp(prop);

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
    const scenery = this.environment.createScenery(this.mood);

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
   * Change what hour it is in the room.
   *
   * The furniture, the creature and everything it remembers stay exactly where
   * they were — this is the light changing, not a new room (§17).
   */
  setAmbience(id: AmbienceId): void {
    if (this.mood.ambience.id === id) return;
    this.mood = { ...this.mood, ambience: getAmbience(id) };
    this.dress(true);
    this.emitStatus();
  }

  /** Change what the room is painted and built from. */
  setRoomTint(color: number): void {
    if (this.mood.tint === color) return;
    this.mood = { ...this.mood, tint: color };
    this.dress(true);
    this.emitStatus();
  }

  get ambienceId(): AmbienceId {
    return this.mood.ambience.id;
  }

  get roomTint(): number {
    return this.mood.tint;
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
      view: this.pet.root,
      art,
      body,
      shadow,
      motion: new PropMotion('tumble', this.petRadius()),
      isToy: false,
      reachable: true,
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

  /** Scale a collider authored at scale 1 up to the size it is drawn at. */
  private scaleCollider(collider: Collider, scale: number): Collider {
    return collider.shape === 'cylinder'
      ? {
        shape: 'cylinder',
        radius: collider.radius * scale,
        height: collider.height * scale,
      }
      : {
        shape: 'box',
        halfX: collider.halfX * scale,
        halfZ: collider.halfZ * scale,
        height: collider.height * scale,
      };
  }

  private addProp(prop: PlacedProp): Entity {
    const traits = getObjectTraits(prop.definition.type);
    const scale = (prop.definition.scale ?? 1) * 0.85;

    const view = renderObject({
      ...prop.definition,
      scale,
    });
    const { art, shadow } = this.splitArt(view);

    // The collision volume and the resting surface are authored at scale 1
    // alongside the artwork, so both have to be scaled with it.
    const collider = this.scaleCollider(traits.collider, scale);

    const surface: SurfaceSpec | undefined = traits.surface
      ? {
        ...traits.surface,
        rim: traits.surface.rim === undefined ? undefined : traits.surface.rim * scale,
        inset:
          traits.surface.inset === undefined ? undefined : traits.surface.inset * scale,
        give: traits.surface.give === undefined ? undefined : traits.surface.give * scale,
      }
      : undefined;

    const body = this.world.add(
      createBody({
        id: prop.id,
        type: traits.body,
        position: {
          x: prop.x,
          // Wall-hung decor never touches the floor.
          y: traits.mount === undefined ? 0 : traits.mount * scale,
          z: prop.z,
        },
        collider,
        mass: traits.mass * scale,
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
    };

    this.entities.set(prop.id, entity);
    this.stageLayer.addChild(view);
    this.syncEntity(entity);

    return entity;
  }

  /** Drop a new object into the room, e.g. from the inventory. */
  placeObject(
    id: string,
    type: ObjectType,
    options: { x?: number; z?: number } = {},
  ): void {
    if (this.entities.has(id)) return;

    const traits = getObjectTraits(type);
    const mounted = traits.mount !== undefined;

    // A new object lands on a tile: the row its type prefers, and a column
    // somewhere across the middle of the room. Explicit coordinates from the
    // caller win, and are snapped like any other placement.
    const home = cellCenter(
      Math.floor(GRID_COLUMNS * (0.3 + Math.random() * 0.4)),
      rowForBand(traits.home ?? 'front'),
    );

    const entity = this.addProp({
      id,
      definition: { type, seed: id.length * 7 + 3 },
      x: options.x ?? home.x,
      z: options.z ?? (mounted ? 8 : home.z),
    });

    if (mounted) return;

    if (entity.body.type === 'static') {
      // Furniture is never integrated, so dropping it from a height would
      // leave it hanging there. It is placed instead.
      this.settlePlacement(entity);
      return;
    }

    // Arrives from above, so you can see it land.
    this.world.place(entity.body, { y: 300 });
  }

  /** Take an object back out of the room. */
  removeObject(id: string): void {
    const entity = this.entities.get(id);
    if (!entity || entity.id === 'pet') return;

    if (this.world.manipulator.held === entity.body) this.world.release();
    if (this.grabbed === entity) this.grabbed = null;

    this.world.remove(id);
    this.entities.delete(id);
    entity.view.destroy({ children: true });
  }

  hasObject(id: string): boolean {
    return this.entities.has(id);
  }

  /** Every lamp in the room, whichever room it is. */
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

  setLights(on: boolean): void {
    if (this.lightsOn === on) return;
    this.lightsOn = on;
    this.brain.lightsChanged(on);

    // Every lamp in the room, whichever room it is. Deep search, because the
    // lamp's art was moved under its own container when the entity was split
    // from its shadow.
    for (const lamp of this.lamps()) {
      const glow = lamp.view.getChildByLabel('lamp-glow', true);
      if (glow) glow.visible = on;
    }

    this.emitStatus();
  }

  toggleLights(): void {
    this.setLights(!this.lightsOn);
  }

  /** Something good happened elsewhere in the app. */
  celebrate(): void {
    this.brain.celebrate();
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
  pointerDown(canvasX: number, canvasY: number): void {
    const point = this.root.toLocal({ x: canvasX, y: canvasY });

    const bodies = this.world.bodies;
    const body = pickAt(bodies, point.x, point.y, (candidate) => {
      const entity = this.entities.get(candidate.id);
      return entity !== undefined && entity.reachable;
    });

    if (!body) return;

    const entity = this.entities.get(body.id);
    if (!entity) return;

    this.grabbed = entity;
    this.grabStart = { time: performance.now(), moved: 0 };
    this.grabOrigin = { ...body.position };
    this.pointer = { x: point.x, y: point.y };
    this.swing = 0;

    this.world.grab(body);
    entity.motion.knock(0.3);

    if (entity.id === 'pet') {
      // Wherever it was walking, it is not walking there from here.
      this.navigator.clear();
      this.brain.pickedUp();
    }

    this.emitStatus();
  }

  pointerMove(canvasX: number, canvasY: number): void {
    const entity = this.grabbed;
    if (!entity) return;

    const point = this.root.toLocal({ x: canvasX, y: canvasY });
    const carry = this.carryTarget(point.x, point.y);
    this.world.manipulator.moveTo(carry.x, carry.z, carry.lift);

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
    const entity = this.grabbed;
    if (!entity) return;

    this.grabbed = null;

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
      this.settlePlacement(entity);
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

  /** Put a set-down object where it belongs: on a row, on top of something. */
  private settlePlacement(entity: Entity): void {
    const body = entity.body;
    if (entity.id === 'pet') return;

    // Clamped by the body's own footprint, not just its centre — a bed set
    // down against the right wall should stop with its edge against it rather
    // than with half of it through the plaster.
    const bounds = this.world.bounds;
    const spanX = halfX(body.collider);
    const spanZ = halfZ(body.collider);

    // Snapped to a tile of the floor grid in both axes, then clamped by the
    // body's own footprint — a bed set down against the right wall should stop
    // with its edge against it rather than with half of it through the plaster.
    const snapped = snapToGrid(body.position.x, body.position.z);

    const inside = {
      x: clamp(
        snapped.x,
        bounds.minX + spanX,
        Math.max(bounds.minX + spanX, bounds.maxX - spanX),
      ),
      z: clamp(
        snapped.z,
        bounds.minZ + spanZ,
        Math.max(bounds.minZ + spanZ, bounds.maxZ - spanZ),
      ),
    };

    const rest = this.world.surfaceHeightAt(inside.x, inside.z, body.id);

    if (body.type === 'static') {
      this.world.place(body, { x: inside.x, y: rest, z: inside.z });
      this.world.setVelocity(body, { x: 0, y: 0, z: 0 });
    } else {
      // Dynamic things are only nudged onto the row — they still have to fall
      // the last few pixels themselves, which is how you can tell they are
      // objects and not stickers.
      this.world.place(body, { x: inside.x, z: inside.z });
      this.world.setVelocity(body, { x: 0, z: 0 });
    }

    // Anything that was resting on this needs to notice it moved.
    for (const rider of this.world.occupants(body.id)) this.world.wake(rider);
  }

  /** A press that never became a drag. */
  private handleClick(entity: Entity): void {
    if (entity.type === 'lamp') {
      this.toggleLights();
      return;
    }

    if (entity.id === 'pet') {
      this.brain.poked();
      return;
    }

    // Nudging anything else is a small shove — which the creature notices.
    entity.motion.knock(0.8, Math.random() < 0.5 ? -1 : 1);
    this.world.push(entity.body, {
      y: 240,
      x: (Math.random() - 0.5) * 140,
    });
  }

  // --- The loop -------------------------------------------------------------

  private update(dt: number): void {
    this.time += dt;

    const { impacts, walls, ground } = this.world.step(dt);
    const petBody = this.petEntity.body;

    // Objects that move on their own: the clock's hands and pendulum, the
    // plant's sway, the lamp's flicker. Some of them have things to say.
    const life = { time: this.time, lightsOn: this.lightsOn, now: new Date() };

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
        this.entities.get(landing.body.id)?.motion.knock(landing.speed / 900);
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
      lightsOn: this.lightsOn,
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

    if (intent.lookAt) {
      const at = project(intent.lookAt.x, intent.lookAt.y, intent.lookAt.z);
      const local = this.pet.root.toLocal({ x: at.x, y: at.y });
      this.animation.setLookTarget({ x: local.x, y: local.y });
    } else {
      this.animation.setLookTarget(null);
    }

    this.animation.update(dt * 1000);
    this.updateDressing(dt);

    for (const entity of this.entities.values()) {
      entity.motion.update(dt, entity.body);
      this.syncEntity(entity);
    }

    this.updateGuide(dt);

    // Night fades rather than snaps: the switch is instant, the room settling
    // into the dark is not.
    const dusk = this.environment.night.alpha;
    const target = this.lightsOn ? 0 : dusk;
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
      lightsOn: this.lightsOn,
    };
  }

  private footprintOf(body: PhysicsBody): number {
    return body.collider.shape === 'cylinder' ? body.collider.radius : body.collider.halfX;
  }

  /** Something in the room announced itself — currently, the clock striking. */
  private onObjectEvent(entity: Entity, event: string): void {
    if (event !== 'chime') return;

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
  private syncEntity(entity: Entity): void {
    const { body, view, art, shadow } = entity;

    const scale = scaleAt(body.position.z);
    const base = project(body.position.x, 0, body.position.z);

    // The creature's artwork is drawn at its own scale on top of the camera's,
    // so anything measured in world units has to be divided back out before it
    // is used as a coordinate inside its container.
    const unit = entity.id === 'pet' ? PET_SCALE : 1;

    view.position.set(base.x, base.y);
    view.scale.set(scale * unit);

    const tint = depthTintOf(body.position.z);
    if (view.tint !== tint) view.tint = tint;

    const holder = body.support?.id ? (this.world.get(body.support.id) ?? null) : null;
    view.zIndex = sortKeyOf(body, holder);

    // Artwork is anchored at the floor contact point, so lifting it is just
    // its height.
    const sink = holder?.surface?.give ?? 0;
    art.position.set(0, (-body.position.y + Math.min(sink, body.position.y)) / unit);
    art.pivot.set(0, (-body.collider.height * 0.4) / unit);

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

  /** Show where a carried thing will land, and in which row. */
  private updateGuide(dt: number): void {
    const drop = this.world.manipulator.dropPoint();
    const body = this.world.manipulator.held;

    this.guide.update(
      drop && body
        ? {
          x: drop.x,
          z: drop.z,
          surfaceY: drop.y,
          bodyY: body.position.y,
          radius: this.footprintOf(body),
        }
        : null,
      dt,
    );
  }

  /**
   * Which tile a carried body is over.
   *
   * Nothing while it is lifted past the back wall: at that point the pointer is
   * choosing a height rather than a place on the floor, and naming a tile there
   * would be inventing an answer.
   */
  private holdingCell(body: PhysicsBody): { row: number; col: number } | null {
    if (body.position.z <= this.world.bounds.minZ + 1) return null;
    const cell = cellAt(body.position.x, body.position.z);
    return { row: cell.row, col: cell.col };
  }

  private emitStatus(mood?: string, behavior?: PetBehavior): void {
    if (!this.onStatus) return;

    const held = this.world.manipulator.held;

    const next: RoomStatus = {
      mood: mood ?? this.lastStatus?.mood ?? 'settling in',
      behavior: behavior ?? this.lastStatus?.behavior ?? 'idle',
      lightsOn: this.lightsOn,
      ambience: this.mood.ambience.id,
      tint: this.mood.tint,
      holding: this.grabbed ? (this.grabbed.id === 'pet' ? 'pet' : 'prop') : null,
      holdingCell: held ? this.holdingCell(held) : null,
    };

    const previous = this.lastStatus;
    if (
      previous &&
      previous.mood === next.mood &&
      previous.behavior === next.behavior &&
      previous.lightsOn === next.lightsOn &&
      previous.ambience === next.ambience &&
      previous.tint === next.tint &&
      previous.holding === next.holding &&
      previous.holdingCell?.row === next.holdingCell?.row &&
      previous.holdingCell?.col === next.holdingCell?.col
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

  private layout(): void {
    const { width, height } = this.app.screen;
    const scale =
      this.fit === 'contain'
        ? Math.min(width / SCREEN_WIDTH, height / SCREEN_HEIGHT)
        : Math.max(width / SCREEN_WIDTH, height / SCREEN_HEIGHT);

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
