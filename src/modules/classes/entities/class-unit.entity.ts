import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';

/** Delivery of one course unit inside a class; owns its own position, unlock time and state. */
@Entity({ name: 'class_units' })
@Index('uq_class_units_class_course_unit', ['classId', 'courseUnitId'], { unique: true })
@Index('uq_class_units_class_position', ['classId', 'position'], { unique: true })
@Index('idx_class_units_course_unit', ['courseUnitId'])
export class ClassUnitEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'course_unit_id', type: 'uuid' })
  courseUnitId!: string;

  @Column({ name: 'position', type: 'integer' })
  position!: number;

  @Column({ name: 'unlock_at', type: 'timestamptz', nullable: true })
  unlockAt!: Date | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ClassUnitStatus,
    enumName: 'class_unit_status_enum',
    default: ClassUnitStatus.LOCKED,
  })
  status!: ClassUnitStatus;
}
