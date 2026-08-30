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

  // --- The social layer (13-social-endpoints.md) ---------------------------
  /** Somebody already has that username. Distinct from a plain CONFLICT. */
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  /**
   * The friendship cannot be in the state that was asked for.
   *
   * Covers adding yourself, adding somebody you are already friends with, and
   * accepting a request that is not yours to accept. One code rather than
   * three, because the client's response to all of them is the same — show the
   * message and re-read the relationship — and the message says which it was.
   */
  FRIENDSHIP_INVALID: 'FRIENDSHIP_INVALID',
  /** The park is full. Counted under a row lock, never by the client. */
  PARK_FULL: 'PARK_FULL',
  /** Wrong or missing passcode for a private park. */
  PARK_PASSCODE_REQUIRED: 'PARK_PASSCODE_REQUIRED',
  /** The park stopped existing — everybody left while this request was in flight. */
  PARK_CLOSED: 'PARK_CLOSED',
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
