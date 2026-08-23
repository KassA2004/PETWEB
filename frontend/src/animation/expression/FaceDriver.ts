/**
 * FaceDriver — turns expression numbers into a face.
 *
 * It owns everything above the mouth line: lids, brows, pupils, blush, and the
 * mouth redraw. It also owns blinking, because a blink is a lid movement that
 * has to cooperate with whatever the current expression is doing to the same
 * lid — a sleeping creature must not blink its eyes open.
 *
 * Every value written here is an **offset from the creature's design**, never a
 * replacement for it:
 *
 *   lids     start from the eye preset's own resting coverage, so a Sleepy eye
 *            is still half shut when the creature is delighted
 *   pupils   move within the range that eye published, so they cannot escape
 *   brows    rotate around the rest angle the brow type chose, so Angular brows
 *            stay crosser than Worried ones at the same `browInner`
 *   mouth    is handed a curve, not a shape; the design decides what that does
 *
 * The driver eases toward its target rather than snapping, so an emotion
 * arriving looks like the creature reacting rather than a sprite swap.
 */

import { clamp } from '../../assets/shared/shapes';
import { createRng } from '../../assets/shared/shapes';
import { mouthColors } from '../../assets/pets/parts/Face';
import type { PetRig } from '../../assets/pets/anatomy/PetRig';
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
      mouthTwist: approach(this.current.mouthTwist, target.mouthTwist, rate),
      eyeOpen: approach(this.current.eyeOpen, target.eyeOpen, rate),
      eyeSquint: approach(this.current.eyeSquint, target.eyeSquint, rate),
      eyeWide: approach(this.current.eyeWide, target.eyeWide, rate),
      eyeTilt: approach(this.current.eyeTilt, target.eyeTilt, rate),
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
    const { face, joints, proportions, appearance } = this.rig;
    const params = this.current;

    for (const side of ['left', 'right'] as const) {
      const eye = side === 'left' ? face.eyeLeft : face.eyeRight;
      const joint = side === 'left' ? joints.eyeLeft : joints.eyeRight;
      const mirror = side === 'left' ? -1 : 1;

      // Widening the eyes lifts the design's resting lid out of the way, so a
      // Sleepy-eyed creature can still look startled without losing its droop.
      const restLid = eye.lidRest * clamp(2 - params.eyeWide, 0, 1);
      const expressionLid = restLid + (1 - clamp(params.eyeOpen, 0, 1)) * (1 - restLid);
      const closure = clamp(Math.max(expressionLid, this.blinkClosure()), 0, 1);

      // The lower lid joins in only over the last stretch of a close, and then
      // rises to meet the upper one. Without it a fully shut eye shows a slice
      // of sclera under the lid; with it the two meet on the closed-eye line.
      const meeting = Math.max(0, (closure - 0.6) / 0.4);
      const squint = clamp(Math.max(eye.lowerRest, params.eyeSquint, meeting), 0, 1);

      eye.lid.scale.y = closure;
      eye.lowerLid.scale.y = squint;

      eye.root.scale.set(clamp(params.eyeWide, 0.5, 1.6));
      eye.root.rotation = joint.rest.rotation + mirror * params.eyeTilt;

      eye.pupil.scale.set(clamp(proportions.pupilScale * params.pupil, 0.25, 2.2));

      // Gaze moves the pupil within the range its own eye shape allows, so it
      // can never leave the eye however hard the creature stares.
      if (gaze) {
        eye.pupil.position.set(
          eye.pupilRest.x + clamp(gaze.x, -1, 1) * eye.pupilRange.x,
          eye.pupilRest.y + clamp(gaze.y, -1, 1) * eye.pupilRange.y,
        );
      } else {
        eye.pupil.position.set(eye.pupilRest.x, eye.pupilRest.y);
      }
    }

    // Brows: the inner end drops for anger and lifts for worry, and both rise
    // together for surprise. Added to the brow type's own rest angle, so a
    // design that is already cross stays crosser.
    const browAngle = params.browInner * 0.5;
    const browLift = params.browRaise * proportions.browWidth * 0.24;

    face.browLeft.rotation = joints.browLeft.rest.rotation + browAngle;
    face.browRight.rotation = joints.browRight.rest.rotation - browAngle;
    face.browLeft.y = proportions.browLeftAnchor.y - browLift;
    face.browRight.y = proportions.browRightAnchor.y - browLift;

    face.cheeks.alpha = clamp(
      appearance.blush * face.cheekStrength * 0.6 * params.blush,
      0,
      0.92,
    );

    const colors = mouthColors(appearance);

    face.mouth.apply({
      type: appearance.mouthType,
      teeth: appearance.teethType,
      curve: params.mouthCurve,
      open: params.mouthOpen,
      twist: params.mouthTwist,
      width: proportions.mouthWidth * params.mouthWidth,
      weight: proportions.mouthWeight,
      fangs: appearance.fangs,
      color: colors.color,
      tongue: colors.tongue,
      seed: appearance.seed,
    });
  }
}

function approach(from: number, to: number, rate: number): number {
  return from + (to - from) * rate;
}
