/**
 * A token bucket, per socket, per kind of thing a socket can do.
 *
 * The REST API is rate-limited per user (00-conventions.md §9). A socket is a
 * hole in that: it is one HTTP request that then carries an unbounded number of
 * messages, and without a limit here a single connection can ask the server to
 * write a chat row in a loop for as long as it likes.
 *
 * A bucket rather than a fixed window, because the three things being limited
 * have genuinely different shapes:
 *
 * ```text
 *   movement   ~10 Hz forever, and a frame-rate spike must not disconnect
 *              anybody — so a bucket that refills continuously and tolerates a
 *              short burst is right, and a "20 per second" window is not
 *   chat       a person typing. Bursty by nature (three quick lines), and then
 *              quiet. A bucket that holds five and refills over five seconds
 *              allows the burst and refuses the flood
 *   actions    the same shape as chat
 * ```
 *
 * Over-budget messages are **dropped, not punished**. A dropped position update
 * costs one frame of smoothness and the next one arrives 100 ms later; a
 * disconnection costs somebody their afternoon in the park. The only thing that
 * gets a socket closed is failing to authenticate.
 */

export interface RateSpec {
  /** Bucket size — how much burst is allowed. */
  readonly tokens: number;
  /** How long a full bucket takes to refill, in milliseconds. */
  readonly perMs: number;
}

export class TokenBucket {
  private available: number;
  private last = Date.now();

  constructor(private readonly spec: RateSpec) {
    this.available = spec.tokens;
  }

  /**
   * Spend one token. False when there is nothing left.
   *
   * Refills lazily from the clock rather than on a timer: a bucket that ticks
   * is a timer per socket per channel, which for a few hundred connections is
   * a thousand timers doing arithmetic nobody asked for.
   */
  take(): boolean {
    const now = Date.now();
    const refill = ((now - this.last) / this.spec.perMs) * this.spec.tokens;

    this.last = now;
    this.available = Math.min(this.spec.tokens, this.available + refill);

    if (this.available < 1) return false;

    this.available -= 1;
    return true;
  }
}
