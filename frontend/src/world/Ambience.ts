/**
 * Ambience — the room's mood, as data.
 *
 * The brief asks for one room that can be many rooms by light alone
 * (/Docs/theme-and-design.md §17): morning, day, sunset, evening, night, all
 * the same furniture, all the same box. Nothing in here builds anything. It is
 * a set of numbers the scenery reads, so that "what does sunset look like" has
 * exactly one answer and it lives in one file.
 *
 * The four things a mood is made of:
 *
 *   key      the light actually falling into the room. Colours the floor
 *            pool, the shafts through the window, the lit wall.
 *   grade    where the room's own surface colours get pushed. Late light does
 *            not merely add orange on top; it makes the walls orange.
 *   wash     one translucent sheet over the whole frame. The cheap half of
 *            the mood, and the half the eye reads first.
 *   air      what is floating in the light — dust by day, fireflies at night.
 *
 * Still no filters and no blend modes anywhere: every one of these becomes a
 * flat translucent shape (§9).
 */

import { PALETTE, mix } from '../assets/shared/color';

export const AMBIENCE_IDS = ['morning', 'day', 'sunset', 'evening', 'night'] as const;

export type AmbienceId = (typeof AMBIENCE_IDS)[number];

/** What is drifting in the air, and how it behaves. */
export interface AirSpec {
  color: number;
  count: number;
  /** Pixels risen per second. Negative falls, like snow or ash. */
  rise: number;
  /** Alpha range across the motes. */
  alpha: [number, number];
  /** Radius range. */
  size: [number, number];
  /**
   * How hard each mote breathes, 0..1.
   *
   * Dust barely does; a firefly is mostly this, which is what stops the night
   * motes from reading as daytime dust that someone tinted yellow.
   */
  twinkle: number;
  /** Roughly, seconds per twinkle cycle. */
  twinkleRate: number;
}

/** What is on the other side of the window. */
export interface SkySpec {
  /** The sky itself. */
  color: number;
  /** Land on the horizon. */
  land: number;
  /** Sun or moon. Null for a sky with neither in the pane. */
  disc: number | null;
  /** How high the disc sits in the pane, 0 at the sill, 1 at the lintel. */
  discHeight: number;
  /** Stars, if the sky is dark enough to hold any. 0 for none. */
  stars: number;
}

export interface Ambience {
  id: AmbienceId;
  label: string;
  /** One line, for the interface. */
  note: string;

  /** The light coming in, and how much of it there is. */
  key: { color: number; strength: number };

  /** Where every surface colour in the room gets pushed, and how far. */
  grade: { color: number; amount: number };

  /** One flat sheet over the whole frame. */
  wash: { color: number; alpha: number };

  /** Darkening at the edges of the frame. */
  vignette: { color: number; alpha: number };

  /** Contact shadows: their colour, and how much of them there is. */
  shadow: { color: number; strength: number };

  /** How strongly lamps read against the room. Dark moods want their lamps. */
  lamp: number;

  sky: SkySpec;
  air: AirSpec;
}

const AMBIENCES: Record<AmbienceId, Ambience> = {
  morning: {
    id: 'morning',
    label: 'Morning',
    note: 'Thin early light, everything still cold at the edges.',
    key: { color: 0xfff1d6, strength: 0.95 },
    grade: { color: 0xffe6c4, amount: 0.1 },
    wash: { color: 0xbcd8f0, alpha: 0.07 },
    vignette: { color: PALETTE.ink, alpha: 0.1 },
    shadow: { color: 0x4a3a55, strength: 0.85 },
    lamp: 0.35,
    sky: { color: 0xa9d6f2, land: 0x8fc7a4, disc: 0xfff3c8, discHeight: 0.72, stars: 0 },
    air: {
      color: PALETTE.cream,
      count: 20,
      rise: 5,
      alpha: [0.1, 0.26],
      size: [2, 5],
      twinkle: 0.2,
      twinkleRate: 3.5,
    },
  },

  day: {
    id: 'day',
    label: 'Afternoon',
    note: 'Full warm daylight, the room at its most itself.',
    key: { color: PALETTE.cream, strength: 1 },
    grade: { color: 0xffd9a8, amount: 0.04 },
    wash: { color: 0xffe0b0, alpha: 0.03 },
    vignette: { color: PALETTE.ink, alpha: 0.12 },
    shadow: { color: PALETTE.ink, strength: 1 },
    lamp: 0.5,
    sky: { color: 0x8fc7ef, land: PALETTE.mint, disc: null, discHeight: 0.7, stars: 0 },
    air: {
      color: PALETTE.cream,
      count: 18,
      rise: 4,
      alpha: [0.12, 0.3],
      size: [2.5, 5.5],
      twinkle: 0.15,
      twinkleRate: 4,
    },
  },

  sunset: {
    id: 'sunset',
    label: 'Sunset',
    note: 'Long orange light, shadows stretching across the boards.',
    key: { color: 0xffc890, strength: 1.05 },
    grade: { color: 0xff6a2e, amount: 0.2 },
    wash: { color: 0xff5f2b, alpha: 0.13 },
    vignette: { color: 0x46193a, alpha: 0.28 },
    shadow: { color: 0x4d2140, strength: 1.15 },
    lamp: 0.7,
    // The sun is nearly down: low in the pane, and the land in front of it has
    // gone to silhouette, which is what makes it read as evening rather than
    // as a yellow circle in an orange sky.
    sky: { color: 0xf59a52, land: 0x4f4a52, disc: 0xfff2cc, discHeight: 0.28, stars: 0 },
    air: {
      color: 0xffd7a1,
      count: 24,
      rise: 6,
      alpha: [0.14, 0.34],
      size: [2, 6],
      twinkle: 0.3,
      twinkleRate: 3,
    },
  },

  evening: {
    id: 'evening',
    label: 'Evening',
    note: 'The sun gone, the lamps taking over.',
    key: { color: 0xffd39a, strength: 0.6 },
    grade: { color: 0x4b3a72, amount: 0.24 },
    wash: { color: 0x3a2a5c, alpha: 0.16 },
    vignette: { color: 0x22143a, alpha: 0.26 },
    shadow: { color: 0x2a1c47, strength: 1.1 },
    lamp: 1,
    sky: { color: 0x4d5f9c, land: 0x33406b, disc: null, discHeight: 0.6, stars: 6 },
    air: {
      color: 0xe4d6ff,
      count: 20,
      rise: 3,
      alpha: [0.1, 0.28],
      size: [2, 5],
      twinkle: 0.45,
      twinkleRate: 2.4,
    },
  },

  night: {
    id: 'night',
    label: 'Night',
    note: 'Moonlight, one lamp, and something small blinking in the air.',
    key: { color: 0xc4d6ff, strength: 0.38 },
    grade: { color: 0x2a2350, amount: 0.4 },
    wash: { color: 0x1d1740, alpha: 0.28 },
    vignette: { color: 0x100a24, alpha: 0.36 },
    shadow: { color: 0x150e2e, strength: 0.9 },
    lamp: 1.25,
    sky: { color: 0x161f42, land: 0x1b2444, disc: 0xe6edff, discHeight: 0.74, stars: 14 },
    air: {
      color: 0xffe08a,
      count: 14,
      rise: 2,
      alpha: [0.18, 0.5],
      size: [2.5, 4.5],
      twinkle: 0.85,
      twinkleRate: 1.8,
    },
  },
};

export const AMBIENCE_LIST: Ambience[] = AMBIENCE_IDS.map((id) => AMBIENCES[id]);

export const DEFAULT_AMBIENCE: AmbienceId = 'day';

export function getAmbience(id: AmbienceId | string): Ambience {
  return AMBIENCES[id as AmbienceId] ?? AMBIENCES[DEFAULT_AMBIENCE];
}

/**
 * The colours the user can build the room out of.
 *
 * Surface colours, not accents: whatever is chosen here is what the walls are
 * actually made of, so these are deliberately muted next to the creature
 * palette (§16 — the environment stays softer than the pet).
 */
export const ROOM_TINTS = [
  { label: 'Ember', color: PALETTE.ember },
  { label: 'Clay', color: 0xc4694f },
  { label: 'Wheat', color: 0xc9a25f },
  { label: 'Sage', color: 0x7d9c7a },
  { label: 'Harbour', color: 0x5f87ad },
  { label: 'Plum', color: 0x8168a6 },
  { label: 'Rose', color: 0xd07f92 },
  { label: 'Ash', color: 0x8a8290 },
] as const;

export const DEFAULT_ROOM_TINT = PALETTE.ember;

/**
 * How the room is currently dressed: what it is made of, and what light is on
 * it. Everything an environment needs in order to build its scenery.
 */
export interface RoomMood {
  ambience: Ambience;
  /** Base surface colour the room is built from. */
  tint: number;
}

/**
 * Push a surface colour into the mood.
 *
 * Everything the room is built from goes through this — walls, floor,
 * background, baseboards — which is what keeps the room reading as one lit
 * space rather than a daylight room with an evening sheet thrown over it.
 */
export function graded(color: number, ambience: Ambience): number {
  return mix(color, ambience.grade.color, ambience.grade.amount);
}

/**
 * The floor colour for a room built from `tint`.
 *
 * Boards are wood everywhere; they only pick up a little of whatever the walls
 * are, the way a floor in a painted room does.
 */
export function floorColor(tint: number, ambience: Ambience): number {
  return graded(mix(PALETTE.sand, tint, 0.22), ambience);
}

/**
 * The colour to paint behind the canvas.
 *
 * The frame letterboxes when the room does not match its aspect ratio, so the
 * page needs to know what the room's field colour currently is or the mood
 * stops at the edge of the picture.
 */
export function fieldColor(mood: RoomMood): number {
  const base = graded(mood.tint, mood.ambience);
  const { wash } = mood.ambience;
  return mix(mix(base, PALETTE.ink, 0.3), wash.color, wash.alpha * 1.6);
}
