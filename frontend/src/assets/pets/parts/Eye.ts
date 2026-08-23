/**
 * Eye — one renderer for every preset in ../customization/EyeTypes.
 *
 * The whole eye lives inside a container masked by its own outline. That single
 * decision solves the pupil problem permanently: a pupil cannot leave an eye it
 * is drawn inside of, whatever the gaze system asks for, and a lid sliding down
 * automatically takes the shape of whichever eye it is closing.
 *
 *   root                 the joint. Expression scales this.
 *   └── clipped          masked to the outline
 *       ├── sclera       white, or the dark of a solid eye
 *       ├── pupil        iris, pupil, glints — this is what moves
 *       ├── lowerLid     rises for a squint
 *       └── lid          descends for a blink
 *   └── rim / lashes     drawn over the top, outside the clip
 *
 * `pupilRange` is published so the gaze system can move the pupil in the eye's
 * own units instead of guessing from a radius.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, luminance, mix } from '../../shared/color';
import { clamp } from '../../shared/shapes';
import { drawSmoothClosed } from '../../shared/geometry';
import { eyeSideVariation, getEyeShape } from '../customization/EyeTypes';
import type { EyeShape } from '../customization/EyeTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import type { PetProportions } from '../anatomy/proportions';
import { eyeOutlinePoints, eyeOutlineTension, pupilTravel } from './EyeShapes';

export interface EyeView {
  root: Container;
  /** The moving part: iris, pupil and glints. */
  pupil: Container;
  /** Upper lid. scale.y 0 = open, 1 = shut. */
  lid: Container;
  /** Lower lid. scale.y 0 = down, 1 = raised. */
  lowerLid: Container;
  /** Eye half-size, in pixels. */
  radiusX: number;
  radiusY: number;
  /** How far the pupil may travel from its rest position, in pixels. */
  pupilRange: { x: number; y: number };
  /** Where the pupil sits when the creature is not looking anywhere. */
  pupilRest: { x: number; y: number };
  /** The preset's resting lid coverage, so the driver can start from it. */
  lidRest: number;
  lowerRest: number;
}

/* -------------------------------------------------------------------------- */
/* Pupil                                                                      */
/* -------------------------------------------------------------------------- */

function drawPupilShape(
  g: Graphics,
  shape: EyeShape,
  radius: number,
): void {
  switch (shape.pupilShape) {
    case 'vertical':
      g.ellipse(0, 0, radius * 0.42, radius * 1.35);
      break;
    case 'slit':
      g.ellipse(0, 0, radius * 1.3, radius * 0.3);
      break;
    case 'square':
      g.rect(-radius * 0.85, -radius * 0.85, radius * 1.7, radius * 1.7);
      break;
    case 'round':
    default:
      g.circle(0, 0, radius);
      break;
  }
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

export function createEye(
  side: 'left' | 'right',
  proportions: PetProportions,
  appearance: PetAppearance,
): EyeView {
  const shape = getEyeShape(appearance.eyeType);
  const variation = eyeSideVariation(shape, side);
  const mirror = side === 'left' ? -1 : 1;

  const rx = (proportions.eyeWidth / 2) * variation.scale;
  const ry = (proportions.eyeHeight / 2) * variation.scale;

  const root = new Container();
  root.label = `eye-${side}`;
  root.rotation = mirror * (shape.tilt + variation.tilt);

  const outline = eyeOutlinePoints(shape.outline, rx, ry, mirror);
  const tension = eyeOutlineTension(shape.outline);

  // --- Backing --------------------------------------------------------------
  // A dark eye on a dark creature is not an eye, it is a hole. Solid-dark eyes
  // on a dark coat get a light disc behind them to cut them out of the mass.
  if (shape.sclera < 0.5 && luminance(appearance.primaryColor) < 0.42) {
    const backing = new Graphics();
    drawSmoothClosed(
      backing,
      outline.map((p) => ({ x: p.x * 1.22, y: p.y * 1.22 })),
      tension,
    );
    backing.fill({ color: mix(0xfff6e8, appearance.primaryColor, 0.18) });
    root.addChild(backing);
  }

  // --- The clip -------------------------------------------------------------
  const mask = new Graphics();
  drawSmoothClosed(mask, outline, tension);
  mask.fill({ color: 0xffffff });
  root.addChild(mask);

  const clipped = new Container();
  clipped.label = `eyeball-${side}`;
  clipped.mask = mask;
  root.addChild(clipped);

  // --- Sclera ---------------------------------------------------------------
  const darkTone = mix(0x3a2a2e, appearance.eyeColor, 0.18);
  const scleraColor = mix(darkTone, 0xfffaf2, shape.sclera);

  const sclera = new Graphics();
  drawSmoothClosed(sclera, outline, tension);
  sclera.fill({ color: scleraColor });
  clipped.addChild(sclera);

  // A whited eye gets one flat shade shape under its upper lid, which is what
  // stops it from reading as a hole punched in the face.
  if (shape.sclera > 0.5) {
    const socket = new Graphics();
    drawSmoothClosed(
      socket,
      outline.map((p) => ({ x: p.x, y: p.y - ry * 0.62 })),
      tension,
    );
    socket.fill({ color: darken(appearance.primaryColor, 0.14), alpha: 0.22 });
    clipped.addChild(socket);
  }

  // --- Pupil ----------------------------------------------------------------
  const pupil = new Container();
  pupil.label = `pupil-${side}`;
  clipped.addChild(pupil);

  // A solid eye's "pupil" is the whole eye; a white eye's is a disc in it.
  const pupilRadius =
    shape.sclera > 0.5
      ? Math.min(rx, ry) * shape.pupilScale * 1.35
      : Math.min(rx, ry) * shape.pupilScale;

  if (shape.pupilScale > 0) {
    if (shape.iris > 0) {
      const iris = new Graphics();
      const irisRadius =
        shape.sclera > 0.5 ? pupilRadius * (1 + shape.iris * 0.7) : pupilRadius * shape.iris;

      if (shape.sclera > 0.5) {
        iris.circle(0, 0, irisRadius);
        iris.fill({ color: appearance.eyeColor });
      } else {
        // On a solid eye the iris is a bright ring inside the dark, not around it.
        iris.circle(0, ry * 0.08, irisRadius);
        iris.fill({ color: mix(appearance.eyeColor, 0xffffff, 0.15) });
      }

      pupil.addChild(iris);
    }

    const core = new Graphics();
    if (shape.sclera > 0.5) {
      drawPupilShape(core, shape, pupilRadius);
      core.fill({ color: darkTone });
    } else {
      drawSmoothClosed(
        core,
        outline.map((p) => ({ x: p.x * shape.pupilScale, y: p.y * shape.pupilScale })),
        tension,
      );
      core.fill({ color: darkTone });
    }
    pupil.addChild(core);

    // --- Glints -------------------------------------------------------------
    if (shape.glints > 0) {
      const glint = new Graphics();
      const r = pupilRadius;

      glint.circle(-r * 0.34, -r * 0.36, r * 0.34);
      if (shape.glints > 1) glint.circle(r * 0.34, r * 0.3, r * 0.17);
      if (shape.glints > 2) glint.circle(r * 0.1, -r * 0.62, r * 0.1);

      glint.fill({ color: 0xffffff, alpha: 0.92 });
      pupil.addChild(glint);
    }
  }

  const range = pupilTravel(shape.outline, rx, ry, pupilRadius, shape.mobility);
  const pupilRest = {
    x: (shape.pupilX + variation.pupilX) * mirror * range.x,
    y: (shape.pupilY + variation.pupilY) * ry * 0.5,
  };
  pupil.position.set(pupilRest.x, pupilRest.y);

  // --- Lids -----------------------------------------------------------------
  // Both lids are coat-coloured slabs clipped to the eye's outline, so closing
  // one takes the shape of whichever eye it belongs to.
  //
  // The upper lid's height is chosen so that a full close leaves its edge a
  // little below the eye's centre rather than past its bottom rim. That is what
  // gives a shut eye a visible closed-eye line; the lower lid rises to meet it
  // (see FaceDriver), so nothing shows through underneath.
  const lidColor = darken(appearance.primaryColor, 0.06);
  const LID_TRAVEL = 1.5;

  const lowerLid = new Container();
  lowerLid.label = `lower-lid-${side}`;
  lowerLid.position.set(0, ry * 1.02);
  lowerLid.scale.y = 0;
  const lowerArt = new Graphics();
  lowerArt.rect(-rx * 1.6, -ry * 1.3, rx * 3.2, ry * 1.3);
  lowerArt.fill({ color: lidColor });
  lowerLid.addChild(lowerArt);
  clipped.addChild(lowerLid);

  const lid = new Container();
  lid.label = `lid-${side}`;
  lid.position.set(0, -ry * 1.02);
  const lidArt = new Graphics();
  lidArt.rect(-rx * 1.6, 0, rx * 3.2, ry * LID_TRAVEL);
  lidArt.fill({ color: lidColor });
  lid.addChild(lidArt);

  // A line riding the lid's lower edge, so a shut eye reads as shut rather than
  // as a patch of coat where an eye used to be. Every eye gets one — without it
  // a sleeping creature has no face at all — and lashed designs get a heavy one.
  const lash = new Graphics();
  const lashWeight = Math.max(0.45, shape.lashes);
  lash.moveTo(-rx * 1.02, ry * LID_TRAVEL);
  lash.quadraticCurveTo(0, ry * (LID_TRAVEL + 0.16), rx * 1.02, ry * LID_TRAVEL);
  lash.stroke({
    color: darken(appearance.primaryColor, 0.5),
    width: Math.max(2, rx * 0.16 * lashWeight),
    cap: 'round',
  });
  lid.addChild(lash);

  const restLid = clamp(shape.lidRest + variation.lid, 0, 1);
  lid.scale.y = restLid;
  lowerLid.scale.y = shape.lowerRest;
  clipped.addChild(lid);

  // --- Rim, over the clip ---------------------------------------------------
  if (shape.rim > 0) {
    const rim = new Graphics();
    drawSmoothClosed(rim, outline, tension);
    rim.stroke({
      color: darken(appearance.primaryColor, 0.55),
      width: Math.max(1.5, rx * 0.1 * shape.rim),
      alpha: 0.5 + shape.rim * 0.45,
      alignment: 0.5,
    });
    root.addChild(rim);
  }

  // A soft lift under the eye, so it sits in the face instead of on it.
  const seat = new Graphics();
  drawSmoothClosed(
    seat,
    outline.map((p) => ({ x: p.x * 1.06, y: p.y * 1.06 + ry * 0.12 })),
    tension,
  );
  seat.stroke({
    color: lighten(appearance.primaryColor, 0.3),
    width: Math.max(1, rx * 0.06),
    alpha: 0.18,
    alignment: 0,
  });
  root.addChildAt(seat, 0);

  return {
    root,
    pupil,
    lid,
    lowerLid,
    radiusX: rx,
    radiusY: ry,
    pupilRange: range,
    pupilRest,
    lidRest: restLid,
    lowerRest: shape.lowerRest,
  };
}
