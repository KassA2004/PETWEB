/**
 * The contract every animation is written against.
 *
 * States and clips are pure descriptions: given the context, return a pose.
 * They never touch containers, never keep frame counters of their own, and
 * never know what came before them — the controller owns all of that, which is
 * what makes crossfading and layering possible at all.
 */

import type { PetRig } from '../../assets/pets/anatomy/PetRig';
import type { Emotion } from '../expression/Expression';
import type { Pose } from './Pose';

/** What the physical world is doing to the creature right now. */
export interface MotionState {
  /** Horizontal velocity in room pixels per second. */
  vx: number;
  /** Absolute horizontal speed. */
  speed: number;
  /** Height above the ground line. */
  height: number;
  /** Off the ground and not in your hand. */
  airborne: boolean;
  /** In your hand. */
  held: boolean;
  /** How hard it hit something this frame, 0 if nothing did. */
  impact: number;
}

export const RESTING_MOTION: MotionState = {
  vx: 0,
  speed: 0,
  height: 0,
  airborne: false,
  held: false,
  impact: 0,
};

export interface AnimationContext {
  rig: PetRig;
  /** Seconds since the controller started. */
  time: number;
  /** Seconds elapsed this frame. */
  delta: number;
  /**
   * Global motion amplitude. States lower it to calm the creature down and
   * raise it to energize the ambient layers.
   */
  intensity: number;
  /**
   * A point of interest in the rig's local space, or null for "nothing in
   * particular". The gaze layer and some poses read it.
   */
  lookTarget: { x: number; y: number } | null;
  motion: MotionState;
  /** Deterministic per-creature randomness. */
  random: () => number;
}

/** What the creature feels while a state or clip is running. */
export interface EmotionRequest {
  emotion: Emotion;
  strength: number;
  /** How quickly the face gets there, 0..1. Fear snaps; contentment drifts. */
  response?: number;
}

export interface PetState {
  name: string;
  /** Ambient layer scale while this state is active. */
  intensity?: number;
  /** Seconds to crossfade into this state. */
  blendIn?: number;
  pose(ctx: AnimationContext): Pose;
  emotion?(ctx: AnimationContext): EmotionRequest | null;
  enter?(ctx: AnimationContext): void;
  exit?(ctx: AnimationContext): void;
}

/** A layer runs every frame regardless of state and writes offsets directly. */
export interface MotionLayer {
  readonly name: string;
  update(ctx: AnimationContext): void;
  /** Re-bind after the creature is rebuilt. */
  setRig?(rig: PetRig): void;
}
