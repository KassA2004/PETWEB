/**
 * Clips — one-shot animations that interrupt whatever the creature was doing.
 *
 * States describe what a creature is generally up to; clips describe things
 * that *happen to it*. Landing, hitting a wall, being shaken and pouncing on a
 * toy are all events with a beginning, a middle and an end, and none of them
 * belong in a looping state machine.
 *
 * A clip is a function of normalized time, so authoring one means describing
 * the shape of an impact rather than tracking frames:
 *
 *   0.0 ─ anticipation ─ 0.2 ─── impact ─── 0.35 ──── recovery ──── 1.0
 *
 * The controller blends clips in and out and drops them when they finish, so
 * nothing ever snaps (/Docs/animation-approach.md §34).
 */

import type { FaceParams } from '../expression/Expression';
import type { Pose } from './Pose';
import { easeInOut } from './Pose';
import type { AnimationContext, EmotionRequest } from './types';

export interface ClipDefinition {
  name: string;
  /** Seconds. Ignored while `loop` is true. */
  duration: number;
  /** Seconds to fade the clip's pose in and out. */
  blendIn?: number;
  blendOut?: number;
  /** Higher wins when two clips are requested at once. */
  priority?: number;
  /** Runs until explicitly stopped — used while the creature is being shaken. */
  loop?: boolean;
  /** The pose at normalized time `t` (0..1, or elapsed seconds when looping). */
  pose(t: number, ctx: AnimationContext): Pose;
  /** Optional face override while the clip runs. */
  face?(t: number, ctx: AnimationContext): Partial<FaceParams>;
  /** Optional emotion the clip forces while it runs. */
  emotion?(t: number, ctx: AnimationContext): EmotionRequest | null;
  /** Fired once when the clip starts. */
  onStart?(ctx: AnimationContext): void;
}

export class ClipInstance {
  readonly definition: ClipDefinition;
  elapsed = 0;
  stopping = false;

  constructor(definition: ClipDefinition) {
    this.definition = definition;
  }

  get name(): string {
    return this.definition.name;
  }

  get priority(): number {
    return this.definition.priority ?? 0;
  }

  /** 0..1 through the clip. Loops report seconds since they started. */
  get progress(): number {
    const { duration, loop } = this.definition;
    if (loop) return this.elapsed;
    return duration <= 0 ? 1 : Math.min(1, this.elapsed / duration);
  }

  /**
   * How strongly the clip's pose should apply right now.
   *
   * Ramps in at the start, holds, and ramps out either at the end of a fixed
   * clip or as soon as a looping clip is asked to stop.
   */
  weight(): number {
    const { duration, blendIn = 0.08, blendOut = 0.18, loop } = this.definition;

    const rising = blendIn <= 0 ? 1 : easeInOut(this.elapsed / blendIn);

    if (loop) {
      if (!this.stopping) return rising;
      const since = this.elapsed - (this.stopTime ?? this.elapsed);
      return rising * (1 - easeInOut(since / blendOut));
    }

    const remaining = duration - this.elapsed;
    const falling = blendOut <= 0 ? 1 : easeInOut(remaining / blendOut);
    return Math.min(rising, falling);
  }

  private stopTime: number | null = null;

  stop(): void {
    if (this.stopping) return;
    this.stopping = true;
    this.stopTime = this.elapsed;
  }

  advance(dt: number): void {
    this.elapsed += dt;
  }

  get finished(): boolean {
    const { duration, blendOut = 0.18, loop } = this.definition;

    if (loop) {
      return (
        this.stopping &&
        this.stopTime !== null &&
        this.elapsed - this.stopTime >= blendOut
      );
    }

    return this.elapsed >= duration;
  }
}
