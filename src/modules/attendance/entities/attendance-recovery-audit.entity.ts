import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';

/** Append-only evidence event, like the existing lifecycle/attendance SQL audits. */
@Entity({ name: 'attendance_recovery_audits' })
@Index('uq_recovery_session_version', ['sessionId', 'version'], { unique: true })
export class AttendanceRecoveryAuditEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'session_id', type: 'uuid' }) sessionId!: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId!: string;
  @Column({ type: 'integer' }) version!: number;
  @Column({ type: 'varchar', length: 1000 }) reason!: string;
  @Column({ name: 'evidence_note', type: 'varchar', length: 2000 }) evidenceNote!: string;
  @Column({
    name: 'old_status',
    type: 'enum',
    enum: SessionStatus,
    enumName: 'session_status_enum',
  })
  oldStatus!: SessionStatus;
  @Column({
    name: 'new_status',
    type: 'enum',
    enum: SessionStatus,
    enumName: 'session_status_enum',
  })
  newStatus!: SessionStatus;
  @Column({ name: 'old_actual_started_at', type: 'timestamptz', nullable: true })
  oldActualStartedAt!: Date | null;
  @Column({ name: 'new_actual_started_at', type: 'timestamptz' }) newActualStartedAt!: Date;
  @Column({ name: 'old_actual_ended_at', type: 'timestamptz', nullable: true })
  oldActualEndedAt!: Date | null;
  @Column({ name: 'new_actual_ended_at', type: 'timestamptz' }) newActualEndedAt!: Date;
  @Column({ name: 'old_editable_until', type: 'timestamptz', nullable: true })
  oldEditableUntil!: Date | null;
  @Column({ name: 'new_editable_until', type: 'timestamptz' }) newEditableUntil!: Date;
  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}
