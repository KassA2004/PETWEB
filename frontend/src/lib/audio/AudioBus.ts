/**
 * The mixer.
 *
 * One AudioContext, one signal path, and every sound in the product routed
 * through it. The alternative — `new Audio(...)` wherever a sound is wanted —
 * is what makes web applications sound like a room full of unrelated devices:
 * nothing can be turned down together, nothing knows what else is playing, and
 * the twentieth simultaneous ball bounce clips the output because no single
 * place ever counted to twenty.
 *
 * ```text
 *   voices ──┬─→ MUSIC ───────┐
 *            ├─→ ENVIRONMENT ─┤
 *            ├─→ PET ─────────┼─→ MASTER ─→ compressor ─→ out
 *            ├─→ SFX ─────────┤
 *            └─→ UI ──────────┘
 * ```
 *
 * Three things this owns that nothing else should:
 *
 * **The hierarchy.** Channel gains are set once, here, in the order the mix is
 * meant to read (see `DEFAULT_LEVELS`). A sound never picks its own absolute
 * volume; it picks a *strength*, and the channel decides what that is worth
 * against everything else.
 *
 * **The limit.** A compressor on the master bus, and a hard cap on how many
 * voices may be alive at once. Physics does not care that fourteen collisions
 * in a third of a second is unpleasant; something has to.
 *
 * **The unlock.** Browsers refuse to start an AudioContext that no gesture
 * asked for, and a context created at page load starts `suspended` and stays
 * that way silently. `unlock()` is wired to the first real interaction, and
 * everything before it is a no-op rather than an error.
 *
 * There are no audio files. Every sound is synthesised (`./voices.ts`), which
 * is the same choice the artwork makes and for the same reasons: nothing to
 * download, nothing to license, and a bounce can be tuned by changing a number
 * rather than by opening an editor.
 */

export const CHANNELS = ['music', 'environment', 'pet', 'sfx', 'ui'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * The mix, as one table.
 *
 * Read it top to bottom: this is the order the ear is meant to notice things
 * in. Music sits under everything because it is the floor of the room, not an
 * event. Ambience is clearly there but never asks for attention. The creature
 * and the objects are the things the user actually did, so they read. UI is
 * loudest per event and shortest by far — a click is 60 milliseconds, and
 * making it quiet enough to "not dominate" only makes it feel broken.
 *
 * Numbers, not adjectives, and tuned against the synthesised voices in
 * `./voices.ts` — swapping those out means retuning these.
 */
export const DEFAULT_LEVELS: Record<Channel | 'master', number> = {
  master: 0.75,
  music: 0.16,
  environment: 0.3,
  pet: 0.5,
  sfx: 0.36,
  ui: 0.55,
};

/**
 * How many one-shot voices may be alive at once.
 *
 * Chosen against the worst honest case rather than the average: a toy box
 * knocked over is perhaps six objects landing inside a second, and anything
 * past that is a physics event the user is not listening to individually.
 */
const MAX_VOICES = 12;

/** How long a channel takes to reach a new level. Long enough not to click. */
const FADE_SECONDS = 0.12;

export interface VoiceHandle {
  /** Where to connect a source. Already routed to the right channel. */
  destination: GainNode;
  /** The moment the voice should start, in context time. */
  at: number;
  /** Tell the bus the voice is finished, so the slot can be reused. */
  release: () => void;
}

export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels = new Map<Channel, GainNode>();

  private levels: Record<Channel | 'master', number> = { ...DEFAULT_LEVELS };
  private muted = false;

  private voices = 0;
  /** Last time each throttle key was allowed through, in ms. */
  private lastPlayed = new Map<string, number>();

  /** True once a gesture has been seen and the context is actually running. */
  get ready(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /**
   * Start, or resume, the audio context.
   *
   * Safe to call on every interaction: creating the context is guarded, and
   * `resume()` on a running context is a no-op. It has to be called from inside
   * a real user gesture the first time, which is why the caller wires it to
   * pointerdown/keydown rather than to an effect.
   */
  async unlock(): Promise<void> {
    if (!this.context) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;

      this.context = new Ctor();
      this.build(this.context);
    }

    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => undefined);
    }
  }

  /** Build the signal path once the context exists. */
  private build(context: AudioContext): void {
    // A limiter rather than a compressor doing tone: a high ratio and a fast
    // attack, sitting just under 0 dBFS, so a pile-up is squashed instead of
    // clipping. Nothing else in the chain is allowed to be this loud.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    limiter.connect(context.destination);

    const master = context.createGain();
    master.gain.value = this.muted ? 0 : this.levels.master;
    master.connect(limiter);

    for (const channel of CHANNELS) {
      const gain = context.createGain();
      gain.gain.value = this.levels[channel];
      gain.connect(master);
      this.channels.set(channel, gain);
    }

    this.master = master;
  }

  /** The node a channel's sources connect to, or null before the unlock. */
  channel(name: Channel): GainNode | null {
    return this.channels.get(name) ?? null;
  }

  setLevel(name: Channel | 'master', value: number): void {
    const level = Math.max(0, Math.min(1, value));
    this.levels[name] = level;

    const node = name === 'master' ? this.master : this.channels.get(name);
    if (!node || !this.context) return;

    const target = name === 'master' && this.muted ? 0 : level;
    node.gain.cancelScheduledValues(this.context.currentTime);
    node.gain.setTargetAtTime(target, this.context.currentTime, FADE_SECONDS);
  }

  getLevel(name: Channel | 'master'): number {
    return this.levels[name];
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.setLevel('master', this.levels.master);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Ask for a voice.
   *
   * Returns null — rather than throwing, or queueing — when the sound should
   * not be made: before the unlock, when the channel is silent anyway, when
   * this kind of sound played too recently, or when too many voices are already
   * running. A refusal is the normal case for a busy physics frame, so it has
   * to be cheap and it has to be nothing.
   *
   * @param throttleKey  sounds sharing a key share a cooldown. A bouncing ball
   *   and a landing chair are different keys; two balls are the same one, which
   *   is the point — the ear does not distinguish them and would only hear the
   *   count.
   */
  take(
    channel: Channel,
    options: { throttleKey?: string; cooldownMs?: number } = {},
  ): VoiceHandle | null {
    if (!this.context || this.context.state !== 'running') return null;

    const output = this.channels.get(channel);
    if (!output) return null;

    // Nothing to hear anyway: skip the work rather than synthesising silence.
    if (this.levels[channel] <= 0.001 || this.muted || this.levels.master <= 0.001) {
      return null;
    }

    if (this.voices >= MAX_VOICES) return null;

    const { throttleKey, cooldownMs = 0 } = options;
    if (throttleKey && cooldownMs > 0) {
      const now = performance.now();
      const last = this.lastPlayed.get(throttleKey) ?? -Infinity;
      if (now - last < cooldownMs) return null;
      this.lastPlayed.set(throttleKey, now);
    }

    this.voices += 1;
    let released = false;

    return {
      destination: output,
      at: this.context.currentTime,
      release: () => {
        if (released) return;
        released = true;
        this.voices = Math.max(0, this.voices - 1);
      },
    };
  }

  /**
   * Let go of the context.
   *
   * Called when the application unmounts. A context left open holds an audio
   * device awake, and a page that has been navigated away from should not.
   */
  async dispose(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.master = null;
    this.channels.clear();
    this.voices = 0;
    this.lastPlayed.clear();

    await context?.close().catch(() => undefined);
  }
}
