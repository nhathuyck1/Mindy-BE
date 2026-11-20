import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class NotificationException extends AppHttpException {
  constructor(
    status: number,
    readonly code: string,
  ) {
    super(status, code, 'Notification request could not be completed.');
  }
}
