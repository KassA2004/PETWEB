/**
 * The music.
 *
 * Five cozy tracks, shuffled, crossfaded into one another, and one synthesised
 * loop underneath the whole arrangement in case none of them ever arrives.
 *
 * ```text
 *   <audio> (streamed) ─→ MediaElementSource ─→ track gain ─┐
 *   <audio> (next one) ─→ MediaElementSource ─→ track gain ─┼→ MUSIC channel
 *   generative fallback ────────────────────────────────────┘
 * ```
 *
 * ## What replaced what, and why
 *
 * This used to be a note picker: a pentatonic scale, a two-and-a-half second
 * pulse, a detuned pad, and a small amount of randomness about which degree
 * came next. The reasoning was sound and the result was not. Pentatonic *does*
 * make wrong notes impossible, which is exactly the problem — a sequence that
 * cannot be wrong also cannot be going anywhere, and after twenty minutes it is
 * audibly a random number generator with a nice scale on it. The brief has not
 * changed (support the room, never become the event); what changed is that
 * somebody with taste now writes the notes.
 *
 * The generative version is still here, at the bottom, as `Fallback`. It is
 * what plays when the files cannot be reached — an aeroplane, a broken deploy,
 * a locked-down network — and it is the reason nothing in this class has to
 * treat a failed download as an error.
 *
 * ## Streamed, not decoded
 *
 * An `<audio>` element and a `MediaElementAudioSourceNode`, rather than
 * `decodeAudioData` into an `AudioBufferSourceNode`. Two and a bit minutes of
 * 44.1 kHz stereo is about forty megabytes of `Float32Array` once decoded, per
 * track, and the only thing that buys is sample-accurate scheduling — which
 * music with no rhythm to keep does not need. The element reads it off the
 * network as it goes and holds a fraction of that.
 *
 * ## The hour changes the room, not the playlist
 *
 * The old version transposed the scale by the time of day. Recorded tracks
 * cannot be transposed without sounding transposed, so the hour does the one
 * thing that is honest with a recording: it moves the *level*, a little. Night
 * is quieter. That is all it should ever have been.
 */

import type { AudioBus } from './AudioBus';
import type { AmbienceId } from '../../world/Ambience';
import { AUDIO_BASE, TRACKS } from './library';

/** How long one track takes to fade into the next. */
const CROSSFADE_SECONDS = 6;

/**
 * How much of the end of a track is spent arriving at the next one.
 *
 * The files are already faded out over their last four seconds by the fetch
 * tool, so the crossfade starts a little before that: the outgoing track is
 * fading on its own while the incoming one comes up, which is what stops the
 * join from having a dip in the middle of it.
 */
const HANDOVER_SECONDS = CROSSFADE_SECONDS + 2;

/** What the hour does to the level. Night is quieter; nothing else moves. */
const LEVEL: Record<AmbienceId, number> = {
  morning: 1,
  day: 1,
  sunset: 0.9,
  evening: 0.8,
  night: 0.65,
};

interface Playing {
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  /** Cleared when this one is retired, so its watcher stops firing. */
  watcher: number;
}

export class Music {
  private bus: AudioBus;
  private output: GainNode | null = null;

  private current: Playing | null = null;
  private retiring: Playing | null = null;

  /** The shuffled playlist, and where in it we are. */
  private order: string[] = [];
  private next = 0;

  private hour: AmbienceId = 'day';
  private fallback: Fallback | null = null;

  constructor(bus: AudioBus) {
    this.bus = bus;
  }

  get playing(): boolean {
    return this.output !== null;
  }

  start(): void {
    if (this.output) return;

    const channel = this.bus.channel('music');
    if (!channel) return;

    const context = channel.context as AudioContext;

    const output = context.createGain();
    output.gain.value = 0;
    output.connect(channel);
    output.gain.setTargetAtTime(LEVEL[this.hour], context.currentTime, 1.2);

    this.output = output;

    // A fresh shuffle per session, rather than a fixed order: the first track
    // of the day should not be the same one every day.
    this.order = shuffled(TRACKS);
    this.next = 0;

    this.advance(0);
  }

  /**
   * Put the next track on.
   *
   * @param fadeIn seconds. Zero for the first one, because there is nothing to
   *   fade over and a six-second ramp into silence reads as a bug.
   */
  private advance(fadeIn: number): void {
    const output = this.output;
    if (!output) return;

    const context = output.context as AudioContext;
    const path = this.order[this.next % this.order.length];
    this.next += 1;

    const element = new Audio(AUDIO_BASE + path);
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';

    let source: MediaElementAudioSourceNode;
    try {
      source = context.createMediaElementSource(element);
    } catch {
      // A browser that will not route an element into the graph. Nothing else
      // in the class can work, so hand over to the synthesiser for good.
      this.startFallback();
      return;
    }

    const gain = context.createGain();
    gain.gain.value = fadeIn > 0 ? 0.0001 : 1;
    if (fadeIn > 0) gain.gain.setTargetAtTime(1, context.currentTime, fadeIn / 3);

    source.connect(gain);
    gain.connect(output);

    /*
     * Watch for the end, rather than listening for `ended`.
     *
     * `ended` fires when the track is over, and by then it is too late to fade
     * anything into it — the handover has to *start* several seconds before the
     * end. So a slow timer asks how far through we are. Two seconds is far more
     * often than it needs to be asked and still nothing: it is one property
     * read, and it keeps the handover within two seconds of where it was meant
     * to be even in a throttled background tab.
     */
    const watcher = window.setInterval(() => {
      const left = element.duration - element.currentTime;
      if (!Number.isFinite(left) || left > HANDOVER_SECONDS) return;

      window.clearInterval(watcher);
      this.handover();
    }, 2000);

    const playing: Playing = { element, source, gain, watcher };

    void element.play().catch(() => {
      // Autoplay policy, a decoding failure, a 404. The context is already
      // unlocked by the time this runs — `unlock()` is what calls `start()` —
      // so this is a real failure rather than a policy one, and the answer is
      // the same either way: something has to be playing.
      this.stopOne(playing);
      if (this.current === playing) this.current = null;
      this.startFallback();
    });

    this.current = playing;
  }

  /** Fade the current track out and the next one in, at the same time. */
  private handover(): void {
    const output = this.output;
    const going = this.current;
    if (!output || !going) return;

    const context = output.context as AudioContext;

    // Only one may be retiring. A second handover inside a crossfade would
    // otherwise leak an element that nothing is holding a reference to.
    if (this.retiring) this.stopOne(this.retiring);

    going.gain.gain.setTargetAtTime(0.0001, context.currentTime, CROSSFADE_SECONDS / 3);
    this.retiring = going;

    const retired = going;
    window.setTimeout(() => {
      this.stopOne(retired);
      if (this.retiring === retired) this.retiring = null;
    }, CROSSFADE_SECONDS * 1000);

    this.advance(CROSSFADE_SECONDS);
  }

  /**
   * Stop one element and let go of everything it holds.
   *
   * `src = ''` and `load()` matter: an `<audio>` element left with a source is
   * an element that may keep buffering, and nothing else here would ever
   * collect it — the `MediaElementAudioSourceNode` holds a reference to it for
   * as long as it is connected.
   */
  private stopOne(playing: Playing): void {
    window.clearInterval(playing.watcher);
    playing.element.pause();
    playing.source.disconnect();
    playing.gain.disconnect();
    playing.element.removeAttribute('src');
    playing.element.load();
  }

  /** The synthesised loop, for when there is nothing to stream. */
  private startFallback(): void {
    const output = this.output;
    if (!output || this.fallback) return;

    this.fallback = new Fallback(output);
    this.fallback.start();
  }

  /** The hour moves the level. Same tracks, quieter room. */
  setAmbience(ambience: AmbienceId): void {
    this.hour = ambience;

    const output = this.output;
    if (!output) return;

    const context = output.context as AudioContext;
    output.gain.setTargetAtTime(LEVEL[ambience] ?? 1, context.currentTime, 2);
  }

  stop(): void {
    const output = this.output;
    this.output = null;

    if (this.current) this.stopOne(this.current);
    if (this.retiring) this.stopOne(this.retiring);
    this.current = null;
    this.retiring = null;

    this.fallback?.stop();
    this.fallback = null;

    if (!output) return;
    const context = output.context as AudioContext;
    output.gain.setTargetAtTime(0, context.currentTime, 0.4);
    window.setTimeout(() => output.disconnect(), 1500);
  }
}

/** Fisher–Yates, on a copy. The playlist order is per session. */
function shuffled(items: readonly string[]): string[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * The generative loop, kept for when the files cannot be reached.
 *
 * This is the music the product had before there were any recordings, moved
 * here whole. It is worth keeping for one reason: it needs nothing but an audio
 * context, so a room with no network still has a floor under it rather than
 * silence — and silence is the one thing the mix cannot recover from, because
 * there is no way for a user to tell it apart from a bug.
 *
 * F major pentatonic, a very slow pulse, and a two-oscillator pad. Pentatonic
 * because it cannot produce a wrong note, which means the picker can be
 * genuinely random and never needs a rule about what may follow what. That is
 * why generative background music tends to be pentatonic, and it is a good
 * enough reason for a fallback even though it was not a good enough one for the
 * real thing.
 */
class Fallback {
  private output: GainNode;
  private mine: GainNode | null = null;
  private pad: { stop: () => void } | null = null;
  private timer = 0;
  private degree = 2;

  private static readonly SCALE = [349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 784.0, 880.0];
  private static readonly STEP_SECONDS = 2.4;

  constructor(output: GainNode) {
    this.output = output;
  }

  start(): void {
    if (this.mine) return;

    const context = this.output.context as AudioContext;
    const mine = context.createGain();
    mine.gain.value = 0;
    mine.connect(this.output);
    mine.gain.setTargetAtTime(1, context.currentTime, 1.2);

    this.mine = mine;
    this.pad = this.startPad(context, mine);
    this.schedule();
  }

  /**
   * The bed under the notes: two sines a few cents apart, held for ever.
   *
   * The detune is what stops it sounding like a test tone — two oscillators
   * beating slowly against each other is the cheapest warm pad there is.
   */
  private startPad(context: AudioContext, output: GainNode): { stop: () => void } {
    const gain = context.createGain();
    gain.gain.value = 0.05;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;

    const oscillators = [-4, 5].map((cents) => {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 174.61; // F below the scale.
      osc.detune.value = cents;
      osc.connect(filter);
      osc.start();
      return osc;
    });

    filter.connect(gain);
    gain.connect(output);

    return {
      stop: () => {
        for (const osc of oscillators) {
          osc.stop();
          osc.disconnect();
        }
        filter.disconnect();
        gain.disconnect();
      },
    };
  }

  private schedule(): void {
    this.timer = window.setTimeout(
      () => {
        this.playNote();
        if (this.mine) this.schedule();
      },
      Fallback.STEP_SECONDS * 1000 * (0.8 + Math.random() * 0.4),
    );
  }

  private playNote(): void {
    const output = this.mine;
    if (!output) return;

    const context = output.context as AudioContext;
    const at = context.currentTime;

    // Wander by a step or two rather than jumping. Random over the whole scale
    // sounds like a random note generator, which is what it is.
    this.degree = Math.max(
      0,
      Math.min(Fallback.SCALE.length - 1, this.degree + Math.round((Math.random() - 0.5) * 3)),
    );

    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.value = Fallback.SCALE[this.degree];

    filter.type = 'lowpass';
    filter.frequency.value = 1600;

    // A long, soft envelope. The attack is what keeps it out of the way — a
    // note that fades in over a fifth of a second cannot startle anybody.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.09, at + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    osc.start(at);
    osc.stop(at + 2.5);

    window.setTimeout(() => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, 2800);
  }

  stop(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;

    const mine = this.mine;
    this.mine = null;
    this.pad?.stop();
    this.pad = null;

    mine?.disconnect();
  }
}
