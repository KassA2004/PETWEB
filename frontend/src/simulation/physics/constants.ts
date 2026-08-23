/**
 * Every tuned number the solver uses, in one place.
 *
 * They are gathered here for a reason that is not tidiness: the old solver hid
 * a speed limit, a contact-speed threshold and a correction clamp in three
 * different files, and each one existed to paper over instability produced by
 * the other two. With positional correction and velocity response separated
 * (see `Solver.ts`) none of them are load-bearing any more, and having them
 * side by side makes it obvious if one ever starts being so again.
 */

/**
 * The solver runs at a fixed rate, independent of the display.
 *
 * Actually 1/120s, unlike the value this replaced — which claimed 1/120 in its
 * comment and ran at 171Hz, so every constant tuned against it was tuned
 * against a lie.
 */
export const FIXED_STEP = 1 / 120;

/** A frame that stalls must not be simulated all at once. */
export const MAX_SUBSTEPS = 5;

/** px/s². Tuned for a room measured in hundreds of pixels, not metres. */
export const DEFAULT_GRAVITY = 2600;

// --- Penetration ------------------------------------------------------------

/**
 * Overlap left uncorrected, in pixels.
 *
 * Two objects resting against each other are always fractionally overlapped;
 * chasing that to zero is what makes a stack hum. Leaving a hair of it means
 * they simply touch.
 */
export const SLOP = 0.35;

/**
 * Fraction of the remaining penetration resolved per step.
 *
 * Below 1 so a deep overlap — something dropped inside something else — eases
 * apart over a few frames instead of being flung. This moves *positions only*;
 * it can never manufacture velocity, which is the whole point of the rewrite.
 */
export const CORRECTION = 0.6;

/** Most one step may push a body, in pixels. A backstop, not a mechanism. */
export const MAX_CORRECTION = 12;

/**
 * Fraction resolved per step when one of the pair is the creature.
 *
 * Lower than `CORRECTION`, and the difference is personality rather than
 * physics. A rigid correction ejects the creature from a chair leg in two
 * frames, which is technically perfect and reads as a creature made of
 * marble — it stops dead, at exactly the surface, every time. Easing it out
 * over a handful of frames lets the walk carry on into the obstacle for a
 * moment and then slide off it, which is what being soft looks like from the
 * outside.
 *
 * It cannot cause tunnelling: this is per *substep* at 120Hz, so the overlap
 * is still gone inside a tenth of a second.
 */
export const SOFT_CORRECTION = 0.22;

// --- Response ---------------------------------------------------------------

/**
 * Closing speed below which a contact is a *rest*, not an impact.
 *
 * Below this, the bodies are separated positionally and no bounce is applied.
 * Two things leaning on each other are always very slightly approaching — that
 * is what leaning is — and treating it as a collision is what used to walk a
 * pile of toys slowly across the room.
 */
export const IMPACT_SPEED = 45;

/** Impacts slower than this are not worth telling the room about. */
export const REPORT_SPEED = 90;

/** A landing softer than this is a body settling, not an arrival. */
export const LANDING_SPEED = 200;

/**
 * Solver passes per step.
 *
 * Three is where a pile of toys in a basket stops sinking visibly. It is a
 * Gauss-Seidel solver, so each pass carries the support one contact further up
 * a stack, and a room whose deepest stack is four things does not need more.
 */
export const ITERATIONS = 3;

// --- Friction ---------------------------------------------------------------

/**
 * Downward speed a supported body is allowed to keep, in px/s.
 *
 * Contact impulses conserve momentum, so a stack of things standing on each
 * other never quite sheds the velocity gravity keeps adding: each pass hands a
 * little of it down the pile and the floor absorbs what reaches it, and the
 * top of a tall stack is left permanently falling at a few pixels a second
 * while not actually moving. It is invisible and it is fatal, because nothing
 * that is still moving is ever allowed to sleep.
 *
 * A supported body is not falling. Say so.
 */
export const RESTING_FALL_SPEED = 70;

/**
 * Below this horizontal speed a grounded body is simply stopped.
 *
 * Real static friction, rather than an exponential decay that approaches zero
 * without ever arriving. An object that keeps 0.4px/s forever never sleeps,
 * and a room full of things that never sleep drifts overnight.
 */
export const STATIC_FRICTION_SPEED = 6;

// --- Sleeping ---------------------------------------------------------------

/** Below this speed, for this long, a grounded body is asleep. */
export const SLEEP_SPEED = 9;
export const SLEEP_DELAY = 0.35;

/** A sleeping body woken by a neighbour needs the neighbour to be moving. */
export const WAKE_SPEED = 25;

// --- Safety -----------------------------------------------------------------

/**
 * Nothing in a small room has any business moving faster than this.
 *
 * A genuine backstop now: with correction and response separated the solver
 * has no way to manufacture speed, so this only ever catches a throw made in
 * anger.
 */
export const SPEED_LIMIT = 2600;

/**
 * How far above its support a static body may sit before it counts as floating.
 *
 * Generous enough to absorb the sub-pixel differences between a placement and
 * the surface query that produced it, tight enough that a gap you can see is a
 * gap that gets closed (`PhysicsWorld.settleUnsupported`).
 */
export const SETTLE_SLACK = 0.6;
