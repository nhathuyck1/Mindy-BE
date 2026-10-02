import { ApiProperty } from '@nestjs/swagger';

import type { OrderDetailEntity } from '../entities/order-detail.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import type { OrderWithDetails } from '../services/checkout.service.js';

/** Immutable snapshot of one purchased class. */
export class OrderDetailDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId: string;

  @ApiProperty({ type: String })
  readonly courseTitle: string;

  @ApiProperty({ type: String })
  readonly className: string;

  @ApiProperty({ type: Number, description: 'VND price captured at checkout' })
  readonly priceAmount: number;

  @ApiProperty({ type: Number, example: 1 })
  readonly quantity: number;

  @ApiProperty({ type: Number })
  readonly totalAmount: number;

  constructor(detail: OrderDetailEntity) {
    this.id = detail.id;
    this.classId = detail.classId;
    this.courseTitle = detail.courseTitleSnapshot;
    this.className = detail.classNameSnapshot;
    this.priceAmount = detail.priceSnapshot;
    this.quantity = detail.quantity;
    this.totalAmount = detail.totalAmount;
  }
}

export class OrderDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String, example: 'MD7K3QX9PA2B4C' })
  readonly orderCode: string;

  @ApiProperty({ type: String, enum: PaymentType })
  readonly paymentType: PaymentType;

  @ApiProperty({ type: String, enum: OrderStatus })
  readonly status: OrderStatus;

  @ApiProperty({ type: Number, description: 'Integer VND total calculated by the server' })
  readonly totalAmount: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Seat hold deadline' })
  readonly expiresAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly paidAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Mentor who collects the cash; null for PayOS orders',
  })
  readonly mentorId: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;

  @ApiProperty({ type: () => OrderDetailDto, isArray: true })
  readonly details: OrderDetailDto[];

  constructor({ order, details }: OrderWithDetails) {
    this.id = order.id;
    this.orderCode = order.orderCode;
    this.paymentType = order.paymentType;
    this.status = order.status;
    this.totalAmount = order.totalAmount;
    this.expiresAt = order.expiresAt;
    this.paidAt = order.paidAt;
    this.mentorId = order.cashMentorId;
    this.createdAt = order.createdAt;
    this.details = details.map((detail) => new OrderDetailDto(detail));
  }
}

/** Checkout always answers with a list, even when a single PayOS order was created. */
export class CheckoutResultDto {
  @ApiProperty({ type: () => OrderDto, isArray: true })
  readonly orders: OrderDto[];

  constructor(orders: readonly OrderWithDetails[]) {
    this.orders = orders.map((order) => new OrderDto(order));
  }
}

export class OrderPageDto {
  @ApiProperty({ type: () => OrderDto, isArray: true })
  readonly items: OrderDto[];

  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;

  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;

  @ApiProperty({ type: Number, example: 42 })
  readonly total: number;

  constructor(items: OrderDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
