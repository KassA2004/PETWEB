/**
 * Joints — the transform layer the animation system talks to.
 *
 * Animation never touches artwork. It reads and writes joints, which is why the
 * same Idle or Walk works on any creature no matter how it is customized
 * (/Docs/pet-anatomy.md section 14).
 *
 * Each joint remembers its rest transform. Every frame the controller resets
 * joints to rest and then lets motion modules add offsets on top, so several
 * modules (breathing + wobble + a state pose) can layer without fighting
 * each other.
 */

import { Container } from 'pixi.js';

export const JOINT_NAMES = [
  'root',
  'body',
  'face',
  'eyeLeft',
  'eyeRight',
  'mouth',
  'armLeft',
  'armRight',
  'footLeft',
  'footRight',
  'topper',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

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
 * everything attached below it — an arm rotates about its shoulder, the topper
 * about its base, the whole face about the middle of the blob.
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
 * rest. Used for parts that already position themselves (eyes, mouth).
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

/** Rebase a joint's rest transform — used when a pose state settles. */
export function setJointRest(joint: Joint, rest: Partial<JointTransform>): void {
  joint.rest = { ...joint.rest, ...rest };
}

export type JointMap = Record<JointName, Joint>;
