import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { EnrollmentStatus } from '../enums/enrollment-status.enum.js';

/** Statuses that occupy the (student, class) slot; CANCELLED rows are history only. */
export const EFFECTIVE_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  EnrollmentStatus.PENDING_PAYMENT,
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.COMPLETED,
];

/** Statuses that take a seat of the class capacity. */
export const SEAT_HOLDING_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  EnrollmentStatus.PENDING_PAYMENT,
  EnrollmentStatus.ACTIVE,
];

/**
 * A student's entitlement to one class. Checkout creates it as PENDING_PAYMENT to hold a seat;
 * the partial unique index `uq_enrollments_student_class_effective` (see migration) is the
 * final defense against duplicate purchases.
 */
@Entity({ name: 'enrollments' })
@Index('idx_enrollments_class_status', ['classId', 'status'])
export class EnrollmentEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'order_detail_id', type: 'uuid', unique: true })
  orderDetailId!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EnrollmentStatus,
    enumName: 'enrollment_status_enum',
    default: EnrollmentStatus.PENDING_PAYMENT,
  })
  status!: EnrollmentStatus;

  @Column({ name: 'enrolled_at', type: 'timestamptz', nullable: true })
  enrolledAt!: Date | null;
}
