import { HttpStatus } from '@nestjs/common';

import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { ClassStatus } from '../enums/class-status.enum.js';

export class UnitReleaseConflictException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'UNIT_RELEASE_CONFLICT',
      'A completed unit or cancelled class cannot change release',
    );
  }
}

export class ClassNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'CLASS_NOT_FOUND', 'The class was not found');
  }
}

export class ClassStudentNotFoundException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      'CLASS_STUDENT_NOT_FOUND',
      'The student was not found in this class',
    );
  }
}

export class ClassUnitNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'CLASS_UNIT_NOT_FOUND', 'The class unit was not found');
  }
}

export class ClassSessionNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'CLASS_SESSION_NOT_FOUND', 'The class session was not found');
  }
}

export class ClassCodeAlreadyExistsException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'CLASS_CODE_ALREADY_EXISTS', 'The class code is already in use');
  }
}

export class ClassCourseInactiveException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'CLASS_COURSE_INACTIVE', 'The course of the class is not active');
  }
}

export class ClassMentorNotEligibleException extends AppHttpException {
  constructor(status: HttpStatus.UNPROCESSABLE_ENTITY | HttpStatus.CONFLICT) {
    super(
      status,
      'CLASS_MENTOR_NOT_ELIGIBLE',
      'The mentor must be an active account with the mentor role',
    );
  }
}

export class ClassDateRangeInvalidException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CLASS_DATE_RANGE_INVALID',
      'The class start date must not be after its end date',
    );
  }
}

export class ClassNotEditableException extends AppHttpException {
  constructor(status: ClassStatus, fields: readonly string[] = []) {
    super(
      HttpStatus.CONFLICT,
      'CLASS_NOT_EDITABLE',
      `The requested change is not allowed while the class is ${status}`,
      fields.length === 0 ? undefined : [{ fields }],
    );
  }
}

export class ClassInvalidTransitionException extends AppHttpException {
  constructor(from: ClassStatus, to: ClassStatus) {
    super(
      HttpStatus.CONFLICT,
      'CLASS_INVALID_TRANSITION',
      `A class cannot move from ${from} to ${to}`,
    );
  }
}

export class ClassNotReadyToOpenException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'CLASS_NOT_READY_TO_OPEN',
      'The class needs at least one unit and one scheduled session inside its period',
    );
  }
}

export class ClassSessionTimeRangeInvalidException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CLASS_SESSION_TIME_RANGE_INVALID',
      'The session must start before it ends',
    );
  }
}

export class ClassSessionOvernightNotAllowedException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CLASS_SESSION_OVERNIGHT_NOT_ALLOWED',
      'A teaching session must stay within one calendar day in the center time zone',
    );
  }
}

export class ClassSessionNotEditableException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'CLASS_SESSION_NOT_EDITABLE',
      'Only scheduled sessions can change time',
    );
  }
}

export class ClassSessionLocalTimeInvalidException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CLASS_SESSION_LOCAL_TIME_INVALID',
      'The requested local clock time does not exist in the center time zone',
    );
  }
}

export class ClassSessionOutsideClassPeriodException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CLASS_SESSION_OUTSIDE_CLASS_PERIOD',
      'The session must fall within the class start and end dates',
    );
  }
}

export class ClassSessionOverlapException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'CLASS_SESSION_OVERLAP',
      'The session overlaps another session of the same class',
    );
  }
}

export class ClassMentorScheduleConflictException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'CLASS_MENTOR_SCHEDULE_CONFLICT',
      'The mentor already teaches another class during one of the sessions',
    );
  }
}

export class ClassNotOpenException extends AppHttpException {
  constructor(classId: string) {
    super(HttpStatus.CONFLICT, 'CLASS_NOT_OPEN', 'The class is not open for registration', [
      { classId },
    ]);
  }
}

export class ClassFullException extends AppHttpException {
  constructor(classId: string) {
    super(HttpStatus.CONFLICT, 'CLASS_FULL', 'The class has no seats left', [{ classId }]);
  }
}
