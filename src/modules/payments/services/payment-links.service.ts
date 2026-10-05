import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource } from 'typeorm';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
// biome-ignore lint/style/useImportType: Exported commerce provider.
import { OrderSettlementService } from '../../commerce/services/order-settlement.service.js';
import { PAYOS_PROVIDER, type PayosProvider } from '../domain/payos-provider.js';
import { PaymentDto } from '../dtos/payment.dto.js';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity.js';
import { PayosPaymentDetailEntity } from '../entities/payos-payment-detail.entity.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import {
  PaymentAmountInvalidException,
  PaymentOrderInvalidException,
  PaymentUnavailableException,
} from '../exceptions/payment.exceptions.js';

@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly db: DataSource,
    private readonly orders: OrderSettlementService,
    private readonly config: ConfigService,
    @Inject(PAYOS_PROVIDER) private readonly provider: PayosProvider,
  ) {}

  async get(studentId: string, orderId: string): Promise<PaymentDto | null> {
    const { order } = await this.orders.read(this.db.manager, orderId, studentId);
    const p = await this.db.getRepository(PaymentTransactionEntity).findOneBy({ orderId });
    if (!p) return null;
    const d = await this.db
      .getRepository(PayosPaymentDetailEntity)
      .findOneByOrFail({ paymentId: p.id });
    return new PaymentDto(
      p,
      d,
      order.expiresAt,
      order.status === OrderStatus.PENDING && order.expiresAt > new Date(),
    );
  }

  async create(studentId: string, orderId: string): Promise<PaymentDto> {
    if (
      !this.config.getOrThrow<boolean>('PAYOS_ENABLED') ||
      !this.config.getOrThrow<boolean>('PAYOS_CREATE_LINK_ENABLED')
    )
      throw new PaymentUnavailableException();
    const token = randomUUID();
    const reserved = await this.db.transaction(async (manager) => {
      await this.orders.read(manager, orderId, studentId);
      const order = await this.orders.lock(manager, orderId);
      if (
        order.paymentType !== PaymentType.PAYOS ||
        order.status !== OrderStatus.PENDING ||
        order.expiresAt <= new Date()
      )
        throw new PaymentOrderInvalidException();
      if (
        !Number.isSafeInteger(order.totalAmount) ||
        order.totalAmount <= 0 ||
        Math.floor(order.expiresAt.getTime() / 1000) > 2147483647
      )
        throw new PaymentAmountInvalidException();
      const payments = manager.getRepository(PaymentTransactionEntity);
      let p = await payments.findOneBy({ orderId });
      if (!p) p = await payments.save(payments.create({ orderId, amount: order.totalAmount }));
      const details = manager.getRepository(PayosPaymentDetailEntity);
      let d = await details.findOneBy({ paymentId: p.id });
      if (!d)
        d = await details.save(
          details.create({ paymentId: p.id, channelKey: this.provider.channelKey }),
        );
      if (d.channelKey !== this.provider.channelKey) throw new PaymentUnavailableException();
      const hasLease = d.leaseUntil !== null && d.leaseUntil > new Date();
      const claim = d.checkoutUrl === null && p.status === PaymentStatus.CREATING && !hasLease;
      if (claim) {
        d.leaseToken = token;
        d.leaseUntil = new Date(Date.now() + 30_000);
        await details.save(d);
      }
      return { p, d, order, claim };
    });
    if (!reserved.claim) return new PaymentDto(reserved.p, reserved.d, reserved.order.expiresAt);
    try {
      const link =
        (await this.provider.get(reserved.d.providerOrderCode)) ??
        (await this.provider.create(
          reserved.d.providerOrderCode,
          reserved.p.amount,
          reserved.order.expiresAt,
        ));
      if (
        link.orderCode !== reserved.d.providerOrderCode ||
        link.amount !== reserved.p.amount ||
        !/^https:\/\/pay\.payos\.vn\//.test(link.checkoutUrl)
      )
        throw new PaymentUnavailableException();
      return await this.db.transaction(async (manager) => {
        const order = await this.orders.lock(manager, orderId);
        const p = await manager
          .getRepository(PaymentTransactionEntity)
          .findOneByOrFail({ id: reserved.p.id });
        const d = await manager
          .getRepository(PayosPaymentDetailEntity)
          .findOneByOrFail({ id: reserved.d.id });
        if (d.leaseToken === token) {
          if (d.paymentLinkId !== null && d.paymentLinkId !== link.id)
            throw new PaymentUnavailableException();
          d.paymentLinkId = link.id;
          d.checkoutUrl = link.checkoutUrl;
          d.qrCode = link.qrCode;
          d.leaseToken = null;
          d.leaseUntil = null;
          await manager.getRepository(PayosPaymentDetailEntity).save(d);
          if (p.status === PaymentStatus.CREATING) {
            p.status =
              (link.status === 'PENDING' || link.status === 'PAID') &&
              order.status === OrderStatus.PENDING &&
              order.expiresAt > new Date()
                ? PaymentStatus.PENDING
                : PaymentStatus.REQUIRES_REVIEW;
            await manager.getRepository(PaymentTransactionEntity).save(p);
          }
        }
        return new PaymentDto(
          p,
          d,
          order.expiresAt,
          order.status === OrderStatus.PENDING && order.expiresAt > new Date(),
        );
      });
    } catch {
      // Preserve code/attempt. Retry recovers with GET before attempting CREATE again.
      await this.db
        .getRepository(PayosPaymentDetailEntity)
        .update({ id: reserved.d.id, leaseToken: token }, { leaseToken: null, leaseUntil: null });
      throw new PaymentUnavailableException();
    }
  }
}
