/**
 * The physics layer's public face.
 *
 * Everything the room needs, and nothing about how it works. If a file outside
 * `simulation/physics` reaches past this barrel, that is a sign the boundary
 * has slipped.
 */

export { PhysicsWorld } from './PhysicsWorld';
export type { PhysicsWorldOptions, Obstruction } from './PhysicsWorld';

export {
  addVelocity,
  bodyRadius,
  createBody,
  placeBody,
  setVelocity,
  sleep,
  wake,
} from './Body';
export type { BodyOptions } from './Body';

export { CharacterController } from './CharacterController';
export type { CharacterOptions } from './CharacterController';

export { Environment } from './Environment';
export type { RoomBounds, WallHit } from './Environment';

export { Manipulator, MAX_THROW_SPEED, clearanceOf, overFootprint } from './Manipulator';

export {
  clampToFootprint,
  footprintContains,
  footprintRadius,
  halfX,
  halfZ,
  topOf,
} from './Collider';

export { FIXED_STEP, DEFAULT_GRAVITY } from './constants';
export { clamp, lerp, approach, damp, horizontalSpeed, speedOf } from './math';

export type {
  BodyType,
  BoxCollider,
  Collider,
  Contact,
  CylinderCollider,
  GroundImpact,
  Impact,
  PhysicsBody,
  Solidity,
  StepResult,
  SupportRef,
  SurfaceKind,
  SurfaceSpec,
  Vec3,
  WallImpact,
} from './types';
