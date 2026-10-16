import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class TeachingConflictException extends AppHttpException {
  constructor(code: string, message: string) {
    super(HttpStatus.CONFLICT, code, message);
  }
}

export class SessionAssignmentRequiredException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'SESSION_ASSIGNMENT_REQUIRED',
      'This session is assigned to another mentor',
    );
  }
}

export class SessionScheduleNotFutureException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'SESSION_START_NOT_FUTURE',
      'Session must start in the future',
    );
  }
}

export class SessionMakeupDurationMismatchException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MAKEUP_DURATION_MISMATCH',
      'Makeup must preserve the source duration',
    );
  }
}
