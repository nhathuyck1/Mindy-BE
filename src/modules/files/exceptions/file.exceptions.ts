import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';

export type UploadPolicyCode =
  | 'MATERIAL_ACCESS_DENIED'
  | 'MATERIAL_NOT_FOUND'
  | 'MATERIAL_SCOPE_MISMATCH'
  | 'MATERIAL_CONTENT_INVALID';
export class UploadPolicyError extends Error {
  constructor(readonly code: UploadPolicyCode) {
    super(code);
  }
}
export class FileException extends AppHttpException {
  constructor(code: string, status: HttpStatus = HttpStatus.CONFLICT) {
    super(status, code, 'The file operation cannot be completed in its current state');
  }
}
export function uploadPolicyException(error: UploadPolicyError): FileException {
  const statuses: Record<UploadPolicyCode, HttpStatus> = {
    MATERIAL_ACCESS_DENIED: HttpStatus.FORBIDDEN,
    MATERIAL_NOT_FOUND: HttpStatus.NOT_FOUND,
    MATERIAL_SCOPE_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
    MATERIAL_CONTENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  };
  return new FileException(error.code, statuses[error.code]);
}
export class BinaryValidationError extends Error {
  constructor(readonly code: string = 'FILE_BINARY_INVALID') {
    super(code);
  }
}
