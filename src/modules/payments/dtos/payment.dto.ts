import { ApiProperty } from '@nestjs/swagger';
import type { PaymentTransactionEntity } from '../entities/payment-transaction.entity.js';
import type { PayosPaymentDetailEntity } from '../entities/payos-payment-detail.entity.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';

export class PaymentDto {
  @ApiProperty({ format: 'uuid' }) readonly paymentId: string;
  @ApiProperty({ format: 'uuid' }) readonly orderId: string;
  @ApiProperty({ enum: PaymentStatus }) readonly status: PaymentStatus;
  @ApiProperty({ type: String, nullable: true }) readonly checkoutUrl: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null while creating or after recovery via provider lookup; use checkoutUrl',
  })
  readonly qrCode: string | null;
  @ApiProperty({ format: 'date-time' }) readonly expiresAt: Date;
  @ApiProperty({ type: Number }) readonly amount: number;
  constructor(
    p: PaymentTransactionEntity,
    d: PayosPaymentDetailEntity,
    expiresAt: Date,
    payable = true,
  ) {
    this.paymentId = p.id;
    this.orderId = p.orderId;
    this.status = p.status;
    this.checkoutUrl = payable && p.status === PaymentStatus.PENDING ? d.checkoutUrl : null;
    this.qrCode = payable && p.status === PaymentStatus.PENDING ? d.qrCode : null;
    this.expiresAt = expiresAt;
    this.amount = p.amount;
  }
}

export class WebhookAckDto {
  @ApiProperty({ example: '00' }) readonly code = '00';
  @ApiProperty({ example: 'success' }) readonly desc = 'success';
}
