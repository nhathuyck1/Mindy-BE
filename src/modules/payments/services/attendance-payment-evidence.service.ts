import { Injectable } from '@nestjs/common';
import { type EntityManager, In } from 'typeorm';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { OrderSettlementService } from '../../commerce/services/order-settlement.service.js';
import { isCashConfirmation } from '../domain/cash-confirmation.js';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from '../entities/payment-webhook-event.entity.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';

export interface AttendancePaymentEvidence {
  readonly orderDetailId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly classId: string;
  readonly studentId: string;
  readonly paidAt: Date;
  readonly paymentType: PaymentType;
}

@Injectable()
export class AttendancePaymentEvidenceService {
  constructor(private readonly orders: OrderSettlementService) {}

  /** Read verified settlements only. Never settle or acquire Order/Payment locks after Session. */
  async read(
    manager: EntityManager,
    detailIds: readonly string[],
  ): Promise<Map<string, AttendancePaymentEvidence>> {
    const lines = await this.orders.attendancePaymentLines(manager, detailIds);
    const payments = lines.length
      ? await manager.getRepository(PaymentTransactionEntity).findBy({
          orderId: In(lines.map((l) => l.orderId)),
          status: PaymentStatus.SUCCEEDED,
        })
      : [];
    const byOrder = new Map(payments.map((p) => [p.orderId, p]));
    const events = payments.length
      ? await manager.getRepository(PaymentWebhookEventEntity).findBy({
          paymentId: In(payments.map((p) => p.id)),
          outcome: 'SETTLED',
        })
      : [];
    const result = new Map<string, AttendancePaymentEvidence>();
    for (const line of lines) {
      const p = byOrder.get(line.orderId);
      if (
        !p?.paidAt ||
        !p.referenceCode ||
        p.amount !== Number(line.totalAmount) ||
        p.paidAt.getTime() !== line.paidAt.getTime()
      )
        continue;
      if (
        line.paymentType === PaymentType.CASH &&
        !isCashConfirmation(p.referenceCode, line.orderId, line.cashMentorId)
      )
        continue;
      if (
        line.paymentType === PaymentType.PAYOS &&
        !events.some(
          (event) =>
            event.paymentId === p.id &&
            event.eventKey === p.referenceCode &&
            event.amount === p.amount &&
            event.currency === 'VND' &&
            event.resultCode === '00',
        )
      )
        continue;
      result.set(line.detailId, {
        orderDetailId: line.detailId,
        orderId: line.orderId,
        paymentId: p.id,
        classId: line.classId,
        studentId: line.studentId,
        paidAt: p.paidAt,
        paymentType: line.paymentType,
      });
    }
    return result;
  }
}
