import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { AttendanceAdmissionBasis } from '../enums/attendance-admission-basis.enum.js';

@Entity({ name: 'attendance_recovery_audit_items' })
@Index('uq_recovery_item_attendance', ['attendanceId'], { unique: true })
export class AttendanceRecoveryAuditItemEntity {
  @PrimaryColumn({ name: 'recovery_audit_id', type: 'uuid' }) recoveryAuditId!: string;
  @PrimaryColumn({ name: 'attendance_id', type: 'uuid' }) attendanceId!: string;
  @Column({ name: 'session_id', type: 'uuid' }) sessionId!: string;
  @Column({ name: 'enrollment_id', type: 'uuid' }) enrollmentId!: string;
  @Column({ name: 'admission_basis', type: 'varchar', length: 30 })
  admissionBasis!: AttendanceAdmissionBasis;
  @Column({ name: 'order_detail_id', type: 'uuid' }) orderDetailId!: string;
  @Column({ name: 'order_id', type: 'uuid' }) orderId!: string;
  @Column({ name: 'payment_id', type: 'uuid' }) paymentId!: string;
  @Column({ name: 'paid_at', type: 'timestamptz' }) paidAt!: Date;
}
