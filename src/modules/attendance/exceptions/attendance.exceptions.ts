import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class AttendanceHistoryNotFoundException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      'ATTENDANCE_HISTORY_NOT_FOUND',
      'Own class attendance history was not found',
    );
  }
}

export class AttendanceConflictException extends AppHttpException {
  constructor(code: string, message: string) {
    super(HttpStatus.CONFLICT, code, message);
  }
}
export class AttendanceEnrollmentNotEligibleException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ATTENDANCE_ENROLLMENT_NOT_ELIGIBLE',
      'Every enrollment must belong to the session roster',
    );
  }
}

export class AttendanceRecoveryEvidenceInvalidException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ATTENDANCE_RECOVERY_EVIDENCE_INVALID',
      'Verified payment, historical hold and explicit admission evidence are required',
    );
  }
}
