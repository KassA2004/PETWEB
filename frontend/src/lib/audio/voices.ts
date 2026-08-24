/**
 * The sounds themselves, made out of arithmetic.
 *
 * There are no audio files in this product, for the same reason there are no
 * image files: an asset you cannot tune is an asset that stays slightly wrong
 * for ever. A bounce that is a shade too bright is one number here, and
 * `theme-and-design.md`'s argument for procedural artwork applies to a bounce
 * exactly as it does to a plant pot.
 *
 * Everything below is built from three ingredients:
 *
 * ```text
 *   an oscillator     a pitch, usually falling — the sound of something losing
 *                     energy, which is what a collision is
 *   noise             the part that makes a thud a thud rather than a beep
 *   an envelope       almost the whole character. Attack in milliseconds,
 *                     decay in tenths. Nothing here rings for a second.
 * ```
 *
 * The one rule worth stating: **strength changes brightness, not just level.**
 * A hard knock is not a loud version of a soft one; it has more high end. A
 * mixer that only scales gain makes everything sound like the same event played
 * at different distances, which is exactly what a room full of physics should
 * not sound like.
 */

import type { AudioBus, Channel, VoiceHandle } from './AudioBus';

/** Shared shape for every one-shot. */
export interface VoiceOptions {
  /** 0..1, how hard the thing that caused it was. */
  strength?: number;
  /** -1..1 stereo position. */
  pan?: number;
  /** 0 near .. 1 far. Costs level and top end, the way distance does. */
  distance?: number;
  /** Multiplies the whole voice, for callers that need one quieter. */
  gain?: number;
}

interface Built {
  context: BaseAudioContext;
  /** Everything a voice makes connects here. */
  input: GainNode;
  handle: VoiceHandle;
  at: number;
  strength: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Noise, cached.
 *
 * One second of white noise is a 44 kB float array and every thud needs some.
 * Regenerating it per voice was measurable on a busy frame; generating it once
 * and playing it from a random offset is not, and nobody can hear the
 * difference between two windows of the same noise.
 */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(context);
  if (cached) return cached;

  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  noiseCache.set(context, buffer);
  return buffer;
}

/**
 * Claim a voice and build the little chain every sound shares:
 * `input → distance filter → panner → channel`.
 */
function open(
  bus: AudioBus,
  channel: Channel,
  options: VoiceOptions,
  throttle?: { key: string; cooldownMs: number },
): Built | null {
  const handle = bus.take(channel, {
    throttleKey: throttle?.key,
    cooldownMs: throttle?.cooldownMs,
  });
  if (!handle) return null;

  const context = handle.destination.context;
  const distance = clamp01(options.distance ?? 0);
  const strength = clamp01(options.strength ?? 0.6);

  const input = context.createGain();
  // Distance costs level. Not a physical inverse-square — the room is six
  // metres of pretend and a real falloff would make the back wall inaudible.
  input.gain.value = (options.gain ?? 1) * (1 - distance * 0.45);

  // ...and it costs top end, which is what actually reads as distance.
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 18000 - distance * 9000 - (1 - strength) * 4000;
  tone.Q.value = 0.6;

  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));

  input.connect(tone);
  tone.connect(panner);
  panner.connect(handle.destination);

  return { context, input, handle, at: handle.at, strength };
}

/** Schedule the teardown so the voice slot comes back. */
function close(built: Built, duration: number): void {
  const stopAt = built.at + duration;
  window.setTimeout(
    () => {
      built.input.disconnect();
      built.handle.release();
    },
    Math.max(30, (stopAt - built.context.currentTime) * 1000 + 60),
  );
}

/** An oscillator with a falling pitch and a percussive envelope. */
function tone(
  built: Built,
  spec: {
    type: OscillatorType;
    from: number;
    to: number;
    duration: number;
    peak: number;
    attack?: number;
  },
): void {
  const { context, input, at } = built;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const attack = spec.attack ?? 0.004;

  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), at + spec.duration);

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, spec.peak), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.duration);

  osc.connect(gain);
  gain.connect(input);
  osc.start(at);
  osc.stop(at + spec.duration + 0.02);
}

/** A burst of filtered noise: the body of anything that hits something. */
function noise(
  built: Built,
  spec: { duration: number; peak: number; frequency: number; type?: BiquadFilterType },
): void {
  const { context, input, at } = built;
  const source = context.createBufferSource();
  const buffer = noiseBuffer(context);
  source.buffer = buffer;
  source.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = spec.type ?? 'bandpass';
  filter.frequency.value = spec.frequency;
  filter.Q.value = 0.8;

  const gain = context.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, spec.peak), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(input);
  source.start(at, Math.random() * (buffer.duration - spec.duration - 0.01));
  source.stop(at + spec.duration + 0.02);
}

/* -------------------------------------------------------------------------- */
/* One-shots                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Something soft and heavy meeting the floor.
 *
 * Mostly noise with a short low tone under it. The tone is what stops it
 * sounding like static; the noise is what stops it sounding like a drum.
 */
export function thud(bus: AudioBus, channel: Channel, options: VoiceOptions = {}): void {
  const built = open(bus, channel, options, { key: `thud:${channel}`, cooldownMs: 45 });
  if (!built) return;

  const s = built.strength;
  const duration = 0.13 + s * 0.06;

  noise(built, { duration, peak: 0.16 + s * 0.2, frequency: 220 + s * 260, type: 'lowpass' });
  tone(built, { type: 'sine', from: 150 + s * 60, to: 58, duration, peak: 0.12 + s * 0.16 });
  close(built, duration);
}

/**
 * A ball.
 *
 * The one sound most likely to arrive fourteen times in a third of a second, so
 * it carries the shortest cooldown that still lets a real bounce sequence read
 * as a sequence: about three per second gets the rhythm across, and everything
 * past that was going to be mush anyway.
 *
 * It is also deliberately *not* the loudest thing in the room, which took
 * measuring to get right. Written by feel it came out at twice a pet chirp and
 * above the goal fanfare — a single throw sounded great and a game of fetch was
 * exhausting. A sound that repeats has to sit below the sounds that do not.
 */
export function bounce(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'sfx', options, { key: 'bounce', cooldownMs: 90 });
  if (!built) return;

  const s = built.strength;
  const duration = 0.1 + s * 0.05;

  tone(built, {
    type: 'sine',
    from: 380 + s * 420,
    to: 120,
    duration,
    peak: 0.11 + s * 0.16,
    attack: 0.002,
  });
  noise(built, { duration: 0.035, peak: 0.035 + s * 0.06, frequency: 1800 + s * 1600 });
  close(built, duration);
}

/** Wood, plastic, a block: shorter and harder than a thud, with a click on it. */
export function knock(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'sfx', options, { key: 'knock', cooldownMs: 70 });
  if (!built) return;

  const s = built.strength;
  const duration = 0.09 + s * 0.04;

  tone(built, { type: 'triangle', from: 260 + s * 200, to: 90, duration, peak: 0.12 + s * 0.16 });
  noise(built, { duration: 0.02, peak: 0.05 + s * 0.08, frequency: 2600 });
  close(built, duration);
}

/** Fabric, a cushion, a plush: almost all noise, almost no pitch. */
export function pat(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'sfx', options, { key: 'pat', cooldownMs: 70 });
  if (!built) return;

  const s = built.strength;
  const duration = 0.11;

  noise(built, { duration, peak: 0.1 + s * 0.14, frequency: 480, type: 'lowpass' });
  close(built, duration);
}

/** Setting something down on its cell: a small, satisfied click. */
export function place(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'sfx', options, { key: 'place', cooldownMs: 60 });
  if (!built) return;

  tone(built, { type: 'triangle', from: 520, to: 300, duration: 0.09, peak: 0.16 });
  noise(built, { duration: 0.03, peak: 0.05, frequency: 3200 });
  close(built, 0.11);
}

/** Picking something up. Even shorter, and upward, which reads as "held". */
export function lift(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'sfx', options, { key: 'lift', cooldownMs: 60 });
  if (!built) return;

  tone(built, { type: 'sine', from: 320, to: 560, duration: 0.07, peak: 0.1 });
  close(built, 0.09);
}

/**
 * No.
 *
 * The one sound in the product allowed to be slightly unpleasant: two low tones
 * a semitone apart, which beat against each other. It is short enough not to
 * become a punishment, and it is the same "no" the guide draws in red.
 */
export function refuse(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'sfx', options, { key: 'refuse', cooldownMs: 180 });
  if (!built) return;

  tone(built, { type: 'square', from: 190, to: 150, duration: 0.13, peak: 0.07 });
  tone(built, { type: 'square', from: 179, to: 142, duration: 0.13, peak: 0.06 });
  close(built, 0.16);
}

export type ChirpMood = 'idle' | 'happy' | 'startled' | 'poked' | 'sleepy' | 'glum';

/**
 * The creature, as one table.
 *
 * `interval` is the whole of the feeling: above 1 the two notes rise, below it
 * they fall, and the distance from 1 is how much it means it.
 *
 * `sleepy` and `glum` are the two quiet ones — a yawn as the lights go out, and
 * the small noise a creature makes when it would rather you had not left it
 * again. Both are lower and softer than every other mood, because a sulk that
 * is loud is not a sulk, it is a complaint.
 */
const CHIRP: Record<
  ChirpMood,
  { base: number; interval: number; duration: number; peak: number }
> = {
  idle: { base: 520, interval: 1.12, duration: 0.14, peak: 0.07 },
  happy: { base: 660, interval: 1.5, duration: 0.2, peak: 0.12 },
  startled: { base: 720, interval: 0.62, duration: 0.2, peak: 0.12 },
  poked: { base: 600, interval: 1.22, duration: 0.2, peak: 0.12 },
  sleepy: { base: 430, interval: 0.72, duration: 0.34, peak: 0.042 },
  glum: { base: 390, interval: 0.86, duration: 0.24, peak: 0.05 },
};

/**
 * The creature.
 *
 * A two-note chirp with a bit of vibrato, pitched well above everything else in
 * the mix so it is legible without being loud. `mood` slides the interval: up
 * for happy, down for startled, and barely anywhere for a small idle noise to
 * itself.
 */
export function chirp(
  bus: AudioBus,
  options: VoiceOptions & { mood?: ChirpMood } = {},
): void {
  const built = open(bus, 'pet', options, { key: 'chirp', cooldownMs: 220 });
  if (!built) return;

  const { base, interval, duration, peak } = CHIRP[options.mood ?? 'idle'];

  tone(built, { type: 'sine', from: base, to: base * interval, duration, peak, attack: 0.012 });
  // A quiet fifth above, which is what turns a beep into a voice.
  tone(built, {
    type: 'sine',
    from: base * 1.5,
    to: base * interval * 1.5,
    duration: duration * 0.8,
    peak: peak * 0.35,
    attack: 0.016,
  });
  close(built, duration);
}

/** The clock, the music box: a struck metal note with a long tail. */
export function chime(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'environment', options, { key: 'chime', cooldownMs: 400 });
  if (!built) return;

  const duration = 1.1;
  for (const [ratio, level] of [
    [1, 0.12],
    [2.01, 0.06],
    [2.98, 0.03],
  ] as const) {
    tone(built, {
      type: 'sine',
      from: 784 * ratio,
      to: 780 * ratio,
      duration: duration * (1 - (ratio - 1) * 0.18),
      peak: level,
      attack: 0.006,
    });
  }
  close(built, duration);
}

/* -------------------------------------------------------------------------- */
/* Interface                                                                  */
/* -------------------------------------------------------------------------- */

/** A button. Sixty milliseconds, and it should be almost subliminal. */
export function click(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'click', cooldownMs: 40 });
  if (!built) return;

  tone(built, { type: 'triangle', from: 900, to: 620, duration: 0.05, peak: 0.1 });
  close(built, 0.07);
}

/** A panel arriving. Softer and lower than a click, because it is not an action. */
export function open_(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'open', cooldownMs: 120 });
  if (!built) return;

  tone(built, { type: 'sine', from: 380, to: 620, duration: 0.14, peak: 0.09, attack: 0.02 });
  close(built, 0.16);
}

/** A panel leaving: the same shape, backwards and quieter. */
export function close_(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'close', cooldownMs: 120 });
  if (!built) return;

  tone(built, { type: 'sine', from: 560, to: 340, duration: 0.11, peak: 0.06, attack: 0.016 });
  close(built, 0.13);
}

/**
 * Taking hold of something on the page.
 *
 * The interface's answer to `lift`, which belongs to the room. Deliberately not
 * the same sound: one is a thing being picked up off a floor, the other is a
 * line of text coming off a list, and giving both the room's voice would say
 * the panel and the world are the same place.
 */
export function grab(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'grab', cooldownMs: 80 });
  if (!built) return;

  tone(built, { type: 'sine', from: 340, to: 520, duration: 0.06, peak: 0.08 });
  noise(built, { duration: 0.02, peak: 0.02, frequency: 2600 });
  close(built, 0.08);
}

/** Setting it down where it was meant to go. The same shape, resolving. */
export function drop(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'drop', cooldownMs: 80 });
  if (!built) return;

  tone(built, { type: 'triangle', from: 560, to: 330, duration: 0.11, peak: 0.11 });
  noise(built, { duration: 0.03, peak: 0.03, frequency: 1800 });
  close(built, 0.13);
}

/**
 * Passing over somewhere it could go.
 *
 * The quietest thing in the product, and it has to be: it fires while the hand
 * is still moving, so anything with a body to it would turn a hover into a
 * stutter. One short, high tick at about a third of a click.
 */
export function hover(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'hover', cooldownMs: 140 });
  if (!built) return;

  tone(built, { type: 'sine', from: 1180, to: 1180, duration: 0.03, peak: 0.035 });
  close(built, 0.05);
}

/**
 * The room going quiet.
 *
 * Two soft falling tones a fifth apart, over a third of a second — long by this
 * product's standards, and the length is the message. Everything else on this
 * channel acknowledges a press; this one marks the beginning of an hour, so it
 * is nearer to a room than to a button: low, unhurried, and with no click
 * anywhere in it.
 */
export function hush(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'hush', cooldownMs: 500 });
  if (!built) return;

  tone(built, { type: 'sine', from: 392, to: 262, duration: 0.34, peak: 0.075, attack: 0.05 });
  tone(built, { type: 'sine', from: 262, to: 196, duration: 0.42, peak: 0.05, attack: 0.08 });
  close(built, 0.46);
}

/**
 * The lights coming back on.
 *
 * `hush` inverted, and about the same size. Not a fanfare: finishing a session
 * means the time was served, which is worth noticing and is emphatically not
 * the same event as finishing the thing you were working on. That one keeps
 * `fanfare`, and the gap between the two sounds is how the product says so
 * without a word.
 */
export function restore(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'restore', cooldownMs: 500 });
  if (!built) return;

  tone(built, { type: 'sine', from: 262, to: 392, duration: 0.3, peak: 0.08, attack: 0.04 });
  tone(built, { type: 'triangle', from: 523, to: 659, duration: 0.36, peak: 0.045, attack: 0.06 });
  close(built, 0.4);
}

/**
 * A switch, in the room.
 *
 * On the environment channel rather than the interface's, because the lamp is
 * furniture: a thing in the world that was touched, and it belongs at the level
 * of the world rather than at the level of a button.
 */
export function lightSwitch(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'environment', options, { key: 'light', cooldownMs: 160 });
  if (!built) return;

  tone(built, { type: 'square', from: 220, to: 120, duration: 0.035, peak: 0.12 });
  noise(built, { duration: 0.025, peak: 0.16, frequency: 2200 });
  close(built, 0.06);
}

/**
 * Finishing something.
 *
 * The one sound allowed to be an event: a rising major arpeggio over about half
 * a second. It is louder and longer than every other interface sound on
 * purpose, because it is the only one that marks something the user did in the
 * real world, and a completion that sounds like a checkbox is a completion
 * nobody feels.
 */
export function fanfare(bus: AudioBus, options: VoiceOptions = {}): void {
  const built = open(bus, 'ui', options, { key: 'fanfare', cooldownMs: 600 });
  if (!built) return;

  const { context, input, at } = built;
  // C-E-G-C, which is as close to "well done" as four notes get.
  const notes = [523.25, 659.25, 783.99, 1046.5];

  notes.forEach((frequency, index) => {
    const start = at + index * 0.075;
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.13, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

    osc.connect(gain);
    gain.connect(input);
    osc.start(start);
    osc.stop(start + 0.45);
  });

  close(built, 0.75);
}
