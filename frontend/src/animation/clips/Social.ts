/**
 * Social clips — what a creature looks like when there is another creature.
 *
 * The park's whole promise is that two pets meet rather than two usernames, and
 * a meeting with no animation is a status effect (`Interactions.ts` makes the
 * same argument about the supper bowl). So every interaction the park can
 * broadcast has a clip here, and both creatures play one: the greeter's and the
 * greeted's are different animations of the same event.
 *
 * These are **one-shots**, unlike the interaction clips next door. Using the
 * scratching post has no natural length — you stop when you stop — but a
 * greeting does: it starts, it lands, it is over, and it must end at the same
 * moment on every screen watching it. The server says how long
 * (`INTERACTION_MS`), both clients run the same duration, and nobody has to
 * agree about anything afterwards.
 *
 * The rule from `Interactions.ts` holds here too, because it is what makes all
 * of these read as the same creature:
 *
 *   **The body leads and everything soft arrives late.**
 *
 * And one more that only applies to these:
 *
 *   **The creature turns toward the other one.** Every clip takes a
 *   `direction` — which way the other creature is, in screen terms — and leans
 *   that way. A greeting delivered to the opposite wall is worse than no
 *   greeting, because it reads as a bug rather than as shyness.
 */

import { easeInOut, easeOutBack } from '../core/Pose';
import type { ClipDefinition } from '../core/Clip';
import type { Pose } from '../core/Pose';
import type { AnimationContext } from '../core/types';

/**
 * Above interactions, below handling.
 *
 * A creature greeting another creature should interrupt it watching the fish;
 * being picked up mid-greeting is still being picked up (§33 — emotion beats
 * intention).
 */
const PRIORITY = 60;

/** The four things one creature may do to another. Matches the server's list. */
export type SocialClipKind = 'greet' | 'play' | 'nuzzle' | 'copy';

/**
 * Whether this creature started it.
 *
 * The two halves of an interaction are different animations, and the difference
 * is the point: one creature bows and the other one bounces in reply. A single
 * clip played by both would look like two things happening at once rather than
 * like one thing happening between them.
 */
export type SocialRole = 'actor' | 'target';

export interface SocialClipOptions {
  kind: SocialClipKind;
  role: SocialRole;
  /** -1 if the other creature is to the left on screen, 1 if to the right. */
  direction: -1 | 1;
  /** Seconds. Comes from the server, so both clients run the same length. */
  duration: number;
}

/**
 * Build the clip for one side of one interaction.
 *
 * One entry point rather than eight exported functions, because the caller — a
 * network event handler — has a `kind` and a `role` as *data* and would
 * otherwise need a lookup table of its own.
 */
export function createSocialClip(options: SocialClipOptions): ClipDefinition {
  const { kind, role, direction, duration } = options;

  const pose =
    kind === 'greet'
      ? role === 'actor'
        ? greetBow(direction)
        : greetReply(direction)
      : kind === 'play'
        ? playBounce(direction, role)
        : kind === 'nuzzle'
          ? role === 'actor'
            ? nuzzleLean(direction)
            : nuzzleReceive(direction)
          : copyBob(direction, role);

  return {
    name: `social-${kind}-${role}`,
    duration,
    blendIn: 0.18,
    blendOut: 0.28,
    priority: PRIORITY,
    pose,
    emotion: () => ({
      emotion: 'joy',
      // The one who was greeted is pleased; the one doing the greeting is
      // enthusiastic. A small difference, and it is most of why the pair reads
      // as a conversation rather than as a synchronised routine.
      strength: role === 'actor' ? 0.9 : 0.7,
      response: 0.9,
    }),
  };
}

/**
 * A bow.
 *
 * Down, hold, up with a little overshoot. The hold is what makes it a bow
 * rather than a nod — a pure sine has no bottom, the same problem the eat clip
 * solves by squaring its wave.
 */
function greetBow(direction: -1 | 1): (t: number, ctx: AnimationContext) => Pose {
  return (t, ctx) => {
    const { proportions } = ctx.rig;

    // Down over the first third, held to two thirds, up with snap after that.
    const dip =
      t < 0.34
        ? easeInOut(t / 0.34)
        : t < 0.62
          ? 1
          : 1 - easeOutBack((t - 0.62) / 0.38, 1.4);

    const lag = Math.max(0, dip - 0.15);
    const wag = Math.sin(t * Math.PI * 6) * (1 - t);

    return {
      body: {
        x: direction * proportions.bodyWidth * 0.05 * dip,
        y: dip * proportions.bodyHeight * 0.07,
        rotation: direction * 0.22 * dip,
        scaleY: 1 - dip * 0.05,
        scaleX: 1 + dip * 0.04,
      },
      face: {
        x: direction * proportions.bodyWidth * 0.05 * dip,
        rotation: direction * 0.3 * dip,
      },
      earLeft: { rotation: -lag * 0.9 },
      earRight: { rotation: lag * 0.75 },
      topper: { rotation: -lag * 0.7 },
      // The tail keeps going after the body has come back up, which is the
      // whole of "pleased to see you".
      tail: { rotation: wag * 1.1 },
    };
  };
}

/**
 * Being greeted: a startled little rise, then a bob back.
 *
 * Starts a beat late — `t` is shifted — because a reply that begins on the same
 * frame as the greeting is not a reply, it is a coincidence.
 */
function greetReply(direction: -1 | 1): (t: number, ctx: AnimationContext) => Pose {
  return (t, ctx) => {
    const { proportions } = ctx.rig;

    const delayed = Math.max(0, (t - 0.22) / 0.78);
    const rise = Math.sin(delayed * Math.PI) ** 0.7;
    const lag = Math.sin(Math.max(0, delayed - 0.12) * Math.PI);

    return {
      body: {
        y: -rise * proportions.bodyHeight * 0.09,
        rotation: direction * 0.12 * rise,
        scaleY: 1 + rise * 0.05,
        scaleX: 1 - rise * 0.04,
      },
      face: {
        x: direction * proportions.bodyWidth * 0.06 * rise,
        rotation: direction * 0.24 * rise,
      },
      earLeft: { rotation: -lag * 1.2 },
      earRight: { rotation: lag * 1.05 },
      topper: { rotation: -lag * 0.9 },
      tail: { rotation: Math.sin(delayed * Math.PI * 5) * 0.8 * rise },
    };
  };
}

/**
 * Playing: three hops, leaning toward the other creature.
 *
 * The two roles are offset by half a hop rather than being different shapes,
 * because playing together is the one interaction where doing the *same* thing
 * is the point — but doing it in unison would look like a bug, so they
 * alternate.
 */
function playBounce(
  direction: -1 | 1,
  role: SocialRole,
): (t: number, ctx: AnimationContext) => Pose {
  const offset = role === 'actor' ? 0 : Math.PI;

  return (t, ctx) => {
    const { proportions } = ctx.rig;

    const beat = t * Math.PI * 6 + offset;
    const hop = Math.abs(Math.sin(beat));
    // Fades in and out so the last hop lands rather than being cut off.
    const envelope = Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.5;
    const lift = hop * envelope;
    const lag = Math.abs(Math.sin(beat - 0.9)) * envelope;

    return {
      body: {
        x: direction * proportions.bodyWidth * 0.06 * Math.sin(beat * 0.5) * envelope,
        y: -lift * proportions.bodyHeight * 0.14,
        rotation: direction * 0.1 * envelope,
        scaleY: 1 + lift * 0.07 - (1 - lift) * 0.04 * envelope,
        scaleX: 1 - lift * 0.06 + (1 - lift) * 0.03 * envelope,
      },
      face: {
        x: direction * proportions.bodyWidth * 0.04 * envelope,
        rotation: direction * 0.16 * envelope,
      },
      earLeft: { rotation: -lag * 1.3 },
      earRight: { rotation: lag * 1.15 },
      topper: { rotation: -lag * 1 },
      tail: { rotation: Math.sin(beat * 0.75) * 1.1 * envelope },
      wingLeft: { rotation: -lift * 0.55 },
      wingRight: { rotation: lift * 0.55 },
    };
  };
}

/**
 * A nuzzle: lean in, press, linger, come back.
 *
 * The slowest clip here, and deliberately: affection is legible through
 * *duration* rather than through amplitude. A fast nuzzle is a headbutt.
 */
function nuzzleLean(direction: -1 | 1): (t: number, ctx: AnimationContext) => Pose {
  return (t, ctx) => {
    const { proportions } = ctx.rig;

    const lean =
      t < 0.4 ? easeInOut(t / 0.4) : t < 0.72 ? 1 : 1 - easeInOut((t - 0.72) / 0.28);

    // A small settle at the top of the press — the moment of contact.
    const press = t > 0.4 && t < 0.72 ? Math.sin((t - 0.4) / 0.32 * Math.PI * 2) * 0.25 : 0;
    const lag = Math.max(0, lean - 0.2);

    return {
      body: {
        x: direction * proportions.bodyWidth * 0.13 * lean,
        y: lean * proportions.bodyHeight * 0.03,
        rotation: direction * (0.2 * lean + press * 0.06),
        scaleX: 1 + lean * 0.03,
      },
      face: {
        x: direction * proportions.bodyWidth * 0.07 * lean,
        y: lean * proportions.bodyHeight * 0.02,
        rotation: direction * 0.34 * lean,
      },
      earLeft: { rotation: -lag * 0.7 },
      earRight: { rotation: lag * 0.6 },
      topper: { rotation: -lag * 0.55 },
      tail: { rotation: Math.sin(t * Math.PI * 3) * 0.5 * lean },
    };
  };
}

/**
 * Being nuzzled: give a little, then lean back into it.
 *
 * Away first and toward second, which is the shape of accepting something:
 * surprise, then welcome. Getting the order the other way round reads as
 * flinching.
 */
function nuzzleReceive(direction: -1 | 1): (t: number, ctx: AnimationContext) => Pose {
  return (t, ctx) => {
    const { proportions } = ctx.rig;

    const give = t < 0.3 ? easeInOut(t / 0.3) : 1 - easeInOut(Math.min(1, (t - 0.3) / 0.35));
    const settle =
      t > 0.42 ? Math.sin(Math.min(1, (t - 0.42) / 0.58) * Math.PI) : 0;
    const lag = Math.max(give, settle) * 0.8;

    return {
      body: {
        // Pushed away, then leaning back toward them.
        x: direction * proportions.bodyWidth * (0.07 * give - 0.06 * settle),
        rotation: direction * (0.14 * give - 0.12 * settle),
        scaleX: 1 - give * 0.03 + settle * 0.02,
      },
      face: {
        x: direction * proportions.bodyWidth * (-0.03 * give + 0.05 * settle),
        rotation: direction * (-0.1 * give + 0.26 * settle),
      },
      earLeft: { rotation: -lag * 0.8 },
      earRight: { rotation: lag * 0.7 },
      topper: { rotation: -lag * 0.6 },
      tail: { rotation: Math.sin(t * Math.PI * 4) * 0.7 * settle },
    };
  };
}

/**
 * Copying: a wobble that the other creature repeats a beat later.
 *
 * The silliest of the four and the one that most needs the phase offset — two
 * creatures doing the same wobble at the same instant is a rendering glitch;
 * one doing it *after* the other is a joke.
 */
function copyBob(
  direction: -1 | 1,
  role: SocialRole,
): (t: number, ctx: AnimationContext) => Pose {
  // A third of the clip behind, not half: near enough to be an imitation,
  // far enough to be visibly second.
  const shift = role === 'actor' ? 0 : 0.33;

  return (t, ctx) => {
    const { proportions } = ctx.rig;

    const local = Math.max(0, (t - shift) / (1 - shift));
    const envelope = Math.sin(Math.min(1, local * 1.1) * Math.PI) ** 0.6;
    const wobble = Math.sin(local * Math.PI * 5);
    const lag = Math.sin(local * Math.PI * 5 - 1.1) * envelope;

    return {
      body: {
        x: wobble * proportions.bodyWidth * 0.09 * envelope,
        y: -Math.abs(wobble) * proportions.bodyHeight * 0.04 * envelope,
        rotation: wobble * 0.2 * envelope,
        scaleY: 1 + Math.abs(wobble) * 0.04 * envelope,
      },
      face: {
        x: direction * proportions.bodyWidth * 0.03 * envelope,
        rotation: lag * 0.22,
      },
      earLeft: { rotation: -lag * 1.4 },
      earRight: { rotation: lag * 1.25 },
      topper: { rotation: -lag * 1.1 },
      tail: { rotation: lag * 1.2 },
    };
  };
}
