import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { numericColumnTransformer } from '../../../common/database/column-transformers.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';

@Entity({ name: 'orders' })
@Index('idx_orders_student_created', ['studentId', 'createdAt'])
@Index('idx_orders_status_expires', ['status', 'expiresAt'])
@Index('idx_orders_cash_mentor_status', ['cashMentorId', 'status'], {
  where: '"cash_mentor_id" IS NOT NULL',
})
export class OrderEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'order_code', type: 'varchar', length: 50, unique: true })
  orderCode!: string;

  /** Integer VND total calculated by the server from the order details. */
  @Column({ name: 'total_amount', type: 'bigint', transformer: numericColumnTransformer })
  totalAmount!: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status_enum',
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({ name: 'payment_type', type: 'enum', enum: PaymentType, enumName: 'payment_type_enum' })
  paymentType!: PaymentType;

  /**
   * Mentor of every class in a cash order at checkout time; the only user allowed to confirm
   * the cash later. Always null for PayOS orders.
   */
  @Column({ name: 'cash_mentor_id', type: 'uuid', nullable: true })
  cashMentorId!: string | null;

  /** Deadline of the seat hold; an unpaid order expires after it. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;
}
