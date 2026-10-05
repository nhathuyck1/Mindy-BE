import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { numericColumnTransformer } from '../../../common/database/column-transformers.js';

@Entity({ name: 'payment_confirmation_emails' })
export class PaymentConfirmationEmailEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'order_id', type: 'uuid', unique: true }) orderId!: string;
  @Column({ name: 'student_id', type: 'uuid' }) studentId!: string;
  @Column({ name: 'order_code', type: 'varchar', length: 50 }) orderCode!: string;
  @Column({ type: 'bigint', transformer: numericColumnTransformer }) amount!: number;
  @Column({ type: 'varchar', length: 20, default: 'PENDING' }) status!:
    | 'PENDING'
    | 'SENDING'
    | 'SENT'
    | 'FAILED';
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true }) leaseToken!: string | null;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true }) leaseUntil!: Date | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;
}
