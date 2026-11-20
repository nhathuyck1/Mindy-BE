import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../common/http/app-http.exception.js';

export class MailDeliveryUnavailableException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'MAIL_DELIVERY_UNAVAILABLE',
      'Email delivery is temporarily unavailable',
    );
  }
}
