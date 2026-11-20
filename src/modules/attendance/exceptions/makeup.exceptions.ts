import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class MakeupConflictException extends AppHttpException {
  constructor(code: string, message: string) {
    super(HttpStatus.CONFLICT, code, message);
  }
}
export class MakeupNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'MAKEUP_NOT_FOUND', 'Makeup conflict or placement not found');
  }
}
export class MakeupNotEligibleException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MAKEUP_NOT_ELIGIBLE',
      'An ACTIVE source enrollment and an equivalent Course Unit in another class are required',
    );
  }
}
