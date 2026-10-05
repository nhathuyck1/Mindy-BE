import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { numericColumnTransformer } from '../../../common/database/column-transformers.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';

@Entity({ name: 'payment_transactions' })
export class PaymentTransactionEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'order_id', type: 'uuid', unique: true }) orderId!: string;
  @Column({ type: 'bigint', transformer: numericColumnTransformer }) amount!: number;
  @Column({ type: 'varchar', length: 30, default: PaymentStatus.CREATING }) status!: PaymentStatus;
  @Column({ name: 'reference_code', type: 'varchar', length: 150, nullable: true, unique: true })
  referenceCode!: string | null;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt!: Date | null;
}
