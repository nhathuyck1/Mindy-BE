import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In, type SelectQueryBuilder } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { approvedLeaveOverlap } from '../../mentor-availability/mentor-availability.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ScheduleReservationsService } from '../../schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { toLocalDate, withLocalTime } from '../domain/class-calendar.js';
import {
  EFFECTIVE_MENTOR_SQL,
  effectiveMentorId,
  OCCUPIED_SESSION_SQL,
} from '../domain/effective-mentor.js';
import type {
  ClassMentorCandidatesDto,
  MentorTeachingScheduleDto,
  SessionMentorCandidatesDto,
  TeachingClassDetailDto,
  TeachingClassDto,
  TeachingClassPageDto,
  TeachingSessionContextDto,
  TeachingSessionDto,
} from '../dtos/teaching.dto.js';
import type {
  ManagementClassesQueryDto,
  MentorCandidatesQueryDto,
  MentorScheduleQueryDto,
} from '../dtos/teaching-query.dto.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import {
  ClassNotEditableException,
  ClassNotFoundException,
  ClassSessionNotFoundException,
} from '../exceptions/class.exceptions.js';
import {
  SessionAssignmentRequiredException,
  TeachingConflictException,
} from '../exceptions/teaching.exceptions.js';

@Injectable()
export class TeachingReadService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly reservations: ScheduleReservationsService,
  ) {}

  timeZone(): string {
    return this.config.getOrThrow<string>('APP_TIME_ZONE');
  }

  /** Read participant for the operations backlog; no implicit calendar window or writer locks. */
  async incompleteSessions(
    m: EntityManager,
    query: {
      page: number;
      pageSize: number;
      from?: Date;
      to?: Date;
      classId?: string;
      issue?: 'OVERDUE_NOT_STARTED' | 'STARTED_NOT_FINALIZED';
    },
    now: Date,
  ): Promise<{ items: TeachingSessionDto[]; total: number }> {
    const q = this.sessionQuery(m)
      .where('c.status IN (:...classes)', { classes: [ClassStatus.OPEN, ClassStatus.IN_PROGRESS] })
      .andWhere('s.status IN (:...states)', {
        states:
          query.issue === undefined
            ? [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS]
            : [
                query.issue === 'OVERDUE_NOT_STARTED'
                  ? SessionStatus.SCHEDULED
                  : SessionStatus.IN_PROGRESS,
              ],
      })
      .andWhere('s.endsAt <= :now', { now });
    if (query.classId !== undefined) q.andWhere('c.id=:classId', { classId: query.classId });
    if (query.from !== undefined)
      q.andWhere('s.startsAt<:to AND s.endsAt>:from', { from: query.from, to: query.to });
    const [sessions, total] = await q
      .orderBy('s.endsAt', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return { items: await this.sessionViews(m, sessions, now), total };
  }

  async listClasses(options: ManagementClassesQueryDto): Promise<TeachingClassPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const q = m
        .getRepository(ClassEntity)
        .createQueryBuilder('c')
        .orderBy('c.startDate', 'DESC')
        .addOrderBy('c.id', 'ASC');
      if (options.status !== undefined) q.where('c.status = :status', { status: options.status });
      const [classes, total] = await q
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      return {
        items: await this.classViews(m, classes),
        total,
        page: options.page,
        pageSize: options.pageSize,
      };
    });
  }

  async classDetail(id: string, options: PageOptionsDto): Promise<TeachingClassDetailDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const c = await this.loadClass(m, id);
      const [sessions, total] = await this.sessionQuery(m)
        .where('c.id = :id', { id })
        .orderBy('s.startsAt', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      const views = await this.classViews(m, [c]);
      const view = views[0];
      if (!view) throw new ClassNotFoundException();
      return {
        class: view,
        sessions: {
          items: await this.sessionViews(m, sessions, new Date()),
          total,
          page: options.page,
          pageSize: options.pageSize,
        },
      };
    });
  }

  async sessionCandidates(
    id: string,
    options: MentorCandidatesQueryDto,
  ): Promise<SessionMentorCandidatesDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const { session: s, classEntity: c } = await this.loadSession(m, id);
      this.assertAssignmentEditable(c, s);
      const now = new Date();
      const [from, to] = this.checkedInterval(s, now);
      return {
        ...(await this.candidates(
          m,
          [{ id, from, to }],
          effectiveMentorId(s, c.mentorId),
          options,
        )),
        sessionId: id,
        sessionVersion: s.version,
        checkedFrom: from,
        checkedTo: to,
        asOf: now,
        timeZone: this.timeZone(),
        availabilityBasis: 'TEACHING_SCHEDULE_AND_APPROVED_LEAVE',
      };
    });
  }

  async classCandidates(
    id: string,
    options: MentorCandidatesQueryDto,
  ): Promise<ClassMentorCandidatesDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const c = await this.loadClass(m, id);
      this.assertClassEditable(c);
      const sessions = await this.affectedSessions(m, id);
      return {
        ...(await this.candidates(
          m,
          sessions.map((s) => ({ id: s.id, from: s.startsAt, to: s.endsAt })),
          c.mentorId,
          options,
        )),
        classId: id,
        assignmentVersion: c.assignmentVersion,
        affectedSessionCount: sessions.length,
        asOf: new Date(),
        timeZone: this.timeZone(),
        availabilityBasis: 'TEACHING_SCHEDULE_AND_APPROVED_LEAVE',
      };
    });
  }

  async schedule(
    mentorId: string,
    options: MentorScheduleQueryDto,
  ): Promise<MentorTeachingScheduleDto> {
    const now = new Date();
    const zone = this.timeZone();
    let from: Date;
    let to: Date;
    if (options.from !== undefined && options.to !== undefined) {
      from = new Date(options.from);
      to = new Date(options.to);
    } else {
      const today = toLocalDate(now, zone);
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      const monday = new Date(now.getTime() - ((weekday + 6) % 7) * 86400000);
      const start = withLocalTime(monday, '00:00', zone);
      const end = withLocalTime(new Date(monday.getTime() + 7 * 86400000), '00:00', zone);
      if (!start || !end) throw new BadRequestException('Invalid calendar range');
      from = start;
      to = end;
    }
    if (!(from < to) || to.getTime() - from.getTime() > 93 * 86400000)
      throw new UnprocessableEntityException('Range must be positive and at most 93 days');
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const q = this.sessionQuery(m)
        .where(`${EFFECTIVE_MENTOR_SQL} = :mentorId`, { mentorId })
        .andWhere('s.startsAt < :to AND s.endsAt > :from', { from, to });
      if (options.classId !== undefined)
        q.andWhere('c.id = :classId', { classId: options.classId });
      const [sessions, total] = await q
        .orderBy('s.startsAt', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      return {
        items: await this.sessionViews(m, sessions, now),
        total,
        page: options.page,
        pageSize: options.pageSize,
        from,
        to,
        timeZone: zone,
        asOf: now,
      };
    });
  }

  async context(id: string, actor: AuthenticatedUser): Promise<TeachingSessionContextDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const { session, classEntity } = await this.loadSession(m, id);
      const makeupPlacementId =
        actor.role === UserRole.STUDENT
          ? await this.reservations.guestContext(m, id, actor.userId)
          : null;
      if (
        (![UserRole.ADMIN, UserRole.MANAGER, UserRole.MENTOR].includes(actor.role) &&
          !makeupPlacementId) ||
        !(await this.users.findActiveByRole(actor.userId, actor.role, m)) ||
        (actor.role === UserRole.MENTOR &&
          effectiveMentorId(session, classEntity.mentorId) !== actor.userId)
      )
        throw new SessionAssignmentRequiredException();
      const views = await this.sessionViews(m, [session], new Date());
      const view = views[0];
      if (!view) throw new ClassSessionNotFoundException();
      const terminal =
        [SessionStatus.COMPLETED, SessionStatus.CANCELLED].includes(session.status) ||
        [ClassStatus.COMPLETED, ClassStatus.CANCELLED].includes(classEntity.status);
      return {
        session: view,
        roomName: session.roomName,
        meetingUrl: terminal ? null : (session.meetingUrl ?? classEntity.meetingUrl),
        accessScope: 'SESSION',
        makeupPlacementId,
      };
    });
  }

  async loadClass(m: EntityManager, id: string, lock = false): Promise<ClassEntity> {
    const q = m.getRepository(ClassEntity).createQueryBuilder('c').where('c.id = :id', { id });
    if (lock) q.setLock('pessimistic_write');
    const c = await q.getOne();
    if (!c) throw new ClassNotFoundException();
    return c;
  }

  async loadSession(
    m: EntityManager,
    id: string,
    lock = false,
  ): Promise<{ session: ClassSessionEntity; classEntity: ClassEntity }> {
    // Resolve ancestry, then lock Class -> Session. All writers use that order.
    const initial = await this.sessionQuery(m).where('s.id = :id', { id }).getOne();
    if (!initial) throw new ClassSessionNotFoundException();
    const unit = await m
      .getRepository(ClassUnitEntity)
      .findOneByOrFail({ id: initial.classUnitId });
    const classEntity = await this.loadClass(m, unit.classId, lock);
    const q = m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .where('s.id = :id', { id });
    // Non-key writes must remain compatible with FK checks in concurrent conflict recording.
    if (lock) q.setLock('for_no_key_update');
    const session = await q.getOne();
    if (!session) throw new ClassSessionNotFoundException();
    return { session, classEntity };
  }

  async affectedSessions(m: EntityManager, classId: string): Promise<ClassSessionEntity[]> {
    return this.sessionQuery(m)
      .where('c.id = :classId', { classId })
      .andWhere('s.status = :status AND s.mentorOverrideId IS NULL', {
        status: SessionStatus.SCHEDULED,
      })
      .orderBy('s.id', 'ASC')
      .getMany();
  }

  assertClassEditable(c: ClassEntity): void {
    if ([ClassStatus.COMPLETED, ClassStatus.CANCELLED].includes(c.status))
      throw new ClassNotEditableException(c.status);
  }

  assertAssignmentEditable(c: ClassEntity, s: ClassSessionEntity): void {
    if (s.status === SessionStatus.SCHEDULED) this.assertClassEditable(c);
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(s.status))
      throw new TeachingConflictException(
        'SESSION_STATE_CONFLICT',
        'Only scheduled or in-progress sessions may be reassigned',
      );
  }

  checkedInterval(s: ClassSessionEntity, now: Date): [Date, Date] {
    if (s.status === SessionStatus.SCHEDULED) return [s.startsAt, s.endsAt];
    const from = new Date(Math.max(now.getTime(), s.startsAt.getTime()));
    return from >= s.endsAt ? [now, now] : [from, s.endsAt];
  }

  async sessionViews(
    m: EntityManager,
    sessions: readonly ClassSessionEntity[],
    now: Date,
  ): Promise<TeachingSessionDto[]> {
    if (!sessions.length) return [];
    const units = await m
      .getRepository(ClassUnitEntity)
      .findBy({ id: In(sessions.map((s) => s.classUnitId)) });
    const classes = await m
      .getRepository(ClassEntity)
      .findBy({ id: In(units.map((u) => u.classId)) });
    const ids = classes
      .map((c) => c.mentorId)
      .concat(
        sessions.flatMap((s) =>
          [s.mentorOverrideId, s.teachingMentorId].filter((id): id is string => id !== null),
        ),
      );
    const names = new Map((await this.users.findByIds(ids, m)).map((u) => [u.id, u.displayName]));
    const classByUnit = new Map(units.map((u) => [u.id, classes.find((c) => c.id === u.classId)]));
    return sessions.map((s) => {
      const c = classByUnit.get(s.classUnitId);
      if (!c) throw new ClassNotFoundException();
      const effective = effectiveMentorId(s, c.mentorId);
      return {
        sessionId: s.id,
        classId: c.id,
        classUnitId: s.classUnitId,
        makeupForSessionId: s.makeupForSessionId,
        makeupRootSessionId: s.makeupRootSessionId,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        primaryMentor: { id: c.mentorId, displayName: names.get(c.mentorId) ?? null },
        effectiveMentor: effective
          ? { id: effective, displayName: names.get(effective) ?? null }
          : null,
        assignmentType: s.mentorOverrideId ? 'SUBSTITUTE' : 'PRIMARY',
        version: s.version,
        actualStartedAt: s.actualStartedAt,
        actualEndedAt: s.actualEndedAt,
        editableUntil: s.editableUntil,
        asOf: now,
        timeZone: this.timeZone(),
      };
    });
  }

  sessionQuery(m: EntityManager): SelectQueryBuilder<ClassSessionEntity> {
    return m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .innerJoin(ClassUnitEntity, 'u', 'u.id = s.classUnitId')
      .innerJoin(ClassEntity, 'c', 'c.id = u.classId');
  }

  private async classViews(
    m: EntityManager,
    classes: readonly ClassEntity[],
  ): Promise<TeachingClassDto[]> {
    const users = new Map(
      (
        await this.users.findByIds(
          classes.map((c) => c.mentorId),
          m,
        )
      ).map((u) => [u.id, u.displayName]),
    );
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      status: c.status,
      assignmentVersion: c.assignmentVersion,
      primaryMentor: { id: c.mentorId, displayName: users.get(c.mentorId) ?? null },
    }));
  }

  private async candidates(
    m: EntityManager,
    intervals: readonly { id: string; from: Date; to: Date }[],
    current: string | null,
    options: MentorCandidatesQueryDto,
  ): Promise<{
    items: { id: string; displayName: string; isCurrent: boolean }[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const q = this.users.activeMentorsQuery(m);
    if (options.search)
      q.andWhere('mentor.displayName ILIKE :search', {
        search: `%${options.search.replace(/[\\%_]/g, '\\$&')}%`,
      });
    // Class reassignment excludes the affected set, but detects unaffected same-class sessions.
    const excluded = intervals.map((i) => i.id);
    for (const [index, interval] of intervals.entries()) {
      if (interval.from >= interval.to) continue;
      q.andWhere(`NOT ${approvedLeaveOverlap('mentor.id', `:from${index}`, `:to${index}`)}`, {
        [`from${index}`]: interval.from,
        [`to${index}`]: interval.to,
      });
      q.andWhere(
        `NOT EXISTS (SELECT 1 FROM class_sessions s JOIN class_units u ON u.id = s.class_unit_id
        JOIN classes c ON c.id = u.class_id WHERE s.id <> ALL(:excluded::uuid[]) AND ${OCCUPIED_SESSION_SQL}
        AND ${EFFECTIVE_MENTOR_SQL} = mentor.id AND s.starts_at < :to${index} AND s.ends_at > :from${index})`,
        { excluded, [`to${index}`]: interval.to, [`from${index}`]: interval.from },
      );
    }
    const [users, total] = await q
      .orderBy('mentor.displayName', 'ASC')
      .addOrderBy('mentor.id', 'ASC')
      .skip((options.page - 1) * options.pageSize)
      .take(options.pageSize)
      .getManyAndCount();
    return {
      items: users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        isCurrent: u.id === current,
      })),
      total,
      page: options.page,
      pageSize: options.pageSize,
    };
  }
}
