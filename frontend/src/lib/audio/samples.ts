/**
 * The recordings: fetched once, decoded once, handed out as buffers.
 *
 * A cache and a fetch queue, and deliberately nothing else. It does not play
 * anything — `voices.sampled` does that, through the same distance filter,
 * panner and voice budget every synthesised sound goes through, because a
 * recording that bypassed the mixer would be exactly the "room full of
 * unrelated devices" problem `AudioBus` exists to prevent.
 *
 * ```text
 *   unlock()  ─→ load()  ─→ fetch, in priority order, one at a time
 *                              ↓
 *   room event ─→ take('bounce') ─→ a buffer, or null if it is not here yet
 *                              ↓                         ↓
 *                        voices.sampled            voices.bounce
 * ```
 *
 * ## Three decisions worth defending
 *
 * **Nothing is fetched before the first gesture.** There is no audio context
 * until somebody clicks (browsers refuse to make one), so a sample downloaded
 * during page load is a sample that cannot be decoded, competing for bandwidth
 * with the room the user is waiting to see. The first click starts both the
 * context and the download.
 *
 * **One at a time, in a stated order.** Thirteen parallel requests for a
 * megabyte of audio is thirteen requests competing with whatever the room is
 * still loading. Sequential, cheapest-first, and the order (`FETCH_ORDER`) is
 * how soon each is likely to be heard.
 *
 * **A miss is not an error.** `take` returns null for anything not yet decoded,
 * for a file that failed, and for a browser that could not decode it — and
 * every caller has a synthesised voice to fall back to. So a first chirp two
 * hundred milliseconds after the first click is synthesised and the second one
 * is a real animal, and nobody has to see a loading state for a sound.
 */

import { AMBIENCE_LOOPS, AUDIO_BASE, FETCH_ORDER, ONE_SHOTS } from './library';
import type { OneShotName } from './library';
import type { WindowViewId } from '../../assets/environment/window/WindowViews';

/** A decoded file, or the fact that it will never decode. */
type Slot = AudioBuffer | 'failed';

export class Samples {
  private buffers = new Map<string, Slot>();
  /** In-flight decodes, so two callers asking at once share one request. */
  private pending = new Map<string, Promise<Slot>>();
  /** Which variant each name hands out next. See `take`. */
  private cursor = new Map<string, number>();
  private started = false;

  /**
   * Fetch and decode one file.
   *
   * The context is passed in rather than held, because it can be closed and
   * rebuilt (`AudioBus.dispose`) and an `AudioBuffer` belongs to the context
   * that decoded it. In practice the application makes one; the buffers are
   * keyed by path alone, and a context that has genuinely gone away takes the
   * whole `Samples` instance with it.
   */
  private async fetchOne(context: BaseAudioContext, path: string): Promise<Slot> {
    const already = this.buffers.get(path);
    if (already) return already;

    const inFlight = this.pending.get(path);
    if (inFlight) return inFlight;

    const work = (async (): Promise<Slot> => {
      try {
        const response = await fetch(AUDIO_BASE + path);
        if (!response.ok) throw new Error(String(response.status));

        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(path, decoded);
        return decoded;
      } catch {
        // A missing or undecodable file costs the synthesised voice and
        // nothing else. Recorded as failed so it is not asked for again on
        // every bounce for the rest of the session.
        this.buffers.set(path, 'failed');
        return 'failed';
      } finally {
        this.pending.delete(path);
      }
    })();

    this.pending.set(path, work);
    return work;
  }

  /**
   * Start loading the one-shots. Safe to call on every unlock.
   *
   * Not awaited by anything: the room keeps making sounds throughout, out of
   * `voices.ts`, and each one quietly becomes a recording as its file lands.
   */
  load(context: BaseAudioContext): void {
    if (this.started) return;
    this.started = true;

    void (async () => {
      for (const name of FETCH_ORDER) {
        for (const path of ONE_SHOTS[name].files) {
          await this.fetchOne(context, path);
        }
      }
    })();
  }

  /**
   * The next take of this sound, or null.
   *
   * Round-robin rather than random, and that is the better answer for two
   * variants: random picks the same one twice in a row a quarter of the time,
   * which is the exact artefact the variants were added to remove. With more
   * than two takes random would be worth it; with two, alternating is strictly
   * better.
   *
   * A variant that has not arrived is skipped rather than waited for, so the
   * first bounce after the first click plays whichever take is decoded.
   */
  take(name: OneShotName): AudioBuffer | null {
    const { files } = ONE_SHOTS[name];
    const from = this.cursor.get(name) ?? 0;

    for (let step = 0; step < files.length; step += 1) {
      const index = (from + step) % files.length;
      const buffer = this.buffers.get(files[index]);

      if (buffer && buffer !== 'failed') {
        this.cursor.set(name, index + 1);
        return buffer;
      }
    }

    return null;
  }

  /**
   * The bed for a window view, fetched on demand.
   *
   * Not part of `load`'s queue: there are six of them and the room only ever
   * has one window, so fetching the other five would be a megabyte and a half
   * spent on views nobody has selected. The caller (`Ambience`) asks for the
   * one it needs and crossfades it in when it arrives, over the synthesised bed
   * that is already playing.
   */
  async ambience(context: BaseAudioContext, view: WindowViewId): Promise<AudioBuffer | null> {
    const path = AMBIENCE_LOOPS[view];
    if (!path) return null;

    const slot = await this.fetchOne(context, path);
    return slot === 'failed' ? null : slot;
  }

  /** Let go of every decoded buffer. Called when the context is disposed. */
  clear(): void {
    this.buffers.clear();
    this.pending.clear();
    this.cursor.clear();
    this.started = false;
  }
}
