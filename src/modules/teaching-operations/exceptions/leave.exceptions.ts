import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class LeaveException extends AppHttpException {
  constructor(code: string, message: string, status = 409, details?: readonly unknown[]) {
    super(status, code, message, details);
  }
}
