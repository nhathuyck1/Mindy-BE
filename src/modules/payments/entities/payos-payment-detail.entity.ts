import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { numericColumnTransformer } from '../../../common/database/column-transformers.js';

@Entity({ name: 'payos_payment_details' })
export class PayosPaymentDetailEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'payment_transaction_id', type: 'uuid', unique: true }) paymentId!: string;
  @Column({ name: 'channel_key', type: 'varchar', length: 64 }) channelKey!: string;
  @Column({
    name: 'payos_order_code',
    type: 'bigint',
    unique: true,
    transformer: numericColumnTransformer,
    default: () => "nextval('payos_order_code_seq')",
  })
  providerOrderCode!: number;
  @Column({ name: 'payment_link_id', type: 'varchar', length: 150, nullable: true, unique: true })
  paymentLinkId!: string | null;
  @Column({ name: 'checkout_url', type: 'text', nullable: true }) checkoutUrl!: string | null;
  @Column({ name: 'qr_code', type: 'text', nullable: true }) qrCode!: string | null;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true }) leaseToken!: string | null;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true }) leaseUntil!: Date | null;
}
