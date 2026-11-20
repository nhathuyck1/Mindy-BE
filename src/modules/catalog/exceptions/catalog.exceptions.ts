import { HttpStatus } from '@nestjs/common';

import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class CourseCategoryNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'COURSE_CATEGORY_NOT_FOUND', 'The course category was not found');
  }
}

export class CourseCategorySlugAlreadyExistsException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'COURSE_CATEGORY_SLUG_ALREADY_EXISTS',
      'The category slug is already in use',
    );
  }
}

export class CourseCategorySlugRequiredException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'COURSE_CATEGORY_SLUG_REQUIRED',
      'A slug could not be derived from the name; provide one explicitly',
    );
  }
}

export class CourseCategoryInactiveException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'COURSE_CATEGORY_INACTIVE', 'The course category is not active');
  }
}

export class CourseNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND', 'The course was not found');
  }
}

export class CourseCodeAlreadyExistsException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'COURSE_CODE_ALREADY_EXISTS', 'The course code is already in use');
  }
}

export class CourseHasNoUnitsException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'COURSE_HAS_NO_UNITS',
      'The course needs at least one unit before it can be activated',
    );
  }
}

export class CourseUnitOrderMismatchException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'COURSE_UNIT_ORDER_MISMATCH',
      'The order must list every unit of the course exactly once',
    );
  }
}
