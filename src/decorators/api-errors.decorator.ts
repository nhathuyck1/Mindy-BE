import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import { ErrorResponseDto } from '../common/dtos/error-response.dto.js';

const DESCRIPTIONS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.UNAUTHORIZED]: 'Not signed in or the session is no longer valid',
  [HttpStatus.FORBIDDEN]: 'The role or resource ownership does not allow this action',
  [HttpStatus.NOT_FOUND]: 'The resource does not exist or is not public',
  [HttpStatus.CONFLICT]: 'The request conflicts with the current state of the resource',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'The request data is invalid',
};

/** Documents the standard error envelope for the given expected status codes. */
export function ApiErrors(...statuses: HttpStatus[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        type: ErrorResponseDto,
        description: DESCRIPTIONS[status] ?? 'Request failed',
      }),
    ),
  );
}
