import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { defaultCodeForStatus } from './error-codes';
import { ValidationFailedException } from './validation.exception';

/**
 * Single global exception filter, producing the envelope from
 * 00-conventions.md §8:
 *
 *   { error: { code, message, details, requestId } }
 *
 * Note: this only covers `/api/v1/*` and `/health` — Better Auth's routes are
 * mounted directly on Express (see main.ts) and never reach Nest's pipeline,
 * so they respond with Better Auth's own error shape instead. That is a
 * deliberate, documented gap (01-auth-endpoints.md keeps Better Auth's route
 * table separate from ours), not an oversight.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = randomUUID();

    if (exception instanceof ValidationFailedException) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: exception.message,
          details: exception.details,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);

      response.status(status).json({
        error: {
          code: defaultCodeForStatus(status),
          message: Array.isArray(message) ? message.join('; ') : message,
          requestId,
        },
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    });
  }
}
