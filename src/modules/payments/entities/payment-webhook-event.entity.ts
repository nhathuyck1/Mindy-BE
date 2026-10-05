import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericColumnTransformer } from '../../../common/database/column-transformers.js';

@Entity({ name: 'payment_webhook_events' })
export class PaymentWebhookEventEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'event_key', type: 'varchar', length: 64, unique: true }) eventKey!: string;
  @Column({ type: 'varchar', length: 64 }) fingerprint!: string;
  @Column({ name: 'payment_id', type: 'uuid', nullable: true }) paymentId!: string | null;
  @Column({ name: 'provider_order_code', type: 'bigint', transformer: numericColumnTransformer })
  providerOrderCode!: number;
  @Column({ name: 'reference_code', type: 'varchar', length: 150 }) referenceCode!: string;
  @Column({ name: 'payment_link_id', type: 'varchar', length: 150 }) paymentLinkId!: string;
  @Column({ type: 'bigint', transformer: numericColumnTransformer }) amount!: number;
  @Column({ type: 'varchar', length: 10 }) currency!: string;
  @Column({ name: 'result_code', type: 'varchar', length: 10 }) resultCode!: string;
  @Column({ type: 'varchar', length: 20 }) source!: 'WEBHOOK' | 'RECONCILIATION';
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId!: string | null;
  @Column({ type: 'varchar', length: 30 }) outcome!:
    | 'SETTLED'
    | 'REQUIRES_REVIEW'
    | 'CONFIRM_SAMPLE';
  @Column({ type: 'varchar', length: 60, nullable: true }) reason!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
