import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { SessionStatus } from '../enums/session-status.enum.js';

@Entity({ name: 'class_sessions' })
@Index('uq_class_sessions_unit_number', ['classUnitId', 'sessionNumber'], { unique: true })
@Index('idx_class_sessions_time_range', ['startsAt', 'endsAt'])
export class ClassSessionEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_unit_id', type: 'uuid' })
  classUnitId!: string;

  @Column({ name: 'makeup_for_session_id', type: 'uuid', nullable: true })
  makeupForSessionId!: string | null;

  @Column({ name: 'makeup_root_session_id', type: 'uuid', nullable: true })
  makeupRootSessionId!: string | null;

  @Column({ name: 'mentor_override_id', type: 'uuid', nullable: true })
  mentorOverrideId!: string | null;

  /** Unknown for pre-migration history; never infer it from the current primary mentor. */
  @Column({ name: 'teaching_mentor_id', type: 'uuid', nullable: true })
  teachingMentorId!: string | null;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'actual_started_at', type: 'timestamptz', nullable: true })
  actualStartedAt!: Date | null;

  @Column({ name: 'actual_ended_at', type: 'timestamptz', nullable: true })
  actualEndedAt!: Date | null;

  @Column({ name: 'started_by', type: 'uuid', nullable: true })
  startedBy!: string | null;

  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy!: string | null;

  @Column({ name: 'editable_until', type: 'timestamptz', nullable: true })
  editableUntil!: Date | null;

  @Column({ name: 'session_number', type: 'integer' })
  sessionNumber!: number;

  @Column({ name: 'title', type: 'varchar', length: 250 })
  title!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'room_name', type: 'varchar', length: 150, nullable: true })
  roomName!: string | null;

  @Column({ name: 'meeting_url', type: 'text', nullable: true })
  meetingUrl!: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SessionStatus,
    enumName: 'session_status_enum',
    default: SessionStatus.SCHEDULED,
  })
  status!: SessionStatus;
}
