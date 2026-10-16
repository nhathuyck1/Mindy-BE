import { Injectable } from '@nestjs/common';
import { type EntityManager, In, type SelectQueryBuilder } from 'typeorm';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from '../entities/payment-webhook-event.entity.js';
import { PayosPaymentDetailEntity } from '../entities/payos-payment-detail.entity.js';
@Injectable()
export class ManagerPaymentReadService {
  query(manager: EntityManager): SelectQueryBuilder<PaymentTransactionEntity> {
    return manager.getRepository(PaymentTransactionEntity).createQueryBuilder('payment');
  }
  async forOrders(
    manager: EntityManager,
    orderIds: readonly string[],
  ): Promise<
    {
      payment: PaymentTransactionEntity;
      providerOrderCode: number | null;
      review: PaymentWebhookEventEntity | null;
    }[]
  > {
    const payments = orderIds.length
      ? await manager.getRepository(PaymentTransactionEntity).findBy({ orderId: In([...orderIds]) })
      : [];
    const ids = payments.map((p) => p.id);
    const details = ids.length
      ? await manager.getRepository(PayosPaymentDetailEntity).findBy({ paymentId: In(ids) })
      : [];
    // DISTINCT ON limits review projection to one event per transaction, not unbounded event history.
    const reviews = ids.length
      ? await manager
          .getRepository(PaymentWebhookEventEntity)
          .createQueryBuilder('event')
          .distinctOn(['event.paymentId'])
          .where('event.paymentId IN (:...ids) AND event.outcome = :outcome', {
            ids,
            outcome: 'REQUIRES_REVIEW',
          })
          .orderBy('event.paymentId', 'ASC')
          .addOrderBy('event.createdAt', 'DESC')
          .addOrderBy('event.id', 'ASC')
          .getMany()
      : [];
    return payments.map((payment) => ({
      payment,
      providerOrderCode: details.find((d) => d.paymentId === payment.id)?.providerOrderCode ?? null,
      review: reviews.find((e) => e.paymentId === payment.id) ?? null,
    }));
  }
}
