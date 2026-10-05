import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OrderEntity } from '../entities/order.entity.js';
import { OrderDetailEntity } from '../entities/order-detail.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import {
  OrderAccessDeniedException,
  OrderNotFoundException,
} from '../exceptions/commerce.exceptions.js';
import type { OrderWithDetails } from './checkout.service.js';

/** Public commerce API; callers supply the transaction manager. */
@Injectable()
export class OrderSettlementService {
  async read(
    manager: EntityManager,
    orderId: string,
    studentId?: string,
  ): Promise<OrderWithDetails> {
    const order = await manager.getRepository(OrderEntity).findOneBy({ id: orderId });
    if (!order) throw new OrderNotFoundException();
    if (studentId !== undefined && order.studentId !== studentId)
      throw new OrderAccessDeniedException();
    const details = await manager
      .getRepository(OrderDetailEntity)
      .find({ where: { orderId }, order: { classId: 'ASC' } });
    return { order, details };
  }

  async lock(manager: EntityManager, orderId: string): Promise<OrderEntity> {
    const order = await manager
      .getRepository(OrderEntity)
      .findOne({ where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
    if (!order) throw new OrderNotFoundException();
    return order;
  }

  async markPaid(manager: EntityManager, orderId: string, paidAt: Date): Promise<void> {
    await manager
      .getRepository(OrderEntity)
      .update({ id: orderId, status: OrderStatus.PENDING }, { status: OrderStatus.PAID, paidAt });
  }
}
