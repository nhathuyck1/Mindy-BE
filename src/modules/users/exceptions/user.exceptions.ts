import { HttpStatus } from '@nestjs/common';

import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class UserEmailAlreadyExistsException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'USER_EMAIL_ALREADY_EXISTS', 'The email is already in use');
  }
}

export class UserPhoneAlreadyExistsException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'USER_PHONE_ALREADY_EXISTS', 'The phone is already in use');
  }
}

export class UserNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'The user was not found');
  }
}

export class UserSelfStatusChangeException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'USER_SELF_STATUS_CHANGE_FORBIDDEN',
      'You cannot change the status of your own account',
    );
  }
}
