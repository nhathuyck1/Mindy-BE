import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource, type EntityManager } from 'typeorm';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Exported class provider.
import { ClassOffersService } from '../../classes/services/class-offers.service.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
// biome-ignore lint/style/useImportType: Exported commerce provider.
import { OrderSettlementService } from '../../commerce/services/order-settlement.service.js';
// biome-ignore lint/style/useImportType: Exported enrollment provider.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import {
  PAYOS_PROVIDER,
  type PayosProvider,
  type VerifiedPayment,
} from '../domain/payos-provider.js';
import { PaymentConfirmationEmailEntity } from '../entities/payment-confirmation-email.entity.js';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from '../entities/payment-webhook-event.entity.js';
import { PayosPaymentDetailEntity } from '../entities/payos-payment-detail.entity.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import { PaymentUnavailableException } from '../exceptions/payment.exceptions.js';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
export type SettlementResult = 'SETTLED' | 'DUPLICATE' | 'REQUIRES_REVIEW' | 'CONFIRM_SAMPLE';

@Injectable()
export class PaymentSettlementService {
  constructor(
    private readonly db: DataSource,
    private readonly orders: OrderSettlementService,
    private readonly classes: ClassOffersService,
    private readonly enrollments: EnrollmentsService,
    @Inject(PAYOS_PROVIDER) private readonly provider: PayosProvider,
  ) {}

  async webhook(body: unknown): Promise<SettlementResult> {
    const verified = await this.provider.verify(body);
    try {
      return await this.settle(verified, 'WEBHOOK', null);
    } catch {
      throw new PaymentUnavailableException();
    }
  }

  /** Internal only: invoked after adapter verification or authenticated provider reconciliation. */
  async settle(
    data: VerifiedPayment,
    source: 'WEBHOOK' | 'RECONCILIATION',
    actorId: string | null,
  ): Promise<SettlementResult> {
    const mapping = await this.db
      .getRepository(PayosPaymentDetailEntity)
      .findOneBy({ providerOrderCode: data.orderCode, channelKey: this.provider.channelKey });
    const eventKey = hash(`${this.provider.channelKey}:${data.reference}`);
    const fingerprint = hash(
      JSON.stringify([
        data.orderCode,
        data.amount,
        data.currency,
        data.paymentLinkId,
        data.reference,
        data.code,
      ]),
    );
    // Recover early webhook mapping without holding a database lock across a network call.
    const remote =
      mapping && mapping.paymentLinkId === null ? await this.provider.get(data.orderCode) : null;
    return this.db.transaction(async (manager) => {
      let p: PaymentTransactionEntity | null = null;
      let reason: string | null = null;
      let order: Awaited<ReturnType<OrderSettlementService['lock']>> | null = null;
      let holds: { classId: string; orderDetailId: string; unitIds: string[] }[] = [];
      if (mapping) {
        const initial = await manager
          .getRepository(PaymentTransactionEntity)
          .findOneByOrFail({ id: mapping.paymentId });
        const snapshot = await this.orders.read(manager, initial.orderId);
        const offers = await this.classes.lockOffers(
          manager,
          snapshot.details.map((d) => d.classId),
        );
        order = await this.orders.lock(manager, initial.orderId);
        p = await manager
          .getRepository(PaymentTransactionEntity)
          .findOne({ where: { id: initial.id }, lock: { mode: 'pessimistic_write' } });
        if (!p) throw new PaymentUnavailableException();
        const d = await manager
          .getRepository(PayosPaymentDetailEntity)
          .findOneByOrFail({ id: mapping.id });
        if (data.currency !== 'VND' || data.code !== '00') reason = 'INVALID_RESULT_OR_CURRENCY';
        else if (
          data.amount !== p.amount ||
          data.amount !== order.totalAmount ||
          order.paymentType !== PaymentType.PAYOS
        )
          reason = 'AMOUNT_OR_METHOD_MISMATCH';
        else if (
          d.paymentLinkId !== null
            ? d.paymentLinkId !== data.paymentLinkId
            : remote === null ||
              remote.id !== data.paymentLinkId ||
              remote.orderCode !== data.orderCode ||
              remote.amount !== p.amount
        )
          reason = 'LINK_MISMATCH';
        else if (
          p.status !== PaymentStatus.SUCCEEDED &&
          (order.status !== OrderStatus.PENDING || order.expiresAt <= new Date())
        )
          reason = 'ORDER_CLOSED_OR_LATE';
        else if (offers.some((c) => c.status === ClassStatus.CANCELLED)) reason = 'CLASS_CANCELLED';
        else if (p.status === PaymentStatus.REQUIRES_REVIEW)
          reason = 'PAYMENT_ALREADY_REQUIRES_REVIEW';
        else if (p.status === PaymentStatus.SUCCEEDED) reason = 'ADDITIONAL_SETTLEMENT';
        if (reason === null) {
          holds = await Promise.all(
            snapshot.details.map(async (detail) => ({
              classId: detail.classId,
              orderDetailId: detail.id,
              unitIds: await this.classes.unitIds(manager, detail.classId),
            })),
          );
          if (!(await this.enrollments.canActivateHolds(manager, order.studentId, holds)))
            reason = 'MISSING_OR_RELEASED_HOLD';
        }
        // Only bind a previously missing link after every provider identity check passes.
        if (reason === null && d.paymentLinkId === null) {
          d.paymentLinkId = data.paymentLinkId;
          await manager.getRepository(PayosPaymentDetailEntity).save(d);
        }
      } else reason = data.isConfirmSample ? null : 'UNKNOWN_PROVIDER_ORDER';

      // Serialize the reference across orders/replicas; collision events are durable too.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [eventKey]);
      const events = manager.getRepository(PaymentWebhookEventEntity);
      const previous = await events.findOneBy({ eventKey });
      if (previous) {
        if (previous.fingerprint === fingerprint) return 'DUPLICATE';
        const collisionKey = hash(`${eventKey}:${fingerprint}`);
        if (!(await events.existsBy({ eventKey: collisionKey })))
          await this.record(
            manager,
            data,
            collisionKey,
            fingerprint,
            p?.id ?? null,
            source,
            actorId,
            'REQUIRES_REVIEW',
            'REFERENCE_COLLISION',
          );
        return 'REQUIRES_REVIEW';
      }
      if (!mapping && data.isConfirmSample) {
        await this.record(
          manager,
          data,
          eventKey,
          fingerprint,
          null,
          source,
          actorId,
          'CONFIRM_SAMPLE',
          null,
        );
        return 'CONFIRM_SAMPLE';
      }
      if (reason !== null || !p || !order) {
        await this.record(
          manager,
          data,
          eventKey,
          fingerprint,
          p?.id ?? null,
          source,
          actorId,
          'REQUIRES_REVIEW',
          reason ?? 'UNKNOWN_PROVIDER_ORDER',
        );
        // An invalid event must not poison a valid pending attempt; late/cancelled settlement does.
        if (
          p &&
          p.status !== PaymentStatus.SUCCEEDED &&
          ['ORDER_CLOSED_OR_LATE', 'CLASS_CANCELLED', 'MISSING_OR_RELEASED_HOLD'].includes(
            reason ?? '',
          )
        ) {
          await manager
            .getRepository(PaymentTransactionEntity)
            .update(p.id, { status: PaymentStatus.REQUIRES_REVIEW });
        }
        return 'REQUIRES_REVIEW';
      }
      const now = new Date();
      await this.enrollments.activateHolds(manager, order.studentId, holds, now);
      await this.orders.markPaid(manager, order.id, now);
      await manager
        .getRepository(PaymentTransactionEntity)
        .update(p.id, { status: PaymentStatus.SUCCEEDED, paidAt: now, referenceCode: eventKey });
      await manager.getRepository(PaymentConfirmationEmailEntity).insert({
        orderId: order.id,
        studentId: order.studentId,
        orderCode: order.orderCode,
        amount: p.amount,
      });
      await this.record(
        manager,
        data,
        eventKey,
        fingerprint,
        p.id,
        source,
        actorId,
        'SETTLED',
        null,
      );
      return 'SETTLED';
    });
  }

  private async record(
    manager: EntityManager,
    d: VerifiedPayment,
    eventKey: string,
    fingerprint: string,
    paymentId: string | null,
    source: 'WEBHOOK' | 'RECONCILIATION',
    actorId: string | null,
    outcome: PaymentWebhookEventEntity['outcome'],
    reason: string | null,
  ): Promise<void> {
    await manager.getRepository(PaymentWebhookEventEntity).insert({
      eventKey,
      fingerprint,
      paymentId,
      providerOrderCode: d.orderCode,
      referenceCode: d.reference,
      paymentLinkId: d.paymentLinkId,
      amount: d.amount,
      currency: d.currency,
      resultCode: d.code,
      source,
      actorId,
      outcome,
      reason,
    });
  }
}
