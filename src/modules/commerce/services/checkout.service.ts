import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';

// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassOffersService } from '../../classes/services/class-offers.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import {
  calculateExpiry,
  generateOrderCode,
  type PlannedOrder,
  planOrders,
} from '../domain/checkout-plan.js';
import { CartDetailEntity } from '../entities/cart-detail.entity.js';
import { OrderEntity } from '../entities/order.entity.js';
import { OrderDetailEntity } from '../entities/order-detail.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { CartEmptyException } from '../exceptions/commerce.exceptions.js';
import { lockOrCreateCart } from './cart.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { OrderExpiryService } from './order-expiry.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { OrderSettlementService } from './order-settlement.service.js';

export interface OrderWithDetails {
  readonly order: OrderEntity;
  readonly details: OrderDetailEntity[];
}

const HOLD_TTL_CONFIG_KEYS: Readonly<Record<PaymentType, string>> = {
  [PaymentType.PAYOS]: 'ORDER_PAYOS_HOLD_TTL_SECONDS',
  [PaymentType.CASH]: 'ORDER_CASH_HOLD_TTL_SECONDS',
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly offersService: ClassOffersService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly expiryService: OrderExpiryService,
    private readonly settlementService: OrderSettlementService,
  ) {}

  /**
   * Turns the whole cart into orders and seat holds in one transaction: any invalid
   * item rolls everything back. Prices and totals come from the current course price, never
   * from the client or the cart snapshot. Zero-total orders activate their holds immediately;
   * positive totals require a separate payment after this commit.
   */
  async checkout(studentId: string, paymentType: PaymentType): Promise<OrderWithDetails[]> {
    const now = new Date();
    const expiresAt = calculateExpiry(
      now,
      this.config.getOrThrow<number>(HOLD_TTL_CONFIG_KEYS[paymentType]),
    );

    return this.dataSource.transaction(async (manager) => {
      // Lock order: cart first, then classes by ascending ID. A second checkout of the same
      // student waits on the cart and then finds it empty, so no duplicate order is created.
      const cart = await lockOrCreateCart(manager, studentId);
      const cartDetails = manager.getRepository(CartDetailEntity);
      const items = await cartDetails.find({ where: { cartId: cart.id } });
      if (items.length === 0) {
        throw new CartEmptyException();
      }

      const classIds = items.map((item) => item.classId);
      const offers = await this.offersService.lockOffers(manager, classIds);
      await this.expiryService.expireOverdueForClasses(manager, classIds, now);
      await this.offersService.assertPurchasable(studentId, offers, manager);

      const created: OrderWithDetails[] = [];
      for (const plan of planOrders(paymentType, offers)) {
        created.push(await this.createOrder(manager, studentId, paymentType, expiresAt, plan));
      }
      await this.enrollmentsService.holdSeats(
        manager,
        studentId,
        created.flatMap(({ details }) =>
          details.map((detail) => ({ classId: detail.classId, orderDetailId: detail.id })),
        ),
      );
      for (const { order, details } of created) {
        if (order.totalAmount !== 0) continue;
        const holds = await Promise.all(
          details.map(async (detail) => ({
            classId: detail.classId,
            orderDetailId: detail.id,
            unitIds: await this.offersService.unitIds(manager, detail.classId),
          })),
        );
        const paidAt = new Date();
        await this.enrollmentsService.activateHolds(manager, studentId, holds, paidAt);
        await this.settlementService.markPaid(manager, order.id, paidAt);
        order.status = OrderStatus.PAID;
        order.paidAt = paidAt;
      }
      await cartDetails.delete({ cartId: cart.id });
      return created;
    });
  }

  private async createOrder(
    manager: EntityManager,
    studentId: string,
    paymentType: PaymentType,
    expiresAt: Date,
    plan: PlannedOrder,
  ): Promise<OrderWithDetails> {
    const orders = manager.getRepository(OrderEntity);
    const order = await orders.save(
      orders.create({
        studentId,
        orderCode: generateOrderCode(),
        totalAmount: plan.totalAmount,
        status: OrderStatus.PENDING,
        paymentType,
        cashMentorId: plan.cashMentorId,
        expiresAt,
        paidAt: null,
      }),
    );
    const orderDetails = manager.getRepository(OrderDetailEntity);
    const details = await orderDetails.save(
      plan.offers.map((offer) =>
        orderDetails.create({
          orderId: order.id,
          classId: offer.classId,
          courseTitleSnapshot: offer.courseTitle,
          classNameSnapshot: offer.name,
          priceSnapshot: offer.priceAmount,
          quantity: 1,
          totalAmount: offer.priceAmount,
        }),
      ),
    );

    return { order, details };
  }
}
