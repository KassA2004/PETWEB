/**
 * What the room sounds like when nothing is happening.
 *
 * Ambience is the part of a soundtrack people do not notice and would
 * immediately notice the absence of. It is tied to what is outside the window,
 * because that is the only thing in the room that says where the room *is* —
 * the same view that decides whether the light through the glass is meadow
 * green or lava orange decides whether you can hear gulls.
 *
 * Each bed is a small graph that runs for as long as the view is selected:
 *
 * ```text
 *   recorded loop  ─┐
 *                   ├→ bed gain → ENVIRONMENT channel
 *   or synthesis   ─┘      ↑
 *                   crossfaded on a view change, and on the upgrade
 * ```
 *
 * **Changing view crossfades rather than cuts.** A hard switch is the single
 * most artificial thing an ambience system can do — real rooms do not change
 * key instantly — and the fade is two `setTargetAtTime` calls, so there was
 * never a reason to skip it.
 *
 * ## What is recorded, and what is still made out of noise
 *
 * The beds the user actually hears are field recordings now, cut to seamless
 * loops by `tools/audio/fetch.mjs`. Everything below them — the noise layers,
 * the birds, the swell — is the synthesised version, kept and still built on
 * every view change, because it is available on the frame the view changes and
 * the recording is a fetch away. `Ambience.set` plays the synthesiser and then
 * upgrades itself; see the class.
 *
 * This is where synthesis was weakest, which is why it was the first thing
 * replaced. Filtered noise is genuinely convincing wind: air moving past things
 * *is* broadband noise with a wandering filter on it, and the ear has no
 * further detail to miss. It is not convincing anything else. A sea is
 * thousands of individual collapses with a shape to each one, and a band of
 * noise breathing every eight seconds is a description of a sea rather than a
 * sea. Birds are the same argument at a smaller scale: the frequency sweeps
 * below get the *rhythm* of birdsong right, which is most of it, and the timbre
 * is unmistakably an oscillator.
 *
 * **The synthesised beds are level-matched, and the numbers below are measured
 * rather than chosen.** Written by ear they were not: low-frequency material
 * carries far more energy for the same apparent loudness, so the sea and the
 * city — which are almost entirely low — came out at three times the RMS of the
 * meadow, and switching the window from a park to an ocean was a jump in volume
 * rather than a change of place. Each `gain` here is set so every view lands
 * near 0.018 RMS on the environment channel. The recordings are matched the
 * same way and to the same place, in LUFS, by the fetch tool — so an upgrade
 * mid-fade is a change of *material* and not of level.
 */

import type { AudioBus } from './AudioBus';
import type { Samples } from './samples';
import type { WindowViewId } from '../../assets/environment/window/WindowViews';

/** How long a view change takes to complete, in seconds. */
const CROSSFADE = 1.6;

interface Bed {
  /** The node whose gain is faded. */
  output: GainNode;
  /** Everything that has to be stopped when the bed goes away. */
  stop: () => void;
}

/**
 * A layer of filtered noise whose filter drifts.
 *
 * The drift is what separates "wind" from "hiss": a static band of noise reads
 * as a broken speaker, and a band that moves over several seconds reads as air.
 */
function noiseLayer(
  context: AudioContext,
  spec: {
    frequency: number;
    Q: number;
    type: BiquadFilterType;
    gain: number;
    /** How far the filter wanders, in Hz, and how slowly. */
    sweep?: { depth: number; seconds: number };
  },
): { node: AudioNode; stop: () => void } {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown-ish noise: white noise integrated, which has the low tilt that makes
  // wind and sea sound like weather rather than like static.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + white * 0.02) / 1.02;
    data[i] = last * 3.5;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = spec.type;
  filter.frequency.value = spec.frequency;
  filter.Q.value = spec.Q;

  const gain = context.createGain();
  gain.gain.value = spec.gain;

  source.connect(filter);
  filter.connect(gain);
  source.start();

  let lfo: OscillatorNode | null = null;
  if (spec.sweep) {
    lfo = context.createOscillator();
    const depth = context.createGain();
    lfo.frequency.value = 1 / spec.sweep.seconds;
    depth.gain.value = spec.sweep.depth;
    lfo.connect(depth);
    depth.connect(filter.frequency);
    lfo.start();
  }

  return {
    node: gain,
    stop: () => {
      source.stop();
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      lfo?.stop();
      lfo?.disconnect();
    },
  };
}

/**
 * Birdsong, as irregularly as birds actually sing.
 *
 * Two to five short sweeps in a burst, then several seconds of nothing. The
 * irregularity is the whole trick: anything on a fixed interval stops being a
 * bird after about ninety seconds and becomes a metronome.
 */
function birds(context: AudioContext, output: AudioNode): () => void {
  let timer = 0;
  let stopped = false;

  const sing = () => {
    if (stopped) return;

    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1400;

    for (let i = 0; i < notes; i++) {
      const at = context.currentTime + i * (0.06 + Math.random() * 0.07);
      const osc = context.createOscillator();
      const gain = context.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), at);
      osc.frequency.exponentialRampToValueAtTime(
        base * (1.1 + Math.random() * 0.5),
        at + 0.05,
      );

      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.035, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);

      osc.connect(gain);
      gain.connect(output);
      osc.start(at);
      osc.stop(at + 0.12);
    }

    timer = window.setTimeout(sing, 3500 + Math.random() * 9000);
  };

  timer = window.setTimeout(sing, 1200 + Math.random() * 3000);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

/** One slow swell, for the sea: the filter and the level move together. */
function swell(context: AudioContext, output: AudioNode, seconds: number): () => void {
  const lfo = context.createOscillator();
  const depth = context.createGain();
  const level = context.createGain();

  level.gain.value = 0.55;
  lfo.frequency.value = 1 / seconds;
  depth.gain.value = 0.45;

  lfo.connect(depth);
  depth.connect(level.gain);
  lfo.start();

  level.connect(output);

  return () => {
    lfo.stop();
    lfo.disconnect();
    depth.disconnect();
    level.disconnect();
  };
}

/** Build the bed for one window view. */
function buildBed(context: AudioContext, view: WindowViewId): Bed {
  const output = context.createGain();
  output.gain.value = 0;

  const parts: (() => void)[] = [];
  const add = (layer: { node: AudioNode; stop: () => void }) => {
    layer.node.connect(output);
    parts.push(layer.stop);
  };

  switch (view) {
    case 'meadow':
    case 'park': {
      // Air moving through leaves, and something living in them.
      add(noiseLayer(context, { type: 'bandpass', frequency: 520, Q: 0.5, gain: 0.5, sweep: { depth: 180, seconds: 13 } }));
      add(noiseLayer(context, { type: 'highpass', frequency: 3200, Q: 0.4, gain: 0.12 }));
      parts.push(birds(context, output));
      break;
    }

    case 'mountains': {
      // Higher, thinner, emptier. Wind with nothing in it.
      add(noiseLayer(context, { type: 'bandpass', frequency: 340, Q: 0.35, gain: 0.45, sweep: { depth: 260, seconds: 9 } }));
      add(noiseLayer(context, { type: 'highpass', frequency: 4200, Q: 0.4, gain: 0.05 }));
      break;
    }

    case 'ocean': {
      // The swell is the sound. A band of noise that breathes every eight
      // seconds does more than any amount of splash detail.
      const sea = noiseLayer(context, { type: 'lowpass', frequency: 900, Q: 0.3, gain: 0.31, sweep: { depth: 380, seconds: 8 } });
      const breathing = context.createGain();
      breathing.gain.value = 1;
      sea.node.connect(breathing);
      breathing.connect(output);
      parts.push(sea.stop, swell(context, breathing, 8));
      add(noiseLayer(context, { type: 'highpass', frequency: 5200, Q: 0.4, gain: 0.02 }));
      break;
    }

    case 'city': {
      // Distant traffic is almost entirely low. The high layer is the part
      // that makes it a city rather than a motorway.
      add(noiseLayer(context, { type: 'lowpass', frequency: 240, Q: 0.4, gain: 0.32, sweep: { depth: 90, seconds: 17 } }));
      add(noiseLayer(context, { type: 'bandpass', frequency: 1400, Q: 0.6, gain: 0.05, sweep: { depth: 400, seconds: 6 } }));
      break;
    }

    case 'dungeon': {
      // A room with stone around it: low rumble, and a resonance that says
      // the space is bigger than the one you are standing in.
      add(noiseLayer(context, { type: 'lowpass', frequency: 130, Q: 0.5, gain: 0.36, sweep: { depth: 40, seconds: 21 } }));
      add(noiseLayer(context, { type: 'bandpass', frequency: 700, Q: 6, gain: 0.04, sweep: { depth: 120, seconds: 11 } }));
      break;
    }

    default:
      break;
  }

  return {
    output,
    stop: () => {
      for (const part of parts) part();
      output.disconnect();
    },
  };
}


/**
 * The ambience layer.
 *
 * Two things are true of every view, and the class is arranged around both:
 * there is a synthesised bed that is available *immediately*, and there is a
 * recorded one that is better and arrives *late*. So a view change plays the
 * synthesiser at once and upgrades itself to the recording when it lands.
 *
 * ```text
 *   set('ocean')  ──→ synth bed, fading in over 1.6s   (available on the frame)
 *                 └─→ fetch ambience/ocean.mp3
 *                          └─→ recorded loop fades in, synth bed fades out
 * ```
 *
 * That ordering is the whole reason the synthesised beds were kept. A room that
 * is silent for the second and a half it takes to fetch three hundred kilobytes
 * has a hole in it exactly where somebody has just changed the view and is
 * listening for the result; a room that plays a rough approximation and then
 * quietly becomes a real recording has none.
 *
 * Beds are held in a set rather than as a single `retiring` slot, because there
 * are now two ways for one to be replaced — a new view, and an upgrade — and a
 * user clicking through six views during a fetch could otherwise strand one.
 */
export class Ambience {
  private bus: AudioBus;
  private samples: Samples;

  /**
   * What is playing, and whether it is the real thing yet.
   *
   * `recorded` is what stops a second arrival from upgrading an already
   * upgraded bed: `set` is called from a React effect on every style change,
   * and the fetch is cached, so the promise resolves immediately every time
   * after the first.
   */
  private current: { view: WindowViewId; bed: Bed; recorded: boolean } | null = null;

  /** Beds on their way out, each with the timer that will free it. */
  private retiring = new Map<Bed, number>();

  constructor(bus: AudioBus, samples: Samples) {
    this.bus = bus;
    this.samples = samples;
  }

  get view(): WindowViewId | null {
    return this.current?.view ?? null;
  }

  /**
   * Play the bed for this view, crossfading from whatever was playing.
   *
   * Idempotent: asking for the view that is already playing does nothing, which
   * matters because the caller is a React effect and will ask on every render
   * that touches the room's style.
   */
  set(view: WindowViewId): void {
    if (this.current?.view === view) return;

    const channel = this.bus.channel('environment');
    if (!channel) return;

    const context = channel.context as AudioContext;

    const synth = buildBed(context, view);
    this.swapTo(channel, synth, view, false);

    void this.upgrade(context, channel, view);
  }

  /**
   * Fetch the recording for a view and put it on, if it is still wanted.
   *
   * Every one of the three guards below is a real case rather than defensive
   * padding: the file may not exist (nothing to upgrade to), the user may have
   * changed the window while it was in flight (upgrading would swap the bed
   * back to the view they just left), and the effect may have called `set`
   * again for the same view (already recorded, nothing to do).
   */
  private async upgrade(
    context: AudioContext,
    channel: GainNode,
    view: WindowViewId,
  ): Promise<void> {
    const buffer = await this.samples.ambience(context, view);
    if (!buffer) return;
    if (this.current?.view !== view || this.current.recorded) return;

    this.swapTo(channel, loopBed(context, buffer), view, true);
  }

  /** Fade a new bed in, fade whatever was there out, and book its removal. */
  private swapTo(
    channel: GainNode,
    bed: Bed,
    view: WindowViewId,
    recorded: boolean,
  ): void {
    const context = channel.context as AudioContext;
    const now = context.currentTime;

    const previous = this.current?.bed;
    if (previous) this.retire(previous, now);

    bed.output.connect(channel);
    bed.output.gain.setTargetAtTime(1, now, CROSSFADE / 3);

    this.current = { view, bed, recorded };
  }

  private retire(bed: Bed, now: number): void {
    bed.output.gain.cancelScheduledValues(now);
    bed.output.gain.setTargetAtTime(0, now, CROSSFADE / 3);

    this.retiring.set(
      bed,
      window.setTimeout(() => {
        bed.stop();
        this.retiring.delete(bed);
      }, CROSSFADE * 1000),
    );
  }

  /** Silence, and let go of everything. */
  stop(): void {
    for (const [bed, timer] of this.retiring) {
      window.clearTimeout(timer);
      bed.stop();
    }
    this.retiring.clear();

    this.current?.bed.stop();
    this.current = null;
  }
}

/**
 * A recorded loop, as a bed.
 *
 * `loop = true` on a buffer source and nothing else — no crossfade at the join,
 * no second source phasing against the first. The seam is already seamless: the
 * fetch tool builds every one of these so that its end is material that
 * continues at its own start (see `makeLoop`), which is the right place for
 * that work because it happens once at build time rather than for ever at
 * playback.
 */
function loopBed(context: AudioContext, buffer: AudioBuffer): Bed {
  const output = context.createGain();
  output.gain.value = 0;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(output);
  source.start(context.currentTime, Math.random() * buffer.duration);

  return {
    output,
    stop: () => {
      try {
        source.stop();
      } catch {
        // Already stopped: `stop()` after the node has ended throws in some
        // engines and is not worth a flag to avoid.
      }
      source.disconnect();
      output.disconnect();
    },
  };
}
