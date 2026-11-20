import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('material_audit_events')
export class MaterialAuditEventEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'material_id', type: 'uuid' }) materialId!: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId!: string;
  @Column({ type: 'varchar', length: 20 }) action!: string;
  @Column({ type: 'integer' }) revision!: number;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}
