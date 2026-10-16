import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In, type SelectQueryBuilder } from 'typeorm';
import type { OrderPageOptionsDto } from '../dtos/order-page-options.dto.js';
import { OrderEntity } from '../entities/order.entity.js';
import { OrderDetailEntity } from '../entities/order-detail.entity.js';
import type { PaymentType } from '../enums/payment-type.enum.js';
import {
  OrderAccessDeniedException,
  OrderNotFoundException,
} from '../exceptions/commerce.exceptions.js';
import type { OrderWithDetails } from './checkout.service.js';

@Injectable()
export class OrdersService {
  constructor(private readonly dataSource: DataSource) {}

  managementQuery(
    manager: EntityManager,
    filters: {
      studentId?: string;
      paymentType?: PaymentType;
      classId?: string;
      orderDetailIds?: readonly string[];
    } = {},
  ): SelectQueryBuilder<OrderEntity> {
    const query = manager.getRepository(OrderEntity).createQueryBuilder('purchase');
    if (filters.studentId !== undefined)
      query.andWhere('purchase.studentId = :studentId', { studentId: filters.studentId });
    if (filters.paymentType !== undefined)
      query.andWhere('purchase.paymentType = :paymentType', { paymentType: filters.paymentType });
    if (filters.classId !== undefined)
      query.andWhere(
        'EXISTS (SELECT 1 FROM order_details d WHERE d.order_id = purchase.id AND d.class_id = :classId)',
        { classId: filters.classId },
      );
    if (filters.orderDetailIds !== undefined) {
      if (!filters.orderDetailIds.length) query.andWhere('FALSE');
      else
        query.andWhere(
          'EXISTS (SELECT 1 FROM order_details d WHERE d.order_id = purchase.id AND d.id IN (:...detailIds))',
          { detailIds: [...filters.orderDetailIds] },
        );
    }
    return query;
  }
  async managementDetails(
    manager: EntityManager,
    orderIds: readonly string[],
  ): Promise<OrderDetailEntity[]> {
    return orderIds.length
      ? manager
          .getRepository(OrderDetailEntity)
          .find({ where: { orderId: In([...orderIds]) }, order: { classId: 'ASC' } })
      : [];
  }

  async listForStudent(
    studentId: string,
    options: OrderPageOptionsDto,
  ): Promise<{ items: OrderWithDetails[]; total: number }> {
    const [orders, total] = await this.dataSource.getRepository(OrderEntity).findAndCount({
      where: { studentId, ...(options.status === undefined ? {} : { status: options.status }) },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    });

    return { items: await this.attachDetails(orders), total };
  }

  /** The role guard is not enough: the order must belong to the requesting student. */
  async getForStudent(studentId: string, orderId: string): Promise<OrderWithDetails> {
    const order = await this.dataSource.getRepository(OrderEntity).findOne({
      where: { id: orderId },
    });
    if (order === null) {
      throw new OrderNotFoundException();
    }
    if (order.studentId !== studentId) {
      throw new OrderAccessDeniedException();
    }

    const [withDetails] = await this.attachDetails([order]);
    if (withDetails === undefined) {
      throw new OrderNotFoundException();
    }

    return withDetails;
  }

  private async attachDetails(orders: readonly OrderEntity[]): Promise<OrderWithDetails[]> {
    if (orders.length === 0) {
      return [];
    }

    const details = await this.dataSource.getRepository(OrderDetailEntity).find({
      where: { orderId: In(orders.map((order) => order.id)) },
      order: { classId: 'ASC' },
    });
    return orders.map((order) => ({
      order,
      details: details.filter((detail) => detail.orderId === order.id),
    }));
  }
}
