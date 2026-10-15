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
