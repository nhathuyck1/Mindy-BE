import { HttpStatus } from '@nestjs/common';

import { AppHttpException } from '../../../common/http/app-http.exception.js';

/** The class filter names a class the student has no FULL or CASH_PREVIEW access to. */
export class ScheduleClassAccessDeniedException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'SCHEDULE_CLASS_ACCESS_DENIED',
      'An active enrollment or unexpired pending cash hold is required for this class',
    );
  }
}
