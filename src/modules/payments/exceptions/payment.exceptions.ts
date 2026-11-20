import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class PaymentUnavailableException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PAYMENT_UNAVAILABLE',
      'Payment is temporarily unavailable',
    );
  }
}
export class PaymentOrderInvalidException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'PAYMENT_ORDER_INVALID',
      'The order cannot be paid by payOS in its current state',
    );
  }
}
export class PaymentAmountInvalidException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'PAYMENT_AMOUNT_INVALID',
      'payOS requires a positive safe integer VND amount',
    );
  }
}
export class InvalidPaymentWebhookException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'INVALID_PAYMENT_WEBHOOK',
      'Invalid payment webhook or signature',
    );
  }
}
