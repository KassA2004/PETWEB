/**
 * Interaction clips — what the creature looks like while it is *using*
 * something.
 *
 * The room gained a supper bowl, a scratching post, a music box, a fish bowl
 * and a tunnel, and every one of them would have been a creature standing
 * politely next to an object without these. An interaction that has no
 * animation is a status effect.
 *
 * All five are **looping** clips, like the shake, because none of them has a
 * natural length: the creature does the thing for as long as the simulation
 * says it is doing the thing, and the clip's blend-out ends it. That is also
 * why they are clips rather than states — a state is what a creature is
 * generally up to, and eating is something it is briefly doing.
 *
 * One rule holds all five together, and it is the one that makes them read as
 * the same creature rather than five mimes:
 *
 *   **The body leads and everything soft arrives late.**
 *
 * Ears, tail and topper are driven from the same wave as the body with a phase
 * offset, so nothing is ever perfectly synchronised (§19). Getting that wrong
 * is what makes procedural animation look mechanical, and it costs one
 * subtraction per part.
 */

import { clamp } from '../../assets/shared/shapes';
import type { ClipDefinition } from '../core/Clip';
import type { Pose } from '../core/Pose';
import type { AnimationContext, EmotionRequest } from '../core/types';
import type { AffordanceKind } from '../../simulation/Affordances';

/**
 * Interaction clips sit below being shaken and above nothing else.
 *
 * Above the ambient states, because using something is the thing the creature
 * is visibly doing; below handling, because being picked up mid-supper is
 * still being picked up (§33 — emotion beats intention).
 */
const PRIORITY = 55;

/** Common shape for every clip here: long blends, so nothing snaps. */
function loopingClip(
  name: string,
  pose: (elapsed: number, ctx: AnimationContext) => Pose,
  emotion?: () => EmotionRequest,
): ClipDefinition {
  return {
    name,
    duration: 0,
    loop: true,
    blendIn: 0.22,
    blendOut: 0.3,
    priority: PRIORITY,
    pose,
    emotion: emotion ? () => emotion() : undefined,
  };
}

/**
 * Eating.
 *
 * A dip and a rise, twice a second, with the head leading the body down into
 * the bowl and the ears swinging forward on the way. The small pause at the
 * bottom is what makes it read as *taking a mouthful* rather than as bobbing:
 * a pure sine has no bottom, so the wave is squared to flatten one end of it.
 */
export function createEatClip(): ClipDefinition {
  return loopingClip('eat', (elapsed, ctx) => {
    const { proportions } = ctx.rig;
    const wave = Math.sin(elapsed * 5.4);
    // Squared and signed: sharp on the way down, lingering at the bottom.
    const dip = wave < 0 ? -(wave * wave) : wave * wave * 0.35;
    const lag = Math.sin(elapsed * 5.4 - 0.6);

    return {
      body: {
        y: -dip * proportions.bodyHeight * 0.09,
        rotation: -dip * 0.1,
        scaleY: 1 - Math.max(0, -dip) * 0.05,
        scaleX: 1 + Math.max(0, -dip) * 0.05,
      },
      face: {
        y: -dip * proportions.bodyHeight * 0.05,
        rotation: -dip * 0.16,
      },
      earLeft: { rotation: -lag * 0.5 },
      earRight: { rotation: -lag * 0.42 },
      topper: { rotation: -lag * 0.34 },
      // A tail that wags while you eat is a happy animal, and it is free.
      tail: { rotation: Math.sin(elapsed * 7.1) * 0.5 },
    };
  }, () => ({ emotion: 'joy', strength: 0.5, response: 0.7 }));
}

/**
 * Scratching.
 *
 * Reared up and working at the post with the whole body, fast. The vertical
 * travel is deliberately small and the *rotation* does the work — a creature
 * that bounces up and down at a post looks like it is climbing; one that leans
 * into it and shakes looks like it is scratching.
 */
export function createScratchClip(): ClipDefinition {
  return loopingClip('scratch', (elapsed, ctx) => {
    const { proportions } = ctx.rig;
    const fast = Math.sin(elapsed * 13);
    const lag = Math.sin(elapsed * 13 - 1.2);
    // Reared: a steady lean that the fast shake happens on top of.
    const rear = 0.16;

    return {
      body: {
        x: fast * proportions.bodyWidth * 0.03,
        y: -proportions.bodyHeight * 0.06,
        rotation: rear + fast * 0.07,
        scaleY: 1 + Math.abs(fast) * 0.015,
      },
      face: { x: lag * proportions.bodyWidth * 0.02, rotation: rear * 0.6 },
      earLeft: { rotation: -lag * 0.6 },
      earRight: { rotation: lag * 0.55 },
      topper: { rotation: -lag * 0.5 },
      tail: { rotation: Math.sin(elapsed * 4.3) * 0.7 },
    };
  }, () => ({ emotion: 'joy', strength: 0.65, response: 0.8 }));
}

/**
 * Dancing.
 *
 * Two waves at a three-to-two ratio — a bounce and a sway — so the creature
 * never lands on the same pose twice in a bar. Everything soft trails by a
 * quarter beat, which is what turns a bouncing blob into something with
 * momentum.
 */
export function createDanceClip(): ClipDefinition {
  return loopingClip('dance', (elapsed, ctx) => {
    const { proportions } = ctx.rig;
    const beat = elapsed * 6.2;
    const bounce = Math.abs(Math.sin(beat));
    const sway = Math.sin(beat * 0.6667);
    const lag = Math.sin(beat * 0.6667 - 0.9);

    return {
      body: {
        x: sway * proportions.bodyWidth * 0.07,
        y: -bounce * proportions.bodyHeight * 0.1,
        rotation: sway * 0.14,
        // Squash on the landing, stretch at the top of the hop.
        scaleY: 1 + bounce * 0.06 - (1 - bounce) * 0.04,
        scaleX: 1 - bounce * 0.05 + (1 - bounce) * 0.03,
      },
      face: {
        x: lag * proportions.bodyWidth * 0.04,
        rotation: lag * 0.18,
      },
      earLeft: { rotation: -lag * 1.1 },
      earRight: { rotation: lag * 0.95 },
      topper: { rotation: -lag * 0.8 },
      tail: { rotation: Math.sin(beat * 1.5) * 0.9 },
      wingLeft: { rotation: -bounce * 0.5 },
      wingRight: { rotation: bounce * 0.5 },
    };
  }, () => ({ emotion: 'joy', strength: 1, response: 1 }));
}

/**
 * Watching something.
 *
 * The stillest clip in the project, and the hardest to get right: almost
 * nothing moves, so the little that does has to be legible. A slow lean
 * forward, one head-tilt every few seconds, and ears that pivot on their own
 * timing. If it moved any more it would be curiosity; any less and it would be
 * a texture.
 */
export function createWatchClip(): ClipDefinition {
  return loopingClip('watch', (elapsed, ctx) => {
    const { proportions } = ctx.rig;
    const breathe = Math.sin(elapsed * 1.4);
    // A tilt that arrives, holds, and goes away again — not a wobble.
    const tiltPhase = Math.sin(elapsed * 0.55);
    const tilt = Math.sign(tiltPhase) * Math.abs(tiltPhase) ** 3;

    return {
      body: {
        y: breathe * proportions.bodyHeight * 0.012,
        rotation: 0.05,
        scaleY: 1 + breathe * 0.012,
        scaleX: 1 - breathe * 0.01,
      },
      face: { rotation: tilt * 0.24 },
      earLeft: { rotation: -0.18 + Math.sin(elapsed * 0.9) * 0.16 },
      earRight: { rotation: -0.14 + Math.sin(elapsed * 1.13 + 2) * 0.16 },
      topper: { rotation: tilt * 0.18 },
      tail: { rotation: Math.sin(elapsed * 0.8) * 0.25 },
    };
  }, () => ({ emotion: 'curious', strength: 0.8, response: 0.5 }));
}

/**
 * Hiding.
 *
 * Hunkered down and small, with an occasional peek. The scale change carries
 * almost all of it — a frightened creature makes itself less, and squashing
 * the body while pulling the ears back does more than any amount of travel.
 *
 * The peek is what stops it being a crouch: every couple of seconds the head
 * comes up, has a look, and goes back down.
 */
export function createHideClip(): ClipDefinition {
  return loopingClip('hide', (elapsed, ctx) => {
    const { proportions } = ctx.rig;
    const cycle = (elapsed % 3.4) / 3.4;
    // A short window of the cycle spent looking out.
    const peek = clamp(Math.sin(cycle * Math.PI * 2) * 2.2, 0, 1);
    const tremble = Math.sin(elapsed * 17) * 0.02;

    return {
      body: {
        y: proportions.bodyHeight * 0.04 * (1 - peek),
        rotation: tremble,
        scaleY: 0.9 + peek * 0.08,
        scaleX: 1.08 - peek * 0.06,
      },
      face: {
        y: -peek * proportions.bodyHeight * 0.05,
        rotation: tremble * 2,
      },
      // Ears flat back while hidden, up when peeking.
      earLeft: { rotation: 0.9 - peek * 0.8 },
      earRight: { rotation: -0.9 + peek * 0.8 },
      topper: { rotation: 0.5 - peek * 0.45 },
      tail: { rotation: 0.4 },
    };
  }, () => ({ emotion: 'fear', strength: 0.45, response: 0.6 }));
}

const CLIPS: Record<AffordanceKind, () => ClipDefinition> = {
  eat: createEatClip,
  scratch: createScratchClip,
  dance: createDanceClip,
  watch: createWatchClip,
  hide: createHideClip,
};

/**
 * The clip for an affordance.
 *
 * A lookup rather than a `switch`, so adding a kind is adding a row — the same
 * rule the asset libraries follow (/Docs/theme-and-design.md §12.3).
 */
export function createInteractionClip(kind: AffordanceKind): ClipDefinition {
  return CLIPS[kind]();
}
