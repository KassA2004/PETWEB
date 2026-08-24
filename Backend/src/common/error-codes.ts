/** Stable machine-readable codes, per 00-conventions.md §8. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  /** The user already has as many open goals as they are allowed. */
  GOAL_LIMIT_REACHED: 'GOAL_LIMIT_REACHED',
  /** A focus session is already running, and there is only one Focus slot. */
  FOCUS_IN_PROGRESS: 'FOCUS_IN_PROGRESS',
  /**
   * The committed time has not actually elapsed yet.
   *
   * Distinct from a plain CONFLICT because it is not really a refusal: the
   * client's countdown ran fast, and the answer carries the true remaining
   * seconds so it can resynchronise and keep waiting rather than show an error.
   */
  FOCUS_NOT_FINISHED: 'FOCUS_NOT_FINISHED',
  /** An upload cannot be deleted because a memory still points at it. */
  FILE_IN_USE: 'FILE_IN_USE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Maps an HTTP status to its default code when a handler didn't pick one explicitly. */
export function defaultCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.BAD_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 413:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case 415:
      return ErrorCode.UNSUPPORTED_MEDIA_TYPE;
    case 422:
      return ErrorCode.VALIDATION_FAILED;
    case 429:
      return ErrorCode.TOO_MANY_REQUESTS;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}
