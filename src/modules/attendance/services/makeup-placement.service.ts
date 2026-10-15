import { createHash } from 'node:crypto';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/postgres-error.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { ClassSessionEntity } from '../../classes/entities/class-session.entity.js';
import { SessionAssignmentRequiredException } from '../../classes/exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import {
  ScheduleReservationsService,
  TIMETABLE_ENROLLMENT_SQL,
} from '../../schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import type {
  ConflictingIntervalDto,
  ConflictStatus,
  CreateMakeupPlacementDto,
  MakeupCandidatePageDto,
  MakeupCandidatesQueryDto,
  MakeupListQueryDto,
  MakeupMutationDto,
  MakeupPlacementCreatedDto,
  MakeupPlacementDto,
  MakeupPlacementPageDto,
  PlacementStatus,
  ScheduleConflictPageDto,
  ScheduleConflictsQueryDto,
} from '../dtos/makeup.dto.js';
import type { AttendanceStatus } from '../enums/attendance-status.enum.js';
import {
  MakeupConflictException,
  MakeupNotEligibleException,
  MakeupNotFoundException,
} from '../exceptions/makeup.exceptions.js';

type ConflictRow = {
  id: string;
  enrollment_id: string;
  source_session_id: string;
  version: number;
  status: ConflictStatus;
  conflicting_intervals: ConflictingIntervalDto[];
  student_id: string;
  class_id: string;
  enrollment_status: string;
  course_unit_id: string;
};
type PlacementRow = {
  id: string;
  conflict_id: string;
  enrollment_id: string;
  source_class_id: string;
  source_session_id: string;
  source_root_session_id: string;
  student_id: string;
  target_class_id: string;
  target_session_id: string;
  status: PlacementStatus;
  version: number;
  attendance_status: AttendanceStatus | null;
};

@Injectable()
export class MakeupPlacementService {
  constructor(
    private readonly db: DataSource,
    private readonly teaching: TeachingReadService,
    private readonly users: UsersService,
    private readonly reservations: ScheduleReservationsService,
  ) {}

  async conflicts(
    actor: AuthenticatedUser,
    query: ScheduleConflictsQueryDto,
  ): Promise<ScheduleConflictPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.staff(m, actor);
      const filter = `($1::uuid IS NULL OR e.class_id=$1) AND
        (($2::text IS NULL AND f.status IN ('OPEN','MAKEUP_ASSIGNED')) OR f.status=$2)`;
      const params = [query.classId ?? null, query.status ?? null];
      const counts: { count: string }[] = await m.query(
        `SELECT count(*) FROM student_schedule_conflicts f
        JOIN enrollments e ON e.id=f.enrollment_id WHERE ${filter}`,
        params,
      );
      const rows: (ConflictRow & {
        display_name: string;
        placement_id: string | null;
        placement_version: number | null;
      })[] = await m.query(
        `SELECT f.*,e.student_id,e.class_id,student.display_name,p.id AS placement_id,p.version AS placement_version
         FROM student_schedule_conflicts f JOIN enrollments e ON e.id=f.enrollment_id
         JOIN users student ON student.id=e.student_id
         LEFT JOIN makeup_placements p ON p.conflict_id=f.id AND p.status<>'CANCELLED'
         WHERE ${filter} ORDER BY f.created_at,f.id LIMIT $3 OFFSET $4`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const sessions = rows.length
        ? await m
            .getRepository(ClassSessionEntity)
            .createQueryBuilder('s')
            .where('s.id=ANY(:ids::uuid[])', { ids: rows.map((r) => r.source_session_id) })
            .getMany()
        : [];
      const views = new Map(
        (await this.teaching.sessionViews(m, sessions, new Date())).map((s) => [s.sessionId, s]),
      );
      return {
        items: rows.map((r) => {
          const sourceSession = views.get(r.source_session_id);
          if (!sourceSession) throw new MakeupNotFoundException();
          return {
            id: r.id,
            enrollmentId: r.enrollment_id,
            student: { id: r.student_id, displayName: r.display_name },
            sourceSession,
            conflictingIntervals: r.conflicting_intervals,
            status: r.status,
            version: r.version,
            makeupPlacementId: r.placement_id,
            makeupPlacementVersion: r.placement_version,
          };
        }),
        total: Number(counts[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        asOf: new Date(),
      };
    });
  }

  async candidates(
    id: string,
    actor: AuthenticatedUser,
    query: MakeupCandidatesQueryDto,
  ): Promise<MakeupCandidatePageDto> {
    if ((query.from === undefined) !== (query.to === undefined))
      throw new UnprocessableEntityException('from/to must be supplied together');
    const now = new Date(),
      from = query.from ? new Date(query.from) : now,
      to = query.to ? new Date(query.to) : new Date(now.getTime() + 93 * 86400000);
    if (!(from < to) || to.getTime() - from.getTime() > 93 * 86400000)
      throw new UnprocessableEntityException('Range must be positive and at most 93 days');
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.staff(m, actor);
      const f = await this.conflict(m, id);
      if (f.enrollment_status !== 'ACTIVE') throw new MakeupNotEligibleException();
      if (f.status !== 'OPEN')
        throw new MakeupConflictException(
          'MAKEUP_ALREADY_ASSIGNED',
          'Cancel the previous placement before selecting a new target',
        );
      // Batched eligibility, capacity and timetable checks; GET reserves no seats.
      const cte = `WITH candidates AS (SELECT s.id,s.starts_at,c.max_students -
        (SELECT count(*)::int FROM enrollments e WHERE e.class_id=c.id AND
          (e.status='ACTIVE' OR (e.status='PENDING_PAYMENT' AND EXISTS(SELECT 1 FROM order_details d
            JOIN orders o ON o.id=d.order_id WHERE d.id=e.order_detail_id AND o.status='PENDING' AND o.expires_at>$1)))) -
        (SELECT count(*)::int FROM makeup_placements p WHERE p.target_session_id=s.id AND p.status='ASSIGNED') AS remaining
        FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
        WHERE u.course_unit_id=$2 AND c.id<>$3 AND c.status IN ('OPEN','IN_PROGRESS')
          AND s.status='SCHEDULED' AND s.starts_at>$1 AND s.starts_at>=$4 AND s.starts_at<$5
          AND NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=c.id AND e.student_id=$6
            AND (e.status IN ('ACTIVE','COMPLETED') OR (e.status='PENDING_PAYMENT' AND EXISTS(
              SELECT 1 FROM order_details d JOIN orders o ON o.id=d.order_id WHERE d.id=e.order_detail_id
                AND o.status='PENDING' AND o.expires_at>$1))))
          AND NOT EXISTS(SELECT 1 FROM class_sessions other JOIN class_units ou ON ou.id=other.class_unit_id
            JOIN classes oc ON oc.id=ou.class_id WHERE other.id<>$7 AND other.id<>s.id
            AND other.status IN ('SCHEDULED','IN_PROGRESS') AND oc.status IN ('OPEN','IN_PROGRESS')
            AND other.starts_at<s.ends_at AND other.ends_at>s.starts_at AND (
              EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=oc.id AND e.student_id=$6 AND ${TIMETABLE_ENROLLMENT_SQL})
              OR EXISTS(SELECT 1 FROM makeup_placements p WHERE p.target_session_id=other.id
                AND p.student_id=$6 AND p.status='ASSIGNED'))))`;
      const params = [
        now,
        f.course_unit_id,
        f.class_id,
        from,
        to,
        f.student_id,
        f.source_session_id,
      ];
      const count: { count: string }[] = await m.query(
        `${cte} SELECT count(*) FROM candidates WHERE remaining>0`,
        params,
      );
      const targets: { id: string; remaining: number }[] = await m.query(
        `${cte}
        SELECT id,remaining FROM candidates WHERE remaining>0 ORDER BY starts_at,id LIMIT $8 OFFSET $9`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const sessions = targets.length
        ? await m
            .getRepository(ClassSessionEntity)
            .createQueryBuilder('s')
            .where('s.id=ANY(:ids::uuid[])', { ids: targets.map((t) => t.id) })
            .getMany()
        : [];
      const views = new Map(
        (await this.teaching.sessionViews(m, sessions, now)).map((s) => [s.sessionId, s]),
      );
      return {
        items: targets.map((t) => {
          const session = views.get(t.id);
          if (!session) throw new MakeupNotFoundException();
          return { session, remainingCapacity: t.remaining };
        }),
        total: Number(count[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        asOf: now,
      };
    });
  }

  async create(
    id: string,
    input: CreateMakeupPlacementDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<MakeupPlacementCreatedDto> {
    this.key(key);
    try {
      return await this.db.transaction(async (m) => {
        await this.staff(m, actor);
        let f = await this.conflict(m, id);
        const target = await this.teaching.loadSession(m, input.targetSessionId);
        await this.lock(
          m,
          [f.class_id, target.classEntity.id],
          [f.source_session_id, target.session.id],
          f.student_id,
        );
        await this.staff(m, actor);
        const route = `conflict:${id}:placement`;
        const replay = await this.receipt<MakeupPlacementCreatedDto>(m, actor, route, key, input);
        if (replay) return replay;
        f = await this.conflict(m, id);
        const { session: s } = await this.teaching.loadSession(m, f.source_session_id);
        const { session: t, classEntity: c } = await this.teaching.loadSession(
          m,
          input.targetSessionId,
        );
        if (f.version !== input.expectedVersion || t.version !== input.expectedTargetVersion)
          throw new MakeupConflictException(
            'MAKEUP_VERSION_CONFLICT',
            'Refetch conflict and target session',
          );
        if (f.status !== 'OPEN')
          throw new MakeupConflictException(
            'MAKEUP_ALREADY_ASSIGNED',
            'Cancel the previous placement before reassigning',
          );
        if (!input.contentMatchConfirmed || f.enrollment_status !== 'ACTIVE' || c.id === f.class_id)
          throw new MakeupNotEligibleException();
        const units: { course_unit_id: string }[] = await m.query(
          'SELECT course_unit_id FROM class_units WHERE id=$1',
          [t.classUnitId],
        );
        if (units[0]?.course_unit_id !== f.course_unit_id) throw new MakeupNotEligibleException();
        const now = new Date();
        const source = await this.teaching.loadClass(m, f.class_id);
        if (
          !['OPEN', 'IN_PROGRESS'].includes(source.status) ||
          s.status === 'CANCELLED' ||
          !['OPEN', 'IN_PROGRESS'].includes(c.status) ||
          t.status !== 'SCHEDULED' ||
          t.startsAt <= now
        )
          throw new MakeupConflictException(
            'MAKEUP_TARGET_UNAVAILABLE',
            'Source/target is no longer available',
          );
        if (await this.reservations.hasEffectiveEnrollment(m, f.student_id, c.id))
          throw new MakeupConflictException(
            'MAKEUP_TARGET_ENROLLED',
            'Student already has a registration in target class',
          );
        if (
          (
            await this.reservations.studentConflicts(
              m,
              f.student_id,
              t.startsAt,
              t.endsAt,
              [s.id, t.id],
              now,
            )
          ).length
        )
          throw new MakeupConflictException(
            'MAKEUP_STUDENT_CONFLICT',
            'Target overlaps the student timetable',
          );
        if ((await this.reservations.remainingCapacity(m, t.id, now)) <= 0)
          throw new MakeupConflictException(
            'MAKEUP_TARGET_FULL',
            'Target session has no remaining capacity',
          );
        const rows: { id: string }[] = await m.query(
          `INSERT INTO makeup_placements(conflict_id,enrollment_id,student_id,
          source_class_id,source_session_id,source_root_session_id,target_class_id,target_session_id,course_unit_id,
          content_match_confirmed,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11) RETURNING id`,
          [
            id,
            f.enrollment_id,
            f.student_id,
            f.class_id,
            s.id,
            s.makeupRootSessionId ?? s.id,
            c.id,
            t.id,
            f.course_unit_id,
            input.reason,
            actor.userId,
          ],
        );
        const p = await this.placement(m, rows[0]?.id ?? '');
        await this.audit(m, p, actor.userId, null, input.reason);
        await m.query(
          "UPDATE student_schedule_conflicts SET status='MAKEUP_ASSIGNED',version=version+1,updated_at=now() WHERE id=$1",
          [id],
        );
        await m.query('UPDATE class_sessions SET version=version+1 WHERE id=$1', [t.id]);
        const result = {
          placement: await this.view(m, p),
          conflictVersion: f.version + 1,
          targetSessionVersion: t.version + 1,
        };
        await this.saveReceipt(m, actor, route, key, input, result);
        return result;
      });
    } catch (error: unknown) {
      if (
        isUniqueViolation(error, 'uq_makeup_source_obligation') ||
        isUniqueViolation(error, 'uq_makeup_student_target')
      )
        throw new MakeupConflictException(
          'MAKEUP_ALREADY_ASSIGNED',
          'A placement already exists for this obligation or target',
        );
      throw error;
    }
  }

  async cancel(
    id: string,
    input: MakeupMutationDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<MakeupPlacementDto> {
    this.key(key);
    return this.db.transaction(async (m) => {
      await this.staff(m, actor);
      let p = await this.placement(m, id);
      await this.lock(
        m,
        [p.source_class_id, p.target_class_id],
        [p.source_session_id, p.target_session_id],
        p.student_id,
      );
      await this.staff(m, actor);
      const route = `placement:${id}:cancel`,
        replay = await this.receipt<MakeupPlacementDto>(m, actor, route, key, input);
      if (replay) return replay;
      p = await this.placement(m, id);
      if (p.version !== input.expectedVersion)
        throw new MakeupConflictException('MAKEUP_VERSION_CONFLICT', 'Refetch placement');
      if (p.status === 'CANCELLED')
        throw new MakeupConflictException(
          'MAKEUP_STATE_CONFLICT',
          'Placement is already cancelled',
        );
      const old = p.status;
      await m.query(
        "UPDATE makeup_placements SET status='CANCELLED',version=version+1,updated_at=now() WHERE id=$1",
        [id],
      );
      p = await this.placement(m, id);
      await this.audit(m, p, actor.userId, old, input.reason);
      await m.query(
        "UPDATE student_schedule_conflicts SET status='OPEN',version=version+1,updated_at=now() WHERE id=$1",
        [p.conflict_id],
      );
      await m.query('UPDATE class_sessions SET version=version+1 WHERE id=$1', [
        p.target_session_id,
      ]);
      const result = await this.view(m, p);
      await this.saveReceipt(m, actor, route, key, input, result);
      return result;
    });
  }

  async own(actor: AuthenticatedUser, query: MakeupListQueryDto): Promise<MakeupPlacementPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      if (
        actor.role !== UserRole.STUDENT ||
        !(await this.users.findActiveByRole(actor.userId, UserRole.STUDENT, m))
      )
        throw new SessionAssignmentRequiredException();
      const params = [actor.userId, query.status ?? null];
      const count: { count: string }[] = await m.query(
        'SELECT count(*) FROM makeup_placements WHERE student_id=$1 AND ($2::text IS NULL OR status=$2)',
        params,
      );
      const rows: PlacementRow[] = await m.query(
        `SELECT p.*,g.status AS attendance_status FROM makeup_placements p
        LEFT JOIN guest_attendance_records g ON g.placement_id=p.id WHERE p.student_id=$1 AND ($2::text IS NULL OR p.status=$2)
        ORDER BY p.created_at DESC,p.id LIMIT $3 OFFSET $4`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      // Batch SessionView mapping, including historical metadata without granting class access.
      const sessions = rows.length
        ? await m
            .getRepository(ClassSessionEntity)
            .createQueryBuilder('s')
            .where('s.id=ANY(:ids::uuid[])', { ids: rows.map((p) => p.target_session_id) })
            .getMany()
        : [];
      const views = new Map(
        (await this.teaching.sessionViews(m, sessions, new Date())).map((s) => [s.sessionId, s]),
      );
      return {
        items: rows.map((p) => {
          const target = views.get(p.target_session_id);
          if (!target) throw new MakeupNotFoundException();
          return this.map(p, target);
        }),
        total: Number(count[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        asOf: new Date(),
        timeZone: this.teaching.timeZone(),
      };
    });
  }

  private async staff(m: EntityManager, actor: AuthenticatedUser): Promise<void> {
    if (
      ![UserRole.ADMIN, UserRole.MANAGER].includes(actor.role) ||
      !(await this.users.findActiveByRole(actor.userId, actor.role, m))
    )
      throw new SessionAssignmentRequiredException();
  }
  private async conflict(m: EntityManager, id: string): Promise<ConflictRow> {
    const rows: ConflictRow[] = await m.query(
      `SELECT f.*,e.student_id,e.class_id,e.status AS enrollment_status,u.course_unit_id
      FROM student_schedule_conflicts f JOIN enrollments e ON e.id=f.enrollment_id
      JOIN class_sessions s ON s.id=f.source_session_id JOIN class_units u ON u.id=s.class_unit_id
      WHERE f.id=$1 AND u.class_id=e.class_id`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new MakeupNotFoundException();
    return row;
  }
  private async placement(m: EntityManager, id: string): Promise<PlacementRow> {
    const rows: PlacementRow[] = await m.query(
      `SELECT p.*,g.status AS attendance_status FROM makeup_placements p
      LEFT JOIN guest_attendance_records g ON g.placement_id=p.id WHERE p.id=$1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new MakeupNotFoundException();
    return row;
  }
  private async lock(
    m: EntityManager,
    classes: readonly string[],
    sessions: readonly string[],
    student: string,
  ): Promise<void> {
    await m.query('SELECT id FROM classes WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
      [...new Set(classes)].sort(),
    ]);
    await m.query(
      'SELECT id FROM class_sessions WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',
      [[...new Set(sessions)].sort()],
    );
    await this.reservations.lockStudents(m, [student]);
  }
  private map(
    p: PlacementRow,
    targetSession: MakeupPlacementDto['targetSession'],
  ): MakeupPlacementDto {
    return {
      id: p.id,
      conflictId: p.conflict_id,
      enrollmentId: p.enrollment_id,
      sourceClassId: p.source_class_id,
      sourceSessionId: p.source_session_id,
      sourceRootSessionId: p.source_root_session_id,
      targetSession,
      status: p.status,
      version: p.version,
      attendanceStatus: p.attendance_status ?? null,
      creditStatus:
        p.status === 'CANCELLED' ? 'REVOKED' : p.status === 'COMPLETED' ? 'FINALIZED' : 'PENDING',
    };
  }
  private async view(m: EntityManager, p: PlacementRow): Promise<MakeupPlacementDto> {
    const { session } = await this.teaching.loadSession(m, p.target_session_id);
    const target = (await this.teaching.sessionViews(m, [session], new Date()))[0];
    if (!target) throw new MakeupNotFoundException();
    return this.map(p, target);
  }
  private async audit(
    m: EntityManager,
    p: PlacementRow,
    actor: string,
    old: string | null,
    reason: string,
  ): Promise<void> {
    await m.query(
      `INSERT INTO makeup_placement_audits(placement_id,actor_id,old_status,new_status,reason,version)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [p.id, actor, old, p.status, reason, p.version],
    );
  }
  private key(key: string | undefined): asserts key is string {
    if (!key || !isUUID(key, '4'))
      throw new UnprocessableEntityException('Idempotency-Key must be a UUID v4');
  }
  private hash(input: MakeupMutationDto): string {
    return createHash('sha256')
      .update(JSON.stringify(input, Object.keys(input).sort()))
      .digest('hex');
  }
  private async receipt<T>(
    m: EntityManager,
    actor: AuthenticatedUser,
    route: string,
    key: string,
    input: MakeupMutationDto,
  ): Promise<T | null> {
    const rows: { payload_hash: string; outcome: T }[] = await m.query(
      'SELECT payload_hash,outcome FROM makeup_mutation_receipts WHERE actor_id=$1 AND route=$2 AND key=$3',
      [actor.userId, route, key],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.payload_hash !== this.hash(input))
      throw new MakeupConflictException(
        'IDEMPOTENCY_KEY_REUSED',
        'Key already used with another payload',
      );
    return row.outcome;
  }
  private async saveReceipt(
    m: EntityManager,
    actor: AuthenticatedUser,
    route: string,
    key: string,
    input: MakeupMutationDto,
    outcome: MakeupPlacementDto | MakeupPlacementCreatedDto,
  ): Promise<void> {
    await m.query(
      'INSERT INTO makeup_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,$2,$3,$4,$5::jsonb)',
      [actor.userId, route, key, this.hash(input), JSON.stringify(outcome)],
    );
  }
}
