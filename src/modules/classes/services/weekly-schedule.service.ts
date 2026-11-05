import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../../users/users.service.js';
import { toLocalDate } from '../domain/class-calendar.js';
import { weeklySchedule } from '../domain/weekly-schedule.js';
import type {
  SwapSessionsInput,
  WeeklyScheduleInput,
  WeeklySchedulePreviewDto,
} from '../dtos/weekly-schedule.dto.js';
import type { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import {
  SessionAssignmentRequiredException,
  TeachingConflictException,
} from '../exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { type CalendarTarget, CalendarValidationService } from './calendar-validation.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassScheduleService } from './class-schedule.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from './teaching-read.service.js';

@Injectable()
export class WeeklyScheduleService {
  async savedSlots(id: string): Promise<{ weekday: number; slotId: number }[]> {
    const rows: { weekly_slots: { weekday: number; slotId: number }[] }[] = await this.db.query(
      'SELECT weekly_slots FROM class_weekly_schedules WHERE class_id=$1',
      [id],
    );
    return rows[0]?.weekly_slots ?? [];
  }
  constructor(
    private readonly db: DataSource,
    private readonly read: TeachingReadService,
    private readonly calendar: CalendarValidationService,
    private readonly schedule: ClassScheduleService,
    private readonly users: UsersService,
  ) {}

  async preview(id: string, input: WeeklyScheduleInput): Promise<WeeklySchedulePreviewDto> {
    return this.db.transaction(async (m) => {
      const c = await this.read.loadClass(m, id);
      const { entries, targets } = await this.prepare(m, c, input);
      return {
        timeZone: this.read.timeZone(),
        expectedVersion: c.assignmentVersion,
        sessions: entries,
        conflicts: await this.calendar.conflicts(m, targets),
      };
    });
  }

  async apply(
    id: string,
    input: WeeklyScheduleInput,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<WeeklySchedulePreviewDto> {
    return this.mutate(id, 'weekly-schedule', input, actor, key, async (m, c) => {
      const { entries, targets } = await this.prepare(m, c, input);
      const existing = await this.sessions(m, id, true);
      await this.calendar.lock(
        m,
        id,
        targets.map((t) => t.mentorId),
      );
      const conflicts = await this.calendar.conflicts(m, targets);
      if (conflicts.length)
        throw new AppHttpException(
          409,
          'SCHEDULE_CONFLICT',
          'Review timetable conflicts',
          conflicts,
        );
      await this.schedule.assertNoPlacements(
        m,
        existing.map((s) => s.id),
      );
      const endBefore = c.endDate;
      c.startDate = input.startDate;
      const last = entries.at(-1);
      if (!last) throw new UnprocessableEntityException('At least one session required');
      c.endDate = toLocalDate(new Date(last.endsAt.getTime() - 1), this.read.timeZone());
      for (const [index, entry] of entries.entries()) {
        const old = existing.find((s) => s.id === entry.sessionId);
        const before = old ? this.schedule.snapshot(old) : {};
        const s =
          old ??
          m.getRepository(ClassSessionEntity).create({
            id: targets[index]?.sessionId,
            classUnitId: entry.classUnitId,
            title: entry.title,
            sessionNumber: entries
              .slice(0, index + 1)
              .filter((e) => e.classUnitId === entry.classUnitId).length,
            status: SessionStatus.SCHEDULED,
            version: 0,
          });
        s.startsAt = entry.startsAt;
        s.endsAt = entry.endsAt;
        s.version += 1;
        await m.getRepository(ClassSessionEntity).save(s);
        await this.schedule.audit(
          m,
          c,
          s,
          actor.userId,
          input.reason,
          'RESCHEDULE',
          before,
          endBefore,
        );
      }
      await this.schedule.finishScheduleBatch(m, [c]);
      await m.query(
        `INSERT INTO class_weekly_schedules(class_id,start_date,weekly_slots) VALUES($1,$2,$3::jsonb)
        ON CONFLICT(class_id) DO UPDATE SET start_date=excluded.start_date,weekly_slots=excluded.weekly_slots,updated_at=clock_timestamp()`,
        [id, input.startDate, JSON.stringify(input.weeklySlots)],
      );
      return {
        timeZone: this.read.timeZone(),
        expectedVersion: c.assignmentVersion,
        sessions: entries.map((e, i) => ({ ...e, sessionId: targets[i]?.sessionId ?? null })),
        conflicts: [],
      };
    });
  }

  async swap(
    id: string,
    input: SwapSessionsInput,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<WeeklySchedulePreviewDto> {
    return this.mutate(id, 'swap', input, actor, key, async (m, c) => {
      if (actor.role !== UserRole.MENTOR) throw new SessionAssignmentRequiredException();
      this.read.assertClassEditable(c);
      const sessions = await this.sessions(m, id, true);
      const a = sessions.find((s) => s.id === input.firstSessionId),
        b = sessions.find((s) => s.id === input.secondSessionId);
      if (!a || !b || a.id === b.id)
        throw new AppHttpException(
          404,
          'CLASS_SESSION_NOT_FOUND',
          'Choose two different sessions in this class',
        );
      if ([a, b].some((s) => (s.mentorOverrideId ?? c.mentorId) !== actor.userId))
        throw new SessionAssignmentRequiredException();
      if (a.version !== input.firstVersion || b.version !== input.secondVersion)
        throw new TeachingConflictException('SESSION_VERSION_CONFLICT', 'Refetch both sessions');
      if ([a, b].some((s) => s.status !== SessionStatus.SCHEDULED || s.startsAt <= new Date()))
        throw new TeachingConflictException(
          'SESSION_STATE_CONFLICT',
          'Swap requires future scheduled sessions',
        );
      if (a.endsAt.getTime() - a.startsAt.getTime() !== b.endsAt.getTime() - b.startsAt.getTime())
        throw new TeachingConflictException(
          'SESSION_DURATION_MISMATCH',
          'Swap requires equal durations',
        );
      await this.schedule.assertNoPlacements(m, [a.id, b.id]);
      const beforeA = this.schedule.snapshot(a),
        beforeB = this.schedule.snapshot(b);
      [a.startsAt, b.startsAt] = [b.startsAt, a.startsAt];
      [a.endsAt, b.endsAt] = [b.endsAt, a.endsAt];
      const targets = [a, b].map((s) => ({
        sessionId: s.id,
        classId: id,
        mentorId: actor.userId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      }));
      await this.calendar.lock(m, id, [actor.userId]);
      const conflicts = await this.calendar.conflicts(m, targets);
      if (conflicts.length)
        throw new AppHttpException(
          409,
          'SCHEDULE_CONFLICT',
          'Swap conflicts with timetable',
          conflicts,
        );
      for (const [s, before] of [
        [a, beforeA],
        [b, beforeB],
      ] as const) {
        s.version += 1;
        await m.getRepository(ClassSessionEntity).save(s);
        await this.schedule.audit(
          m,
          c,
          s,
          actor.userId,
          input.reason,
          'RESCHEDULE',
          before,
          c.endDate,
        );
      }
      await this.schedule.finishScheduleBatch(m, [c]);
      return {
        timeZone: this.read.timeZone(),
        expectedVersion: c.assignmentVersion,
        conflicts: [],
        sessions: [a, b].map((s) => ({
          sessionId: s.id,
          classUnitId: s.classUnitId,
          title: s.title,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        })),
      };
    });
  }

  private async prepare(
    m: EntityManager,
    c: ClassEntity,
    input: WeeklyScheduleInput,
  ): Promise<{ entries: WeeklySchedulePreviewDto['sessions']; targets: CalendarTarget[] }> {
    const existing = await this.sessions(m, c.id);
    if (
      ![ClassStatus.DRAFT, ClassStatus.OPEN].includes(c.status) ||
      existing.some((s) => s.status !== SessionStatus.SCHEDULED || s.actualStartedAt !== null)
    )
      throw new TeachingConflictException(
        'CLASS_SCHEDULE_NOT_EDITABLE',
        'Only draft/open classes with no started sessions can move',
      );
    if (c.assignmentVersion !== input.expectedVersion)
      throw new TeachingConflictException('CLASS_VERSION_CONFLICT', 'Refetch the class');
    if (
      new Set(input.weeklySlots.map((s) => `${s.weekday}:${s.slotId}`)).size !==
      input.weeklySlots.length
    )
      throw new UnprocessableEntityException('Duplicate weekly slot');
    const ids = input.sessions.flatMap((s) => (s.sessionId ? [s.sessionId] : []));
    if (
      new Set(ids).size !== ids.length ||
      (existing.length > 0 && input.sessions.length !== existing.length) ||
      existing.length !== ids.length ||
      existing.some((s) => !ids.includes(s.id))
    )
      throw new TeachingConflictException(
        'CLASS_SCHEDULE_STALE',
        'Include every existing session exactly once',
      );
    const units = await m.getRepository(ClassUnitEntity).findBy({ classId: c.id });
    const position = (unitId: string): number => units.find((u) => u.id === unitId)?.position ?? -1;
    if (
      input.sessions.some(
        (s, index) =>
          index > 0 &&
          position(s.classUnitId) < position(input.sessions[index - 1]?.classUnitId ?? ''),
      )
    )
      throw new UnprocessableEntityException('Keep curriculum unit order');
    const originalOrder = [...existing]
      .sort(
        (a, b) =>
          position(a.classUnitId) - position(b.classUnitId) || a.sessionNumber - b.sessionNumber,
      )
      .map((s) => s.id);
    if (ids.some((id, i) => id !== originalOrder[i]))
      throw new UnprocessableEntityException('Keep existing curriculum session order');
    if (
      input.sessions.some(
        (s) =>
          !units.some((u) => u.id === s.classUnitId) ||
          (s.sessionId &&
            existing.find((e) => e.id === s.sessionId)?.classUnitId !== s.classUnitId),
      )
    )
      throw new UnprocessableEntityException('Session unit does not belong to class');
    let times: ReturnType<typeof weeklySchedule>;
    try {
      times = weeklySchedule(
        input.startDate,
        input.weeklySlots,
        input.sessions.length,
        this.read.timeZone(),
      );
    } catch {
      throw new UnprocessableEntityException('Invalid weekly schedule');
    }
    if (times.some((t) => t.startsAt <= new Date()))
      throw new UnprocessableEntityException('Schedule must be in the future');
    const entries = input.sessions.map((s, i) => ({
      sessionId: s.sessionId ?? null,
      classUnitId: s.classUnitId,
      title: existing.find((e) => e.id === s.sessionId)?.title ?? s.title.trim(),
      startsAt: times[i]?.startsAt ?? new Date(0),
      endsAt: times[i]?.endsAt ?? new Date(0),
    }));
    const targets = entries.map((e) => ({
      sessionId: e.sessionId ?? randomUUID(),
      classId: c.id,
      mentorId: existing.find((s) => s.id === e.sessionId)?.mentorOverrideId ?? c.mentorId,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
    }));
    return { entries, targets };
  }
  private sessions(m: EntityManager, id: string, lock = false): Promise<ClassSessionEntity[]> {
    const q = m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .where('s.class_unit_id IN (SELECT id FROM class_units WHERE class_id=:id)', { id })
      .orderBy('s.id');
    if (lock) q.setLock('for_no_key_update');
    return q.getMany();
  }
  private async mutate<T extends object>(
    id: string,
    action: string,
    input: object,
    actor: AuthenticatedUser,
    key: string | undefined,
    fn: (m: EntityManager, c: ClassEntity) => Promise<T>,
  ): Promise<T> {
    if (!key || !isUUID(key, '4'))
      throw new UnprocessableEntityException('Idempotency-Key must be a UUID v4');
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      route = `class:${id}:${action}`;
    return this.db.transaction(async (m) => {
      const c = await this.read.loadClass(m, id, true);
      if (!(await this.users.findActiveByRole(actor.userId, actor.role, m)))
        throw new SessionAssignmentRequiredException();
      if (
        (action === 'swap' && actor.role !== UserRole.MENTOR) ||
        (action !== 'swap' && ![UserRole.ADMIN, UserRole.MANAGER].includes(actor.role))
      )
        throw new SessionAssignmentRequiredException();
      if (action === 'swap' && actor.role === UserRole.MENTOR) {
        const assigned = await this.sessions(m, id);
        if (!assigned.some((s) => (s.mentorOverrideId ?? c.mentorId) === actor.userId))
          throw new SessionAssignmentRequiredException();
      }
      const rows: { payload_hash: string; outcome: T }[] = await m.query(
        'SELECT payload_hash,outcome FROM teaching_mutation_receipts WHERE actor_id=$1 AND route=$2 AND key=$3',
        [actor.userId, route, key],
      );
      if (rows[0]) {
        if (rows[0].payload_hash !== hash)
          throw new TeachingConflictException(
            'IDEMPOTENCY_KEY_REUSED',
            'Key used with another payload',
          );
        return rows[0].outcome;
      }
      const result = await fn(m, c);
      await m.query(
        'INSERT INTO teaching_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,$2,$3,$4,$5::jsonb)',
        [actor.userId, route, key, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
}
