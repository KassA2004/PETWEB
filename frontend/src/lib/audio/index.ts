/**
 * The one audio system, and the only thing components are allowed to talk to.
 *
 * `AudioBus` owns the mix, `voices.ts` owns what things sound like, `ambience`
 * and `music` own the two continuous layers. This file is the front door: a
 * single instance, the mapping from "something happened in the room" to "this
 * is what that sounds like", and the small amount of React glue.
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
  tunnel: 'pat',
};

class Audio {
  readonly bus = new AudioBus();
  readonly ambience = new Ambience(this.bus);
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

      case 'pet-idle':
        voice.chirp(this.bus, { ...at, mood: 'idle' });
        return;

      case 'pet-happy':
        voice.chirp(this.bus, { ...at, mood: 'happy' });
        return;

      case 'pet-startled':
        voice.chirp(this.bus, { ...at, mood: 'startled' });
        return;

      case 'pet-poked':
        voice.chirp(this.bus, { ...at, mood: 'poked' });
        return;

      case 'pet-sleepy':
        voice.chirp(this.bus, { ...at, mood: 'sleepy' });
        return;

      case 'pet-glum':
        voice.chirp(this.bus, { ...at, mood: 'glum' });
        return;

      case 'chime':
        voice.chime(this.bus, at);
        return;

      case 'lights':
        voice.lightSwitch(this.bus, at);
        return;

      default:
        return;
    }
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
    /** The one interface sound that is an event rather than an acknowledgement. */
    celebrate: () => voice.fanfare(this.bus),
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
