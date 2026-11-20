import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '../../../common/database/column-transformers.js';

@Entity({ name: 'cart_details' })
@Index('uq_cart_details_cart_class', ['cartId', 'classId'], { unique: true })
@Index('idx_cart_details_class', ['classId'])
export class CartDetailEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  /** Price shown when the class was added; display only, checkout always re-reads the price. */
  @Column({ name: 'price_snapshot', type: 'bigint', transformer: numericColumnTransformer })
  priceSnapshot!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
