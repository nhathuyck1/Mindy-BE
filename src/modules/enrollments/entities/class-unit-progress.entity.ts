import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';

@Entity({ name: 'class_unit_progress' })
export class ClassUnitProgressEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'enrollment_id', type: 'uuid' }) enrollmentId!: string;
  @Column({ name: 'class_unit_id', type: 'uuid' }) classUnitId!: string;
  @Column({ type: 'varchar', length: 20, default: 'NOT_STARTED' }) status!: string;
  @Column({ name: 'progress_percent', type: 'numeric', precision: 5, scale: 2, default: 0 })
  progressPercent!: string;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
}
