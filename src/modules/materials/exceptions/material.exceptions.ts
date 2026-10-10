import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { MaterialPolicyErrorCode } from '../domain/material-policy.error.js';

const statuses: Record<MaterialPolicyErrorCode, HttpStatus> = {
  MATERIAL_ACCESS_DENIED: HttpStatus.FORBIDDEN,
  MATERIAL_NOT_FOUND: HttpStatus.NOT_FOUND,
  MATERIAL_REVIEW_CONFLICT: HttpStatus.CONFLICT,
  MATERIAL_CONTENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  MATERIAL_SCOPE_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  FILE_NOT_READY: HttpStatus.CONFLICT,
  FILE_OWNER_MISMATCH: HttpStatus.FORBIDDEN,
};

export class MaterialPolicyException extends AppHttpException {
  constructor(code: MaterialPolicyErrorCode) {
    super(statuses[code], code, 'The material action is not allowed in its current context');
  }
}
