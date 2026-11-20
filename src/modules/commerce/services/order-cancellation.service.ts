import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { ClassOffersService } from '../../classes/services/class-offers.service.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { OrderEntity } from '../entities/order.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import {
  OrderAccessDeniedException,
  OrderNotCancellableException,
} from '../exceptions/commerce.exceptions.js';
import type { OrderWithDetails } from './checkout.service.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { OrderSettlementService } from './order-settlement.service.js';

@Injectable()
export class OrderCancellationService {
  constructor(
    private readonly db: DataSource,
    private readonly orders: OrderSettlementService,
    private readonly classes: ClassOffersService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async cancel(studentId: string, orderId: string): Promise<OrderWithDetails> {
    return this.db.transaction(async (manager) => {
      const snapshot = await this.orders.read(manager, orderId, studentId);
      // Match checkout/payment lock order: classes, order, then enrollments.
      await this.classes.lockOffers(
        manager,
        snapshot.details.map((detail) => detail.classId),
      );
      const order = await this.orders.lock(manager, orderId);
      if (order.studentId !== studentId) throw new OrderAccessDeniedException();
      if (order.status === OrderStatus.CANCELLED) return { order, details: snapshot.details };
      if (order.status !== OrderStatus.PENDING || order.expiresAt <= new Date())
        throw new OrderNotCancellableException();
      await manager.getRepository(OrderEntity).update(orderId, { status: OrderStatus.CANCELLED });
      await this.enrollments.releaseHolds(
        manager,
        snapshot.details.map((detail) => detail.id),
      );
      order.status = OrderStatus.CANCELLED;
      return { order, details: snapshot.details };
    });
  }
}
