/**
 * The music.
 *
 * A soft, slow, generative loop that is supposed to be *almost* noticed. The
 * brief for it is the same one the room's lighting follows: support the
 * atmosphere, never become the event. A tune with a hook is a tune you will
 * hear four hundred times and then mute for ever, so there is no hook — there
 * is a pentatonic scale, a very slow pulse, and a small amount of randomness in
 * which note comes next.
 *
 * ```text
 *   note picker (every ~2.4s) → triangle osc → soft lowpass ─┐
 *                                                            ├→ MUSIC channel
 *   pad (two detuned sines, held)  ─────────────────────────┘
 * ```
 *
 * Pentatonic because it cannot produce a wrong note: any two degrees of it
 * sound fine together, which means the picker can be genuinely random and never
 * needs a rule about what may follow what. That is the entire reason generative
 * background music tends to be pentatonic, and it is a good enough reason.
 *
 * The hour changes the register, not the notes. Morning sits an octave up and
 * night an octave down, so the room's music agrees with its light without
 * needing a second set of material.
 */

import type { AudioBus } from './AudioBus';
import type { AmbienceId } from '../../world/Ambience';

/** F major pentatonic, two octaves. Chosen because it is warm and has no bite. */
const SCALE = [349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 784.0, 880.0];

/** Seconds between notes. Slow enough that it never sounds like a melody. */
const STEP_SECONDS = 2.4;

/** How the hour shifts the register. */
const REGISTER: Record<AmbienceId, number> = {
  morning: 1,
  day: 1,
  sunset: 0.75,
  evening: 0.6,
  night: 0.5,
};

export class Music {
  private bus: AudioBus;
  private output: GainNode | null = null;
  private pad: { stop: () => void } | null = null;
  private timer = 0;
  private register = 1;
  /** The last degree played, so the next one is a step rather than a leap. */
  private degree = 2;

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
    output.gain.setTargetAtTime(1, context.currentTime, 1.2);

    this.output = output;
    this.pad = this.startPad(context, output);
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

  /**
   * One note, then book the next one.
   *
   * A `setTimeout` chain rather than a scheduled sequence: the notes are two
   * and a half seconds apart, so the drift a timer introduces is inaudible, and
   * the alternative — a lookahead scheduler — is a lot of machinery for
   * something with no rhythm to keep.
   */
  private schedule(): void {
    this.timer = window.setTimeout(
      () => {
        this.playNote();
        if (this.output) this.schedule();
      },
      STEP_SECONDS * 1000 * (0.8 + Math.random() * 0.4),
    );
  }

  private playNote(): void {
    const output = this.output;
    if (!output) return;

    const context = output.context as AudioContext;
    const at = context.currentTime;

    // Wander by a step or two rather than jumping. Random over the whole scale
    // sounds like a random note generator, which is what it is, and the point
    // is for it not to.
    this.degree = Math.max(
      0,
      Math.min(SCALE.length - 1, this.degree + Math.round((Math.random() - 0.5) * 3)),
    );

    const frequency = SCALE[this.degree] * this.register;

    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.value = frequency;

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

  /** The hour moves the register. Same notes, different room. */
  setAmbience(ambience: AmbienceId): void {
    this.register = REGISTER[ambience] ?? 1;
  }

  stop(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;

    const output = this.output;
    this.output = null;
    this.pad?.stop();
    this.pad = null;

    if (!output) return;
    const context = output.context as AudioContext;
    output.gain.setTargetAtTime(0, context.currentTime, 0.4);
    window.setTimeout(() => output.disconnect(), 1500);
  }
}
