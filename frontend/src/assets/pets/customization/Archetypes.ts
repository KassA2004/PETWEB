/**
 * Archetypes and variation.
 *
 * Two ways to get a creature without touching forty controls:
 *
 *   ARCHETYPES        hand-tuned starting points. Not species — the system has
 *                     no idea what a rabbit is — but proofs that the libraries
 *                     cover their range. Half of them are deliberately not cute.
 *   randomAppearance  a whole creature from a seed, steered by two dials.
 *
 * The dials are the interesting part. `cuteness` moves every feature along the
 * same axis at once — eye preset, eye size, where the eyes sit, brow shape,
 * mouth design, teeth, colour, resting mood — because cuteness is not one
 * feature, it is all of them agreeing. `chaos` decides how far proportions may
 * wander from sensible, which is what produces the creatures nobody would have
 * designed on purpose (/Docs/project-overview.md §4.3).
 */

import { createRng, lerp } from '../../shared/shapes';
import { TAIL_TYPE_KEYS, WING_TYPE_KEYS } from './AppendageTypes';
import { BODY_TYPE_KEYS } from './BodyTypes';
import { EAR_TYPE_KEYS } from './EarTypes';
import { FOOT_TYPE_KEYS } from './FootTypes';
import { BROW_TYPE_KEYS } from './BrowTypes';
import { CHEEK_TYPE_KEYS } from './CheekTypes';
import { EYE_TYPE_KEYS } from './EyeTypes';
import { MOUTH_TYPE_KEYS } from './MouthTypes';
import { SNOUT_TYPE_KEYS } from './SnoutTypes';
import { PATTERN_KEYS } from './Patterns';
import { TOPPER_TYPE_KEYS } from './TopperTypes';
import type { PetAppearanceInput } from './PetAppearance';

/** Soft, warm, high-value colours. */
const SWEET_COATS = [
  0xffb3c9, 0xffd28a, 0xf7e6a8, 0xa8e6c4, 0xa9d5f5, 0xd5c2f0, 0xffc9a8, 0xfff0d8,
];

/** Dark, saturated or sickly colours. */
const NASTY_COATS = [
  0x7a5c8f, 0x4f6b52, 0x8f4a3c, 0x3f4a63, 0x6b6f3a, 0x8a2f4a, 0x2f3b3f, 0x9c6b2f,
];

const LIGHT_TONES = [0xfff4e2, 0xffe6d0, 0xe8f5ea, 0xf3e8ff, 0xfff9d8, 0xdfeefc];
const ACCENTS = [0xef5f8c, 0xff8a5c, 0xf2c94c, 0x74c9a8, 0x7bb6e8, 0x9b7fd4, 0xd9552b];
const EYE_COLORS = [0x5b3a2e, 0x2f4858, 0x3d6b4f, 0x6b3f6b, 0x8a5a2b, 0x1f1f2e];

export interface VariationOptions {
  /** -1 = as menacing as the parts allow, +1 = as adorable as they allow. */
  cuteness?: number;
  /** 0 = sensible proportions, 1 = completely unhinged. */
  chaos?: number;
  seed?: number;
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

/** Random in [min, max), biased toward the middle when chaos is low. */
function spread(rng: () => number, min: number, max: number, chaos: number): number {
  const middle = (min + max) / 2;
  const raw = min + rng() * (max - min);
  return lerp(middle, raw, 0.25 + chaos * 0.75);
}

/**
 * Build a complete creature from a seed.
 *
 * Deterministic: the same seed and dials always produce the same creature.
 */
export function randomAppearance(options: VariationOptions = {}): PetAppearanceInput {
  const cuteness = Math.max(-1, Math.min(1, options.cuteness ?? 0));
  const chaos = Math.max(0, Math.min(1, options.chaos ?? 0.5));
  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
  const rng = createRng(seed);

  // 0 at fully menacing, 1 at fully adorable. Most values below read off this.
  const sweet = (cuteness + 1) / 2;

  // --- Parts ---------------------------------------------------------------
  // Chaos decides whether parts come from the flattering shortlist or from
  // everything the library has.
  const sweetBodies = ['round', 'blob', 'pear', 'bean', 'short'] as const;
  const nastyBodies = ['chonk', 'egg', 'wide', 'tall', 'square', 'narrow'] as const;
  const bodyPool =
    rng() < chaos * 0.6 ? BODY_TYPE_KEYS : sweet > 0.5 ? sweetBodies : nastyBodies;

  const sweetEyes = ['sparkle', 'saucer', 'dot', 'bean', 'button', 'pearl'] as const;
  const nastyEyes = ['beady', 'pixel', 'sharp', 'narrow', 'deadpan', 'pinprick'] as const;
  const eyePool =
    rng() < chaos * 0.5 ? EYE_TYPE_KEYS : sweet > 0.5 ? sweetEyes : nastyEyes;

  const sweetMouths = ['smile', 'cat', 'small', 'omega', 'round'] as const;
  const nastyMouths = ['line', 'frown', 'jagged', 'slab', 'smirk', 'stitched'] as const;
  const mouthPool =
    rng() < chaos * 0.55 ? MOUTH_TYPE_KEYS : sweet > 0.5 ? sweetMouths : nastyMouths;

  const browPool =
    sweet > 0.6
      ? (['none', 'none', 'thin', 'worried'] as const)
      : sweet < 0.4
        ? (['angular', 'thick', 'bushy', 'flat'] as const)
        : BROW_TYPE_KEYS;

  const teethPool =
    sweet > 0.6
      ? (['none', 'none', 'two', 'one'] as const)
      : (['fangs', 'uneven', 'snaggle', 'underbite', 'full'] as const);

  // --- Proportions ---------------------------------------------------------
  // Cute: big eyes set low and wide on a round body. Menacing: small eyes set
  // high and close on a heavy one. Everything else is scaled between.
  const eyeScale = lerp(0.6, 1.5, sweet) * spread(rng, 0.85, 1.25, chaos);
  const eyeHeight = lerp(0.26, 0.74, sweet) * spread(rng, 0.9, 1.1, chaos);
  const eyeSpacing = lerp(0.13, 0.27, sweet) * spread(rng, 0.85, 1.15, chaos);

  return {
    bodyType: pick(rng, bodyPool),
    bodyScale: spread(rng, 0.8, 1.3, chaos),
    bodyWidth: spread(rng, 0.7, sweet > 0.5 ? 1.35 : 1.55, chaos),
    bodyHeight: spread(rng, 0.75, 1.45, chaos),
    asymmetry: spread(rng, 0.2, 1, chaos),

    footType: pick(
      rng,
      rng() < chaos * 0.55 ? FOOT_TYPE_KEYS : (['nubs', 'paws', 'hooves', 'boots'] as const),
    ),
    footScale: spread(rng, 0.7, 1.5, chaos),

    earType: pick(rng, EAR_TYPE_KEYS),
    earScale: spread(rng, 0.65, 1.6, chaos),
    earSpread: spread(rng, 0.18, 0.46, chaos),
    earTilt: spread(rng, -0.3, 0.5, chaos),

    // Wings are rare unless chaos is high — everything having wings is boring.
    wingType: rng() < 0.22 + chaos * 0.35 ? pick(rng, WING_TYPE_KEYS) : 'none',
    wingScale: spread(rng, 0.7, 1.4, chaos),

    tailType: pick(rng, TAIL_TYPE_KEYS),
    tailScale: spread(rng, 0.7, 1.5, chaos),

    topperType: rng() < 0.3 + chaos * 0.25 ? pick(rng, TOPPER_TYPE_KEYS) : 'none',
    topperScale: spread(rng, 0.6, 1.5, chaos),

    eyeType: pick(rng, eyePool),
    eyeScale,
    eyeSpacing,
    eyeHeight,
    pupilScale: spread(rng, 0.7, sweet > 0.5 ? 1.4 : 1.1, chaos),
    eyeTilt: lerp(0.14, -0.06, sweet) + (rng() - 0.5) * 0.3 * chaos,

    browType: pick(rng, browPool),
    browScale: spread(rng, 0.7, 1.4, chaos),

    snoutType: pick(rng, rng() < 0.55 ? SNOUT_TYPE_KEYS : (['none', 'nose'] as const)),
    snoutScale: spread(rng, 0.7, 1.4, chaos),

    mouthType: pick(rng, mouthPool),
    mouthWidth: spread(rng, 0.7, 1.4, chaos),
    mouthWeight: spread(rng, 0.8, 1.4, chaos),
    teethType: rng() < (sweet > 0.5 ? 0.3 : 0.75) ? pick(rng, teethPool) : 'none',
    fangs: spread(rng, 0.4, 1, chaos),

    cheekType: sweet > 0.5 ? pick(rng, ['round', 'bold', 'soft', 'freckles']) : pick(rng, CHEEK_TYPE_KEYS),

    restingMood: lerp(-0.75, 0.8, sweet) + (rng() - 0.5) * 0.3 * chaos,

    primaryColor: pick(rng, sweet > 0.5 ? SWEET_COATS : NASTY_COATS),
    secondaryColor: pick(rng, LIGHT_TONES),
    accentColor: pick(rng, ACCENTS),
    eyeColor: pick(rng, EYE_COLORS),

    pattern: rng() < 0.35 + chaos * 0.3 ? pick(rng, PATTERN_KEYS) : 'none',
    // Markings read against the coat rather than blending into it.
    patternColor: sweet > 0.5 ? pick(rng, LIGHT_TONES) : pick(rng, NASTY_COATS),
    blush: sweet > 0.5 ? spread(rng, 0.4, 1, chaos) : spread(rng, 0, 0.4, chaos),

    accessories: {},
    seed,
  };
}

export interface Archetype {
  key: string;
  label: string;
  /** What the parts add up to, for the person choosing. */
  hint: string;
  appearance: PetAppearanceInput;
}

/**
 * Hand-tuned starting points.
 *
 * The set is chosen to prove the range rather than to be a menu of pets: three
 * of them are adorable, and the rest are stupid, furious, miserable, unhinged or
 * simply wrong. If every entry here were cute, the customization system would
 * not be doing its job.
 */
export const ARCHETYPES: Archetype[] = [
  {
    key: 'bunny',
    label: 'Bunny',
    hint: 'Long ears, buck teeth, tiny nose',
    appearance: {
      bodyType: 'blob', bodyScale: 1, bodyWidth: 1, bodyHeight: 1, asymmetry: 0.5,
      footType: 'paws', footScale: 1,
      earType: 'bunny', earScale: 1.1, earSpread: 0.2, earTilt: 0.05,
      wingType: 'none', tailType: 'puff', tailScale: 1, topperType: 'none',
      eyeType: 'dot', eyeScale: 1.15, eyeSpacing: 0.22, eyeHeight: 0.52,
      pupilScale: 1, eyeTilt: 0,
      browType: 'none', snoutType: 'muzzle', snoutScale: 1,
      mouthType: 'cat', mouthWidth: 0.9, mouthWeight: 1,
      teethType: 'two', fangs: 0.55, cheekType: 'round',
      restingMood: 0.45,
      primaryColor: 0xdfb98a, secondaryColor: 0xfff0d8, accentColor: 0xd98878,
      eyeColor: 0x3a2a22, pattern: 'none', patternColor: 0xfff0d8, blush: 0.7,
    },
  },
  {
    key: 'bee',
    label: 'Bee',
    hint: 'Wings, antennae, stinger, stripes',
    appearance: {
      bodyType: 'round', bodyScale: 0.95, bodyWidth: 1.05, bodyHeight: 0.95,
      asymmetry: 0.3,
      footType: 'nubs', footScale: 0.8,
      earType: 'antenna', earScale: 1, earSpread: 0.16, earTilt: 0.1,
      wingType: 'bee', wingScale: 1.15,
      tailType: 'stinger', tailScale: 1, topperType: 'none',
      eyeType: 'pearl', eyeScale: 1.1, eyeSpacing: 0.2, eyeHeight: 0.5,
      pupilScale: 1.1, eyeTilt: 0,
      browType: 'none', snoutType: 'none',
      mouthType: 'smile', mouthWidth: 0.8, mouthWeight: 1,
      teethType: 'none', fangs: 0, cheekType: 'round',
      restingMood: 0.5,
      primaryColor: 0xf5c93f, secondaryColor: 0xfff3cf, accentColor: 0xf28b5c,
      eyeColor: 0x3a2a22, pattern: 'band', patternColor: 0x5a3a1e, blush: 0.65,
    },
  },
  {
    key: 'pig',
    label: 'Pig',
    hint: 'Round ears, snout, curly tail',
    appearance: {
      bodyType: 'wide', bodyScale: 1, bodyWidth: 1.1, bodyHeight: 1, asymmetry: 0.4,
      footType: 'hooves', footScale: 1,
      earType: 'round', earScale: 1.15, earSpread: 0.32, earTilt: 0.25,
      wingType: 'none', tailType: 'curl', tailScale: 1, topperType: 'none',
      eyeType: 'dot', eyeScale: 1.05, eyeSpacing: 0.23, eyeHeight: 0.48,
      pupilScale: 1, eyeTilt: 0,
      browType: 'none', snoutType: 'snout', snoutScale: 1.05,
      mouthType: 'omega', mouthWidth: 0.8, mouthWeight: 1,
      teethType: 'none', fangs: 0, cheekType: 'soft',
      restingMood: 0.35,
      primaryColor: 0xf3a68c, secondaryColor: 0xffd9c8, accentColor: 0xd9705c,
      eyeColor: 0x3a2a22, pattern: 'speckles', patternColor: 0xd9705c, blush: 0.5,
    },
  },
  {
    key: 'dummy',
    label: 'Dumb',
    hint: 'Tiny eyes, huge mouth, nothing behind them',
    appearance: {
      bodyType: 'drop', bodyScale: 1.05, bodyWidth: 1.15, bodyHeight: 1,
      asymmetry: 0.7,
      footType: 'flippers', footScale: 1.3,
      earType: 'nubs', earScale: 0.9, earSpread: 0.34, earTilt: 0.3,
      wingType: 'none', tailType: 'none', topperType: 'sprout', topperScale: 0.8,
      eyeType: 'pinprick', eyeScale: 1.1, eyeSpacing: 0.26, eyeHeight: 0.42,
      pupilScale: 0.8, eyeTilt: 0,
      browType: 'dots', browScale: 1, snoutType: 'none',
      mouthType: 'wide', mouthWidth: 1.3, mouthWeight: 1.1,
      teethType: 'one', fangs: 0.8, cheekType: 'round',
      restingMood: 0.6,
      primaryColor: 0x9fd6a8, secondaryColor: 0xeffbe8, accentColor: 0xf2a15c,
      eyeColor: 0x2f3b2f, pattern: 'none', patternColor: 0xeffbe8, blush: 0.5,
    },
  },
  {
    key: 'gremlin',
    label: 'Gremlin',
    hint: 'Sharp eyes, horns, bad teeth. Do not feed',
    appearance: {
      bodyType: 'egg', bodyScale: 0.95, bodyWidth: 1.2, bodyHeight: 0.95,
      asymmetry: 0.8,
      footType: 'talons', footScale: 1.1,
      earType: 'horns', earScale: 1.15, earSpread: 0.32, earTilt: 0.2,
      wingType: 'bat', wingScale: 0.9,
      tailType: 'long', tailScale: 1.1, topperType: 'none',
      eyeType: 'sharp', eyeScale: 1, eyeSpacing: 0.15, eyeHeight: 0.32,
      pupilScale: 0.8, eyeTilt: 0.1,
      browType: 'angular', browScale: 1.15, snoutType: 'none',
      mouthType: 'jagged', mouthWidth: 1.3, mouthWeight: 1.2,
      teethType: 'uneven', fangs: 1, cheekType: 'none',
      restingMood: -0.75,
      primaryColor: 0x6b7f52, secondaryColor: 0xd8dfc0, accentColor: 0x8a2f4a,
      eyeColor: 0xf2c94c, pattern: 'patch', patternColor: 0x3f4a2a, blush: 0,
    },
  },
  {
    key: 'emo',
    label: 'Emo',
    hint: 'Rimmed eyes, drooping ears, stitched mouth',
    appearance: {
      bodyType: 'narrow', bodyScale: 1.05, bodyWidth: 1, bodyHeight: 1.15,
      asymmetry: 0.5,
      footType: 'boots', footScale: 1.05,
      earType: 'drooping', earScale: 1.1, earSpread: 0.24, earTilt: 0.1,
      wingType: 'none', tailType: 'long', tailScale: 0.9, topperType: 'swirl',
      topperScale: 1.1,
      eyeType: 'emo', eyeScale: 1.15, eyeSpacing: 0.2, eyeHeight: 0.48,
      pupilScale: 1, eyeTilt: -0.08,
      browType: 'worried', browScale: 1, snoutType: 'none',
      mouthType: 'stitched', mouthWidth: 0.9, mouthWeight: 1.1,
      teethType: 'none', fangs: 0, cheekType: 'streaks',
      restingMood: -0.5,
      primaryColor: 0x5b4a6b, secondaryColor: 0xd9d2e8, accentColor: 0x8a2f4a,
      eyeColor: 0x2a1f33, pattern: 'band', patternColor: 0x3a2f47, blush: 0.25,
    },
  },
  {
    key: 'loaf',
    label: 'Big Loaf',
    hint: 'Enormous, sleepy, unbothered',
    appearance: {
      bodyType: 'chonk', bodyScale: 1.2, bodyWidth: 1.35, bodyHeight: 0.95,
      asymmetry: 0.5,
      footType: 'quad', footScale: 0.9,
      earType: 'floppy', earScale: 1.05, earSpread: 0.38, earTilt: 0.15,
      wingType: 'tiny', wingScale: 0.8,
      tailType: 'fluffy', tailScale: 0.9, topperType: 'none',
      eyeType: 'sleepy', eyeScale: 1.15, eyeSpacing: 0.24, eyeHeight: 0.55,
      pupilScale: 1, eyeTilt: 0,
      browType: 'fuzzy', browScale: 0.9, snoutType: 'muzzle',
      mouthType: 'line', mouthWidth: 0.9, mouthWeight: 1.1,
      teethType: 'none', fangs: 0, cheekType: 'soft',
      restingMood: 0.15,
      primaryColor: 0xbfa27a, secondaryColor: 0xf0e2c8, accentColor: 0xd98878,
      eyeColor: 0x3a2a22, pattern: 'patch', patternColor: 0x8f7454, blush: 0.4,
    },
  },
  {
    key: 'derp',
    label: 'Derp',
    hint: 'Uneven everything. A mistake, kept',
    appearance: {
      bodyType: 'lump', bodyScale: 1, bodyWidth: 1.1, bodyHeight: 1,
      asymmetry: 1,
      footType: 'paws', footScale: 1.25,
      earType: 'lopsided', earScale: 1.2, earSpread: 0.26, earTilt: 0.1,
      wingType: 'none', tailType: 'puff', tailScale: 1.2, topperType: 'antenna',
      topperScale: 1,
      eyeType: 'derp', eyeScale: 1.2, eyeSpacing: 0.22, eyeHeight: 0.5,
      pupilScale: 1.1, eyeTilt: 0.05,
      browType: 'uneven', browScale: 1.1, snoutType: 'nose',
      mouthType: 'wobble', mouthWidth: 1.1, mouthWeight: 1.2,
      teethType: 'snaggle', fangs: 0.9, cheekType: 'freckles',
      restingMood: 0.5,
      primaryColor: 0xe8b0d8, secondaryColor: 0xfff0fa, accentColor: 0xef5f8c,
      eyeColor: 0x4a3a5a, pattern: 'speckles', patternColor: 0xffffff, blush: 0.8,
    },
  },
  {
    key: 'boss',
    label: 'Serious',
    hint: 'Small, square, flat brows, no time for this',
    appearance: {
      bodyType: 'square', bodyScale: 0.8, bodyWidth: 0.95, bodyHeight: 1,
      asymmetry: 0.15,
      footType: 'hooves', footScale: 0.85,
      earType: 'nubs', earScale: 0.8, earSpread: 0.36, earTilt: 0.1,
      wingType: 'none', tailType: 'none', topperType: 'none',
      eyeType: 'deadpan', eyeScale: 1, eyeSpacing: 0.2, eyeHeight: 0.4,
      pupilScale: 0.9, eyeTilt: 0.05,
      browType: 'flat', browScale: 1.1, snoutType: 'none',
      mouthType: 'line', mouthWidth: 0.9, mouthWeight: 1.2,
      teethType: 'none', fangs: 0, cheekType: 'none',
      restingMood: -0.3,
      primaryColor: 0x8fa8b8, secondaryColor: 0xe4eef2, accentColor: 0x5c7a8a,
      eyeColor: 0x25313a, pattern: 'none', patternColor: 0xe4eef2, blush: 0.1,
    },
  },
  {
    key: 'chaos',
    label: 'Unhinged',
    hint: 'Manic eyes, spikes, far too many teeth',
    appearance: {
      bodyType: 'bell', bodyScale: 1.1, bodyWidth: 1.2, bodyHeight: 1.1,
      asymmetry: 0.9,
      footType: 'talons', footScale: 1.4,
      earType: 'spikes', earScale: 1.4, earSpread: 0.22, earTilt: -0.15,
      wingType: 'butterfly', wingScale: 1.3,
      tailType: 'fluffy', tailScale: 1.4, topperType: 'antenna', topperScale: 1.4,
      eyeType: 'manic', eyeScale: 1.15, eyeSpacing: 0.24, eyeHeight: 0.44,
      pupilScale: 0.7, eyeTilt: 0.12,
      browType: 'bushy', browScale: 1.2, snoutType: 'none',
      mouthType: 'omega', mouthWidth: 1.4, mouthWeight: 1.3,
      teethType: 'full', fangs: 1, cheekType: 'bold',
      restingMood: 0.8,
      primaryColor: 0xb07fd4, secondaryColor: 0xf6e8ff, accentColor: 0xf2c94c,
      eyeColor: 0xd9552b, pattern: 'patch', patternColor: 0x4f2f6b, blush: 1,
    },
  },
];
