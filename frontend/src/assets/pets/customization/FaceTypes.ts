/**
 * FaceTypes — the face's parts, gathered in one import.
 *
 * Each feature owns its own file now, because each one grew into a real
 * library: eyes alone are twenty presets with their own geometry vocabulary,
 * and mouths carry the character-versus-expression contract. Cramming them back
 * together would put four unrelated systems in one file.
 *
 * This barrel exists so callers that want "the face" can say so in one line.
 */

export {
  BROW_TYPES,
  BROW_TYPE_KEYS,
  browSideVariation,
  getBrowShape,
} from './BrowTypes';
export type { BrowKind, BrowShape, BrowType } from './BrowTypes';

export {
  CHEEK_TYPES,
  CHEEK_TYPE_KEYS,
  getCheekShape,
} from './CheekTypes';
export type { CheekKind, CheekShape, CheekType } from './CheekTypes';

export {
  EYE_TYPES,
  EYE_TYPE_KEYS,
  eyeSideVariation,
  getEyeShape,
} from './EyeTypes';
export type { EyeOutline, EyeShape, EyeType, PupilShape } from './EyeTypes';

export {
  MOUTH_TYPES,
  MOUTH_TYPE_KEYS,
  getMouthShape,
  resolveMouthCurve,
} from './MouthTypes';
export type {
  MouthGeometryParams,
  MouthKind,
  MouthShape,
  MouthType,
} from './MouthTypes';

export {
  SNOUT_TYPES,
  SNOUT_TYPE_KEYS,
  getSnoutShape,
} from './SnoutTypes';
export type { SnoutShape, SnoutType } from './SnoutTypes';

export {
  TEETH_TYPES,
  TEETH_TYPE_KEYS,
  getTeethShape,
} from './TeethTypes';
export type { TeethShape, TeethType } from './TeethTypes';
