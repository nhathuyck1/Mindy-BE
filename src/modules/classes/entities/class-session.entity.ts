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
