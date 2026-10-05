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

export class InvalidEmailVerificationTokenException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'INVALID_EMAIL_VERIFICATION_TOKEN',
      'The email verification link is invalid or expired',
    );
  }
}

export class InvalidRegistrationIntentException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'INVALID_REGISTRATION_INTENT',
      'The registration session is invalid or expired',
    );
  }
}

export class GoogleAuthenticationFailedException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'GOOGLE_AUTHENTICATION_FAILED',
      'Google authentication could not be completed',
    );
  }
}

export { MailDeliveryUnavailableException } from '../../../shared/mail/mail.exception.js';
