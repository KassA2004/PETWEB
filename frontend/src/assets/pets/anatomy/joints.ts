/**
 * Joints — the transform layer the animation system talks to.
 *
 * Animation never touches artwork. It reads and writes joints, which is why the
 * same Hop works on a bunny, a bee and whatever the randomizer just produced
 * (/Docs/pet-anatomy.md §14).
 *
 * There are no arm or leg joints. Feet are drawn into the body silhouette, so
 * the only things that move independently are the parts that should: the face,
 * and the appendages hanging off the mass. That is what lets the animation
 * layer express movement by swinging ears and leaning the body rather than by
 * squashing the creature flat.
 *
 * Each joint remembers its rest transform. Every frame the controller resets
 * joints to rest, then layers add offsets on top, so breathing, a spring and a
 * pose can all write to the same joint without fighting.
 */

import { Container } from 'pixi.js';

/**
 * Ear rotation convention.
 *
 * Rotation is clockwise on screen, and the two ears sit on opposite sides of
 * the head, so the same number means opposite things to them:
 *
 *   earLeft negative, earRight positive  ->  splayed outward (relaxed, scared,
 *                                            asleep, flattened in anger)
 *   earLeft positive, earRight negative  ->  brought together and upright
 *                                            (alert, listening, curious)
 *
 * Getting this backwards makes the ears cross over the creature's face, which
 * is the single easiest way to make a pose look wrong.
 */
export const JOINT_NAMES = [
  'root',
  'body',
  'face',
  'eyeLeft',
  'eyeRight',
  'browLeft',
  'browRight',
  'mouth',
  'earLeft',
  'earRight',
  'wingLeft',
  'wingRight',
  'tail',
  'topper',
  'accessoryHead',
  'accessoryFace',
  'accessoryNeck',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

/** The appendages the secondary-motion layer runs springs on. */
export const SPRING_JOINTS = [
  'earLeft',
  'earRight',
  'wingLeft',
  'wingRight',
  'tail',
  'topper',
  'accessoryHead',
] as const satisfies readonly JointName[];

export type SpringJointName = (typeof SPRING_JOINTS)[number];

export interface JointTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface Joint {
  name: JointName;
  container: Container;
  rest: JointTransform;
}

export interface JointOffset {
  x?: number;
  y?: number;
  rotation?: number;
  /** Multiplicative — 1 leaves the rest scale untouched. */
  scaleX?: number;
  scaleY?: number;
}

/**
 * Create a joint container positioned at its rest transform.
 *
 * The container's pivot stays at its origin, so rotating a joint rotates
 * everything below it — an ear about its base, a wing about its shoulder, the
 * whole creature about the point between its feet.
 */
export function createJoint(
  name: JointName,
  x = 0,
  y = 0,
  rotation = 0,
): Joint {
  const container = new Container();
  container.label = name;
  container.position.set(x, y);
  container.rotation = rotation;

  return {
    name,
    container,
    rest: { x, y, rotation, scaleX: 1, scaleY: 1 },
  };
}

/**
 * Wrap an existing container as a joint, capturing its current transform as
 * rest. Used for parts that position themselves (eyes, brows, mouth).
 */
export function jointFromContainer(name: JointName, container: Container): Joint {
  return {
    name,
    container,
    rest: {
      x: container.x,
      y: container.y,
      rotation: container.rotation,
      scaleX: container.scale.x,
      scaleY: container.scale.y,
    },
  };
}

/** Snap a joint back to its rest transform. Called once per frame per joint. */
export function resetJoint(joint: Joint): void {
  joint.container.position.set(joint.rest.x, joint.rest.y);
  joint.container.rotation = joint.rest.rotation;
  joint.container.scale.set(joint.rest.scaleX, joint.rest.scaleY);
}

/** Add an offset on top of whatever is already applied this frame. */
export function offsetJoint(joint: Joint, offset: JointOffset): void {
  const { container } = joint;

  if (offset.x) container.x += offset.x;
  if (offset.y) container.y += offset.y;
  if (offset.rotation) container.rotation += offset.rotation;
  if (offset.scaleX !== undefined) container.scale.x *= offset.scaleX;
  if (offset.scaleY !== undefined) container.scale.y *= offset.scaleY;
}

/** Rebase a joint's rest transform — used when a pose settles. */
export function setJointRest(joint: Joint, rest: Partial<JointTransform>): void {
  joint.rest = { ...joint.rest, ...rest };
}

export type JointMap = Record<JointName, Joint>;
