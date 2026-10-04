import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';

import { normalizeOptionalText } from '../../../common/text/normalize-text.js';
import { isWithinClassPeriod } from '../domain/class-calendar.js';
import type { ScheduleClassSessionDto } from '../dtos/schedule-class-session.dto.js';
import type { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import {
  ClassMentorScheduleConflictException,
  ClassNotReadyToOpenException,
  ClassSessionOutsideClassPeriodException,
  ClassSessionOverlapException,
  ClassSessionTimeRangeInvalidException,
  ClassUnitNotFoundException,
} from '../exceptions/class.exceptions.js';

/** Classes whose sessions occupy their mentor's calendar. */
const SCHEDULE_BINDING_STATUSES: readonly ClassStatus[] = [
  ClassStatus.OPEN,
  ClassStatus.IN_PROGRESS,
];

/**
 * Timetable rules of a class: session validity, overlaps and mentor availability. Every method
 * runs inside the caller's transaction, which must already hold the class row lock.
 */
@Injectable()
export class ClassScheduleService {
  constructor(private readonly config: ConfigService) {}

  bindsMentorCalendar(classEntity: ClassEntity): boolean {
    return SCHEDULE_BINDING_STATUSES.includes(classEntity.status);
  }

  async addSession(
    manager: EntityManager,
    classEntity: ClassEntity,
    input: ScheduleClassSessionDto,
  ): Promise<void> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt.getTime() >= endsAt.getTime()) {
      throw new ClassSessionTimeRangeInvalidException();
    }

    const unit = await manager.getRepository(ClassUnitEntity).findOne({
      where: { id: input.classUnitId, classId: classEntity.id },
    });
    if (unit === null) {
      throw new ClassUnitNotFoundException();
    }
    if (!isWithinClassPeriod({ startsAt, endsAt }, classEntity, this.timeZone())) {
      throw new ClassSessionOutsideClassPeriodException();
    }

    const sessions = manager.getRepository(ClassSessionEntity);
    const overlaps = await sessions
      .createQueryBuilder('session')
      .innerJoin(ClassUnitEntity, 'unit', 'unit.id = session.classUnitId')
      .where('unit.classId = :classId', { classId: classEntity.id })
      .andWhere('session.status = :status', { status: SessionStatus.SCHEDULED })
      .andWhere('session.startsAt < :endsAt AND session.endsAt > :startsAt', { startsAt, endsAt })
      .getExists();
    if (overlaps) {
      throw new ClassSessionOverlapException();
    }

    const last = await sessions.findOne({
      where: { classUnitId: unit.id },
      order: { sessionNumber: 'DESC' },
    });
    await sessions.save(
      sessions.create({
        classUnitId: unit.id,
        sessionNumber: (last?.sessionNumber ?? 0) + 1,
        title: input.title.trim(),
        startsAt,
        endsAt,
        roomName: normalizeOptionalText(input.roomName),
        meetingUrl: normalizeOptionalText(input.meetingUrl),
        status: SessionStatus.SCHEDULED,
      }),
    );
    if (this.bindsMentorCalendar(classEntity)) {
      await this.assertMentorAvailable(manager, classEntity);
    }
  }

  /** A class can open only with at least one scheduled session, all inside its period. */
  async assertReadyToOpen(manager: EntityManager, classEntity: ClassEntity): Promise<void> {
    const sessions = await manager
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('session')
      .innerJoin(ClassUnitEntity, 'unit', 'unit.id = session.classUnitId')
      .where('unit.classId = :classId', { classId: classEntity.id })
      .andWhere('session.status = :status', { status: SessionStatus.SCHEDULED })
      .getMany();
    const timeZone = this.timeZone();
    if (
      sessions.length === 0 ||
      sessions.some((session) => !isWithinClassPeriod(session, classEntity, timeZone))
    ) {
      throw new ClassNotReadyToOpenException();
    }

    await this.assertMentorAvailable(manager, classEntity);
  }

  /**
   * Rejects the change when a scheduled session of this class overlaps a scheduled session of
   * another OPEN/IN_PROGRESS class taught by the same mentor. The advisory lock serializes
   * concurrent schedule changes for one mentor until the transaction ends.
   */
  async assertMentorAvailable(manager: EntityManager, classEntity: ClassEntity): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      classEntity.mentorId,
    ]);
    const conflicts: unknown[] = await manager.query(
      `SELECT 1
       FROM "class_sessions" mine
       JOIN "class_units" mine_unit ON mine_unit.id = mine.class_unit_id
       JOIN "class_sessions" other
         ON other.starts_at < mine.ends_at AND other.ends_at > mine.starts_at
       JOIN "class_units" other_unit ON other_unit.id = other.class_unit_id
       JOIN "classes" other_class ON other_class.id = other_unit.class_id
       WHERE mine_unit.class_id = $1
         AND mine.status = $3::"session_status_enum"
         AND other.status = $3::"session_status_enum"
         AND other_class.id <> $1
         AND other_class.mentor_id = $2
         AND other_class.status = ANY($4::"class_status_enum"[])
       LIMIT 1`,
      [classEntity.id, classEntity.mentorId, SessionStatus.SCHEDULED, SCHEDULE_BINDING_STATUSES],
    );
    if (conflicts.length > 0) {
      throw new ClassMentorScheduleConflictException();
    }
  }

  private timeZone(): string {
    return this.config.getOrThrow<string>('APP_TIME_ZONE');
  }
}
