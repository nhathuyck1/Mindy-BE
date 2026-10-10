import { HttpStatus, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Exported class provider.
import { ClassOffersService } from '../../classes/services/class-offers.service.js';
// biome-ignore lint/style/useImportType: Exported class provider.
import { ClassReadService } from '../../classes/services/class-read.service.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { OrderAccessDeniedException } from '../../commerce/exceptions/commerce.exceptions.js';
import type { OrderWithDetails } from '../../commerce/services/checkout.service.js';
// biome-ignore lint/style/useImportType: Exported commerce provider.
import { OrderSettlementService } from '../../commerce/services/order-settlement.service.js';
// biome-ignore lint/style/useImportType: Exported enrollment provider.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import type { CashPreviewView } from '../dtos/student-class-preview.dto.js';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';

@Injectable()
export class CashPaymentsService {
  constructor(
    private readonly db: DataSource,
    private readonly orders: OrderSettlementService,
    private readonly classes: ClassOffersService,
    private readonly read: ClassReadService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async list(
    mentorId: string,
    options: PageOptionsDto,
  ): Promise<{ items: OrderWithDetails[]; total: number }> {
    return this.orders.listCash(this.db.manager, mentorId, options);
  }

  async preview(studentId: string, classId: string): Promise<CashPreviewView> {
    const detail = await this.orders.pendingCashDetail(this.db.manager, studentId, classId);
    const hold =
      detail && (await this.enrollments.findPendingHold(studentId, classId, detail.detailId));
    if (!detail || !hold)
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        'CLASS_PREVIEW_DENIED',
        'An unexpired pending cash enrollment is required',
      );
    const view = await this.read.getDetail(classId);
    if (view.classEntity.status === ClassStatus.CANCELLED)
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        'CLASS_PREVIEW_DENIED',
        'Class is cancelled',
      );
    return {
      ...view,
      enrollment: { id: hold.id, status: hold.status, enrolledAt: hold.enrolledAt },
      order: { id: detail.orderId, orderCode: detail.orderCode, expiresAt: detail.expiresAt },
    };
  }

  async confirm(
    mentorId: string,
    orderId: string,
    receivedAmount: number,
  ): Promise<OrderWithDetails> {
    return this.db.transaction(async (manager) => {
      const snapshot = await this.orders.read(manager, orderId);
      if (snapshot.order.cashMentorId !== mentorId) throw new OrderAccessDeniedException();
      const offers = await this.classes.lockOffers(
        manager,
        snapshot.details.map((d) => d.classId),
      );
      const order = await this.orders.lock(manager, orderId);
      if (order.cashMentorId !== mentorId) throw new OrderAccessDeniedException();
      if (order.paymentType !== PaymentType.CASH || receivedAmount !== order.totalAmount)
        throw new AppHttpException(
          HttpStatus.CONFLICT,
          'CASH_CONFIRMATION_INVALID',
          'Cash method and full order amount are required',
        );
      const payments = manager.getRepository(PaymentTransactionEntity);
      if (order.status === OrderStatus.PAID) {
        const payment = await payments.findOneBy({ orderId });
        if (
          payment?.status !== PaymentStatus.SUCCEEDED ||
          payment.referenceCode !== `cash:${mentorId}:${orderId}`
        )
          throw new AppHttpException(
            HttpStatus.CONFLICT,
            'CASH_CONFIRMATION_INVALID',
            'Paid order has no matching cash confirmation',
          );
        return this.orders.read(manager, orderId);
      }
      if (
        order.status !== OrderStatus.PENDING ||
        order.expiresAt <= new Date() ||
        offers.some((c) => c.status === ClassStatus.CANCELLED)
      )
        throw new AppHttpException(
          HttpStatus.CONFLICT,
          'CASH_ORDER_CLOSED',
          'Order has expired, is closed or contains a cancelled class',
        );
      const holds = await Promise.all(
        snapshot.details.map(async (d) => ({
          classId: d.classId,
          orderDetailId: d.id,
          unitIds: await this.classes.unitIds(manager, d.classId),
        })),
      );
      if (!(await this.enrollments.canActivateHolds(manager, order.studentId, holds)))
        throw new AppHttpException(
          HttpStatus.CONFLICT,
          'CASH_HOLD_INVALID',
          'Existing seat holds cannot be activated',
        );
      const now = new Date();
      if (order.expiresAt <= now)
        throw new AppHttpException(HttpStatus.CONFLICT, 'CASH_ORDER_CLOSED', 'Order has expired');
      await payments.insert({
        orderId,
        amount: receivedAmount,
        status: PaymentStatus.SUCCEEDED,
        paidAt: now,
        referenceCode: `cash:${mentorId}:${orderId}`,
      });
      await this.enrollments.activateHolds(manager, order.studentId, holds, now);
      await this.orders.markPaid(manager, orderId, now);
      return this.orders.read(manager, orderId);
    });
  }
}
