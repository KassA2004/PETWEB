/**
 * What is on disk, and what the room may ask for.
 *
 * The one place a filename appears. Everything else in the audio system asks
 * for a *sound* — `'bounce'`, `'pet-happy'`, the loop for the meadow — and this
 * says which files that is, in what order to fetch them, and which channel they
 * belong to. The files themselves are fetched and processed by
 * `tools/audio/fetch.mjs` from `tools/audio/sources.json`; that file is the
 * provenance, this one is the vocabulary.
 *
 * ## Why some sounds are recordings and some are still synthesised
 *
 * Every sound used to be built out of oscillators (`voices.ts`), and for the
 * whole *interface* that is still the right answer. A click is sixty
 * milliseconds of nothing in particular; there is no recording of a click that
 * is better than a shaped burst, there is no download to wait for, and it can
 * be tuned by changing a number. So the interface stays synthetic.
 *
 * What is *not* better synthesised is anything the ear has heard in the real
 * world:
 *
 * ```text
 *   the creature   a two-note sine chirp is a beep. A recording of a small
 *                  animal is a small animal, and the difference is the entire
 *                  reason anybody looks after one
 *   impacts        material is timbre and timbre is detail. Filtered noise
 *                  says "impact"; a rubber ball says which ball
 *   the weather    the failure was loudest here. Wind is filtered noise and
 *                  survives being one; a sea is not, and a band of noise
 *                  breathing every eight seconds was a synthesiser pretending
 *   the music      a random pentatonic note generator is, after twenty
 *                  minutes, exactly as interesting as a random pentatonic
 *                  note generator
 * ```
 *
 * ## Nothing here is required
 *
 * Every recording is an *upgrade over* a synthesised voice that still exists
 * and still works. A file that has not finished downloading, a file that 404s,
 * a browser that will not decode it — each of those costs the older sound, not
 * silence and not an error. That is what makes it safe to load samples lazily
 * after the first gesture instead of blocking the room on them, and it is why
 * `Samples.take` returns null rather than throwing or waiting.
 */

import type { Channel } from './AudioBus';
import type { WindowViewId } from '../../assets/environment/window/WindowViews';

/** Where the processed audio is served from. Vite copies `public/` verbatim. */
export const AUDIO_BASE = '/audio/';

/**
 * The one-shots, by the name the room asks for, with their variants.
 *
 * **Variants are not decoration.** A ball bounces eleven times on the way to
 * rest and a creature makes an idle noise every few seconds; the same 300
 * milliseconds of waveform played eleven times running does not sound like a
 * ball, it sounds like a sample being retriggered. Two takes, alternated and
 * detuned slightly (`voices.sampled`), is the cheapest fix there is and it is
 * most of the difference between "has sound effects" and "sounds alive".
 *
 * The channel is here rather than at the call site for the same reason the
 * level table is in `AudioBus`: a sound's place in the mix is a decision about
 * the mix, and the room should not be able to put a chirp on the SFX channel by
 * asking wrong.
 */
export const ONE_SHOTS = {
  /* --- the creature ----------------------------------------------------- */
  'pet-idle': { channel: 'pet', files: ['pet/idle-a.wav', 'pet/idle-b.wav'] },
  'pet-happy': { channel: 'pet', files: ['pet/happy-a.wav', 'pet/happy-b.wav'] },
  'pet-startled': { channel: 'pet', files: ['pet/startled.wav'] },
  'pet-poked': { channel: 'pet', files: ['pet/poked.wav'] },
  'pet-sleepy': { channel: 'pet', files: ['pet/sleepy.wav'] },
  'pet-glum': { channel: 'pet', files: ['pet/glum.wav'] },

  /* --- things hitting things -------------------------------------------- */
  bounce: { channel: 'sfx', files: ['impact/bounce-a.wav', 'impact/bounce-b.wav'] },
  knock: { channel: 'sfx', files: ['impact/knock-a.wav', 'impact/knock-b.wav'] },
  pat: { channel: 'sfx', files: ['impact/pat-a.wav', 'impact/pat-b.wav'] },
  thud: { channel: 'sfx', files: ['impact/thud-a.wav', 'impact/thud-b.wav'] },

  /* --- the room itself --------------------------------------------------- */
  // The clock and the light switch are on `environment` rather than `sfx`,
  // matching the voices they replace: they are things the room does, not
  // things the user did to it.
  chime: { channel: 'environment', files: ['room/chime.wav'] },
  lights: { channel: 'environment', files: ['room/lights.wav'] },
  celebrate: { channel: 'ui', files: ['room/celebrate.wav'] },
} as const satisfies Record<string, { channel: Channel; files: readonly string[] }>;

export type OneShotName = keyof typeof ONE_SHOTS;

/**
 * The order they are fetched in.
 *
 * Not alphabetical and not arbitrary: it is how soon after the first click each
 * one is likely to be needed. The creature makes a noise within a second or two
 * of the room being alive; a light switch waits for somebody to press it; a
 * fanfare waits for a goal to be finished, which is minutes away at best.
 *
 * The whole set is under a megabyte, so this is a difference of a few hundred
 * milliseconds — but those are the few hundred milliseconds in which the first
 * chirp happens.
 */
export const FETCH_ORDER: readonly OneShotName[] = [
  'pet-idle',
  'pet-happy',
  'bounce',
  'pat',
  'knock',
  'thud',
  'pet-poked',
  'pet-startled',
  'pet-sleepy',
  'pet-glum',
  'chime',
  'lights',
  'celebrate',
];

/**
 * The bed for each window view.
 *
 * One field recording per view, cut to a seamless thirty-second loop by the
 * fetch tool — see its `makeLoop` for why the loop point is a crossfade rather
 * than a cut. Thirty seconds is long enough that the ear does not catch the
 * period on wind or waves, and short enough that a bed is 300 kB.
 *
 * These are the sounds the synthesised beds were worst at. Filtered noise makes
 * plausible wind and implausible everything else, and the ocean — a band of
 * noise with a slow swell on it — was the clearest tell in the product that
 * somebody had made these out of maths.
 */
export const AMBIENCE_LOOPS: Record<WindowViewId, string> = {
  meadow: 'ambience/meadow.mp3',
  park: 'ambience/park.mp3',
  mountains: 'ambience/mountains.mp3',
  ocean: 'ambience/ocean.mp3',
  city: 'ambience/city.mp3',
  dungeon: 'ambience/dungeon.mp3',
};

/**
 * The music, as a playlist.
 *
 * Five tracks, shuffled, crossfaded into each other, and none of them with a
 * hook — the brief the generative version was written to has not changed, only
 * the means. What changed is that a person wrote these, so they go somewhere,
 * and "somewhere" is the thing a note picker cannot do at any temperature.
 *
 * Streamed rather than decoded (`music.ts`): two and a bit minutes of stereo
 * decodes to about forty megabytes of Float32 in memory, and there is no reason
 * to hold that when an `<audio>` element will read it off disk as it goes.
 */
export const TRACKS: readonly string[] = [
  'music/cozy-lofi.mp3',
  'music/cozy-home.mp3',
  'music/calm-piano.mp3',
  'music/coffee-jazz.mp3',
  'music/cozy-forest.mp3',
];
