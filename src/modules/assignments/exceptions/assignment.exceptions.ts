import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class AssignmentException extends AppHttpException {
  constructor(status: number, code: string, details?: Record<string, unknown>) {
    super(status, code, code.replaceAll('_', ' ').toLowerCase(), details ? [details] : undefined);
  }
}
