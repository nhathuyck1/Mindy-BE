import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { attendanceDeadline } from '../domain/class-calendar.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import { ClassSessionLocalTimeInvalidException } from '../exceptions/class.exceptions.js';
import { TeachingConflictException } from '../exceptions/teaching.exceptions.js';

/** Public transaction participant. Caller holds Class -> Session locks. */
@Injectable()
export class SessionLifecycleService {
  constructor(private readonly config: ConfigService) {}

  async start(
    m: EntityManager,
    c: ClassEntity,
    s: ClassSessionEntity,
    actorId: string,
    at: Date,
    reason?: string,
  ): Promise<void> {
    if (
      ![ClassStatus.OPEN, ClassStatus.IN_PROGRESS].includes(c.status) ||
      s.status !== SessionStatus.SCHEDULED
    )
      throw new TeachingConflictException(
        'SESSION_STATE_CONFLICT',
        'Start requires an open/in-progress class and scheduled session',
      );
    const old = s.status;
    s.status = SessionStatus.IN_PROGRESS;
    s.actualStartedAt = at;
    s.startedBy = actorId;
    s.teachingMentorId = s.mentorOverrideId ?? c.mentorId;
    const deadline = attendanceDeadline(
      s.startsAt,
      this.config.getOrThrow<string>('APP_TIME_ZONE'),
    );
    if (!deadline) throw new ClassSessionLocalTimeInvalidException();
    s.editableUntil = deadline;
    if (c.status === ClassStatus.OPEN) {
      c.status = ClassStatus.IN_PROGRESS;
      c.assignmentVersion += 1;
      await m.getRepository(ClassEntity).save(c);
    }
    await this.save(m, s, actorId, old, reason);
  }

  async finalize(
    m: EntityManager,
    s: ClassSessionEntity,
    actorId: string,
    at: Date,
    reason?: string,
  ): Promise<void> {
    const old = s.status;
    s.status = SessionStatus.COMPLETED;
    s.actualEndedAt = at;
    s.completedBy = actorId;
    await this.save(m, s, actorId, old, reason);
  }

  async bumpVersion(m: EntityManager, s: ClassSessionEntity): Promise<void> {
    s.version += 1;
    await m.getRepository(ClassSessionEntity).save(s);
  }

  /** Historical evidence recovery, never reopens the Class or invents past actors. */
  async recover(
    m: EntityManager,
    c: ClassEntity,
    s: ClassSessionEntity,
    actorId: string,
    start: Date,
    end: Date,
    reason: string,
  ): Promise<void> {
    if (
      c.status === ClassStatus.DRAFT ||
      ![SessionStatus.SCHEDULED, SessionStatus.COMPLETED].includes(s.status)
    )
      throw new TeachingConflictException('SESSION_STATE_CONFLICT', 'Session cannot be recovered');
    const old = s.status;
    s.actualStartedAt ??= start;
    s.actualEndedAt ??= end;
    const deadline = attendanceDeadline(
      s.startsAt,
      this.config.getOrThrow<string>('APP_TIME_ZONE'),
    );
    if (!deadline) throw new ClassSessionLocalTimeInvalidException();
    s.editableUntil ??= deadline;
    s.status = SessionStatus.COMPLETED;
    await this.save(m, s, actorId, old, reason);
  }

  private async save(
    m: EntityManager,
    s: ClassSessionEntity,
    actorId: string,
    old: SessionStatus,
    reason?: string,
  ): Promise<void> {
    await this.bumpVersion(m, s);
    await m.query(
      `INSERT INTO session_lifecycle_audits(session_id,actor_id,old_status,new_status,reason,version) VALUES($1,$2,$3,$4,$5,$6)`,
      [s.id, actorId, old, s.status, reason ?? null, s.version],
    );
  }
}
