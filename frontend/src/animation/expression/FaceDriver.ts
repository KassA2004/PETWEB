/**
 * FaceDriver — turns expression numbers into a face.
 *
 * It owns everything above the mouth line: lids, brows, pupils, blush, and the
 * mouth redraw. It also owns blinking, because a blink is a lid movement that
 * has to cooperate with whatever the current expression is doing to the same
 * lid — a sleeping creature must not blink its eyes open.
 *
 * The driver eases toward its target rather than snapping, so an emotion
 * arriving looks like the creature reacting rather than a sprite swap.
 */

import { darken, mix } from '../../assets/shared/color';
import { clamp } from '../../assets/shared/shapes';
import type { PetRig } from '../../assets/pets/anatomy/PetRig';
import { createRng } from '../../assets/shared/shapes';
import type { FaceParams } from './Expression';
import { restingFace } from './Expression';

export interface GazeTarget {
  /** -1 .. 1 across the face. */
  x: number;
  y: number;
}

export class FaceDriver {
  /** Where the face currently is. Eased toward `target` every frame. */
  current: FaceParams;

  private rig: PetRig;
  private rng: () => number;

  private blinkCooldown: number;
  private blinkRemaining = 0;
  private blinkQueued = 0;

  constructor(rig: PetRig) {
    this.rig = rig;
    this.current = restingFace(rig.appearance.restingMood);
    this.rng = createRng(rig.appearance.seed ^ 0x5eed);
    this.blinkCooldown = 1.5 + this.rng() * 4;
  }

  /** Re-bind after the creature is rebuilt, keeping the current feelings. */
  setRig(rig: PetRig): void {
    this.rig = rig;
  }

  /**
   * @param target   where the face wants to be
   * @param response 0..1 — how fast it gets there. Fear snaps, contentment drifts.
   */
  update(dt: number, target: FaceParams, gaze: GazeTarget | null, response = 0.5): void {
    const rate = 1 - Math.exp(-(4 + response * 18) * dt);

    this.current = {
      mouthCurve: approach(this.current.mouthCurve, target.mouthCurve, rate),
      mouthOpen: approach(this.current.mouthOpen, target.mouthOpen, rate),
      mouthWidth: approach(this.current.mouthWidth, target.mouthWidth, rate),
      eyeOpen: approach(this.current.eyeOpen, target.eyeOpen, rate),
      eyeSquint: approach(this.current.eyeSquint, target.eyeSquint, rate),
      eyeWide: approach(this.current.eyeWide, target.eyeWide, rate),
      browInner: approach(this.current.browInner, target.browInner, rate),
      browRaise: approach(this.current.browRaise, target.browRaise, rate),
      blush: approach(this.current.blush, target.blush, rate),
      pupil: approach(this.current.pupil, target.pupil, rate),
    };

    this.advanceBlink(dt);
    this.apply(gaze);
  }

  /**
   * Blinks come in a natural rhythm, with the occasional double.
   *
   * Suppressed when the eyes are already mostly shut: a creature asleep or
   * squinting hard has nothing left to blink with.
   */
  private advanceBlink(dt: number): void {
    if (this.current.eyeOpen < 0.25) {
      this.blinkRemaining = 0;
      return;
    }

    if (this.blinkRemaining > 0) {
      this.blinkRemaining -= dt;
      if (this.blinkRemaining <= 0 && this.blinkQueued > 0) {
        this.blinkQueued -= 1;
        this.blinkRemaining = 0.16;
      }
      return;
    }

    this.blinkCooldown -= dt;
    if (this.blinkCooldown <= 0) {
      this.blinkRemaining = 0.16;
      this.blinkCooldown = 1.8 + this.rng() * 5;
      this.blinkQueued = this.rng() < 0.2 ? 1 : 0;
    }
  }

  private blinkClosure(): number {
    if (this.blinkRemaining <= 0) return 0;
    const progress = 1 - this.blinkRemaining / 0.16;
    // Down fast, up slightly slower.
    const coverage = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
    return clamp(coverage, 0, 1);
  }

  /** Write the current numbers onto the rig's face. */
  private apply(gaze: GazeTarget | null): void {
    const { face, proportions, appearance } = this.rig;
    const params = this.current;

    const closure = clamp(Math.max(1 - params.eyeOpen, this.blinkClosure()), 0, 1);

    // The two lids are not allowed to meet in the middle. Left alone they
    // leave a thin dark sliver that reads as a bow tie rather than as an eye,
    // so the squint yields to whatever the upper lid is already doing.
    const squint = clamp(params.eyeSquint, 0, Math.max(0, 1 - closure * 1.6));

    for (const eye of [face.eyeLeft, face.eyeRight]) {
      eye.lid.scale.y = closure;
      eye.lowerLid.scale.y = squint;

      eye.root.scale.set(clamp(params.eyeWide, 0.5, 1.6));
      eye.pupil.scale.set(clamp(params.pupil, 0.6, 1.5));

      if (gaze) {
        eye.pupil.position.set(
          clamp(gaze.x, -1, 1) * eye.radiusX * 0.3,
          clamp(gaze.y, -1, 1) * eye.radiusY * 0.26,
        );
      } else {
        eye.pupil.position.set(0, 0);
      }
    }

    // Brows: the inner end drops for anger and lifts for worry, and both rise
    // together for surprise. Mirrored, so "inner" means inner on both sides.
    const browAngle = params.browInner * 0.5;
    const browLift = params.browRaise * proportions.browWidth * 0.24;

    face.browLeft.rotation = browAngle;
    face.browRight.rotation = -browAngle;
    face.browLeft.y = proportions.browLeftAnchor.y - browLift;
    face.browRight.y = proportions.browRightAnchor.y - browLift;

    face.cheeks.alpha = clamp(appearance.blush * 0.5 * params.blush, 0, 0.85);

    face.mouth.apply({
      curve: params.mouthCurve,
      open: params.mouthOpen,
      width: proportions.mouthWidth * params.mouthWidth,
      weight: proportions.mouthWeight,
      fangs: appearance.fangs,
      color: darken(appearance.primaryColor, 0.62),
      tongue: mix(appearance.accentColor, 0xff6b8a, 0.4),
    });
  }
}

function approach(from: number, to: number, rate: number): number {
  return from + (to - from) * rate;
}
