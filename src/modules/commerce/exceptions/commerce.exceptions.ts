import { HttpStatus } from '@nestjs/common';

import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class CartEmptyException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'CART_EMPTY', 'The cart has no classes to check out');
  }
}

export class CartItemAlreadyExistsException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, 'CART_ITEM_ALREADY_EXISTS', 'The class is already in the cart');
  }
}

export class CartItemNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'CART_ITEM_NOT_FOUND', 'The class is not in the cart');
  }
}

export class CartLimitExceededException extends AppHttpException {
  constructor(limit: number) {
    super(HttpStatus.CONFLICT, 'CART_LIMIT_EXCEEDED', `A cart can hold at most ${limit} classes`);
  }
}

export class OrderNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'The order was not found');
  }
}

export class OrderAccessDeniedException extends AppHttpException {
  constructor() {
    super(HttpStatus.FORBIDDEN, 'ORDER_ACCESS_DENIED', 'You do not have access to this order');
  }
}
