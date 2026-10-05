import { Injectable } from '@nestjs/common';
import { type EntityManager, In } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { OrderEntity } from '../entities/order.entity.js';
import { OrderDetailEntity } from '../entities/order-detail.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import {
  OrderAccessDeniedException,
  OrderNotFoundException,
} from '../exceptions/commerce.exceptions.js';
import type { OrderWithDetails } from './checkout.service.js';

/** Public commerce API; callers supply the transaction manager. */
@Injectable()
export class OrderSettlementService {
  async listCash(
    manager: EntityManager,
    mentorId: string,
    options: PageOptionsDto,
  ): Promise<{ items: OrderWithDetails[]; total: number }> {
    const [orders, total] = await manager.getRepository(OrderEntity).findAndCount({
      where: { cashMentorId: mentorId, paymentType: PaymentType.CASH },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    });
    const details = orders.length
      ? await manager
          .getRepository(OrderDetailEntity)
          .find({ where: { orderId: In(orders.map((o) => o.id)) }, order: { classId: 'ASC' } })
      : [];
    return {
      items: orders.map((order) => ({
        order,
        details: details.filter((d) => d.orderId === order.id),
      })),
      total,
    };
  }

  async pendingCashDetail(
    manager: EntityManager,
    studentId: string,
    classId: string,
  ): Promise<string | null> {
    const detail = await manager
      .getRepository(OrderDetailEntity)
      .createQueryBuilder('detail')
      .innerJoin(OrderEntity, 'order', 'order.id = detail.orderId')
      .where('detail.classId = :classId', { classId })
      .andWhere('order.studentId = :studentId', { studentId })
      .andWhere('order.paymentType = :method', { method: PaymentType.CASH })
      .andWhere('order.status = :status', { status: OrderStatus.PENDING })
      .andWhere('order.expiresAt > :now', { now: new Date() })
      .getOne();
    return detail?.id ?? null;
  }
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
