import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { normalizeOptionalText } from '../../../common/text/normalize-text.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ScheduleReservationsService } from '../../schedule-reservations/schedule-reservations.service.js';
import {
  isSingleTeachingDay,
  isWithinClassPeriod,
  withLocalTime,
} from '../domain/class-calendar.js';
import type { ScheduleClassSessionDto } from '../dtos/schedule-class-session.dto.js';
import type { UpdateClassSessionTimeDto } from '../dtos/update-class-session-time.dto.js';
import type { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import {
  ClassNotReadyToOpenException,
  ClassSessionLocalTimeInvalidException,
  ClassSessionNotEditableException,
  ClassSessionNotFoundException,
  ClassSessionOutsideClassPeriodException,
  ClassSessionOverlapException,
  ClassSessionOvernightNotAllowedException,
  ClassSessionTimeRangeInvalidException,
  ClassUnitNotFoundException,
} from '../exceptions/class.exceptions.js';
import { TeachingConflictException } from '../exceptions/teaching.exceptions.js';

import { MentorConflictService } from './mentor-conflict.service.js';

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
  constructor(
    private readonly config: ConfigService,
    private readonly reservations: ScheduleReservationsService,
    private readonly conflicts: MentorConflictService = new MentorConflictService(),
  ) {}

  bindsMentorCalendar(classEntity: ClassEntity): boolean {
    return SCHEDULE_BINDING_STATUSES.includes(classEntity.status);
  }

  assertInterval(session: ClassSessionEntity, c: ClassEntity): void {
    if (!(session.startsAt < session.endsAt)) throw new ClassSessionTimeRangeInvalidException();
    if (!isSingleTeachingDay(session.startsAt, session.endsAt, this.timeZone()))
      throw new ClassSessionOvernightNotAllowedException();
    if (
      !isWithinClassPeriod(
        { startsAt: session.startsAt, endsAt: new Date(session.endsAt.getTime() - 1) },
        c,
        this.timeZone(),
      )
    )
      throw new ClassSessionOutsideClassPeriodException();
  }

  async saveRescheduled(m: EntityManager, c: ClassEntity, s: ClassSessionEntity): Promise<void> {
    await this.assertNoPlacements(m, [s.id]);
    this.assertInterval(s, c);
    s.version += 1;
    await m.getRepository(ClassSessionEntity).save(s);
    await this.assertNoClassOverlap(m, c.id);
    if (this.bindsMentorCalendar(c)) await this.assertMentorAvailable(m, c);
    await this.recordConflicts(m, c.id);
  }

  snapshot(s: ClassSessionEntity): Record<string, unknown> {
    return {
      sessionId: s.id,
      classUnitId: s.classUnitId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      status: s.status,
      version: s.version,
      mentorOverrideId: s.mentorOverrideId,
      teachingMentorId: s.teachingMentorId,
      makeupForSessionId: s.makeupForSessionId,
      makeupRootSessionId: s.makeupRootSessionId,
    };
  }

  async audit(
    m: EntityManager,
    c: ClassEntity,
    s: ClassSessionEntity,
    actorId: string | null,
    reason: string,
    action: 'RESCHEDULE' | 'CANCEL' | 'MAKEUP' | 'CLASS_CANCEL',
    before: Record<string, unknown>,
    endBefore: string,
  ): Promise<void> {
    await m.query(
      `INSERT INTO session_schedule_audits
      (class_id,session_id,actor_id,action,reason,old_state,new_state,class_end_date_before,class_end_date_after,version)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`,
      [
        c.id,
        s.id,
        actorId,
        action,
        reason,
        JSON.stringify(before),
        JSON.stringify(this.snapshot(s)),
        endBefore,
        c.endDate,
        s.version,
      ],
    );
  }

  async cancelSession(
    m: EntityManager,
    c: ClassEntity,
    s: ClassSessionEntity,
    actorId: string | null,
    reason: string,
    action: 'CANCEL' | 'CLASS_CANCEL',
  ): Promise<void> {
    const before = this.snapshot(s);
    if (await this.reservations.hasOutgoingUnresolved(m, s.id))
      throw new TeachingConflictException(
        'SESSION_HAS_MAKEUP_PLACEMENTS',
        'Resolve outgoing placements before cancelling the source session',
      );
    await m.query("SELECT set_config('mindy.actor_id',$1,true)", [actorId ?? '']);
    s.status = SessionStatus.CANCELLED;
    s.version += 1;
    await m.getRepository(ClassSessionEntity).save(s);
    await this.audit(m, c, s, actorId, reason, action, before, c.endDate);
  }

  /** Caller owns the Class lock. Locks all Session rows before changing any state. */
  async cancelClassSessions(
    m: EntityManager,
    c: ClassEntity,
    actorId: string | null,
  ): Promise<void> {
    const sessions = await m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .where('s.class_unit_id IN (SELECT id FROM class_units WHERE class_id=:classId)', {
        classId: c.id,
      })
      .andWhere("s.status::text IN ('SCHEDULED','IN_PROGRESS')")
      .orderBy('s.id', 'ASC')
      .setLock('for_no_key_update')
      .getMany();
    for (const s of sessions)
      await this.cancelSession(m, c, s, actorId, 'Class cancelled', 'CLASS_CANCEL');
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
    if (!isSingleTeachingDay(startsAt, endsAt, this.timeZone())) {
      throw new ClassSessionOvernightNotAllowedException();
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
      .andWhere("session.status::text IN ('SCHEDULED', 'IN_PROGRESS')")
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

  /** Validates and saves the final bulk state, with rollback handled by the caller. */
  async updateSessionTimes(
    manager: EntityManager,
    classEntity: ClassEntity,
    sessionIds: readonly string[],
    input: UpdateClassSessionTimeDto,
  ): Promise<void> {
    const repository = manager.getRepository(ClassSessionEntity);
    await this.assertNoPlacements(manager, sessionIds);
    const sessions = await repository
      .createQueryBuilder('session')
      .innerJoin(ClassUnitEntity, 'unit', 'unit.id = session.classUnitId')
      .where('unit.classId = :classId', { classId: classEntity.id })
      .andWhere('session.id IN (:...sessionIds)', { sessionIds })
      .orderBy('session.id', 'ASC')
      .getMany();
    if (sessions.length !== sessionIds.length) throw new ClassSessionNotFoundException();
    const timeZone = this.timeZone();
    for (const session of sessions) {
      if (session.status !== SessionStatus.SCHEDULED) throw new ClassSessionNotEditableException();
      const startsAt = withLocalTime(session.startsAt, input.startTime, timeZone);
      const endsAt = withLocalTime(session.endsAt, input.endTime, timeZone);
      if (!startsAt || !endsAt) throw new ClassSessionLocalTimeInvalidException();
      if (startsAt >= endsAt) throw new ClassSessionTimeRangeInvalidException();
      if (!isSingleTeachingDay(startsAt, endsAt, timeZone))
        throw new ClassSessionOvernightNotAllowedException();
      if (!isWithinClassPeriod({ startsAt, endsAt }, classEntity, timeZone)) {
        throw new ClassSessionOutsideClassPeriodException();
      }
      session.startsAt = startsAt;
      session.endsAt = endsAt;
      session.version += 1;
    }
    await repository.save(sessions);
    await this.assertNoClassOverlap(manager, classEntity.id);
    if (this.bindsMentorCalendar(classEntity)) {
      await this.assertMentorAvailable(manager, classEntity);
    }
    await this.recordConflicts(manager, classEntity.id);
  }

  async assertNoPlacements(m: EntityManager, ids: readonly string[]): Promise<void> {
    if (await this.reservations.hasSessionPlacements(m, ids))
      throw new TeachingConflictException(
        'SESSION_HAS_MAKEUP_PLACEMENTS',
        'Resolve or cancel placements before changing this session schedule',
      );
  }

  async recordConflicts(m: EntityManager, classId: string): Promise<void> {
    const students = await this.reservations.classStudentIds(m, classId);
    await this.reservations.lockStudents(m, students);
    await this.reservations.recordMakeupConflicts(m, students, new Date());
  }

  async assertMakeupsResolved(m: EntityManager, classId: string): Promise<void> {
    if (await this.reservations.hasUnresolved(m, classId))
      throw new TeachingConflictException(
        'CLASS_HAS_UNRESOLVED_MAKEUPS',
        'Resolve outstanding makeup placements before completing this class',
      );
  }

  async assertNoClassOverlap(manager: EntityManager, classId: string): Promise<void> {
    const overlaps: unknown[] = await manager.query(
      `SELECT 1 FROM class_sessions first
       JOIN class_units first_unit ON first_unit.id = first.class_unit_id
       JOIN class_sessions second
         ON first.id < second.id AND first.starts_at < second.ends_at
         AND first.ends_at > second.starts_at
       JOIN class_units second_unit ON second_unit.id = second.class_unit_id
       WHERE first_unit.class_id = $1 AND second_unit.class_id = $1
         AND first.status::text IN ('SCHEDULED', 'IN_PROGRESS')
         AND second.status::text IN ('SCHEDULED', 'IN_PROGRESS')
       LIMIT 1`,
      [classId],
    );
    if (overlaps.length > 0) throw new ClassSessionOverlapException();
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
      sessions.some(
        (session) =>
          !isWithinClassPeriod(session, classEntity, timeZone) ||
          !isSingleTeachingDay(session.startsAt, session.endsAt, timeZone),
      )
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
    const sessions = await manager
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('session')
      .innerJoin(ClassUnitEntity, 'unit', 'unit.id = session.classUnitId')
      .where('unit.classId = :id', { id: classEntity.id })
      .andWhere("session.status::text IN ('SCHEDULED', 'IN_PROGRESS')")
      .getMany();
    await this.conflicts.assertAvailable(
      manager,
      sessions.map((session) => ({
        sessionId: session.id,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        mentorId:
          session.status === SessionStatus.SCHEDULED
            ? (session.mentorOverrideId ?? classEntity.mentorId)
            : (session.teachingMentorId ?? classEntity.mentorId),
      })),
    );
  }

  private timeZone(): string {
    return this.config.getOrThrow<string>('APP_TIME_ZONE');
  }
}
