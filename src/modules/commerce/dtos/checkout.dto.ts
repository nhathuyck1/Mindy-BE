import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { PaymentType } from '../enums/payment-type.enum.js';

/** Checkout always covers the whole cart; totals, prices and mentors are decided by the server. */
export class CheckoutDto {
  @ApiProperty({ type: String, enum: PaymentType, example: PaymentType.CASH })
  @IsEnum(PaymentType)
  readonly paymentType!: PaymentType;
}
