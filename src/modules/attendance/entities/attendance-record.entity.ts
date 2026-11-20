import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';

@Entity({ name: 'attendance_records' })
@Index('uq_attendance_enrollment_session', ['enrollmentId', 'sessionId'], { unique: true })
@Index('idx_attendance_session_status', ['sessionId', 'status'])
export class AttendanceRecordEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;
  @Column({
    type: 'enum',
    enum: AttendanceStatus,
    enumName: 'attendance_status_enum',
    default: AttendanceStatus.UNMARKED,
  })
  status!: AttendanceStatus;
  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt!: Date | null;
  @Column({ name: 'recorded_by', type: 'uuid' })
  recordedBy!: string;
  @Column({ name: 'admitted_at', type: 'timestamptz' })
  admittedAt!: Date;
  @Column({ name: 'admission_source', type: 'varchar', length: 30 })
  admissionSource!: string;
}
