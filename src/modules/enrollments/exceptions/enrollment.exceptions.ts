import { HttpStatus } from '@nestjs/common';

import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class ClassAlreadyEnrolledException extends AppHttpException {
  constructor(classIds: readonly string[] = []) {
    super(
      HttpStatus.CONFLICT,
      'CLASS_ALREADY_ENROLLED',
      'You already hold a seat or are enrolled in this class',
      classIds.map((classId) => ({ classId })),
    );
  }
}
