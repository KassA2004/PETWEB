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

export type PetBehavior =
  | 'idle'
  | 'wander'
  | 'sit'
  | 'rest'
  | 'investigate'
  | 'chase'
  | 'play'
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
      mood: MOODS[behavior],
      emotion: feeling.emotion,
      emotionStrength: feeling.strength,
    };
  }

  private decay(dt: number, perception: Perception): void {
    const needs = this.needs;

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
    if (this.needs.fear > 0.34) return 'scared';
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
    if (this.needs.playfulness < 0.3) return null;

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
    const weights: [PetBehavior, number][] = [
      ['idle', 1],
      ['wander', 0.3 + curiosity * 1.2 + energy * 0.6],
      ['sit', 0.25 + (1 - energy) * 1.4],
      ['investigate', 0.3 + curiosity * 1.0],
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

    // Nearer things are likelier, but nothing is impossible: a creature that
    // always visited the closest object would wear a groove in the floor.
    const weighted = candidates.map((object) => ({
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
    if (behavior === 'play' || behavior === 'chase') {
      return { emotion: 'joy', strength: Math.min(1, 0.6 + joy * 0.5) };
    }
    if (joy > 0.55) return { emotion: 'joy', strength: (joy - 0.55) * 1.6 };
    if (energy < 0.3) return { emotion: 'sleepy', strength: (0.3 - energy) * 2 };

    return { emotion: 'neutral', strength: 1 };
  }

  private lookTarget(perception: Perception): { x: number; y: number; z: number } | null {
    if (this.behavior === 'sleep' || this.behavior === 'held') return null;

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

    if (!focus) return null;

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
