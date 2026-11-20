import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '../../../common/database/column-transformers.js';

/** Immutable commercial snapshot of one purchased class; never updated after checkout. */
@Entity({ name: 'order_details' })
@Index('uq_order_details_order_class', ['orderId', 'classId'], { unique: true })
@Index('idx_order_details_class', ['classId'])
export class OrderDetailEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'course_title_snapshot', type: 'varchar', length: 250 })
  courseTitleSnapshot!: string;

  @Column({ name: 'class_name_snapshot', type: 'varchar', length: 250 })
  classNameSnapshot!: string;

  @Column({ name: 'price_snapshot', type: 'bigint', transformer: numericColumnTransformer })
  priceSnapshot!: number;

  /** Always 1: a student buys one seat per class. */
  @Column({ name: 'quantity', type: 'integer', default: 1 })
  quantity!: number;

  @Column({ name: 'total_amount', type: 'bigint', transformer: numericColumnTransformer })
  totalAmount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
