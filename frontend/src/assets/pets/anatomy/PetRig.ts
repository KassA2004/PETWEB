/**
 * PetRig — the standardized creature skeleton.
 *
 * One rig, any creature (/Docs/pet-anatomy.md §3-6). Bunny ears, bee wings, a
 * pig snout and a gremlin's horns all hang off exactly these joints, which is
 * why one Hop animation drives every combination the randomizer can produce.
 *
 * There are no arms and no leg joints — feet are drawn into the body
 * silhouette. Everything that moves independently is either the face or an
 * appendage, and every appendage is spring-driven, so the animation layer never
 * has to squash the body to show that something happened.
 *
 * Layer order (back to front):
 *
 *   root
 *   └── body
 *       ├── wings                    behind the mass
 *       ├── tail                     behind the mass
 *       ├── ears (if the type hangs behind)
 *       ├── topper
 *       ├── body art                 the silhouette, with feet fused in
 *       ├── ears (if the type sits in front)
 *       ├── neck accessory
 *       ├── face                     clipped to the silhouette
 *       │   ├── cheeks, snout, eyes, brows, mouth
 *       │   └── face accessory
 *       └── head accessory
 */

import { Container, Graphics } from 'pixi.js';
import { getEarShape, getTailShape, getWingShape } from '../customization/AppendageTypes';
import type { PetAppearance } from '../customization/PetAppearance';
import { getTopperShape } from '../customization/TopperTypes';
import { createAccessory } from '../parts/Accessory';
import { createBody, drawPetSilhouette } from '../parts/Body';
import { createEar } from '../parts/Ear';
import { createFace } from '../parts/Face';
import type { FaceView } from '../parts/Face';
import { createTail } from '../parts/Tail';
import type { TailView } from '../parts/Tail';
import { createTopper } from '../parts/Topper';
import { createWing } from '../parts/Wing';
import { createJoint, jointFromContainer } from './joints';
import type { Joint, JointMap } from './joints';
import { computeProportions } from './proportions';
import type { PetProportions } from './proportions';

/** How much each spring-driven appendage lags and trails. */
export interface AppendageWeights {
  ear: { floppiness: number; weight: number };
  wing: { floppiness: number; flutter: number };
  tail: { floppiness: number; weight: number };
  topper: { floppiness: number };
}

export interface PetRig {
  /** Display root. Position this in the world; it sits on the floor. */
  root: Container;
  joints: JointMap;
  proportions: PetProportions;
  appearance: PetAppearance;
  face: FaceView;
  tail: TailView;
  weights: AppendageWeights;
  destroy(): void;
}

export function createPetRig(appearance: PetAppearance): PetRig {
  const proportions = computeProportions(appearance);

  // --- Root and body --------------------------------------------------------
  const rootJoint = createJoint('root', 0, 0);
  const root = rootJoint.container;

  const bodyJoint = createJoint(
    'body',
    proportions.bodyCenter.x,
    proportions.bodyCenter.y,
  );
  root.addChild(bodyJoint.container);

  const behind = new Container();
  behind.label = 'behind';
  bodyJoint.container.addChild(behind);

  // --- Wings, behind the mass ----------------------------------------------
  const wingLeft = createJoint(
    'wingLeft',
    proportions.wingLeftAnchor.x,
    proportions.wingLeftAnchor.y,
    proportions.wingRestTilt,
  );
  wingLeft.container.addChild(createWing('left', proportions, appearance));
  behind.addChild(wingLeft.container);

  const wingRight = createJoint(
    'wingRight',
    proportions.wingRightAnchor.x,
    proportions.wingRightAnchor.y,
    -proportions.wingRestTilt,
  );
  wingRight.container.addChild(createWing('right', proportions, appearance));
  behind.addChild(wingRight.container);

  // --- Tail, behind the mass ------------------------------------------------
  const tail = createTail(proportions, appearance);
  tail.root.position.set(proportions.tailAnchor.x, proportions.tailAnchor.y);
  behind.addChild(tail.root);
  const tailJoint = jointFromContainer('tail', tail.root);

  // --- Ears -----------------------------------------------------------------
  // Some ear types read better tucked behind the head (round, floppy, fins),
  // others in front of it. The type says which.
  const earLeft = createJoint(
    'earLeft',
    proportions.earLeftAnchor.x,
    proportions.earLeftAnchor.y,
    -proportions.earRestTilt,
  );
  earLeft.container.addChild(createEar('left', proportions, appearance));

  const earRight = createJoint(
    'earRight',
    proportions.earRightAnchor.x,
    proportions.earRightAnchor.y,
    proportions.earRestTilt,
  );
  earRight.container.addChild(createEar('right', proportions, appearance));

  if (proportions.earBehind) {
    behind.addChild(earLeft.container, earRight.container);
  }

  // --- Topper, behind the mass ----------------------------------------------
  const topperJoint = createJoint(
    'topper',
    proportions.topperAnchor.x,
    proportions.topperAnchor.y,
  );
  topperJoint.container.addChild(createTopper(proportions, appearance));
  behind.addChild(topperJoint.container);

  // --- The mass itself ------------------------------------------------------
  bodyJoint.container.addChild(createBody(proportions, appearance));

  if (!proportions.earBehind) {
    bodyJoint.container.addChild(earLeft.container, earRight.container);
  }

  // --- Neck accessory, lying on the mass ------------------------------------
  const accessoryNeck = createJoint(
    'accessoryNeck',
    proportions.neckAccessoryAnchor.x,
    proportions.neckAccessoryAnchor.y,
  );
  if (appearance.accessories.neck) {
    accessoryNeck.container.addChild(
      createAccessory(appearance.accessories.neck, proportions.neckAccessoryWidth),
    );
  }
  bodyJoint.container.addChild(accessoryNeck.container);

  // --- Face -----------------------------------------------------------------
  const face = createFace(proportions, appearance);
  bodyJoint.container.addChild(face.root);
  const faceJoint = jointFromContainer('face', face.root);

  // The face is clipped to the body: a wide-set eye on a narrow creature has
  // to slide under the edge of the mass, not float beside it. The mask lives
  // on the body so it stays put while the face slides across it.
  const faceMask = new Graphics();
  drawPetSilhouette(faceMask, proportions, appearance);
  faceMask.fill({ color: 0xffffff });
  bodyJoint.container.addChild(faceMask);
  face.root.mask = faceMask;

  // Eyewear lives inside the face group, so it rides with the eyes and
  // inherits the clip for free.
  const accessoryFace = createJoint(
    'accessoryFace',
    proportions.faceAccessoryAnchor.x,
    proportions.faceAccessoryAnchor.y,
  );
  if (appearance.accessories.face) {
    accessoryFace.container.addChild(
      createAccessory(appearance.accessories.face, proportions.faceAccessoryWidth),
    );
  }
  face.root.addChild(accessoryFace.container);

  // --- Head accessory, over everything --------------------------------------
  const accessoryHead = createJoint(
    'accessoryHead',
    proportions.headAccessoryAnchor.x,
    proportions.headAccessoryAnchor.y,
  );
  if (appearance.accessories.head) {
    accessoryHead.container.addChild(
      createAccessory(appearance.accessories.head, proportions.headAccessoryWidth),
    );
  }
  bodyJoint.container.addChild(accessoryHead.container);

  const joints: JointMap = {
    root: rootJoint,
    body: bodyJoint,
    face: faceJoint,
    eyeLeft: jointFromContainer('eyeLeft', face.eyeLeft.root),
    eyeRight: jointFromContainer('eyeRight', face.eyeRight.root),
    browLeft: jointFromContainer('browLeft', face.browLeft),
    browRight: jointFromContainer('browRight', face.browRight),
    mouth: jointFromContainer('mouth', face.mouth.root),
    earLeft,
    earRight,
    wingLeft,
    wingRight,
    tail: tailJoint,
    topper: topperJoint,
    accessoryHead,
    accessoryFace,
    accessoryNeck,
  };

  const ear = getEarShape(appearance.earType);
  const wing = getWingShape(appearance.wingType);
  const tailShape = getTailShape(appearance.tailType);
  const topper = getTopperShape(appearance.topperType);

  return {
    root,
    joints,
    proportions,
    appearance,
    face,
    tail,
    weights: {
      ear: { floppiness: ear.floppiness, weight: ear.weight },
      wing: { floppiness: wing.floppiness, flutter: wing.flutter },
      tail: { floppiness: tailShape.floppiness, weight: tailShape.weight },
      topper: { floppiness: topper.floppiness },
    },
    destroy() {
      root.destroy({ children: true });
    },
  };
}

/** All joints as a list — convenient for per-frame resets. */
export function jointList(rig: PetRig): Joint[] {
  return Object.values(rig.joints);
}
