import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { DeliveryMode } from '../enums/delivery-mode.enum.js';

@Entity({ name: 'classes' })
@Index('idx_classes_course_status', ['courseId', 'status'])
@Index('idx_classes_mentor_dates', ['mentorId', 'startDate', 'endDate'])
@Index('idx_classes_status_start_date', ['status', 'startDate'])
export class ClassEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  @Column({ name: 'code', type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ name: 'name', type: 'varchar', length: 250 })
  name!: string;

  /** Calendar date in `YYYY-MM-DD` form. */
  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  /** Calendar date in `YYYY-MM-DD` form. */
  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ name: 'max_students', type: 'integer' })
  maxStudents!: number;

  @Column({
    name: 'delivery_mode',
    type: 'enum',
    enum: DeliveryMode,
    enumName: 'delivery_mode_enum',
  })
  deliveryMode!: DeliveryMode;

  @Column({ name: 'meeting_url', type: 'text', nullable: true })
  meetingUrl!: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ClassStatus,
    enumName: 'class_status_enum',
    default: ClassStatus.DRAFT,
  })
  status!: ClassStatus;
}
