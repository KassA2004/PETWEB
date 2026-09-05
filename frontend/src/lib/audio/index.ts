/**
 * The one audio system, and the only thing components are allowed to talk to.
 *
 * `AudioBus` owns the mix, `voices.ts` owns what things sound like, `samples.ts`
 * owns the recordings that are better than what `voices.ts` can make, and
 * `ambience` and `music` own the two continuous layers. This file is the front
 * door: a single instance, the mapping from "something happened in the room" to
 * "this is what that sounds like", and the small amount of React glue.
 *
 * The mapping now has two answers for most events — a recording, and the
 * oscillators that were there before it — and choosing between them is one
 * private method (`recorded`). The recording wins whenever it has finished
 * downloading; nothing waits for one, and nothing breaks without one.
 *
 * The rule the rest of the application follows is short: **no component
 * constructs audio.** A button calls `sfx.click()`. It does not know what a
 * click is made of, how loud it is relative to a bounce, or whether the context
 * has been unlocked yet — all three of those are decisions that have to be made
 * once, for everything, or the mix is not a mix.
 */

import { AudioBus, CHANNELS, DEFAULT_LEVELS } from './AudioBus';
import type { Channel } from './AudioBus';
import { Ambience } from './ambience';
import { Music } from './music';
import { Samples } from './samples';
import type { OneShotName } from './library';
import { ONE_SHOTS } from './library';
import * as voice from './voices';
import type { RoomSound } from '../../scenes/room/RoomSound';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import type { AmbienceId } from '../../world/Ambience';
import type { WindowViewId } from '../../assets/environment/window/WindowViews';

export type { Channel };
export { CHANNELS, DEFAULT_LEVELS };

/**
 * How each kind of object sounds when it hits something.
 *
 * A short table rather than a property on the catalog row, and that is a
 * judgement call worth defending: material is *only* an audio concern, and
 * putting `sound: 'wood'` on twenty catalog rows would push an audio decision
 * into the file that defines what an object is. Anything missing falls back to
 * a thud, which is the right sound for most of a room.
 */
const MATERIAL: Partial<Record<ObjectType, 'bounce' | 'knock' | 'pat' | 'thud'>> = {
  ball: 'bounce',
  cube: 'knock',
  plush: 'pat',
  pillow: 'pat',
  chair: 'knock',
  table: 'knock',
  bookshelf: 'knock',
  bed: 'pat',
  beanbag: 'pat',
  hammock: 'pat',
  basket: 'knock',
  bowl: 'knock',
  musicbox: 'knock',
  // Canvas over sticks: soft, with a little of the frame in it.
  teepee: 'pat',

  // The 2026 additions. Wood knocks, cloth pats, and anything hollow or
  // glazed rings — `bounce` is the nearest thing the synth has to a chime.
  stool: 'knock',
  cabinet: 'knock',
  desk: 'knock',
  loveseat: 'pat',
  rug: 'pat',
  candles: 'knock',
  hourglass: 'bounce',
  terrarium: 'bounce',
  crystal: 'bounce',
  mushrooms: 'pat',
  yarn: 'pat',
  hoop: 'knock',
  top: 'knock',
  rattle: 'knock',
  star: 'pat',
};

/**
 * How often each recorded sound may be retriggered, and under which key.
 *
 * Copied from the synthesised voice it stands in for, deliberately and exactly.
 * A recorded bounce and a synthesised bounce are the same *event* as far as the
 * ear is concerned, so they must share one cooldown — if they had separate keys
 * a room mid-download could play both for one collision, which is the one
 * artefact the whole fallback arrangement exists to avoid.
 *
 * The numbers themselves are argued for in `voices.ts`. The short version:
 * about three bounces a second gets the rhythm of a bouncing ball across and
 * everything past that was going to be mush, and a creature that speaks more
 * often than four times a second is not a creature.
 */
const THROTTLE: Record<OneShotName, { key: string; cooldownMs: number }> = {
  'pet-idle': { key: 'chirp', cooldownMs: 220 },
  'pet-happy': { key: 'chirp', cooldownMs: 220 },
  'pet-startled': { key: 'chirp', cooldownMs: 220 },
  'pet-poked': { key: 'chirp', cooldownMs: 220 },
  'pet-sleepy': { key: 'chirp', cooldownMs: 220 },
  'pet-glum': { key: 'chirp', cooldownMs: 220 },

  bounce: { key: 'bounce', cooldownMs: 90 },
  knock: { key: 'knock', cooldownMs: 70 },
  pat: { key: 'pat', cooldownMs: 70 },
  thud: { key: 'thud:sfx', cooldownMs: 45 },

  chime: { key: 'chime', cooldownMs: 400 },
  lights: { key: 'light', cooldownMs: 160 },
  celebrate: { key: 'fanfare', cooldownMs: 600 },
};

class Audio {
  readonly bus = new AudioBus();
  readonly samples = new Samples();
  readonly ambience = new Ambience(this.bus, this.samples);
  readonly music = new Music(this.bus);

  /** Whether the user wants music at all, separate from its level. */
  private musicWanted = true;
  private pendingView: WindowViewId | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.restore();
  }

  /* --- lifecycle --------------------------------------------------------- */

  /**
   * Start the audio, from inside a user gesture.
   *
   * Called on every button press, and it has to be safe to call that often:
   * creating the context is guarded, `Ambience.set` returns early for the view
   * already playing, and `Music.start` for music already running. So this
   * simply asserts what should be true — the room is playing its ambience, the
   * music is on if it is wanted — every time, rather than only once.
   *
   * That is deliberately duller than the version it replaces, which applied the
   * pending ambience *only on the transition to ready*. It looked tighter and it
   * had a hole: any earlier press that happened to unlock the context before the
   * room had said which window it has would consume the transition, and the
   * ambience then never started at all. The music did, which made it look like
   * the audio was working. Correctness here is worth more than elegance —
   * an idempotent call costs three comparisons.
   */
  async unlock(): Promise<void> {
    const wasReady = this.bus.ready;
    await this.bus.unlock();
    if (!this.bus.ready) return;

    // The first gesture is the first moment a sample can be decoded — there is
    // no context before it — so it is also the first moment worth fetching one.
    // Guarded inside `load`, and deliberately not awaited: everything it
    // fetches has a synthesised voice playing in the meantime.
    const context = this.bus.channel('sfx')?.context;
    if (context) this.samples.load(context);

    if (this.pendingView) this.ambience.set(this.pendingView);
    if (this.musicWanted) this.music.start();

    // Only the transition is news; a listener does not want a re-render per
    // click for the rest of the session.
    if (!wasReady) this.notify();
  }

  /** Let go of the audio device. Called when the application unmounts. */
  async dispose(): Promise<void> {
    this.music.stop();
    this.ambience.stop();
    this.samples.clear();
    await this.bus.dispose();
  }

  get ready(): boolean {
    return this.bus.ready;
  }

  /* --- the room ---------------------------------------------------------- */

  /**
   * What the room just did.
   *
   * The whole mapping from event to sound, in one place. Everything arrives
   * with a strength, a pan and a distance already worked out
   * (`scenes/room/RoomSound.ts`), so this only has to choose a voice — and the
   * throttling that keeps a bouncing ball from sounding like a construction
   * site lives one level down, in the bus, where the voice count is known.
   */
  room(event: RoomSound): void {
    const { kind, strength, pan, distance, type } = event;
    const at = { strength, pan, distance };

    switch (kind) {
      case 'prop-land':
      case 'prop-bump':
      case 'prop-wall': {
        const material = (type && MATERIAL[type]) ?? 'thud';
        // A wall is a glancing blow, not a landing.
        const scaled = { ...at, strength: kind === 'prop-wall' ? strength * 0.7 : strength };

        // Impacts get the widest detune of anything in the room. They are the
        // sounds that repeat — a ball settling is eleven of them inside two
        // seconds — and six per cent either way is what turns eleven copies of
        // one waveform back into eleven bounces.
        if (this.recorded(material, { ...scaled, detune: 0.06 })) return;

        if (material === 'bounce') voice.bounce(this.bus, scaled);
        else if (material === 'knock') voice.knock(this.bus, scaled);
        else if (material === 'pat') voice.pat(this.bus, scaled);
        else voice.thud(this.bus, 'sfx', scaled);
        return;
      }

      case 'prop-place':
        voice.place(this.bus, at);
        return;

      case 'prop-lift':
        voice.lift(this.bus, at);
        return;

      case 'prop-refused':
        voice.refuse(this.bus, at);
        return;

      /*
       * The creature.
       *
       * One recording per mood, and the mood is the *file* rather than a
       * parameter — which is the whole difference between a voice and a
       * synthesiser. The synthesised version slid one interval up for happy and
       * down for startled, because that is all an oscillator can do about
       * feeling; a recording of a delighted animal and a recording of a
       * startled one are different sounds, not the same sound transposed.
       *
       * A narrow detune, unlike the impacts. A creature whose pitch wanders by
       * six per cent is a different creature each time it speaks.
       */
      case 'pet-idle':
        if (this.recorded('pet-idle', { ...at, detune: 0.03 })) return;
        voice.chirp(this.bus, { ...at, mood: 'idle' });
        return;

      case 'pet-happy':
        if (this.recorded('pet-happy', { ...at, detune: 0.03 })) return;
        voice.chirp(this.bus, { ...at, mood: 'happy' });
        return;

      case 'pet-startled':
        if (this.recorded('pet-startled', { ...at, detune: 0.03 })) return;
        voice.chirp(this.bus, { ...at, mood: 'startled' });
        return;

      case 'pet-poked':
        if (this.recorded('pet-poked', { ...at, detune: 0.03 })) return;
        voice.chirp(this.bus, { ...at, mood: 'poked' });
        return;

      case 'pet-sleepy':
        if (this.recorded('pet-sleepy', { ...at, detune: 0.02 })) return;
        voice.chirp(this.bus, { ...at, mood: 'sleepy' });
        return;

      case 'pet-glum':
        if (this.recorded('pet-glum', { ...at, detune: 0.02 })) return;
        voice.chirp(this.bus, { ...at, mood: 'glum' });
        return;

      case 'chime':
        // A struck note, so barely any detune: a music box that is a semitone
        // out on every strike is a broken music box.
        if (this.recorded('chime', { ...at, detune: 0.01 })) return;
        voice.chime(this.bus, at);
        return;

      case 'lights':
        if (this.recorded('lights', { ...at, detune: 0.02 })) return;
        voice.lightSwitch(this.bus, at);
        return;

      default:
        return;
    }
  }

  /**
   * Play the recording for a sound, if there is one to play.
   *
   * The one place the two halves of the audio meet, and it is three lines
   * because everything either side of it was built to make it three lines: the
   * sample layer answers "is it here yet" without waiting (`Samples.take`), and
   * `voices.sampled` puts a buffer through the same chain, the same panner and
   * the same voice budget as an oscillator.
   *
   * The throttle key and cooldown are the *synthesised voice's own*, so a
   * recorded bounce and a synthesised one compete for one slot rather than two.
   * That also makes the fallthrough safe: if this returns false because the bus
   * refused rather than because the file is missing, the synthesised voice below
   * asks the same bus with the same key and is refused identically — so a
   * refusal can never turn into two sounds.
   *
   * @returns whether anything was played, which is the caller's cue to stop.
   */
  private recorded(
    name: OneShotName,
    options: Parameters<typeof voice.sampled>[3],
  ): boolean {
    const buffer = this.samples.take(name);
    if (!buffer) return false;

    return voice.sampled(
      this.bus,
      ONE_SHOTS[name].channel,
      buffer,
      options,
      THROTTLE[name],
    );
  }

  /**
   * The room's appearance changed.
   *
   * Idempotent in both axes, because the caller is an effect that fires on
   * every style change and most of them are neither the window nor the hour.
   */
  setScene(view: WindowViewId, ambience: AmbienceId): void {
    this.pendingView = view;
    this.music.setAmbience(ambience);
    if (this.bus.ready) this.ambience.set(view);
  }

  /* --- interface --------------------------------------------------------- */

  readonly ui = {
    click: () => voice.click(this.bus),
    open: () => voice.open_(this.bus),
    close: () => voice.close_(this.bus),
    /**
     * The one interface sound that is an event rather than an acknowledgement.
     *
     * The only recorded sound in `ui`, and it earns it for the same reason the
     * room's sounds do: a fanfare is a *performance*, and three sine tones in
     * an arpeggio is a description of one. Everything else here stays
     * synthesised — see `library.ts`.
     */
    celebrate: () => {
      if (this.recorded('celebrate', { strength: 0.9, detune: 0.01 })) return;
      voice.fanfare(this.bus);
    },
    refuse: () => voice.refuse(this.bus, { gain: 0.7 }),

    /* --- picking a goal up and putting it somewhere --------------------- */
    grab: () => voice.grab(this.bus),
    drop: () => voice.drop(this.bus),
    /** Passing over somewhere it could go. The quietest thing here. */
    hover: () => voice.hover(this.bus),

    /* --- the hour itself ------------------------------------------------ */
    /** Committing to a session: the room going quiet. */
    hush: () => voice.hush(this.bus),
    /** Serving the time: the lights coming back on. Not a fanfare. */
    restore: () => voice.restore(this.bus),
  };

  /* --- settings ---------------------------------------------------------- */

  setLevel(channel: Channel | 'master', value: number): void {
    this.bus.setLevel(channel, value);
    this.persist();
    this.notify();
  }

  getLevel(channel: Channel | 'master'): number {
    return this.bus.getLevel(channel);
  }

  setMuted(muted: boolean): void {
    this.bus.setMuted(muted);
    this.persist();
    this.notify();
  }

  get muted(): boolean {
    return this.bus.isMuted;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicWanted = enabled;
    if (enabled && this.bus.ready) this.music.start();
    if (!enabled) this.music.stop();
    this.persist();
    this.notify();
  }

  get musicEnabled(): boolean {
    return this.musicWanted;
  }

  /* --- change notification ------------------------------------------------ */

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /* --- persistence -------------------------------------------------------- */

  /**
   * Volume lives in `localStorage`, not in `RoomStyle`.
   *
   * `RoomStyle` is what the room *is*, and it is shared by every device the
   * user signs in from. How loud it should be is a fact about the room they are
   * sitting in, not about the room on the screen — turning it down on a laptop
   * at midnight should not silence it on the desktop tomorrow. Same reasoning,
   * opposite answer: the room is the account's, the volume is the device's.
   */
  private persist(): void {
    try {
      const levels: Record<string, number> = { master: this.bus.getLevel('master') };
      for (const channel of CHANNELS) levels[channel] = this.bus.getLevel(channel);

      window.localStorage.setItem(
        'petweb.audio',
        JSON.stringify({ levels, muted: this.bus.isMuted, music: this.musicWanted }),
      );
    } catch {
      // Private browsing, a full quota, a locked-down profile. The audio still
      // works; it just starts at the defaults next time.
    }
  }

  private restore(): void {
    try {
      const raw = window.localStorage.getItem('petweb.audio');
      if (!raw) return;

      const saved = JSON.parse(raw) as {
        levels?: Record<string, number>;
        muted?: boolean;
        music?: boolean;
      };

      for (const [name, value] of Object.entries(saved.levels ?? {})) {
        if (name !== 'master' && !CHANNELS.includes(name as Channel)) continue;
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        this.bus.setLevel(name as Channel | 'master', value);
      }

      if (typeof saved.muted === 'boolean') this.bus.setMuted(saved.muted);
      if (typeof saved.music === 'boolean') this.musicWanted = saved.music;
    } catch {
      // A corrupt entry costs the defaults, which is the right price.
    }
  }
}

/**
 * The instance.
 *
 * A module singleton rather than a React context, because audio outlives any
 * particular tree: the PixiJS scene is not in the React tree at all, and a
 * context would mean the room could not make a sound without a provider it has
 * no other reason to know about.
 */
export const audio = new Audio();

/** The short name components actually use. */
export const sfx = audio.ui;
