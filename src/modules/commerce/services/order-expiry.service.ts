import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In } from 'typeorm';

// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { OrderEntity } from '../entities/order.entity.js';
import { OrderDetailEntity } from '../entities/order-detail.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';

/**
 * Expires unpaid orders after their hold deadline: the order becomes EXPIRED and its pending
 * enrollments are cancelled, which frees the seats. Nothing is deleted, and expiring an order
 * that is no longer PENDING is a no-op, so every entry point is safe to repeat.
 */
@Injectable()
export class OrderExpiryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  /**
   * Releases overdue holds on the given classes. Checkout calls this while holding the class
   * locks so capacity is counted without seats that should already be free.
   */
  async expireOverdueForClasses(
    manager: EntityManager,
    classIds: readonly string[],
    now: Date,
  ): Promise<number> {
    if (classIds.length === 0) {
      return 0;
    }

    const orders = await manager
      .getRepository(OrderEntity)
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.status = :status', { status: OrderStatus.PENDING })
      .andWhere('order.expiresAt <= :now', { now })
      .andWhere(
        (query) =>
          `EXISTS ${query
            .subQuery()
            .select('1')
            .from(OrderDetailEntity, 'detail')
            .where('detail.orderId = order.id')
            .andWhere('detail.classId IN (:...classIds)')
            .getQuery()}`,
        { classIds: [...classIds] },
      )
      .orderBy('order.id', 'ASC')
      .getMany();
    return this.expire(manager, orders);
  }

  /**
   * Expires one batch of overdue orders in its own transaction. SKIP LOCKED lets several
   * replicas run the job at once without waiting on, or double-processing, the same orders.
   */
  async expireOverdueBatch(now: Date, limit: number): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const orders = await manager
        .getRepository(OrderEntity)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('order.status = :status', { status: OrderStatus.PENDING })
        .andWhere('order.expiresAt <= :now', { now })
        .orderBy('order.expiresAt', 'ASC')
        .addOrderBy('order.id', 'ASC')
        .take(limit)
        .getMany();
      return this.expire(manager, orders);
    });
  }

  /** Expects the orders to be locked and PENDING. */
  private async expire(manager: EntityManager, orders: readonly OrderEntity[]): Promise<number> {
    if (orders.length === 0) {
      return 0;
    }

    const orderIds = orders.map((order) => order.id);
    await manager
      .getRepository(OrderEntity)
      .update({ id: In(orderIds), status: OrderStatus.PENDING }, { status: OrderStatus.EXPIRED });
    const details = await manager.getRepository(OrderDetailEntity).find({
      select: { id: true },
      where: { orderId: In(orderIds) },
    });
    await this.enrollmentsService.releaseHolds(
      manager,
      details.map((detail) => detail.id),
    );
    return orders.length;
  }
}
