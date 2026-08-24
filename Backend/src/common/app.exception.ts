import { HttpException } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

/**
 * An HTTP error that names its own machine-readable code.
 *
 * `HttpExceptionFilter` otherwise derives the code from the status alone
 * (`defaultCodeForStatus`), which is right until two different refusals share a
 * status. The six-goal cap is a 409 and so is a duplicate — a client that wants
 * to say something specific about the first one cannot tell them apart from
 * `CONFLICT`, and matching on the human-readable message is how a copy edit
 * becomes a bug.
 *
 * The message stays the friendly one. The code is for the code.
 */
export class AppException extends HttpException {
  constructor(status: number, code: ErrorCode, message: string) {
    super({ code, message }, status);
  }
}
