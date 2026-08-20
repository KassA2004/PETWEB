import { HttpException, HttpStatus, ValidationError } from '@nestjs/common';

export interface ValidationDetail {
  path: string;
  message: string;
}

/**
 * Thrown by the global ValidationPipe's exceptionFactory so body/query
 * validation failures come back as 422 with per-field details, matching
 * 00-conventions.md §5 and §8 exactly (Nest's built-in pipe otherwise throws a
 * plain 400).
 */
export class ValidationFailedException extends HttpException {
  constructor(public readonly details: ValidationDetail[]) {
    super('Validation failed', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export function toValidationDetails(errors: ValidationError[], parentPath = ''): ValidationDetail[] {
  const details: ValidationDetail[] = [];

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        details.push({ path, message });
      }
    }

    if (error.children?.length) {
      details.push(...toValidationDetails(error.children, path));
    }
  }

  return details;
}
