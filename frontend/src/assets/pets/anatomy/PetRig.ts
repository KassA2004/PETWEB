/**
 * PetRig — the standardized blob skeleton.
 *
 * This is the heart of the "one rig, many creatures" principle
 * (/Docs/pet-anatomy.md sections 3-6). Every pet, however it is customized,
 * gets exactly this hierarchy and exactly these joints, which is why one Walk
 * animation drives a tall tower blob and a wide pebble blob equally well.
 *
 * The contact shadow is NOT built here — PetRenderer owns a single shadow at
 * the pet root and keeps it in sync with appearance changes.
 *
 * Hierarchy (parent -> child), matching pet-anatomy.md section 4:
 *
 *   root
 *   └── body
 *       ├── feet     (left, right)   drawn behind the mass, peeking out below
 *       ├── arms     (left, right)   drawn behind the mass, peeking out sideways
 *       ├── topper                   drawn behind the mass, rising above it
 *       ├── body art                 the blob silhouette itself
 *       └── face
 *           ├── eyes (left, right)
 *           └── mouth
 *
 * Everything except the face sits behind the body mass on purpose: the blob is
 * one unbroken silhouette with small things poking out of it, which is the
 * whole visual idea (/Docs/pet-anatomy.md section 19).
 */

import { Container, Graphics } from 'pixi.js';
import type { PetAppearance } from '../customization/PetAppearance';
import { getTopperShape } from '../customization/TopperTypes';
import { createBody, drawBodySilhouette } from '../parts/Body';
import { createFace } from '../parts/Face';
import type { FaceView } from '../parts/Face';
import { createArm, createFoot } from '../parts/Limb';
import { createTopper } from '../parts/Topper';
import { createJoint, jointFromContainer } from './joints';
import type { Joint, JointMap } from './joints';
import { computeProportions } from './proportions';
import type { PetProportions } from './proportions';

export interface PetRig {
  /** Display root. Position this in the world; it sits on the floor. */
  root: Container;
  joints: JointMap;
  proportions: PetProportions;
  appearance: PetAppearance;
  /** Sub-parts the animation layer needs beyond plain joints. */
  face: FaceView;
  /** How far the topper lags behind the body, from the topper type. */
  topperFloppiness: number;
  destroy(): void;
}

export function createPetRig(appearance: PetAppearance): PetRig {
  const proportions = computeProportions(appearance);

  // --- Root -----------------------------------------------------------------
  const rootJoint = createJoint('root', 0, 0);
  const root = rootJoint.container;

  // --- Body -----------------------------------------------------------------
  const bodyJoint = createJoint(
    'body',
    proportions.bodyCenter.x,
    proportions.bodyCenter.y,
  );
  root.addChild(bodyJoint.container);

  // --- Feet, behind the mass ------------------------------------------------
  const footLeft = createJoint(
    'footLeft',
    proportions.footLeftAnchor.x,
    proportions.footLeftAnchor.y,
  );
  footLeft.container.addChild(createFoot('left', proportions, appearance));
  bodyJoint.container.addChild(footLeft.container);

  const footRight = createJoint(
    'footRight',
    proportions.footRightAnchor.x,
    proportions.footRightAnchor.y,
  );
  footRight.container.addChild(createFoot('right', proportions, appearance));
  bodyJoint.container.addChild(footRight.container);

  // --- Arms, behind the mass ------------------------------------------------
  // Rest rotation splays them slightly outward, so the nubs read as arms
  // rather than as lumps stuck to the sides.
  const armLeft = createJoint(
    'armLeft',
    proportions.armLeftAnchor.x,
    proportions.armLeftAnchor.y,
    0.35,
  );
  armLeft.container.addChild(createArm('left', proportions, appearance));
  bodyJoint.container.addChild(armLeft.container);

  const armRight = createJoint(
    'armRight',
    proportions.armRightAnchor.x,
    proportions.armRightAnchor.y,
    -0.35,
  );
  armRight.container.addChild(createArm('right', proportions, appearance));
  bodyJoint.container.addChild(armRight.container);

  // --- Topper, behind the mass ----------------------------------------------
  const topperJoint = createJoint(
    'topper',
    proportions.topperAnchor.x,
    proportions.topperAnchor.y,
  );
  topperJoint.container.addChild(createTopper(proportions, appearance));
  bodyJoint.container.addChild(topperJoint.container);

  // --- The mass itself ------------------------------------------------------
  bodyJoint.container.addChild(createBody(proportions, appearance));

  // --- Face, on the front ---------------------------------------------------
  const face = createFace(proportions, appearance);
  bodyJoint.container.addChild(face.root);
  const faceJoint = jointFromContainer('face', face.root);

  // The face is clipped to the body. Without this, wide-set eyes or cheeks on
  // a narrow creature hang off the sides of the mass; with it, they slide
  // under the edge as the face moves, which is what a face painted on a
  // surface does. The mask lives on the body, not the face, so it stays put
  // while the face slides across it.
  const faceMask = new Graphics();
  drawBodySilhouette(faceMask, proportions, appearance);
  faceMask.fill({ color: 0xffffff });
  bodyJoint.container.addChild(faceMask);
  face.root.mask = faceMask;

  const joints: JointMap = {
    root: rootJoint,
    body: bodyJoint,
    face: faceJoint,
    eyeLeft: jointFromContainer('eyeLeft', face.eyeLeft.root),
    eyeRight: jointFromContainer('eyeRight', face.eyeRight.root),
    mouth: jointFromContainer('mouth', face.mouth),
    armLeft,
    armRight,
    footLeft,
    footRight,
    topper: topperJoint,
  };

  return {
    root,
    joints,
    proportions,
    appearance,
    face,
    topperFloppiness: getTopperShape(appearance.topperType).floppiness,
    destroy() {
      root.destroy({ children: true });
    },
  };
}

/** All joints as a list — convenient for per-frame resets. */
export function jointList(rig: PetRig): Joint[] {
  return Object.values(rig.joints);
}
