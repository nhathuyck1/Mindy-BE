import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type { ClassEntity } from '../../classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../classes/entities/class-session.entity.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassScheduleService } from '../../classes/services/class-schedule.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MentorConflictService } from '../../classes/services/mentor-conflict.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ScheduleReservationsService } from '../../schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { type LeavePeriod, noticeDeadline, periodInterval } from '../domain/leave-calendar.js';
import type {
  ApproveLeaveInput,
  CreateLeaveInput,
  LeaveApprovalDto,
  LeaveItemDto,
  LeaveListQuery,
  LeaveMutationInput,
  LeavePreviewDto,
  LeavePreviewInput,
  LeaveRequestDto,
  LeaveRequestPageDto,
  LeaveSlotsDto,
  LeaveSlotsInput,
  LeaveStatus,
  ManagementLeaveDetailDto,
  ManagementLeaveListQuery,
} from '../dtos/leave.dto.js';
import { LeaveException } from '../exceptions/leave.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { LeavePlanningService, type LeaveSource } from './leave-planning.service.js';

interface LeaveRow {
  id: string;
  mentor_id: string;
  from_date: string;
  to_date: string;
  period: LeavePeriod;
  reason: string;
  status: LeaveStatus;
  version: number;
  submitted_at: Date;
  expires_at: Date;
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: Date | null;
}
const columns = `id,mentor_id,from_date::text,to_date::text,period,reason,status,version,
  submitted_at,expires_at,reviewed_by,review_reason,reviewed_at`;
const itemColumns = `source_session_id AS "sourceSessionId",class_id AS "classId",source_version AS "sourceVersion",
  source_starts_at AS "sourceStartsAt",source_ends_at AS "sourceEndsAt",starts_at AS "startsAt",ends_at AS "endsAt",
  replacement_session_id AS "replacementSessionId"`;

@Injectable()
export class MentorLeaveService {
  constructor(
    private readonly db: DataSource,
    private readonly read: TeachingReadService,
    private readonly schedule: ClassScheduleService,
    private readonly conflicts: MentorConflictService,
    private readonly reservations: ScheduleReservationsService,
    private readonly users: UsersService,
    private readonly planning: LeavePlanningService,
  ) {}

  async preview(input: LeavePreviewInput, actor: AuthenticatedUser): Promise<LeavePreviewDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      await this.actor(m, actor, true);
      const sources = await this.sources(m, actor.userId, input);
      const now = new Date(),
        first = sources.map((s) => s.session.startsAt).sort((a, b) => +a - +b)[0];
      const deadline = first ? noticeDeadline(first, this.read.timeZone()) : null;
      return {
        affectedSessions: await this.read.sessionViews(
          m,
          sources.map((s) => s.session),
          now,
        ),
        sourceVersions: sources.map((s) => ({
          sessionId: s.session.id,
          version: s.session.version,
        })),
        noticeEligible: deadline !== null && now < deadline,
        noticeDeadline: deadline,
        asOf: now,
        timeZone: this.read.timeZone(),
      };
    });
  }

  async slots(input: LeaveSlotsInput, actor: AuthenticatedUser): Promise<LeaveSlotsDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      await this.actor(m, actor, true);
      const { session: s, classEntity: c } = await this.read.loadSession(m, input.sourceSessionId);
      if (
        s.status !== 'SCHEDULED' ||
        !['OPEN', 'IN_PROGRESS'].includes(c.status) ||
        (s.mentorOverrideId ?? c.mentorId) !== actor.userId
      )
        throw new LeaveException(
          'LEAVE_SOURCE_NOT_FOUND',
          'Source is not assigned to this mentor',
          404,
        );
      const period = periodInterval(input.targetDate, input.targetPeriod, this.read.timeZone());
      const now = new Date();
      if (await this.reservations.hasSessionPlacements(m, [s.id]))
        return { slots: [], sessionVersion: s.version, asOf: now, timeZone: this.read.timeZone() };
      const slots = await this.planning.availableSlots(
        m,
        actor.userId,
        s,
        c,
        period,
        now,
        this.read.timeZone(),
      );
      return { slots, sessionVersion: s.version, asOf: now, timeZone: this.read.timeZone() };
    });
  }

  async create(
    input: CreateLeaveInput,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<LeaveRequestDto> {
    this.key(key);
    return this.db.transaction(async (m) => {
      await this.actor(m, actor, true);
      const route = 'leave:create';
      await this.receiptLock(m, actor.userId, route, key);
      const replay = await this.replay<LeaveRequestDto>(m, actor, route, key, input);
      if (replay) return replay;
      let sources = await this.sources(m, actor.userId, input);
      this.sameSources(sources, input.sourceVersions);
      const classes = await this.lockSources(m, sources);
      await this.conflicts.lockClassMentors(m, [...classes.keys()], [actor.userId]);
      sources = await this.sources(m, actor.userId, input);
      this.sameSources(sources, input.sourceVersions);
      if (sources.some((s) => !classes.has(s.classId))) this.stale();
      await this.actor(m, actor, true);
      const now = new Date(),
        first = sources.map((s) => s.session.startsAt).sort((a, b) => +a - +b)[0];
      if (!first || now >= noticeDeadline(first, this.read.timeZone()))
        throw new LeaveException(
          'LEAVE_NOTICE_TOO_SHORT',
          'Submit at least two calendar days before the first affected session',
          422,
        );
      await this.schedule.assertNoPlacements(
        m,
        sources.map((s) => s.session.id),
      );
      const targets = this.planning.mappings(input, sources, this.read.timeZone());
      await this.lockStudents(m, classes);
      await this.planning.validate(
        m,
        actor.userId,
        input.period,
        targets,
        classes,
        this.planning.intervals(input, this.read.timeZone()),
        this.read.timeZone(),
        now,
      );
      const rows: { id: string }[] = await m.query(
        `INSERT INTO mentor_leave_requests
        (mentor_id,from_date,to_date,period,reason,submitted_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [actor.userId, input.fromDate, input.toDate, input.period, input.reason, now, first],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('Missing created leave request');
      for (const t of targets) {
        const s = sources.find((source) => source.session.id === t.sourceSessionId)?.session;
        if (!s) this.stale();
        await m.query(
          `INSERT INTO mentor_leave_items(request_id,source_session_id,class_id,source_version,
          source_starts_at,source_ends_at,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, s.id, t.classId, s.version, s.startsAt, s.endsAt, t.startsAt, t.endsAt],
        );
      }
      const row = await this.row(m, id, actor);
      await this.audit(m, row, actor, 'PENDING', input.reason);
      const result = await this.view(m, row, { page: 1, pageSize: 100 });
      await this.remember(m, actor, route, key, input, result);
      return result;
    });
  }

  async list(
    query: LeaveListQuery | ManagementLeaveListQuery,
    actor: AuthenticatedUser,
  ): Promise<LeaveRequestPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      await this.actor(m, actor);
      const now = new Date();
      const mentor =
        actor.role === UserRole.MENTOR
          ? actor.userId
          : 'mentorId' in query
            ? query.mentorId
            : undefined;
      const effective =
        "CASE WHEN status='PENDING' AND expires_at<=$1 THEN 'EXPIRED' ELSE status END";
      const where = `($2::uuid IS NULL OR mentor_id=$2) AND ($3::text IS NULL OR (${effective})=$3)`;
      const params = [now, mentor ?? null, query.status ?? null];
      const counts: { total: string }[] = await m.query(
        `SELECT count(*) AS total FROM mentor_leave_requests WHERE ${where}`,
        params,
      );
      const rows: LeaveRow[] = await m.query(
        `SELECT ${columns} FROM mentor_leave_requests WHERE ${where}
        ORDER BY submitted_at DESC,id DESC LIMIT $4 OFFSET $5`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const items: LeaveRequestDto[] = [];
      const summaries: {
        requestId: string;
        total: number;
        classExtensions: { classId: string; endDate: string }[];
      }[] = rows.length
        ? await m.query(
            `
        WITH per_class AS (SELECT i.request_id,i.class_id,count(*)::int AS total,
          greatest(c.end_date,max((i.ends_at-interval '1 millisecond') AT TIME ZONE $2)::date)::text AS end_date
          FROM mentor_leave_items i JOIN classes c ON c.id=i.class_id WHERE i.request_id=ANY($1::uuid[])
          GROUP BY i.request_id,i.class_id,c.end_date)
        SELECT request_id AS "requestId",sum(total)::int AS total,
          jsonb_agg(jsonb_build_object('classId',class_id,'endDate',end_date) ORDER BY class_id) AS "classExtensions"
          FROM per_class GROUP BY request_id`,
            [rows.map((r) => r.id), this.read.timeZone()],
          )
        : [];
      for (const row of rows)
        items.push(
          await this.view(
            m,
            row,
            undefined,
            now,
            summaries.find((s) => s.requestId === row.id),
          ),
        );
      return {
        items,
        total: Number(counts[0]?.total ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        asOf: now,
      };
    });
  }

  async detail(
    id: string,
    query: { page: number; pageSize: number },
    actor: AuthenticatedUser,
  ): Promise<LeaveRequestDto | ManagementLeaveDetailDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      await this.actor(m, actor);
      const row = await this.row(m, id, actor),
        result = await this.view(m, row, query);
      const items = await this.items(m, id),
        sources = await this.sources(m, row.mentor_id, this.input(row));
      const studentConflicts = await this.planning.studentConflicts(
        m,
        items,
        result.asOf,
        actor.role === UserRole.MENTOR ? undefined : query,
      );
      if (actor.role === UserRole.MENTOR)
        return { ...result, studentConflictCount: studentConflicts.total };
      return {
        ...result,
        studentConflicts: studentConflicts.items,
        studentConflictCount: studentConflicts.total,
        sourcesCurrent: this.isSame(
          sources,
          items.map((i) => ({ sessionId: i.sourceSessionId, version: i.sourceVersion })),
        ),
      };
    });
  }

  async mutate(
    id: string,
    action: 'approve' | 'reject' | 'withdraw',
    input: LeaveMutationInput | ApproveLeaveInput,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<LeaveRequestDto | LeaveApprovalDto> {
    this.key(key);
    const outcome = await this.db.transaction(async (m) => {
      await this.actor(m, actor, action === 'withdraw');
      if (action !== 'withdraw' && actor.role === UserRole.MENTOR)
        throw new LeaveException('LEAVE_FORBIDDEN', 'Staff role required', 403);
      const route = `leave:${id}:${action}`;
      await this.receiptLock(m, actor.userId, route, key);
      const row = await this.row(m, id, actor, true);
      const replay = await this.replay<LeaveRequestDto | LeaveApprovalDto>(
        m,
        actor,
        route,
        key,
        input,
      );
      if (replay) return replay;
      if (row.status !== 'PENDING')
        throw new LeaveException('LEAVE_STATE_CONFLICT', 'Request is no longer pending');
      if (row.expires_at <= new Date()) {
        await this.transition(m, row, actor, 'EXPIRED', 'Source start reached');
        return null;
      }
      if (row.version !== input.expectedVersion)
        throw new LeaveException(
          'LEAVE_VERSION_CONFLICT',
          'Refetch the request before changing it',
        );
      let result: LeaveRequestDto | LeaveApprovalDto;
      if (action === 'approve') {
        if (!('acknowledgeStudentConflicts' in input))
          throw new LeaveException('LEAVE_ACK_REQUIRED', 'Conflict acknowledgment required', 422);
        const approved = await this.approve(m, row, input, actor);
        if (!approved) return null;
        result = approved;
      } else {
        await this.transition(
          m,
          row,
          actor,
          action === 'reject' ? 'REJECTED' : 'WITHDRAWN',
          input.reason,
        );
        result = await this.view(m, row);
      }
      await this.remember(m, actor, route, key, input, result);
      return result;
    });
    if (!outcome)
      throw new LeaveException(
        'LEAVE_REQUEST_EXPIRED',
        'Source start reached; expiration has been persisted',
      );
    return outcome;
  }

  private async approve(
    m: EntityManager,
    row: LeaveRow,
    input: ApproveLeaveInput,
    actor: AuthenticatedUser,
  ): Promise<LeaveApprovalDto | null> {
    const items = await this.items(m, row.id);
    const before = await this.sources(m, row.mentor_id, this.input(row));
    this.sameSources(
      before,
      items.map((i) => ({ sessionId: i.sourceSessionId, version: i.sourceVersion })),
    );
    const classes = await this.lockSources(m, before);
    await this.conflicts.lockClassMentors(m, [...classes.keys()], [row.mentor_id]);
    await this.actor(m, actor);
    if (!(await this.users.findActiveByRole(row.mentor_id, UserRole.MENTOR, m)))
      throw new LeaveException('LEAVE_MENTOR_INACTIVE', 'Requesting mentor must still be active');
    const sources = await this.sources(m, row.mentor_id, this.input(row));
    this.sameSources(
      sources,
      items.map((i) => ({ sessionId: i.sourceSessionId, version: i.sourceVersion })),
    );
    if (sources.some((s) => !classes.has(s.classId))) this.stale();
    const now = new Date();
    if (row.expires_at <= now) {
      await this.transition(m, row, actor, 'EXPIRED', 'Source start reached');
      return null;
    }
    await this.schedule.assertNoPlacements(
      m,
      sources.map((s) => s.session.id),
    );
    await this.lockStudents(m, classes);
    const intervals = this.planning.intervals(this.input(row), this.read.timeZone());
    const studentConflicts = await this.planning.validate(
      m,
      row.mentor_id,
      row.period,
      items,
      classes,
      intervals,
      this.read.timeZone(),
      now,
    );
    if (studentConflicts.total && !input.acknowledgeStudentConflicts)
      throw new LeaveException(
        'LEAVE_STUDENT_CONFLICT_ACK_REQUIRED',
        'Review and acknowledge full-day student conflicts',
      );
    const replacements: ClassSessionEntity[] = [];
    // Cancel all sources before creating any replacement: cross-class mappings are validated as one final state.
    for (const source of sources) {
      const c = classes.get(source.classId);
      if (!c) this.stale();
      await this.schedule.cancelSession(m, c, source.session, actor.userId, input.reason, 'CANCEL');
    }
    for (const t of items) {
      const source = sources.find((s) => s.session.id === t.sourceSessionId)?.session;
      const c = classes.get(t.classId);
      if (!source || !c) this.stale();
      const s = await this.schedule.replaceCancelledSession(
        m,
        c,
        source,
        { startsAt: t.startsAt, endsAt: t.endsAt, mentorId: row.mentor_id },
        actor.userId,
        input.reason,
      );
      replacements.push(s);
      await m.query(
        'UPDATE mentor_leave_items SET replacement_session_id=$3 WHERE request_id=$1 AND source_session_id=$2',
        [row.id, source.id, s.id],
      );
    }
    for (const i of intervals)
      await m.query(
        `INSERT INTO mentor_approved_leave_intervals(request_id,mentor_id,starts_at,ends_at) VALUES($1,$2,$3,$4)`,
        [row.id, row.mentor_id, i.startsAt, i.endsAt],
      );
    await this.schedule.finishScheduleBatch(m, [...classes.values()]);
    await this.transition(m, row, actor, 'APPROVED', input.reason);
    const request = await this.view(m, row, { page: 1, pageSize: 100 });
    return {
      request,
      replacements: await this.read.sessionViews(m, replacements, now),
      classExtensions: request.classExtensions,
      studentConflictCount: studentConflicts.total,
    };
  }

  private input(row: LeaveRow): LeavePreviewInput {
    return { fromDate: row.from_date, toDate: row.to_date, period: row.period };
  }

  private async sources(
    m: EntityManager,
    mentor: string,
    input: LeavePreviewInput,
  ): Promise<LeaveSource[]> {
    const intervals = this.planning.intervals(input, this.read.timeZone());
    const rows: { id: string; classId: string }[] = await m.query(
      `SELECT s.id,u.class_id AS "classId" FROM class_sessions s
      JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
      WHERE c.status IN ('OPEN','IN_PROGRESS') AND s.status='SCHEDULED' AND coalesce(s.mentor_override_id,c.mentor_id)=$1
        AND EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS i("startsAt" timestamptz,"endsAt" timestamptz)
          WHERE s.starts_at<i."endsAt" AND s.ends_at>i."startsAt") ORDER BY s.id LIMIT 501`,
      [mentor, JSON.stringify(intervals)],
    );
    if (rows.length > 500)
      throw new LeaveException('LEAVE_TOO_MANY_SESSIONS', 'Split leave into smaller ranges', 422);
    if (!rows.length) return [];
    const sessions = await m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .where('s.id=ANY(:ids::uuid[])', { ids: rows.map((r) => r.id) })
      .getMany();
    return rows.map((r) => {
      const session = sessions.find((s) => s.id === r.id);
      if (!session) this.stale();
      return { session, classId: r.classId };
    });
  }

  private async lockSources(
    m: EntityManager,
    sources: readonly LeaveSource[],
  ): Promise<Map<string, ClassEntity>> {
    const classes = new Map<string, ClassEntity>();
    for (const id of [...new Set(sources.map((s) => s.classId))].sort())
      classes.set(id, await this.read.loadClass(m, id, true));
    for (const s of [...sources].sort((a, b) => a.session.id.localeCompare(b.session.id)))
      await m
        .getRepository(ClassSessionEntity)
        .createQueryBuilder('s')
        .where('s.id=:id', { id: s.session.id })
        .setLock('for_no_key_update')
        .getOne();
    return classes;
  }
  private async lockStudents(
    m: EntityManager,
    classes: ReadonlyMap<string, ClassEntity>,
  ): Promise<void> {
    const ids: string[] = [];
    for (const c of classes.values())
      ids.push(...(await this.reservations.classStudentIds(m, c.id)));
    await this.reservations.lockStudents(m, ids);
  }
  private isSame(
    sources: readonly LeaveSource[],
    versions: readonly { sessionId: string; version: number }[],
  ): boolean {
    return (
      sources.length > 0 &&
      sources.length === versions.length &&
      new Set(versions.map((v) => v.sessionId)).size === versions.length &&
      sources.every((s) =>
        versions.some((v) => v.sessionId === s.session.id && v.version === s.session.version),
      )
    );
  }
  private sameSources(
    sources: readonly LeaveSource[],
    versions: readonly { sessionId: string; version: number }[],
  ): void {
    if (!this.isSame(sources, versions)) this.stale();
  }
  private stale(): never {
    throw new LeaveException(
      'LEAVE_REQUEST_STALE',
      'Affected sessions changed; withdraw and submit a fresh preview',
    );
  }

  private async actor(
    m: EntityManager,
    actor: AuthenticatedUser,
    mentorOnly = false,
  ): Promise<void> {
    const roles = mentorOnly
      ? [UserRole.MENTOR]
      : [UserRole.ADMIN, UserRole.MANAGER, UserRole.MENTOR];
    if (
      !roles.includes(actor.role) ||
      !(await this.users.findActiveByRole(actor.userId, actor.role, m))
    )
      throw new LeaveException('LEAVE_FORBIDDEN', 'Active role required', 403);
  }
  private key(key?: string): void {
    if (!key || !isUUID(key, '4'))
      throw new LeaveException('LEAVE_KEY_INVALID', 'Idempotency-Key must be a UUID v4', 422);
  }
  private async row(
    m: EntityManager,
    id: string,
    actor: AuthenticatedUser,
    lock = false,
  ): Promise<LeaveRow> {
    const rows: LeaveRow[] = await m.query(
      `SELECT ${columns} FROM mentor_leave_requests WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    const row = rows[0];
    if (!row || (actor.role === UserRole.MENTOR && row.mentor_id !== actor.userId))
      throw new LeaveException('LEAVE_NOT_FOUND', 'Leave request not found', 404);
    return row;
  }
  private async items(m: EntityManager, id: string): Promise<LeaveItemDto[]> {
    return m.query(
      `SELECT ${itemColumns} FROM mentor_leave_items WHERE request_id=$1 ORDER BY source_starts_at,source_session_id`,
      [id],
    );
  }
  private async view(
    m: EntityManager,
    row: LeaveRow,
    query?: { page: number; pageSize: number },
    now = new Date(),
    summary?: { total: number; classExtensions: { classId: string; endDate: string }[] },
  ): Promise<LeaveRequestDto> {
    const counts: { total: string | number }[] = summary
      ? [{ total: summary.total }]
      : await m.query('SELECT count(*) AS total FROM mentor_leave_items WHERE request_id=$1', [
          row.id,
        ]);
    const page = query?.page ?? 1,
      pageSize = query?.pageSize ?? 100;
    const items: LeaveItemDto[] = query
      ? await m.query(
          `SELECT ${itemColumns} FROM mentor_leave_items WHERE request_id=$1 ORDER BY source_starts_at,source_session_id LIMIT $2 OFFSET $3`,
          [row.id, pageSize, (page - 1) * pageSize],
        )
      : [];
    const classExtensions: { classId: string; endDate: string }[] =
      summary?.classExtensions ??
      (await m.query(
        `SELECT i.class_id AS "classId",greatest(c.end_date,max((i.ends_at - interval '1 millisecond') AT TIME ZONE $2)::date)::text AS "endDate"
      FROM mentor_leave_items i JOIN classes c ON c.id=i.class_id WHERE i.request_id=$1 GROUP BY i.class_id,c.end_date ORDER BY i.class_id`,
        [row.id, this.read.timeZone()],
      ));
    return {
      id: row.id,
      mentorId: row.mentor_id,
      fromDate: row.from_date,
      toDate: row.to_date,
      period: row.period,
      reason: row.reason,
      status: row.status === 'PENDING' && row.expires_at <= now ? 'EXPIRED' : row.status,
      version: row.version,
      submittedAt: row.submitted_at,
      expiresAt: row.expires_at,
      itemCount: Number(counts[0]?.total ?? 0),
      studentConflictCount: null,
      items,
      page,
      pageSize,
      classExtensions,
      review:
        row.reviewed_by && row.reviewed_at
          ? {
              reviewerId: row.reviewed_by,
              reason: row.review_reason ?? '',
              reviewedAt: row.reviewed_at,
            }
          : null,
      asOf: now,
      timeZone: this.read.timeZone(),
    };
  }
  private async transition(
    m: EntityManager,
    row: LeaveRow,
    actor: AuthenticatedUser,
    status: LeaveStatus,
    reason: string,
  ): Promise<void> {
    row.status = status;
    row.version += 1;
    row.reviewed_by = actor.userId;
    row.review_reason = reason;
    row.reviewed_at = new Date();
    await m.query(
      'UPDATE mentor_leave_requests SET status=$2,version=$3,reviewed_by=$4,review_reason=$5,reviewed_at=$6 WHERE id=$1',
      [row.id, status, row.version, actor.userId, reason, row.reviewed_at],
    );
    await this.audit(m, row, actor, status, reason);
  }
  private async audit(
    m: EntityManager,
    row: LeaveRow,
    actor: AuthenticatedUser,
    action: string,
    reason: string,
  ): Promise<void> {
    await m.query(
      'INSERT INTO mentor_leave_audits(request_id,actor_id,action,version,reason) VALUES($1,$2,$3,$4,$5)',
      [row.id, actor.userId, action, row.version, reason],
    );
  }
  private hash(input: object): string {
    const canonical = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        );
      return value;
    };
    return createHash('sha256')
      .update(JSON.stringify(canonical(input)))
      .digest('hex');
  }
  private async receiptLock(
    m: EntityManager,
    actor: string,
    route: string,
    key?: string,
  ): Promise<void> {
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `leave-receipt:${actor}:${route}:${key}`,
    ]);
  }
  private async replay<T>(
    m: EntityManager,
    actor: AuthenticatedUser,
    route: string,
    key: string | undefined,
    input: object,
  ): Promise<T | null> {
    const rows: { payload_hash: string; outcome: T }[] = await m.query(
      'SELECT payload_hash,outcome FROM teaching_mutation_receipts WHERE actor_id=$1 AND route=$2 AND key=$3',
      [actor.userId, route, key],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.payload_hash !== this.hash(input))
      throw new LeaveException('IDEMPOTENCY_KEY_REUSED', 'Key already used with another payload');
    return row.outcome;
  }
  private async remember(
    m: EntityManager,
    actor: AuthenticatedUser,
    route: string,
    key: string | undefined,
    input: object,
    outcome: object,
  ): Promise<void> {
    await m.query(
      'INSERT INTO teaching_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,$2,$3,$4,$5::jsonb)',
      [actor.userId, route, key, this.hash(input), JSON.stringify(outcome)],
    );
  }
}
