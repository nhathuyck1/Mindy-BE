import { HttpStatus } from '@nestjs/common';

import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class InvalidCredentialsException extends AppHttpException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
}

export class InvalidRefreshTokenException extends AppHttpException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN', 'The refresh session is invalid');
  }
}

export class AuthenticationRequiredException extends AppHttpException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
  }
}

export class InsufficientRoleException extends AppHttpException {
  constructor() {
    super(HttpStatus.FORBIDDEN, 'INSUFFICIENT_ROLE', 'You do not have permission for this action');
  }
}
