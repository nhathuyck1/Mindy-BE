import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';

@Entity('class_unit_release_audit')
@Index('idx_class_unit_release_audit_unit_time', ['classUnitId', 'occurredAt', 'id'])
@Index('idx_class_unit_release_audit_class', ['classId'])
@Index('idx_class_unit_release_audit_actor', ['actorId'])
export class ClassUnitReleaseAuditEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId!: string;
  @Column({ name: 'class_id', type: 'uuid' }) classId!: string;
  @Column({ name: 'class_unit_id', type: 'uuid' }) classUnitId!: string;
  @Column({
    name: 'before_status',
    type: 'enum',
    enum: ClassUnitStatus,
    enumName: 'class_unit_status_enum',
  })
  beforeStatus!: ClassUnitStatus;
  @Column({
    name: 'after_status',
    type: 'enum',
    enum: ClassUnitStatus,
    enumName: 'class_unit_status_enum',
  })
  afterStatus!: ClassUnitStatus;
  @Column({ name: 'before_unlock_at', type: 'timestamptz', nullable: true })
  beforeUnlockAt!: Date | null;
  @Column({ name: 'after_unlock_at', type: 'timestamptz', nullable: true })
  afterUnlockAt!: Date | null;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}
