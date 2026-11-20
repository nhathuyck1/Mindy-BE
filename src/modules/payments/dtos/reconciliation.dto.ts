import { ApiProperty } from '@nestjs/swagger';
import type { PaymentWebhookEventEntity } from '../entities/payment-webhook-event.entity.js';

export class ReconciliationEventDto {
  @ApiProperty() readonly id: string;
  @ApiProperty({ type: String, nullable: true }) readonly paymentId: string | null;
  @ApiProperty() readonly providerOrderCode: number;
  @ApiProperty() readonly referenceCode: string;
  @ApiProperty() readonly amount: number;
  @ApiProperty() readonly currency: string;
  @ApiProperty({ type: String, nullable: true }) readonly reason: string | null;
  @ApiProperty() readonly source: string;
  @ApiProperty({ type: String, nullable: true }) readonly actorId: string | null;
  @ApiProperty() readonly createdAt: Date;
  constructor(e: PaymentWebhookEventEntity) {
    this.id = e.id;
    this.paymentId = e.paymentId;
    this.providerOrderCode = e.providerOrderCode;
    this.referenceCode = e.referenceCode;
    this.amount = e.amount;
    this.currency = e.currency;
    this.reason = e.reason;
    this.source = e.source;
    this.actorId = e.actorId;
    this.createdAt = e.createdAt;
  }
}
export class ReconciliationPageDto {
  @ApiProperty({ type: () => ReconciliationEventDto, isArray: true })
  readonly items: ReconciliationEventDto[];
  @ApiProperty() readonly total: number;
  @ApiProperty() readonly page: number;
  @ApiProperty() readonly pageSize: number;
  constructor(items: PaymentWebhookEventEntity[], total: number, page: number, pageSize: number) {
    this.items = items.map((e) => new ReconciliationEventDto(e));
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }
}
export class ReconciliationResultDto {
  @ApiProperty() readonly status: string;
  constructor(status: string) {
    this.status = status;
  }
}
