/**
 * Archetypes and variation.
 *
 * Two ways to get a creature without touching thirty sliders:
 *
 *   ARCHETYPES        hand-tuned starting points. A bunny, a bee, a pig — not
 *                     because the system knows what those are, but because
 *                     those parts happen to line up that way.
 *   randomAppearance  a whole creature from a seed, steered by two dials.
 *
 * The dials are the interesting part. `cuteness` moves every feature along the
 * same axis at once — eye size, where the eyes sit on the face, brow shape,
 * teeth, colour, resting mood — because cuteness is not one feature, it is all
 * of them agreeing. `chaos` decides how far proportions are allowed to wander
 * from sensible, which is what produces the creatures nobody would have
 * designed on purpose (/Docs/project-overview.md §4.3).
 */

import { createRng, lerp } from '../../shared/shapes';
import { EAR_TYPE_KEYS, TAIL_TYPE_KEYS, WING_TYPE_KEYS } from './AppendageTypes';
import { BODY_TYPE_KEYS, FOOT_TYPE_KEYS } from './BodyTypes';
import { BROW_TYPE_KEYS, EYE_TYPE_KEYS, SNOUT_TYPE_KEYS } from './FaceTypes';
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
  // Chaos decides whether parts are picked from the flattering shortlist or
  // from everything the library has.
  const sweetBodies = ['round', 'blob', 'pear', 'bean'] as const;
  const nastyBodies = ['chonk', 'egg', 'wide', 'tall'] as const;
  const bodyPool =
    rng() < chaos * 0.6
      ? BODY_TYPE_KEYS
      : sweet > 0.5
        ? sweetBodies
        : nastyBodies;

  const sweetEyes = ['sparkle', 'saucer', 'dot', 'bean'] as const;
  const nastyEyes = ['beady', 'pixel', 'dot', 'sleepy'] as const;
  const eyePool =
    rng() < chaos * 0.5 ? EYE_TYPE_KEYS : sweet > 0.5 ? sweetEyes : nastyEyes;

  const browPool =
    sweet > 0.6
      ? (['none', 'none', 'thin'] as const)
      : sweet < 0.4
        ? (['angular', 'thick', 'fuzzy'] as const)
        : BROW_TYPE_KEYS;

  // --- Proportions ---------------------------------------------------------
  // Cute: big eyes set low and wide on a round body. Menacing: small eyes set
  // high and close on a heavy one. Everything else is scaled between.
  const eyeScale = lerp(0.55, 1.5, sweet) * spread(rng, 0.85, 1.25, chaos);
  const eyeHeight = lerp(0.24, 0.72, sweet) * spread(rng, 0.9, 1.1, chaos);
  const eyeSpacing = lerp(0.13, 0.26, sweet) * spread(rng, 0.85, 1.15, chaos);

  const bodyWidth = spread(rng, 0.7, sweet > 0.5 ? 1.35 : 1.7, chaos);
  const bodyHeight = spread(rng, 0.75, 1.45, chaos);

  return {
    bodyType: pick(rng, bodyPool),
    bodyScale: spread(rng, 0.8, 1.25, chaos),
    bodyWidth,
    bodyHeight,
    footType: pick(rng, rng() < chaos * 0.5 ? FOOT_TYPE_KEYS : (['nubs', 'paws', 'hooves'] as const)),
    footScale: spread(rng, 0.7, 1.4, chaos),

    earType: pick(rng, EAR_TYPE_KEYS),
    earScale: spread(rng, 0.65, 1.6, chaos),
    earSpread: spread(rng, 0.2, 0.45, chaos),
    earTilt: spread(rng, -0.3, 0.5, chaos),

    // Wings are rare unless chaos is high — everything having wings is boring.
    wingType: rng() < 0.25 + chaos * 0.35 ? pick(rng, WING_TYPE_KEYS) : 'none',
    wingScale: spread(rng, 0.7, 1.4, chaos),

    tailType: pick(rng, TAIL_TYPE_KEYS),
    tailScale: spread(rng, 0.7, 1.5, chaos),

    topperType: rng() < 0.35 + chaos * 0.25 ? pick(rng, TOPPER_TYPE_KEYS) : 'none',
    topperScale: spread(rng, 0.6, 1.5, chaos),

    eyeType: pick(rng, eyePool),
    eyeScale,
    eyeSpacing,
    eyeHeight,

    browType: pick(rng, browPool),
    browScale: spread(rng, 0.7, 1.4, chaos),

    snoutType: pick(rng, rng() < 0.6 ? SNOUT_TYPE_KEYS : (['none', 'nose'] as const)),
    snoutScale: spread(rng, 0.7, 1.4, chaos),

    mouthWidth: spread(rng, 0.7, 1.4, chaos),
    mouthWeight: spread(rng, 0.8, 1.4, chaos),
    restingMood: lerp(-0.75, 0.8, sweet) + (rng() - 0.5) * 0.3 * chaos,
    fangs: sweet < 0.45 ? spread(rng, 0.3, 1, chaos) : rng() < chaos * 0.2 ? 0.5 : 0,

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
 * These are proofs that the library covers its range: three of them line up
 * with the reference art, and three of them deliberately do not.
 */
export const ARCHETYPES: Archetype[] = [
  {
    key: 'bunny',
    label: 'Bunny',
    hint: 'Long ears, puff tail, tiny nose',
    appearance: {
      bodyType: 'blob', bodyScale: 1, bodyWidth: 1, bodyHeight: 1,
      footType: 'paws', footScale: 1,
      earType: 'bunny', earScale: 1.1, earSpread: 0.22, earTilt: 0.05,
      wingType: 'none', tailType: 'puff', tailScale: 1, topperType: 'none',
      eyeType: 'dot', eyeScale: 1.15, eyeSpacing: 0.22, eyeHeight: 0.52,
      browType: 'none', snoutType: 'muzzle', snoutScale: 1,
      mouthWidth: 0.9, mouthWeight: 1, restingMood: 0.4, fangs: 0,
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
      footType: 'nubs', footScale: 0.8,
      earType: 'antenna', earScale: 1, earSpread: 0.18, earTilt: 0.1,
      wingType: 'bee', wingScale: 1.15,
      tailType: 'stinger', tailScale: 1, topperType: 'none',
      eyeType: 'dot', eyeScale: 1.1, eyeSpacing: 0.2, eyeHeight: 0.5,
      browType: 'none', snoutType: 'none',
      mouthWidth: 0.8, mouthWeight: 1, restingMood: 0.5, fangs: 0,
      primaryColor: 0xf5c93f, secondaryColor: 0xfff3cf, accentColor: 0xf28b5c,
      eyeColor: 0x3a2a22, pattern: 'band', patternColor: 0x5a3a1e, blush: 0.65,
    },
  },
  {
    key: 'pig',
    label: 'Pig',
    hint: 'Round ears, snout, curly tail',
    appearance: {
      bodyType: 'wide', bodyScale: 1, bodyWidth: 1.15, bodyHeight: 1,
      footType: 'hooves', footScale: 1,
      earType: 'round', earScale: 1.2, earSpread: 0.34, earTilt: 0.25,
      wingType: 'none', tailType: 'curl', tailScale: 1, topperType: 'none',
      eyeType: 'dot', eyeScale: 1.05, eyeSpacing: 0.23, eyeHeight: 0.48,
      browType: 'none', snoutType: 'snout', snoutScale: 1.05,
      mouthWidth: 0.8, mouthWeight: 1, restingMood: 0.35, fangs: 0,
      primaryColor: 0xf3a68c, secondaryColor: 0xffd9c8, accentColor: 0xd9705c,
      eyeColor: 0x3a2a22, pattern: 'speckles', patternColor: 0xd9705c, blush: 0.5,
    },
  },
  {
    key: 'blob',
    label: 'Blob',
    hint: 'The original. No opinions.',
    appearance: {
      bodyType: 'blob', bodyScale: 1, bodyWidth: 1, bodyHeight: 1,
      footType: 'nubs', earType: 'none', wingType: 'none', tailType: 'none',
      topperType: 'puff', topperScale: 1,
      eyeType: 'dot', eyeScale: 1.1, eyeSpacing: 0.2, eyeHeight: 0.5,
      browType: 'none', snoutType: 'none',
      restingMood: 0.4, fangs: 0,
      primaryColor: 0xff8fb4, secondaryColor: 0xfdeacd, accentColor: 0xef5f8c,
      pattern: 'none', patternColor: 0xfdeacd, blush: 0.55,
    },
  },
  {
    key: 'gremlin',
    label: 'Gremlin',
    hint: 'Beady eyes, horns, teeth. Do not feed.',
    appearance: {
      bodyType: 'egg', bodyScale: 0.95, bodyWidth: 1.25, bodyHeight: 0.95,
      footType: 'talons', footScale: 1.1,
      earType: 'horns', earScale: 1.15, earSpread: 0.34, earTilt: 0.2,
      wingType: 'bat', wingScale: 0.9,
      tailType: 'long', tailScale: 1.1, topperType: 'none',
      eyeType: 'beady', eyeScale: 0.9, eyeSpacing: 0.13, eyeHeight: 0.3,
      browType: 'angular', browScale: 1.15, snoutType: 'none',
      mouthWidth: 1.3, mouthWeight: 1.2, restingMood: -0.7, fangs: 1,
      primaryColor: 0x6b7f52, secondaryColor: 0xd8dfc0, accentColor: 0x8a2f4a,
      eyeColor: 0xf2c94c, pattern: 'patch', patternColor: 0x3f4a2a, blush: 0,
    },
  },
  {
    key: 'loaf',
    label: 'Big Loaf',
    hint: 'Enormous, sleepy, unbothered',
    appearance: {
      bodyType: 'chonk', bodyScale: 1.15, bodyWidth: 1.4, bodyHeight: 0.95,
      footType: 'quad', footScale: 0.9,
      earType: 'floppy', earScale: 1.05, earSpread: 0.4, earTilt: 0.15,
      wingType: 'tiny', wingScale: 0.8,
      tailType: 'fluffy', tailScale: 0.9, topperType: 'none',
      eyeType: 'sleepy', eyeScale: 1.1, eyeSpacing: 0.24, eyeHeight: 0.55,
      browType: 'fuzzy', browScale: 0.9, snoutType: 'muzzle',
      mouthWidth: 0.9, mouthWeight: 1.1, restingMood: 0.15, fangs: 0,
      primaryColor: 0xbfa27a, secondaryColor: 0xf0e2c8, accentColor: 0xd98878,
      eyeColor: 0x3a2a22, pattern: 'patch', patternColor: 0x8f7454, blush: 0.4,
    },
  },
];
