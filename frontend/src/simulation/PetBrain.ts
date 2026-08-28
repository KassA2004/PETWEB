/**
 * PetBrain — what the creature wants.
 *
 * This is the simulation layer from /Docs/animation-approach.md §3: it decides
 * *what the pet is doing*, and never touches artwork, joints or PixiJS. It
 * reads a description of the room and returns an intent; the scene turns that
 * intent into movement and an animation state.
 *
 *   PERCEPTION -> NEEDS -> BEHAVIOR SELECTION -> INTENT
 *
 * Two rules from the doc shape everything here:
 *
 *   §33 Interruptions — being picked up or hit outranks whatever the creature
 *       had planned. Emotion beats intention, intention beats idling.
 *   §29 Behaviour selection — nothing below the interrupt layer is scripted.
 *       Behaviours are weighted by the creature's current needs, so a tired
 *       pet mostly rests and a curious one mostly explores, without either
 *       ever being certain.
 *
 * It also has to be allowed to not care (§25). Not every ball rolling past is
 * worth getting up for.
 */

import type { Emotion } from '../animation/expression/Expression';
import { appetiteFor } from './Affordances';
import type { AffordanceKind, PerceivedAffordance } from './Affordances';

export type PetBehavior =
  | 'idle'
  | 'wander'
  | 'sit'
  | 'rest'
  | 'investigate'
  | 'chase'
  | 'play'
  /**
   * Using something the room offers: eating, scratching, dancing, watching
   * the fish, hiding in the tunnel.
   *
   * One behaviour for all of them, because the *decision* is the same decision
   * every time — is there something here that answers what I want, and can I
   * get to it. What differs is only which clip plays, and that is
   * `Intent.useKind`. Adding an interactive object therefore adds no branch
   * here (see ./Affordances.ts).
   */
  | 'use'
  | 'sleep'
  | 'scared'
  | 'angry'
  | 'dizzy'
  | 'held';

export interface PerceivedObject {
  id: string;
  x: number;
  /** How far into the room it stands. The same z the physics uses. */
  z: number;
  /** How far above the floor it is. */
  height: number;
  /** Current speed, px/s. */
  speed: number;
  /** Roughly how wide it is, so distances can be measured to its edge. */
  radius: number;
  isToy: boolean;
  /** Beetles, moths, dust — worth chasing, impossible to catch. */
  isCritter: boolean;
  /**
   * How high its resting surface is, or null if there is nowhere to sit.
   *
   * This is how the environment offers itself to the creature: the bed, the
   * chair and the basket all say "you could be up here", and a tired creature
   * goes and climbs one instead of falling asleep in the middle of the floor
   * (/Docs/animation-approach.md §38, §41).
   */
  restHeight: number | null;
  /** How much the creature would like to sleep there, 0..1. */
  comfort: number;
  /** Scenery can be looked at, but never walked to or knocked about. */
  reachable: boolean;
  /**
   * What this thing offers the creature to do, if anything.
   *
   * Everything the brain knows about supper bowls and scratching posts is on
   * this one field. It has never heard of either.
   */
  affordance: PerceivedAffordance | null;
}

/** Where the user's hand is, when it is anywhere. */
export interface PerceivedPointer {
  /** Room coordinates, projected onto the floor. */
  x: number;
  z: number;
}

export interface Perception {
  pet: {
    x: number;
    z: number;
    height: number;
    held: boolean;
    /** Its own footprint, so distances can be measured edge to edge. */
    radius: number;
    /** Off the ground and not held — i.e. mid-flight. */
    airborne: boolean;
    /** What it is standing on, if it has climbed onto something. */
    supportId: string | null;
  };
  objects: PerceivedObject[];
  lightsOn: boolean;
  /**
   * The cursor, on the floor, or null when it is not over the room.
   *
   * The one piece of perception that is not a fact about the world — it is a
   * fact about *you*, which is exactly why a creature's response to it reads as
   * a response to you. A fond one comes over; a wary one keeps its distance.
   * Neither happens at all when the pointer is somewhere else on the page.
   */
  pointer: PerceivedPointer | null;
}

export interface Intent {
  behavior: PetBehavior;
  /**
   * Where on the floor to walk to, or null to stay put.
   *
   * Two numbers rather than one, now that the room has real depth: a toy at
   * the back of the room is not reached by walking to the right x and hoping.
   *
   * When `moveTargetId` is set this is the middle of *that thing* rather than
   * a spot the creature wants to be standing in. The difference matters: the
   * navigator is free to pick whichever side of the ball it can actually get
   * to, and to keep up with the ball while it rolls.
   */
  moveTarget: { x: number; z: number } | null;
  /**
   * The thing it is walking to, if it is walking to a thing.
   *
   * The brain does not know where the furniture is or which way round the bed
   * you have to go — that is the navigation layer's business
   * (`simulation/navigation`). All it says is *what it is going to*, and gets
   * told afterwards whether that worked (`couldNotReach`).
   */
  moveTargetId: string | null;
  /**
   * Something to climb onto, once the creature is standing next to it.
   *
   * The brain only ever says *which* — the jump itself is the room's business,
   * because whether it lands is a question for the physics.
   */
  mountId: string | null;
  /** Room-space point to look at, or null for ambient wandering. */
  lookAt: { x: number; y: number; z: number } | null;
  /** One word for the interface. */
  mood: string;
  /**
   * Which interaction is running, for the animation layer to pick a clip.
   *
   * Only ever set while the behaviour is `use`, and it is the whole of the
   * coupling between "the creature is eating" and "the creature looks like it
   * is eating".
   */
  useKind: AffordanceKind | null;
  /**
   * What it is using, if anything.
   *
   * Separate from `moveTargetId`, which is cleared the moment the creature
   * stops walking: the room still needs to know *which* bowl is being emptied
   * after the creature has arrived at it and stood still.
   */
  useTargetId: string | null;
  /**
   * How the creature feels, for the face.
   *
   * The simulation decides emotion; the animation layer only renders it. A
   * behaviour and an emotion are not the same thing - a creature can be
   * wandering while quietly delighted, or sitting while furious.
   */
  emotion: Emotion;
  emotionStrength: number;
}

/** The continuously changing values behaviour is weighted against (§5). */
export interface PetNeeds {
  energy: number;
  playfulness: number;
  curiosity: number;
  fear: number;
  anger: number;
  /** Raised by being shaken; wears off slowly and unpleasantly. */
  dizziness: number;
  /** Quiet background contentment, raised by play and rest. */
  joy: number;
}

const MOODS: Record<PetBehavior, string> = {
  idle: 'pottering about',
  wander: 'having a wander',
  sit: 'having a sit',
  rest: 'finding somewhere comfy',
  investigate: 'curious',
  chase: 'chasing a toy',
  play: 'playing',
  // Overwritten every tick by the affordance's own line, so the interface can
  // say "having its supper" rather than "using something".
  use: 'busy',
  sleep: 'fast asleep',
  scared: 'frightened',
  angry: 'cross with you',
  dizzy: 'seeing stars',
  held: 'dangling',
};

/** How long an object stays interesting after it last moved, in seconds. */
const INTEREST_MS = 20;

/**
 * How long the creature writes off something it could not get to, in seconds.
 *
 * Long enough that it goes and does something else properly rather than
 * circling back on the next thought, short enough that a ball freed from under
 * the bed becomes interesting again while the user is still watching.
 */
const UNREACHABLE_MS = 24;

/**
 * How long the creature goes between having ideas, in seconds.
 *
 * Nothing below the interrupt layer is reconsidered until this runs out. A
 * creature that re-decides sixty times a second is not deliberating, it is
 * twitching — it changes its mind mid-stride, sets off in a new direction, and
 * reads as an animation glitch rather than as an animal. Interrupts (§33) are
 * exempt, so being picked up or having a ball thrown at it still lands
 * immediately; everything else waits its turn.
 */
const THINK_INTERVAL = 1.8;
const THINK_JITTER = 1.6;

/** How close the creature needs to be to a toy before it plays with it. */
const PLAY_RANGE = 130;

/**
 * How far the creature will go out of its way for a toy that is not moving.
 *
 * A ball that has sat in the corner all day is furniture (§25) — but a
 * creature that *only* ever reacts to things the user throws has no life of
 * its own, and the room's toys may as well not be there. So a still toy is
 * worth crossing the room for occasionally, when it is in the mood, and the
 * cooldown below is what stops "occasionally" becoming "constantly".
 */
const FETCH_RANGE = 520;
const FETCH_COOLDOWN = 22;

/**
 * How long after waking up the creature refuses to go back to bed.
 *
 * Without it, energy hovers around the threshold that sends it to sleep and
 * the creature spends its life climbing on and off the bed. The number is
 * deliberately large: a nap should be a thing that happens a few times a
 * session, not a thing the creature is always halfway into.
 */
const REST_COOLDOWN = 90;

/** Energy at which the creature starts looking for somewhere to lie down. */
const TIRED = 0.2;

/** Energy at which a nap is over. Hysteresis: it wakes up properly, or not. */
const RESTED = 0.8;

/**
 * Close enough to jump up onto something — measured edge to edge.
 *
 * Between the edges, not between the centres: a creature standing against the
 * side of a bed is as close as it is ever going to get, and measuring middle
 * to middle would have it shuffling hopefully at the valance for ever.
 */
const MOUNT_RANGE = 70;

/** A critter further away than this is somebody else's problem. */
const CRITTER_RANGE = 260;

/* -------------------------------------------------------------------------- */
/* How it feels about you                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Affection at or above which the creature comes over of its own accord.
 *
 * Not a switch that turns on a "friendly mode": above it the creature *may*
 * cross the room to where your hand is, on a cooldown, at the same point in the
 * tick where it would otherwise have decided to wander. That it is one option
 * among several is what stops it becoming a loop — the difference between a pet
 * that likes you and a cursor-following toy.
 */
const FOND = 0.7;

/**
 * Affection at or below which it keeps its distance.
 *
 * The low end has to read as *sad*, never as hostile: the creature moves away
 * and declines to start games. It does not hide, hiss, or refuse to be picked
 * up — a creature that punished you would be a creature you would stop opening.
 */
const WARY = 0.32;

/** How near the cursor gets before a wary creature drifts off, in room units. */
const PERSONAL_SPACE = 200;

/** How long between voluntary trips to the cursor, in seconds. */
const POINTER_COOLDOWN = 15;

/** How far away from the cursor a wary creature aims to be. */
const RETREAT_DISTANCE = 240;

/** How long a creature stays visibly put out after a session is abandoned. */
const SULK_SECONDS = 9;

/**
 * How close, edge to edge, the creature has to be before it can use something.
 *
 * Generous, because the navigator already stops it a hand's breadth outside
 * whatever it walked to (`APPROACH_GAP` in the room) and a second threshold
 * tighter than the first would leave the creature standing next to its supper
 * looking at it.
 */
const USE_RANGE = 78;

/**
 * How long an object stays boring after the creature has used it, in seconds.
 *
 * Long enough that the room does not become a circuit of feeding stations,
 * short enough that a creature that got frightened can hide again if the thing
 * that frightened it happens twice.
 */
const USE_COOLDOWN = 40;

/**
 * How much a creature has to want something before crossing the room for it.
 *
 * The single number that decides whether the room feels lived in or needy. Too
 * low and the creature never stops using things; too high and the objects may
 * as well be scenery. It is a *product* of appeal and appetite, so a low-appeal
 * object still gets used when the need is strong.
 */
const USE_THRESHOLD = 0.22;

export interface PetBrainOptions {
  /** The patch of floor the creature is allowed to wander over. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Deterministic randomness, so a seeded pet behaves the same way twice. */
  random?: () => number;
}

interface Interest {
  id: string;
  until: number;
}

export class PetBrain {
  needs: PetNeeds = {
    energy: 0.85,
    playfulness: 0.55,
    curiosity: 0.6,
    fear: 0,
    anger: 0,
    dizziness: 0,
    joy: 0.35,
  };

  private minX: number;
  private maxX: number;
  private minZ: number;
  private maxZ: number;
  private random: () => number;

  private time = 0;
  private behavior: PetBehavior = 'idle';
  /** Behaviours run for at least this long, so the pet does not twitch. */
  private holdUntil = 0;
  /** When it is next allowed to have an idea at all. */
  private thinkAt = 0;
  /** Earliest it will consider going to bed again. */
  private restAfter = 0;
  /** Earliest it will cross the room for a toy that is not moving. */
  private fetchAfter = 0;
  private moveTarget: { x: number; z: number } | null = null;
  private moveTargetId: string | null = null;
  private interests: Interest[] = [];
  /**
   * Things it has tried to get to and could not, and when to forgive them.
   *
   * The memory that stops the only failure mode a navigator cannot fix on its
   * own: a creature that picks the same unreachable ball every time it is
   * asked what it fancies doing is stuck just as surely as one pressed against
   * a wall, it is merely stuck more decoratively.
   */
  private unreachable: Interest[] = [];
  private lastAmbient: PetBehavior | null = null;
  /** What it is currently looking at of its own accord. */
  private focusId: string | null = null;
  /** Whether that thing is a critter, which is what makes chasing it tiring. */
  private focusIsCritter = false;
  /** The last thing it went over to inspect, so it picks something else next. */
  private lastVisited: string | null = null;
  private wasHeld = false;
  /** What it means to climb, this tick. Cleared and rebuilt every update. */
  private mountId: string | null = null;
  /**
   * Where it slept last (§41).
   *
   * One remembered id is the whole of "favourite places" for now, and it is
   * enough: a creature that keeps going back to the same basket looks like it
   * has an opinion about baskets.
   */
  private favouriteRest: string | null = null;
  /** Stops a hopeless chase after a moth from becoming the creature's life. */
  private critterFatigue = 0;

  /**
   * How it feels about you, 0..1. Persisted; set by the room, never by the tick.
   *
   * Not a need. Needs swing about over seconds and are the creature reacting to
   * its afternoon; this moves over days and is the creature's opinion of the
   * person watching. It never *causes* a behaviour on its own — it weights the
   * ones already there, which is the difference between a personality and a
   * mode (§29: behaviours are weighted, never scripted).
   */
  private affection = 0.5;

  /** Earliest it will next come over to the cursor, or move away from it. */
  private pointerAfter = 0;

  /** Seconds left of visibly having its feelings hurt. See `disappointed`. */
  private sulking = 0;

  /**
   * The interaction currently running, and what it is feeding.
   *
   * Held rather than recomputed, because the object it belongs to may stop
   * offering it half-way through — an emptied bowl, a music box that has wound
   * down — and a creature that stopped eating the instant the bowl emptied
   * would snap out of the animation mid-mouthful. It finishes what it started.
   */
  private using: { id: string; affordance: PerceivedAffordance } | null = null;

  /**
   * When each object becomes interesting again after being used.
   *
   * Without it a creature that has just eaten immediately wants to eat again,
   * because the thing that made it want to eat is the thing eating fixed and
   * appetites take time to come back (§32 — appetites have to be able to run
   * out).
   */
  private usedAt = new Map<string, number>();

  constructor(options: PetBrainOptions) {
    this.minX = options.minX;
    this.maxX = options.maxX;
    this.minZ = options.minZ;
    this.maxZ = options.maxZ;
    this.random = options.random ?? Math.random;
  }

  get currentBehavior(): PetBehavior {
    return this.behavior;
  }

  /**
   * How the creature feels about the user.
   *
   * Pushed in from outside because it is not the simulation's to decide: it is
   * made of goals kept and sessions served, which happen on a server and
   * outlive every session of this brain. All the brain does is act like it.
   */
  setAffection(value: number): void {
    if (!Number.isFinite(value)) return;
    this.affection = Math.max(0, Math.min(1, value));
  }

  get fondness(): number {
    return this.affection;
  }

  /**
   * The creature moved house.
   *
   * Only the walls change — it keeps its needs, its habits and its opinion of
   * you, which is the whole point of the creature being the thing that
   * persists and the room being the thing that does not.
   */
  setBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    this.minX = bounds.minX;
    this.maxX = bounds.maxX;
    this.minZ = bounds.minZ;
    this.maxZ = bounds.maxZ;
    this.stay();
    this.favouriteRest = null;
    this.lastVisited = null;
    this.focusId = null;
    this.interests = [];
  }

  // --- Events the world pushes in ------------------------------------------

  /** The user picked the creature up. */
  pickedUp(): void {
    this.needs.fear = Math.min(1, this.needs.fear + 0.22);
    this.setBehavior('held', 0.2);
  }

  /**
   * The user let go of the creature at speed.
   *
   * Gentle sets-down are forgiven; being flung is not. Repeated throws stack
   * anger, which is what turns "startled" into "cross with you".
   */
  thrown(speed: number): void {
    if (speed < 180) return;

    const force = Math.min(1, speed / 900);
    this.needs.fear = Math.min(1, this.needs.fear + 0.35 + force * 0.35);
    this.needs.anger = Math.min(1, this.needs.anger + 0.18 + force * 0.3);
    this.needs.playfulness = Math.max(0, this.needs.playfulness - 0.2);
  }

  /** Something collided with the creature. */
  hitBy(speed: number, isToy: boolean): void {
    if (speed < 90) return;

    // A toy lobbed at it is a game; a chair to the face is not.
    if (isToy && speed < 520) {
      this.needs.playfulness = Math.min(1, this.needs.playfulness + 0.3);
      this.needs.energy = Math.min(1, this.needs.energy + 0.05);
      return;
    }

    const force = Math.min(1, speed / 900);
    this.needs.fear = Math.min(1, this.needs.fear + 0.2 + force * 0.3);
    this.needs.anger = Math.min(1, this.needs.anger + 0.15 + force * 0.25);
  }

  /**
   * The user shook the creature.
   *
   * @param intensity 0..1, how violently.
   */
  shaken(intensity: number): void {
    const force = Math.max(0, Math.min(1, intensity));
    this.needs.dizziness = Math.min(1, this.needs.dizziness + 0.4 + force * 0.5);
    this.needs.fear = Math.min(1, this.needs.fear + 0.25 + force * 0.3);
    this.needs.anger = Math.min(1, this.needs.anger + 0.2 + force * 0.35);
    this.needs.joy = Math.max(0, this.needs.joy - 0.4);
  }

  /** It hit the floor after a fall. */
  landed(speed: number): void {
    if (speed < 500) return;
    const force = Math.min(1, speed / 1500);
    this.needs.fear = Math.min(1, this.needs.fear + force * 0.4);
    this.needs.dizziness = Math.min(1, this.needs.dizziness + force * 0.3);
  }

  /** The lights went on or off. */
  lightsChanged(on: boolean): void {
    if (on) {
      this.needs.energy = Math.max(this.needs.energy, 0.45);
      this.setBehavior('investigate', 1.4);
    } else {
      // Darkness is permission to give up on the day.
      this.setBehavior('sleep', 2);
    }
  }

  /** The user prodded the creature directly. */
  poked(): void {
    if (this.needs.anger > 0.5) {
      this.needs.anger = Math.min(1, this.needs.anger + 0.1);
      return;
    }
    this.needs.playfulness = Math.min(1, this.needs.playfulness + 0.25);
    this.setBehavior('play', 1.8);
  }

  /**
   * Something in the room asked for attention — the clock striking the hour,
   * a light coming on, a noise. It is worth a look, not a decision.
   */
  noticeObject(id: string, curiosity = 0.15): void {
    const existing = this.interests.find((item) => item.id === id);
    if (existing) existing.until = this.time + INTEREST_MS;
    else this.interests.push({ id, until: this.time + INTEREST_MS });

    this.needs.curiosity = Math.min(1, this.needs.curiosity + curiosity);
  }

  /**
   * It set off somewhere and never got there.
   *
   * The room reports this when the navigator has run out of routes and
   * attempts (§9 of the movement brief). Being unable to reach something is
   * ordinary — the ball rolled under the bed, the chair is against the wall —
   * so the response is ordinary too: write the thing off for a while, drop
   * whatever the creature was in the middle of, and let it have a new idea on
   * the next tick rather than continuing to walk hopefully at a wall.
   *
   * @param id what it was going to, or null if it was going to a place.
   */
  couldNotReach(id: string | null): void {
    if (id) {
      const existing = this.unreachable.find((item) => item.id === id);
      if (existing) existing.until = this.time + UNREACHABLE_MS;
      else this.unreachable.push({ id, until: this.time + UNREACHABLE_MS });

      // Stop looking at it, stop remembering it fondly, stop finding it
      // interesting. All three would otherwise send it straight back.
      this.interests = this.interests.filter((item) => item.id !== id);
      if (this.focusId === id) this.focusId = null;
      if (this.favouriteRest === id) this.favouriteRest = null;
      if (this.lastVisited === id) this.lastVisited = null;
    }

    // A chase that went nowhere takes some of the fun out of chasing, which is
    // what stops the creature immediately choosing the next unreachable toy.
    if (this.behavior === 'chase' || this.behavior === 'play') {
      this.needs.playfulness = Math.max(0, this.needs.playfulness - 0.18);
      this.fetchAfter = this.time + 8;
    }
    if (this.focusIsCritter) this.critterFatigue = Math.min(1.6, this.critterFatigue + 0.5);

    this.stay();
    this.behavior = 'idle';
    this.holdUntil = 0;
    this.thinkAt = 0;
  }

  /**
   * The lights came back on and you are still there.
   *
   * The end of a focus session, and the one moment where affection is visible
   * as a *difference* rather than as a tendency: the same event produces a
   * creature bounding over, a creature having a look, or a creature sitting up
   * and going back to what it was doing. Nothing here is scripted beyond
   * choosing which of three ordinary behaviours to be in.
   */
  greet(): void {
    const warmth = this.affection;

    this.sulking = 0;
    this.needs.fear = Math.max(0, this.needs.fear - 0.25);
    this.needs.anger = Math.max(0, this.needs.anger - 0.25);
    this.needs.joy = Math.min(1, this.needs.joy + 0.15 + warmth * 0.45);
    // Waking up properly, so it does not immediately go back to bed.
    this.needs.energy = Math.max(this.needs.energy, RESTED);
    this.restAfter = this.time + REST_COOLDOWN;

    if (warmth >= FOND) {
      this.needs.playfulness = Math.min(1, this.needs.playfulness + 0.45);
      this.setBehavior('play', 2.6);
      return;
    }

    if (warmth > WARY) {
      this.needs.curiosity = Math.min(1, this.needs.curiosity + 0.3);
      this.setBehavior('investigate', 1.8);
      return;
    }

    // Awake, and unimpressed. It will come round.
    this.setBehavior('sit', 2);
  }

  /**
   * You said you would do the thing, and then you did not.
   *
   * Mild, brief and cartoon: it sits down, turns away from wherever you are,
   * and is over it in about nine seconds. It is not angry — `anger` is what
   * being thrown across the room produces, and being let down is not that.
   */
  disappointed(): void {
    this.sulking = SULK_SECONDS;
    this.needs.joy = Math.max(0, this.needs.joy - 0.25);
    this.needs.playfulness = Math.max(0, this.needs.playfulness - 0.3);
    // It is not going to come and see you for a little while.
    this.pointerAfter = this.time + POINTER_COOLDOWN;
    this.setBehavior('sit', 2.4);
  }

  /** Something good happened elsewhere in the app. */
  celebrate(): void {
    this.needs.playfulness = Math.min(1, this.needs.playfulness + 0.4);
    this.needs.fear = Math.max(0, this.needs.fear - 0.3);
    this.needs.anger = Math.max(0, this.needs.anger - 0.4);
    this.setBehavior('play', 2.6);
  }

  // --- The tick ------------------------------------------------------------

  update(dt: number, perception: Perception): Intent {
    this.time += dt;
    this.mountId = null;
    this.decay(dt, perception);
    this.noticeMovement(perception);

    const behavior = this.select(perception);

    if (behavior !== this.behavior) {
      this.behavior = behavior;
      this.onEnter(behavior, perception);
    }

    const feeling = this.feel(behavior);

    return {
      behavior,
      moveTarget: this.moveTarget,
      moveTargetId: this.moveTargetId,
      mountId: this.mountId,
      lookAt: this.lookTarget(perception),
      // An interaction gets to name the mood itself, so the interface says
      // "having its supper" rather than "busy".
      mood: this.moodLine(behavior),
      useKind: behavior === 'use' && this.using ? this.using.affordance.kind : null,
      useTargetId: behavior === 'use' && this.using ? this.using.id : null,
      emotion: feeling.emotion,
      emotionStrength: feeling.strength,
    };
  }

  /**
   * The one line the interface prints under the creature's name.
   *
   * An interaction names itself, so the panel says "having its supper" rather
   * than "busy". Everything else takes the behaviour's word for it — except a
   * creature that has just been let down, which is doing something ordinary and
   * plainly not enjoying it.
   */
  private moodLine(behavior: PetBehavior): string {
    if (behavior === 'use' && this.using) return this.using.affordance.mood;
    if (this.sulking > 0) return 'keeping to itself';
    if (behavior === 'idle' && this.affection < WARY) return 'a bit glum';
    return MOODS[behavior];
  }

  private decay(dt: number, perception: Perception): void {
    const needs = this.needs;

    // Whatever the creature is in the middle of doing pays out while it does
    // it, rather than in a lump at the end. A reward that arrives all at once
    // is a reward you can miss; this way a creature visibly cheers up over the
    // four seconds it spends at the scratching post.
    if (this.behavior === 'use' && this.using) {
      for (const [need, rate] of Object.entries(this.using.affordance.feeds)) {
        const key = need as keyof PetNeeds;
        needs[key] = Math.max(0, Math.min(1, needs[key] + rate * dt));
      }
    }

    // Fear passes quickly; being cross about it lasts.
    needs.fear = Math.max(0, needs.fear - dt * 0.28);
    needs.anger = Math.max(0, needs.anger - dt * 0.07);
    // Dizziness sits between the two: longer than a fright, shorter than a
    // grudge, which is why it earns its own state rather than a wobble.
    needs.dizziness = Math.max(0, needs.dizziness - dt * 0.16);
    needs.joy = Math.max(0, Math.min(1, needs.joy - dt * 0.03));

    // A nap is short and a day is long. The ratio is what stops the creature
    // living on the bed: at these rates it is awake for something like four
    // minutes for every twenty seconds it sleeps, and the cooldown in
    // `settleDown` stretches that a good deal further.
    if (this.behavior === 'sleep') {
      needs.energy = Math.min(1, needs.energy + dt * 0.035);
      needs.playfulness = Math.min(1, needs.playfulness + dt * 0.02);
      needs.curiosity = Math.min(1, needs.curiosity + dt * 0.02);
    } else {
      needs.energy = Math.max(0, needs.energy - dt * 0.0026);
    }

    if (this.behavior === 'play' || this.behavior === 'chase') {
      // A bout of play burns itself out in twenty seconds or so and takes a
      // couple of minutes to build back up. Without that asymmetry the
      // creature plays continuously, which is as monotonous as sleeping
      // continuously and considerably more tiring to watch.
      needs.playfulness = Math.max(0, needs.playfulness - dt * 0.055);
      needs.energy = Math.max(0, needs.energy - dt * 0.007);
      needs.joy = Math.min(1, needs.joy + dt * 0.25);
    } else {
      needs.playfulness = Math.min(1, needs.playfulness + dt * 0.007);
    }

    needs.curiosity = Math.min(1, needs.curiosity + dt * 0.018);

    // Chasing something you cannot catch is tiring, and the tiredness has to
    // accrue in real time. Accruing it where the decision is made instead —
    // which is what this used to do — means it now accrues once every couple
    // of seconds, never reaches the ceiling, and the creature pursues moths
    // for ever (§32).
    const chasingCritter =
      this.focusIsCritter && (this.behavior === 'chase' || this.behavior === 'play');

    this.critterFatigue = chasingCritter
      ? Math.min(1.6, this.critterFatigue + dt * 0.22)
      : Math.max(0, this.critterFatigue - dt * 0.1);

    // Being put down safely is a relief.
    if (this.wasHeld && !perception.pet.held) {
      this.wasHeld = false;
    } else if (!this.wasHeld && perception.pet.held) {
      this.wasHeld = true;
    }

    // Having its feelings hurt wears off on its own, and quickly. "Recovers
    // shortly" is the brief; a creature still sulking ten minutes later would
    // have stopped being cute several minutes ago.
    this.sulking = Math.max(0, this.sulking - dt);

    this.interests = this.interests.filter((item) => item.until > this.time);
    this.unreachable = this.unreachable.filter((item) => item.until > this.time);
  }

  /** Anything that moves is worth a glance (§25). */
  private noticeMovement(perception: Perception): void {
    for (const object of perception.objects) {
      if (object.speed < 70) continue;

      const existing = this.interests.find((item) => item.id === object.id);
      if (existing) {
        existing.until = this.time + INTEREST_MS;
      } else {
        this.interests.push({ id: object.id, until: this.time + INTEREST_MS });
        this.needs.curiosity = Math.min(1, this.needs.curiosity + 0.1);
      }
    }
  }

  private select(perception: Perception): PetBehavior {
    // --- Interrupts (§33) --------------------------------------------------
    if (perception.pet.held) return 'held';
    if (perception.pet.airborne) return 'scared';

    if (this.needs.fear > 0.34) {
      // Somewhere to hide beats running about being frightened, and this is
      // the reason the tunnel is worth having in the room at all. It sits
      // inside the interrupt rather than below it because being frightened
      // outranks deliberation: the creature is not *deciding* to hide, it is
      // bolting for the nearest hole.
      const refuge = this.pickAffordance(perception, 'hide');

      if (refuge) {
        this.focusIsCritter = false;
        this.focusId = refuge.object.id;
        const gap =
          planarDistance(perception.pet, refuge.object) -
          refuge.object.radius -
          perception.pet.radius;

        if (gap <= USE_RANGE) {
          this.stay();
          this.beginUsing(refuge.object.id, refuge.affordance);
          return 'use';
        }

        this.walkToObject(refuge.object);
        this.setHold(0.5);
        return 'scared';
      }

      return 'scared';
    }
    // Dizziness outranks anger: you cannot be properly cross while the room
    // is still going round.
    if (this.needs.dizziness > 0.45) return 'dizzy';
    if (this.needs.anger > 0.55) return 'angry';

    // --- Environment -------------------------------------------------------
    // Tired, or the lights went out: go and find somewhere proper to sleep
    // rather than keeling over where it stands.
    //
    // Hysteresis, and a long cooldown afterwards. Without both, energy hovers
    // around the threshold and the creature spends the whole session climbing
    // on and off the bed: it is either awake for a good while or asleep for a
    // good while, and never hesitating on the edge of the mattress.
    const sleepy =
      this.behavior === 'sleep' || this.behavior === 'rest'
        ? this.needs.energy < RESTED
        : this.needs.energy < TIRED && this.time >= this.restAfter;

    // --- Something in the room that answers what it wants ------------------
    // Checked *before* the nap, and this ordering is the whole reason hunger
    // works: low energy is what makes the creature both tired and hungry, so a
    // sleep gate in front of the supper bowl means it never eats — it goes to
    // bed, wakes up restored, and the bowl is decoration for ever.
    //
    // A sleepy creature is a harder sell, though, or it would stand watching
    // the fish until it fell over. Two ways past that gate, and the first one
    // is the important one:
    //
    //   restorative   the offer feeds energy — it is food. Food is what a
    //                 tired creature actually needs, and eating is what stops
    //                 it being tired, so supper always beats bed.
    //   compelling    anything else has to be worth roughly twice as much as
    //                 it would have to be worth when the creature was rested.
    const offer = this.pickAffordance(perception);
    const restorative = (offer?.affordance.feeds.energy ?? 0) > 0;

    // ...but only while there is light to do it by. Darkness outranks appetite:
    // a creature that got up in the pitch dark to visit the scratching post
    // would not read as hungry, it would read as not having noticed the room.
    //
    // This costs nothing the exception above was protecting. That exception
    // exists so a permanently tired creature can still reach its supper, and
    // sleeping is what stops it being tired — so the bowl is waiting when the
    // lights come back on. It also matters rather more now than it did: the
    // lights going out is how a focus session begins, and somebody who comes
    // back after an hour is owed a sleeping creature rather than one that has
    // been rummaging about in the dark.
    // And not while its feelings are hurt. Nine seconds of not fancying the
    // supper bowl is the whole of the sulk being *visible*: this branch sits
    // above the behaviour hold, so without the guard a peckish creature goes
    // straight back to its bowl and the reaction the user was owed lasts one
    // frame. Hiding is unaffected — that is the fear interrupt further up, and
    // a frightened creature must always be able to reach a hole.
    if (
      offer &&
      perception.lightsOn &&
      this.sulking <= 0 &&
      (!sleepy || restorative || offer.score > USE_THRESHOLD * 2.2)
    ) {
      this.focusIsCritter = false;
      this.focusId = offer.object.id;
      const gap =
        planarDistance(perception.pet, offer.object) -
        offer.object.radius -
        perception.pet.radius;

      if (gap > USE_RANGE) {
        this.walkToObject(offer.object);
        this.setHold(1.2);
        return 'chase';
      }

      this.stay();
      this.beginUsing(offer.object.id, offer.affordance);
      return 'use';
    }

    if (!perception.lightsOn || sleepy) {
      return this.settleDown(perception);
    }

    // --- A toy actually flying past interrupts anything (§33) --------------
    // Without this, a ball thrown at the creature can be ignored for several
    // seconds because it happened to be part-way through a nap decision. The
    // whole point of throwing something is that it gets noticed.
    const flying = perception.objects.find(
      (object) => object.isToy && object.speed > 150,
    );

    if (flying && this.needs.playfulness > 0.25) {
      this.needs.curiosity = Math.min(1, this.needs.curiosity + 0.2);

      if (planarDistance(perception.pet, flying) > PLAY_RANGE) {
        this.walkToObject(flying);
        this.setHold(1.2);
        return 'chase';
      }

      this.stay();
      this.setHold(1.4);
      return 'play';
    }

    // --- Keeping your distance --------------------------------------------
    // A reaction rather than an idea, so it sits above the think interval: a
    // creature that only noticed your hand every couple of seconds would let it
    // arrive, and then edge away from where it used to be.
    const retreat = this.avoidPointer(perception);
    if (retreat) return retreat;

    // Held behaviours run to completion unless something above interrupts.
    if (this.time < this.holdUntil) return this.behavior;

    // And below that: a pause between ideas. Everything from here down is the
    // creature deciding what to do with itself, and it is allowed to take its
    // time about it (§44 — alive does not mean always active).
    if (this.time < this.thinkAt) return this.behavior;
    this.thinkAt = this.time + THINK_INTERVAL + this.random() * THINK_JITTER;

    // --- Toys --------------------------------------------------------------
    const toy = this.pickToy(perception);
    if (toy) {
      // Deciding to go and get a toy nobody threw is a whim, and whims have to
      // be rationed or they stop being whims.
      if (!toy.stirred) this.fetchAfter = this.time + FETCH_COOLDOWN;

      this.focusIsCritter = false;
      this.focusId = toy.object.id;

      if (planarDistance(perception.pet, toy.object) > PLAY_RANGE) {
        this.walkToObject(toy.object);
        this.setHold(1.4);
        return 'chase';
      }
      this.stay();
      this.setHold(2.4);
      return 'play';
    }

    // --- Something tiny scuttling past (§25) -------------------------------
    const critter = this.pickCritter(perception);
    if (critter) {
      this.focusIsCritter = true;
      this.focusId = critter.id;
      this.needs.curiosity = Math.max(0, this.needs.curiosity - 0.12);

      if (planarDistance(perception.pet, critter) > PLAY_RANGE * 0.7) {
        this.walkToObject(critter);
        this.setHold(0.45);
        return 'chase';
      }

      this.stay();
      this.setHold(0.7);
      return 'play';
    }

    // --- Coming over to see you --------------------------------------------
    // Below the toys, above the pottering: a fond creature would still rather
    // chase a ball, which is what keeps this from being the only thing it does.
    const approach = this.approachPointer(perception);
    if (approach) return approach;

    // --- Something moved, but it is not a toy ------------------------------
    const moved = perception.objects.find(
      (object) =>
        !this.givenUpOn(object.id) &&
        this.interests.some((item) => item.id === object.id),
    );
    if (moved && this.needs.curiosity > 0.45) {
      this.needs.curiosity = Math.max(0, this.needs.curiosity - 0.3);
      this.stay();
      this.setHold(1.5);
      return 'investigate';
    }

    // --- Ambient (§29 weighted selection) ----------------------------------
    return this.chooseAmbient(perception);
  }

  /**
   * Moving away from the cursor, if it has come too close and it is not welcome.
   *
   * The visible half of low affection, and the half that had to be got right or
   * the whole idea reads as the creature being broken rather than sad. Three
   * rules, all of them about *not* overdoing it:
   *
   *   it only happens when the hand is genuinely near — a creature that fled
   *   the far side of the room would be frightened, which is a different thing
   *
   *   it walks, it does not bolt. `wander` rather than `scared`, so the gait,
   *   the face and the mood line all stay ordinary
   *
   *   it has a cooldown, so a cursor left resting on the room does not produce
   *   a creature endlessly backing into the corners
   */
  private avoidPointer(perception: Perception): PetBehavior | null {
    const pointer = perception.pointer;
    if (!pointer) return null;
    if (this.affection > WARY && this.sulking <= 0) return null;
    if (this.time < this.pointerAfter) return null;
    if (perception.pet.held) return null;

    const gap = planarDistance(perception.pet, pointer);
    if (gap > PERSONAL_SPACE) return null;

    // Directly away, and far enough that it is out of reach rather than merely
    // further off. Clamped to the room, because a corner is still somewhere.
    const dx = perception.pet.x - pointer.x;
    const dz = perception.pet.z - pointer.z;
    const length = Math.hypot(dx, dz) || 1;

    this.walkTo(
      clampTo(perception.pet.x + (dx / length) * RETREAT_DISTANCE, this.minX, this.maxX),
      clampTo(perception.pet.z + (dz / length) * RETREAT_DISTANCE, this.minZ, this.maxZ),
    );

    this.focusId = null;
    this.focusIsCritter = false;
    this.pointerAfter = this.time + POINTER_COOLDOWN * 0.5;
    this.setHold(2.2);
    this.lastAmbient = 'wander';

    return 'wander';
  }

  /**
   * Going over to where your hand is, because it feels like it.
   *
   * The other half, and deliberately the *less* frequent one. It is gated on a
   * cooldown, on the creature being in the mood, and on a coin flip on top of
   * both — a pet that came to the cursor every time it was free would be a
   * cursor-follower, and the point of affection is that it reads as a
   * disposition rather than as a mechanic (§29, §44).
   */
  private approachPointer(perception: Perception): PetBehavior | null {
    const pointer = perception.pointer;
    if (!pointer) return null;
    if (this.affection < FOND || this.sulking > 0) return null;
    if (this.time < this.pointerAfter) return null;

    // Already there. Sitting next to your hand is its own answer.
    const gap = planarDistance(perception.pet, pointer);
    if (gap < PLAY_RANGE * 0.7) return null;

    // Fondness buys the odds, and nothing else does: at the top of the scale it
    // is about even, at the threshold it is roughly one time in five.
    const eagerness = (this.affection - FOND) / (1 - FOND);
    if (this.random() > 0.2 + eagerness * 0.35) {
      // Not this time — but do not ask again immediately, or "occasionally"
      // becomes "on the next tick".
      this.pointerAfter = this.time + POINTER_COOLDOWN * 0.4;
      return null;
    }

    this.walkTo(
      clampTo(pointer.x, this.minX, this.maxX),
      clampTo(pointer.z, this.minZ, this.maxZ),
    );

    this.focusId = null;
    this.focusIsCritter = false;
    this.needs.curiosity = Math.max(0, this.needs.curiosity - 0.15);
    this.pointerAfter = this.time + POINTER_COOLDOWN;
    this.setHold(3 + this.random() * 2);
    this.lastAmbient = 'wander';

    return 'wander';
  }

  /**
   * The thing in the room most worth going and doing something with, or null.
   *
   * The entire decision-making cost of the affordance system, and it is
   * deliberately one function that knows nothing about any particular object:
   *
   *     score = appeal x appetite x supply / distance-ish
   *
   * `appetite` comes from the needs (see ./Affordances.ts), `appeal` and
   * `supply` from the object. A scratching post with a high appeal is ignored
   * by a contented creature; an empty bowl is ignored by a hungry one; a full
   * bowl on the far side of the room loses to a nearer one. None of those
   * three sentences required a branch.
   */
  private pickAffordance(
    perception: Perception,
    only?: AffordanceKind,
  ): { object: PerceivedObject; affordance: PerceivedAffordance; score: number } | null {
    // Mid-interaction: keep going with what it is already doing, even if the
    // object has stopped offering it. Stopping dead when a bowl empties looks
    // like a bug, not like finishing.
    if (!only && this.behavior === 'use' && this.using && this.time < this.holdUntil) {
      const object = perception.objects.find((item) => item.id === this.using?.id);
      if (object) {
        return { object, affordance: this.using.affordance, score: Infinity };
      }
    }

    let best: {
      object: PerceivedObject;
      affordance: PerceivedAffordance;
      score: number;
    } | null = null;
    let bestScore = USE_THRESHOLD;

    for (const object of perception.objects) {
      const affordance = object.affordance;
      if (!affordance || !object.reachable) continue;
      if (only && affordance.kind !== only) continue;
      if (this.givenUpOn(object.id)) continue;

      // The cooldown exists to stop *appetites* looping: a creature that has
      // just eaten should not immediately want to eat again. A targeted
      // lookup is not an appetite — it is the fear branch asking for a hole to
      // hide in — and a creature frightened twice must be able to hide twice.
      if (!only) {
        const used = this.usedAt.get(object.id);
        if (used !== undefined && this.time - used < USE_COOLDOWN) continue;
      }

      const appetite = appetiteFor(affordance.kind, this.needs);
      if (appetite <= 0.01 || affordance.supply <= 0.05) continue;

      // Distance costs, but only mildly: the room is twelve hundred units
      // across, and a creature that would not cross it for its supper is not a
      // creature, it is a fixture. The constant is deliberately larger than
      // the room, so the far corner is a discount rather than a refusal.
      const reach = planarDistance(perception.pet, object);
      const score =
        affordance.appeal * appetite * affordance.supply * (900 / (900 + reach));

      if (score > bestScore) {
        best = { object, affordance, score };
        bestScore = score;
      }
    }

    return best;
  }

  /**
   * The most interesting toy right now, or null for "I do not care".
   *
   * Two tiers, and the distinction is the whole personality of the thing. A
   * toy that is *moving or recently disturbed* is news, and the creature will
   * always go and see. A toy that has sat still in the corner all day is
   * furniture — but only mostly. Given enough playfulness and a long enough
   * gap since the last time, the creature will decide, apparently out of
   * nowhere, to go and get it, which is the difference between a pet that
   * plays and a pet that merely responds.
   */
  private pickToy(
    perception: Perception,
  ): { object: PerceivedObject; stirred: boolean } | null {
    // Just been let down: it does not start games. Note *start* — this is the
    // deliberate branch, the one where a creature decides to go and find
    // something to play with. A ball actually thrown at it is the interrupt
    // above (§33) and still lands, because a creature that ignored a ball
    // bouncing off its head would be sulking *at* the user, which is precisely
    // what the low end of this must never be.
    if (this.sulking > 0) return null;

    // Below that, fondness is a thumb on the scale rather than a gate. A
    // neglected creature needs more of an excuse to start something; it never
    // needs an impossible one.
    if (this.needs.playfulness < 0.3 + (0.5 - this.affection) * 0.3) return null;

    const toys = perception.objects.filter(
      (object) => object.isToy && object.reachable && !this.givenUpOn(object.id),
    );
    const nearest = (list: PerceivedObject[]) =>
      list.sort(
        (a, b) => planarDistance(perception.pet, a) - planarDistance(perception.pet, b),
      )[0];

    const stirred = toys.filter(
      (object) =>
        object.speed > 40 || this.interests.some((item) => item.id === object.id),
    );

    if (stirred.length > 0) return { object: nearest(stirred), stirred: true };

    if (this.needs.playfulness < 0.55 || this.time < this.fetchAfter) return null;

    const reachable = toys.filter(
      (object) => planarDistance(perception.pet, object) < FETCH_RANGE,
    );

    if (reachable.length === 0) return null;

    return { object: nearest(reachable), stirred: false };
  }

  /**
   * The nearest thing worth chasing that it will never catch.
   *
   * Deliberately self-limiting: chasing builds fatigue, fatigue ends the
   * chase, and the fatigue takes several seconds to wear off. A creature that
   * pursued every moth for ever would not read as curious, it would read as
   * broken (§32 cooldowns).
   */
  private pickCritter(perception: Perception): PerceivedObject | null {
    if (this.critterFatigue > 0.75) return null;
    if (this.needs.curiosity < 0.55 && this.needs.playfulness < 0.55) return null;

    let best: PerceivedObject | null = null;
    let bestDistance = CRITTER_RANGE;

    for (const object of perception.objects) {
      if (!object.isCritter) continue;
      if (this.givenUpOn(object.id)) continue;

      const distance = planarDistance(perception.pet, object);

      if (distance < bestDistance) {
        best = object;
        bestDistance = distance;
      }
    }

    return best;
  }

  /**
   * Going to bed.
   *
   * A creature that sleeps where it is standing is a creature that does not
   * live anywhere. This walks it to the comfiest thing in the room, asks the
   * room to lift it up onto it, and only then goes to sleep — and remembers
   * what it chose, so tomorrow it has a favourite (§41).
   */
  private settleDown(perception: Perception): PetBehavior {
    const spot = this.pickRestSpot(perception);

    // The cooldown is armed while it is actually asleep, so it starts counting
    // from the moment the nap ends rather than from the moment it first
    // thought about one. A creature frightened off the bed halfway there has
    // not had its nap and should still want one.
    const napping = () => {
      this.restAfter = this.time + REST_COOLDOWN;
      this.stay();
      return 'sleep' as const;
    };

    if (perception.pet.supportId && spot?.id === perception.pet.supportId) {
      this.favouriteRest = perception.pet.supportId;
      return napping();
    }

    if (!spot) return napping();

    const distance =
      planarDistance(perception.pet, spot) - spot.radius - perception.pet.radius;
    this.walkToObject(spot);

    // Close enough to jump. The room decides whether the jump lands.
    if (distance <= MOUNT_RANGE) this.mountId = spot.id;

    this.setHold(0.6);
    return 'rest';
  }

  /** The comfiest reachable thing, with a thumb on the scale for habit. */
  private pickRestSpot(perception: Perception): PerceivedObject | null {
    let best: PerceivedObject | null = null;
    let bestScore = Infinity;

    for (const object of perception.objects) {
      if (object.restHeight === null || !object.reachable) continue;
      if (object.comfort < 0.35 || this.givenUpOn(object.id)) continue;

      // Comfort buys distance: a creature will walk past a chair to get to
      // its bed, but not all the way across the room to get to a chair.
      let score = planarDistance(perception.pet, object) * (1.5 - object.comfort);
      if (object.id === this.favouriteRest) score *= 0.55;

      if (score < bestScore) {
        best = object;
        bestScore = score;
      }
    }

    return best;
  }

  private chooseAmbient(perception: Perception): PetBehavior {
    const { energy, curiosity } = this.needs;

    // Weights, not rules: a tired pet mostly sits, but can still potter.
    //
    // `investigate` is here rather than only in the reactive branch above
    // because a creature that inspects the furniture only when the furniture
    // moves is not curious, it is startled. Going over to have a look at the
    // lamp for no reason is most of what makes the room feel occupied.
    // Affection tilts the same four options rather than adding a fifth. A fond
    // creature is *busier* — it wanders and investigates more, and sits less —
    // and a wary one is quieter and keeps to itself. Neither ever loses an
    // option entirely, because a creature that cannot potter is not sad, it is
    // switched off.
    const fondness = (this.affection - 0.5) * 2;

    const weights: [PetBehavior, number][] = [
      ['idle', 1],
      ['wander', Math.max(0.15, 0.3 + curiosity * 1.2 + energy * 0.6 + fondness * 0.5)],
      ['sit', Math.max(0.15, 0.25 + (1 - energy) * 1.4 - fondness * 0.4)],
      ['investigate', Math.max(0.12, 0.3 + curiosity * 1.0 + fondness * 0.4)],
    ];

    // Never do the same ambient thing twice in a row (§30).
    const pool = weights.filter(([behavior]) => behavior !== this.lastAmbient);
    const total = pool.reduce((sum, [, weight]) => sum + weight, 0);

    let roll = this.random() * total;
    let chosen: PetBehavior = 'idle';

    for (const [behavior, weight] of pool) {
      roll -= weight;
      if (roll <= 0) {
        chosen = behavior;
        break;
      }
    }

    this.lastAmbient = chosen;
    this.focusId = null;

    // Ambient behaviours are long. This is the difference between a creature
    // pottering about and a creature that cannot settle: five to eleven
    // seconds of one idea is a pause worth watching, and two is a fidget.
    if (chosen === 'wander') {
      // Anywhere on the floor, not anywhere along one line. A creature that
      // only ever moved left and right would give the room's depth away as
      // scenery within about ten seconds of watching it.
      this.walkTo(
        this.minX + this.random() * (this.maxX - this.minX),
        this.minZ + this.random() * (this.maxZ - this.minZ),
      );
      this.setHold(4 + this.random() * 5);
      return chosen;
    }

    if (chosen === 'investigate') {
      const subject = this.pickCuriosity(perception);
      if (subject) {
        this.focusId = subject.id;
        this.focusIsCritter = false;
        // Having a look at something answers the question that sent it over
        // there, which is what paces this: curiosity has to build back up
        // before the next expedition.
        this.needs.curiosity = Math.max(0, this.needs.curiosity - 0.3);
        // Beside it, not inside it — but *which* side is not the brain's
        // question. It used to guess at the near side and clamp the answer to
        // the room, which put the creature inside the bed roughly as often as
        // beside it. Naming the subject and letting the navigator pick a spot
        // it can actually stand in is both shorter and right.
        this.walkToObject(subject);
        this.setHold(4.5 + this.random() * 4);
        return chosen;
      }

      // Nothing worth looking at. Potter instead.
      this.lastAmbient = 'idle';
      chosen = 'idle';
    }

    this.stay();
    this.setHold(5 + this.random() * 6);

    return chosen;
  }

  /**
   * Something in the room to go and have a look at.
   *
   * Anything reachable that is not a toy — the toys have their own, livelier
   * branch — weighted toward whatever is nearby and away from whatever it has
   * just been staring at.
   */
  private pickCuriosity(perception: Perception): PerceivedObject | null {
    const candidates = perception.objects.filter(
      (object) =>
        object.reachable &&
        !object.isCritter &&
        !object.isToy &&
        object.id !== this.lastVisited &&
        !this.givenUpOn(object.id),
    );

    if (candidates.length === 0) return null;

    // Something the user has been prodding outranks whatever happens to be
    // nearest. `interests` is the same list `noticeObject` writes to, so the
    // preference costs no new state and expires on the same timer.
    const interested = candidates.filter((object) =>
      this.interests.some((item) => item.id === object.id),
    );
    const pool = interested.length > 0 ? interested : candidates;

    // Nearer things are likelier, but nothing is impossible: a creature that
    // always visited the closest object would wear a groove in the floor.
    const weighted = pool.map((object) => ({
      object,
      weight: 1 / (120 + planarDistance(perception.pet, object)),
    }));

    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = this.random() * total;

    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) {
        this.lastVisited = item.object.id;
        return item.object;
      }
    }

    return weighted[weighted.length - 1].object;
  }

  /**
   * How the creature feels, given what it is doing and what has been done to
   * it. Behaviour and emotion are deliberately separate: the strongest feeling
   * wins regardless of the activity, which is how a creature ends up playing
   * with a toy while still visibly annoyed with you.
   */
  private feel(behavior: PetBehavior): { emotion: Emotion; strength: number } {
    const { fear, anger, dizziness, joy, energy } = this.needs;

    if (behavior === 'held') return { emotion: 'surprise', strength: 0.7 };
    if (fear > 0.3) return { emotion: 'fear', strength: Math.min(1, fear * 1.4) };
    if (dizziness > 0.4) return { emotion: 'dizzy', strength: Math.min(1, dizziness) };
    if (anger > 0.4) return { emotion: 'anger', strength: Math.min(1, anger * 1.3) };
    if (behavior === 'sleep') return { emotion: 'sleepy', strength: 1 };

    // Just been let down. Above play, because a creature that had its feelings
    // hurt and then grinned through a game of fetch did not have them hurt.
    // `disappointed`, never `anger` — being let down is not being thrown.
    if (this.sulking > 0) {
      return { emotion: 'disappointed', strength: Math.min(1, 0.5 + this.sulking / SULK_SECONDS * 0.4) };
    }

    if (behavior === 'play' || behavior === 'chase') {
      // Doing the same thing with somebody it is devoted to looks different
      // from doing it alone, and one emotion is the whole of the difference.
      const emotion: Emotion = this.affection > 0.9 && joy > 0.5 ? 'love' : 'joy';
      return { emotion, strength: Math.min(1, 0.6 + joy * 0.5) };
    }

    if (joy > 0.55) return { emotion: 'joy', strength: (joy - 0.55) * 1.6 };
    if (energy < 0.3) return { emotion: 'sleepy', strength: (0.3 - energy) * 2 };

    // The resting face of a neglected creature. Weak on purpose — it is a
    // slight droop somebody notices after a moment, not a crying pet.
    if (this.affection < WARY) {
      return { emotion: 'sad', strength: Math.min(0.55, (WARY - this.affection) * 2) };
    }

    return { emotion: 'neutral', strength: 1 };
  }

  private lookTarget(perception: Perception): { x: number; y: number; z: number } | null {
    if (this.behavior === 'sleep' || this.behavior === 'held') return null;

    const pointer = perception.pointer;

    // Turning away is the cheapest and clearest way to say "not just now", and
    // it costs one look target rather than a pose: the gaze layer already leans
    // the head and the body after it (`layers/Ambient.ts`).
    if (pointer && this.sulking > 0) {
      return {
        x: perception.pet.x * 2 - pointer.x,
        y: perception.pet.height + 20,
        z: perception.pet.z * 2 - pointer.z,
      };
    }

    const focus =
      this.behavior === 'chase' || this.behavior === 'play'
        ? (this.pickToy(perception)?.object ?? this.pickCritter(perception))
        : // Whatever it went over to look at outranks whatever last twitched:
          // if the creature has walked across the room to inspect the lamp, it
          // should be looking at the lamp.
          (perception.objects.find((object) => object.id === this.focusId) ??
          perception.objects.find((object) =>
            this.interests.some((item) => item.id === object.id),
          ));

    if (!focus) {
      // Nothing else going on, and it is fond of you: watch the hand. Only
      // while it is actually moving about, because a creature staring at a
      // parked cursor is not affectionate, it is unsettling.
      if (pointer && this.affection >= FOND) {
        return { x: pointer.x, y: 40, z: pointer.z };
      }
      return null;
    }

    return { x: focus.x, y: focus.height + 20, z: focus.z };
  }

  private onEnter(behavior: PetBehavior, perception: Perception): void {
    if (behavior === 'sleep') {
      this.stay();
    }
    if (behavior === 'scared') {
      // Bolt away from whatever just happened — and toward the front of the
      // room, because backing into a corner is what frightened things do.
      const away = perception.pet.x < (this.minX + this.maxX) / 2 ? -1 : 1;
      this.walkTo(
        clampTo(perception.pet.x + away * 140, this.minX, this.maxX),
        clampTo(perception.pet.z + 40, this.minZ, this.maxZ),
      );
    }
    if (behavior === 'angry' || behavior === 'held' || behavior === 'dizzy') {
      this.stay();
    }
    if (behavior === 'play' || behavior === 'chase') {
      // Chasing something wakes it up a little, which is what stops a tired
      // creature from oscillating between the bed and the beetle.
      this.needs.energy = Math.max(0, this.needs.energy - 0.01);
    }
  }

  /**
   * Walk to a place on the floor.
   *
   * A place is a place: nobody is going to move the far corner of the room
   * while the creature is on its way to it.
   */
  private walkTo(x: number, z: number): void {
    this.moveTarget = { x, z };
    this.moveTargetId = null;
  }

  /**
   * Walk to a *thing*, wherever beside it turns out to be convenient.
   *
   * The brain deliberately does not say which side. It does not know what is
   * against the wall and it does not know how wide the creature is; both of
   * those are questions the navigator can answer properly and it can only
   * guess at (§8).
   */
  private walkToObject(object: PerceivedObject): void {
    this.moveTarget = { x: object.x, z: object.z };
    this.moveTargetId = object.id;
  }

  /** Stay where you are. */
  private stay(): void {
    this.moveTarget = null;
    this.moveTargetId = null;
  }

  /**
   * Start using something — once.
   *
   * The guard is the whole point of this being a method. Both callers run
   * every tick while the creature is standing at the object, and the first
   * version set the hold on every one of them: each frame pushed the end of
   * the interaction a full duration into the future, so the creature ate
   * for ever. A behaviour that renews its own deadline never finishes.
   */
  private beginUsing(id: string, affordance: PerceivedAffordance): void {
    if (this.behavior === 'use' && this.using?.id === id) return;

    this.using = { id, affordance };
    this.usedAt.set(id, this.time);
    this.setHold(affordance.duration);
  }

  /** Has it recently failed to get to this? */
  private givenUpOn(id: string): boolean {
    return this.unreachable.some((item) => item.id === id);
  }

  private setBehavior(behavior: PetBehavior, seconds: number): void {
    this.behavior = behavior;
    this.setHold(seconds);
  }

  private setHold(seconds: number): void {
    this.holdUntil = this.time + seconds;
  }
}

/**
 * How far apart two things are across the floor.
 *
 * Measured in the x/z plane and not weighted, because depth is no longer a
 * discount on distance — a ball two hundred units behind the creature is two
 * hundred units away, and it has to walk them.
 */
function planarDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clampTo(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
