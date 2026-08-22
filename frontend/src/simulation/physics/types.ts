/**
 * The vocabulary of the room's physics.
 *
 * Everything here is data. No behaviour, no solving — those live in their own
 * files so that each one can be read on its own (`Narrowphase`, `Solver`,
 * `Sleep`, `CharacterController`), and so that a body is one plain record
 * rather than state smeared across four systems.
 *
 * Space
 * -----
 * The room is a box, and the physics is genuinely three-dimensional:
 *
 *   x   left/right across the room
 *   y   up. 0 is the floor; gravity pulls toward it
 *   z   into the room. 0 is the back wall, `depth` is the front edge
 *
 * There is no fake axis and no depth "gate". Two things collide when they
 * overlap in all three, which is the only definition of "the plant at the back
 * is not in the way of the ball at the front" that actually holds up.
 *
 * Screen space is derived from this by the projection (see
 * `scenes/room/Projection.ts`) and nothing in this folder knows about it.
 *
 * Shapes
 * ------
 * Two colliders, neither of which ever rotates:
 *
 *   cylinder   a circle in the floor plane, extruded upward
 *   box        a rectangle in the floor plane, extruded upward
 *
 * That is enough for a room. Rotation is a rendering concern — a knocked lamp
 * leans because its artwork leans, not because its collider does — and leaving
 * it out removes the entire class of bugs where a solver argues with itself
 * about angular momentum.
 */

/** A point or a direction in room space. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * What a body is, physically.
 *
 *   static      never integrated, infinite mass. Furniture, once placed.
 *   dynamic     falls, slides, bounces, sleeps. Toys.
 *   character   dynamic, but driven by intent rather than by forces. The pet.
 *
 * The distinction is the whole reason the room stopped shoving itself around:
 * a chair that cannot be accelerated cannot be walked across the room, and a
 * creature whose movement comes from a controller is never in an argument with
 * the collision solver about where it wanted to go.
 */
export type BodyType = 'static' | 'dynamic' | 'character';

/**
 * Whether the creature has to walk around a thing, or simply walks through it.
 *
 * A room reads as full because of what is *drawn* in it, not because of what
 * is solid in it, and those two wants pull in opposite directions. Furnish the
 * room properly and every plant pot, table leg and lamp stem becomes another
 * thing the creature can be trapped behind; keep the floor clear enough to
 * roam and the room looks like a waiting area.
 *
 *   solid     the creature has to go round it. The bed, the chair, the basket,
 *             and everything a toy is ever going to be batted into.
 *   scenery   drawn, lit, sorted by depth and bounced off by toys — but never
 *             in the creature's way.
 *
 * Note what `scenery` is *not*: it is not "no collider". A ball still bounces
 * off the plant, things still stand on the table, and a creature that climbs
 * onto one is still held up by its top face. The single thing it gives up is
 * the *side* of the contact against a character, which is the only part that
 * was ever costing the creature its freedom of movement.
 */
export type Solidity = 'solid' | 'scenery';

/** A circle in the floor plane, extruded upward from the body's base. */
export interface CylinderCollider {
  shape: 'cylinder';
  radius: number;
  height: number;
}

/** A rectangle in the floor plane, extruded upward from the body's base. */
export interface BoxCollider {
  shape: 'box';
  halfX: number;
  halfZ: number;
  height: number;
}

export type Collider = CylinderCollider | BoxCollider;

/**
 * What a surface means to the creature.
 *
 * Physically a tabletop needs no special handling at all: it is the top face
 * of a box, and landing on it falls out of ordinary collision. That is the
 * point of modelling furniture as boxes — the entire one-way-platform
 * subsystem this replaced simply stopped being necessary.
 *
 * What is left is the half of the question physics cannot answer: whether this
 * is somewhere you would *want* to sleep, and whether being on it means being
 * *in* it.
 */
export type SurfaceKind = 'tabletop' | 'bed' | 'seat' | 'shelf' | 'container';

export interface SurfaceSpec {
  kind: SurfaceKind;
  /**
   * Containers only: how high the lip is above the resting floor inside.
   *
   * A basket is a low platform you can only reach from above. The rim is not
   * collision geometry — it is the height something has to clear before the
   * inside counts as reachable, which is what stops the creature strolling
   * into the laundry.
   */
  rim?: number;
  /** Containers: how far inside the footprint an occupant is held. */
  inset?: number;
  /** How far an occupant visually sinks in. A mattress gives; a table does not. */
  give?: number;
  /** How much the creature would like to sleep here, 0..1. */
  comfort?: number;
}

/** What a body is currently standing on. */
export interface SupportRef {
  /** The supporting body, or null for the room's own floor. */
  id: string | null;
  /** World height of the surface being stood on. */
  top: number;
  kind: SurfaceKind | 'floor';
}

/**
 * One physical thing in the room.
 *
 * Every number a system needs about a body lives here: where it is, how fast,
 * what shape, what it is standing on, whether it is asleep, and which visual
 * it belongs to. Nothing keeps a parallel copy.
 */
export interface PhysicsBody {
  id: string;
  type: BodyType;

  /** Base centre: `x`/`z` are the middle of the footprint, `y` is the bottom. */
  position: Vec3;
  velocity: Vec3;
  /**
   * Where the body was before this step integrated it.
   *
   * Read by the narrowphase: something that was above a tabletop last step and
   * is inside it now fell onto it, however deep the overlap got, and must be
   * pushed up rather than out of the nearest side.
   */
  previous: Vec3;

  collider: Collider;

  mass: number;
  /** 0 for static and held bodies — the solver's way of saying "immovable". */
  invMass: number;

  /** Coulomb friction coefficient against the ground and other bodies, 0..1. */
  friction: number;
  /** 0 = lands dead, 1 = bounces for ever. */
  restitution: number;
  /** Air drag, per second. Keeps thrown things from flying like bullets. */
  drag: number;

  // --- Contact state, rewritten every step ---------------------------------
  grounded: boolean;
  support: SupportRef | null;

  // --- Sleeping -------------------------------------------------------------
  sleeping: boolean;
  /** Seconds of stillness accumulated so far. */
  stillTime: number;
  /** Bodies that never sleep: the creature, and anything being carried. */
  neverSleeps: boolean;

  // --- Manipulation ---------------------------------------------------------
  /** True while the pointer is carrying it. Held bodies are kinematic. */
  held: boolean;

  /**
   * How tall a ledge this body simply steps onto, rather than bumping into.
   *
   * Zero for everything but the creature. Without it a rug edge or a dropped
   * pillow is a wall, and the creature spends its afternoon shuffling against
   * a cushion.
   */
  stepHeight: number;

  // --- Semantics ------------------------------------------------------------
  /** Whether a character has to walk around this, or straight through it. */
  solidity: Solidity;
  /** What other bodies may rest on, or null if nothing can. */
  surface: SurfaceSpec | null;
  /**
   * One body id this one may pass through, for as long as it is set.
   *
   * Climbing: a creature getting onto a chair puts its paws on the seat and
   * scrambles. Rather than model paws, the climber is let through the thing it
   * is climbing and the top face catches it on the way down.
   */
  passThrough: string | null;

  /** Anything the scene wants to hang off the body. Physics never reads it. */
  userData?: unknown;
}

/**
 * A resolved overlap between two things.
 *
 * `normal` points from `b` toward `a` — the direction `a` has to move to get
 * out — and `depth` is how far they interpenetrate along it. `b` is null when
 * the other party is the room itself: the floor, or one of the four walls.
 */
export interface Contact {
  a: PhysicsBody;
  b: PhysicsBody | null;
  normal: Vec3;
  depth: number;
  /** True when the normal is the world's up axis: `a` is standing on `b`. */
  standing: boolean;
}

/** Two bodies met hard enough to be worth telling the room about. */
export interface Impact {
  a: PhysicsBody;
  b: PhysicsBody;
  /** Closing speed along the contact normal, px/s. */
  speed: number;
}

/** A body hit the side of the room. */
export interface WallImpact {
  body: PhysicsBody;
  speed: number;
  /** -1 left wall, +1 right wall, 0 back or front. */
  direction: -1 | 0 | 1;
}

/** A body arrived on the floor, or on top of something. */
export interface GroundImpact {
  body: PhysicsBody;
  /** Downward speed at the moment of contact, px/s. */
  speed: number;
  /** What it landed on, or null for the room's floor. */
  onto: string | null;
}

/** Everything that happened during one call to `PhysicsWorld.step`. */
export interface StepResult {
  impacts: Impact[];
  walls: WallImpact[];
  ground: GroundImpact[];
}
