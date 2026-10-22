import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { isSingleTeachingDay } from '../../classes/domain/class-calendar.js';
import { effectiveMentorId } from '../../classes/domain/effective-mentor.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import {
  ClassMentorNotEligibleException,
  ClassSessionOvernightNotAllowedException,
} from '../../classes/exceptions/class.exceptions.js';
import { SessionAssignmentRequiredException } from '../../classes/exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MentorConflictService } from '../../classes/services/mentor-conflict.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { SessionLifecycleService } from '../../classes/services/session-lifecycle.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { AttendancePaymentEvidenceService } from '../../payments/services/attendance-payment-evidence.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { isAttendanceEditable, isAttendanceStartDay } from '../domain/attendance-window.js';
import { hasRecoveryEvidence } from '../domain/recovery-evidence.js';
import type {
  AttendanceCandidatePageDto,
  AttendancePermissionsDto,
  AttendanceRosterDto,
  AttendanceSessionDto,
  AttendanceTotalsDto,
  AttendanceWriteDto,
} from '../dtos/attendance.dto.js';
import type {
  AttendanceMutationDto,
  BulkMarkAttendanceDto,
  FinalizeSessionDto,
  MarkAttendanceDto,
  RecoverAttendanceDto,
  StartSessionDto,
} from '../dtos/attendance-input.dto.js';
import { AttendanceRecordEntity } from '../entities/attendance-record.entity.js';
import { AttendanceRecoveryAuditEntity } from '../entities/attendance-recovery-audit.entity.js';
import { AttendanceRecoveryAuditItemEntity } from '../entities/attendance-recovery-audit-item.entity.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';
import {
  AttendanceConflictException,
  AttendanceEnrollmentNotEligibleException,
  AttendanceRecoveryEvidenceInvalidException,
} from '../exceptions/attendance.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { GuestAttendanceService } from './guest-attendance.service.js';

type SessionContext = Awaited<ReturnType<TeachingReadService['loadSession']>>;
type Operation = 'start' | 'sync' | 'mark' | 'bulk-mark' | 'finalize' | 'recover';
type Input =
  | StartSessionDto
  | FinalizeSessionDto
  | MarkAttendanceDto
  | BulkMarkAttendanceDto
  | RecoverAttendanceDto;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly db: DataSource,
    private readonly teaching: TeachingReadService,
    private readonly lifecycle: SessionLifecycleService,
    private readonly conflicts: MentorConflictService,
    private readonly enrollments: EnrollmentsService,
    private readonly users: UsersService,
    private readonly payments: AttendancePaymentEvidenceService,
    private readonly guests: GuestAttendanceService,
  ) {}

  async candidates(
    id: string,
    actor: AuthenticatedUser,
    page: PageOptionsDto,
  ): Promise<AttendanceCandidatePageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      const ctx = await this.teaching.loadSession(m, id);
      await this.authorize(m, ctx, actor);
      if (
        ctx.session.status !== 'SCHEDULED' ||
        !['OPEN', 'IN_PROGRESS'].includes(ctx.classEntity.status)
      )
        throw new UnprocessableEntityException(
          'Candidates are available only before an active session starts',
        );
      const now = new Date();
      const source = `WITH candidates AS (
        SELECT e.id AS "enrollmentId",e.student_id AS "studentId",u.display_name AS "displayName",'REGULAR' AS "entryType",NULL::uuid AS "makeupPlacementId"
        FROM enrollments e JOIN users u ON u.id=e.student_id
        WHERE e.class_id=$1 AND e.status='ACTIVE' AND e.enrolled_at<=$3 AND e.created_at<=$3
        UNION ALL
        SELECT e.id,p.student_id,u.display_name,'MAKEUP',p.id FROM makeup_placements p
        JOIN enrollments e ON e.id=p.enrollment_id JOIN classes c ON c.id=p.source_class_id JOIN users u ON u.id=p.student_id
        WHERE p.target_session_id=$2 AND p.status='ASSIGNED' AND e.status='ACTIVE' AND e.enrolled_at<=$3 AND p.created_at<=$3 AND c.status IN ('OPEN','IN_PROGRESS')
      )`;
      const params = [ctx.classEntity.id, id, now];
      const counts: { total: number }[] = await m.query(
        `${source} SELECT count(*)::int AS total FROM candidates`,
        params,
      );
      const rows: {
        enrollmentId: string;
        studentId: string;
        displayName: string;
        entryType: 'REGULAR' | 'MAKEUP';
        makeupPlacementId: string | null;
      }[] = await m.query(
        `${source} SELECT * FROM candidates ORDER BY "displayName","enrollmentId","entryType" LIMIT $4 OFFSET $5`,
        [...params, page.pageSize, (page.page - 1) * page.pageSize],
      );
      return {
        items: rows.map(({ studentId, displayName, ...row }) => ({
          ...row,
          student: { id: studentId, displayName },
        })),
        total: counts[0]?.total ?? 0,
        page: page.page,
        pageSize: page.pageSize,
        provisional: true,
        asOf: now,
      };
    });
  }

  async roster(
    id: string,
    actor: AuthenticatedUser,
    page: PageOptionsDto,
  ): Promise<AttendanceRosterDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const ctx = await this.teaching.loadSession(m, id);
      await this.authorize(m, ctx, actor);
      const now = new Date();
      const allRows: {
        attendanceId: string;
        enrollmentId: string;
        entryType: 'REGULAR' | 'MAKEUP';
        makeupPlacementId: string | null;
        studentId: string;
        displayName: string;
        status: AttendanceStatus;
        checkedInAt: Date | null;
        admittedAt: Date;
      }[] = await m.query(
        `SELECT r.id AS "attendanceId",r.enrollment_id AS "enrollmentId",'REGULAR' AS "entryType",NULL::uuid AS "makeupPlacementId",
          e.student_id AS "studentId",u.display_name AS "displayName",r.status,r.checked_in_at AS "checkedInAt",r.admitted_at AS "admittedAt"
         FROM attendance_records r JOIN enrollments e ON e.id=r.enrollment_id JOIN users u ON u.id=e.student_id WHERE r.session_id=$1
         UNION ALL
         SELECT g.id,g.enrollment_id,'MAKEUP',g.placement_id,g.student_id,u.display_name,g.status,g.checked_in_at,g.admitted_at
         FROM guest_attendance_records g JOIN users u ON u.id=g.student_id WHERE g.session_id=$1
         ORDER BY "enrollmentId","entryType","attendanceId" LIMIT $2 OFFSET $3`,
        [id, page.pageSize, (page.page - 1) * page.pageSize],
      );
      const totals = await this.totals(m, id);
      return {
        session: await this.view(m, ctx, actor, now),
        totals: await this.totals(m, id),
        items: allRows.map(({ studentId, displayName, ...row }) => ({
          ...row,
          student: { id: studentId, displayName },
        })),
        total: totals.eligible,
        page: page.page,
        pageSize: page.pageSize,
        pendingPaymentCount: await this.enrollments.pendingAttendanceCount(
          m,
          ctx.classEntity.id,
          now,
        ),
      };
    });
  }

  async start(
    id: string,
    input: StartSessionDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.mutate(id, 'start', input, actor, key);
  }
  async syncRoster(
    id: string,
    input: AttendanceMutationDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.mutate(id, 'sync', input, actor, key);
  }
  async mark(
    id: string,
    input: MarkAttendanceDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.mutate(id, 'mark', input, actor, key);
  }
  async bulkMark(
    id: string,
    input: BulkMarkAttendanceDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.mutate(id, 'bulk-mark', input, actor, key);
  }

  async finalize(
    id: string,
    input: FinalizeSessionDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.mutate(id, 'finalize', input, actor, key);
  }

  async recover(
    id: string,
    input: RecoverAttendanceDto,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.mutate(id, 'recover', input, actor, key);
  }

  private async mutate(
    id: string,
    op: Operation,
    input: Input,
    actor: AuthenticatedUser,
    key?: string,
  ): Promise<AttendanceWriteDto> {
    if (!key || !isUUID(key, '4'))
      throw new UnprocessableEntityException('Idempotency-Key must be a UUID v4');
    return this.db.transaction(async (m) => {
      const ctx = await this.teaching.loadSession(m, id, true);
      await this.authorize(m, ctx, actor);
      if (op === 'recover' && !this.staff(actor)) throw new SessionAssignmentRequiredException();
      const route = `session:${id}:${op}`;
      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            expectedVersion: input.expectedVersion,
            reason: input.reason ?? null,
            ...('checked' in input ? { checked: input.checked } : {}),
            actualStartedAt: 'actualStartedAt' in input ? input.actualStartedAt : null,
            actualEndedAt: 'actualEndedAt' in input ? input.actualEndedAt : null,
            ...('evidenceNote' in input ? { evidenceNote: input.evidenceNote } : {}),
            ...('guestRecords' in input
              ? {
                  guestRecords: input.guestRecords
                    ? [...input.guestRecords]
                        .sort((a, b) => a.makeupPlacementId.localeCompare(b.makeupPlacementId))
                        .map((r) => ({ makeupPlacementId: r.makeupPlacementId, status: r.status }))
                    : [],
                }
              : {}),
            records:
              'records' in input
                ? [...input.records]
                    .sort((a, b) => a.enrollmentId.localeCompare(b.enrollmentId))
                    .map((r) => ({
                      enrollmentId: r.enrollmentId,
                      status: r.status,
                      ...('admissionBasis' in r ? { admissionBasis: r.admissionBasis } : {}),
                    }))
                : null,
          }),
        )
        .digest('hex');
      const receipts: { payload_hash: string; outcome: AttendanceWriteDto }[] = await m.query(
        'SELECT payload_hash,outcome FROM attendance_mutation_receipts WHERE actor_id=$1 AND route=$2 AND key=$3',
        [actor.userId, route, key],
      );
      const receipt = receipts[0];
      if (receipt) {
        if (receipt.payload_hash !== hash)
          throw new AttendanceConflictException(
            'IDEMPOTENCY_KEY_REUSED',
            'Key already used with another payload',
          );
        return receipt.outcome;
      }
      const s = ctx.session;
      if (s.version !== input.expectedVersion)
        throw new AttendanceConflictException(
          'SESSION_VERSION_CONFLICT',
          'Refetch the roster before writing',
        );
      const now = new Date();
      if (this.staff(actor) && !input.reason?.trim())
        throw new UnprocessableEntityException('Staff mutations require a reason');
      let changed: string[] = [];
      let changedGuests: string[] = [];
      if (op === 'start') {
        changed = await this.open(m, ctx, input as StartSessionDto, actor);
        changedGuests = await this.guests.admit(m, s, actor, input.reason);
      } else if (op === 'recover')
        changed = await this.recoverRows(m, ctx, input as RecoverAttendanceDto, actor);
      else {
        this.assertWritable(ctx, actor, now, op);
        if (op === 'sync') {
          changed = await this.admit(m, ctx, actor, now, input.reason, 'SYNC', true);
          changedGuests = await this.guests.admit(m, s, actor, input.reason, s.version + 1);
          if (changed.length || changedGuests.length) await this.lifecycle.bumpVersion(m, s);
        } else if (op === 'mark' || op === 'bulk-mark') {
          const batch =
            op === 'bulk-mark'
              ? await this.bulkBatch(m, id, input as BulkMarkAttendanceDto)
              : (input as MarkAttendanceDto);
          if (batch.records.length || batch.guestRecords?.length)
            changed = await this.markRows(m, ctx, batch, actor, now);
          else if (op === 'mark')
            throw new UnprocessableEntityException(
              'At least one regular or guest record is required',
            );
          changedGuests = await this.guests.mark(
            m,
            s,
            batch.guestRecords ?? [],
            actor,
            input.reason,
          );
          if (changed.length || changedGuests.length) await this.lifecycle.bumpVersion(m, s);
        } else {
          changed = await this.close(m, ctx, input as FinalizeSessionDto, actor, now);
          changedGuests = await this.guests.finalize(m, s, actor, input.reason);
        }
      }
      const result: AttendanceWriteDto = {
        session: await this.view(m, ctx, actor, new Date()),
        totals: await this.totals(m, id),
        changedEnrollmentIds: changed,
        changedMakeupPlacementIds: changedGuests,
      };
      await m.query(
        'INSERT INTO attendance_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,$2,$3,$4,$5::jsonb)',
        [actor.userId, route, key, hash, JSON.stringify(result)],
      );
      return result;
    });
  }

  private async open(
    m: EntityManager,
    ctx: SessionContext,
    input: StartSessionDto,
    actor: AuthenticatedUser,
  ): Promise<string[]> {
    const s = ctx.session;
    if (
      s.status !== SessionStatus.SCHEDULED ||
      ![ClassStatus.OPEN, ClassStatus.IN_PROGRESS].includes(ctx.classEntity.status)
    )
      throw new AttendanceConflictException('SESSION_STATE_CONFLICT', 'Session cannot be started');
    const recovery = input.actualStartedAt !== undefined;
    if (!isSingleTeachingDay(s.startsAt, s.endsAt, this.teaching.timeZone()))
      throw new ClassSessionOvernightNotAllowedException();
    if (recovery && !this.staff(actor))
      throw new UnprocessableEntityException('Only staff may provide actualStartedAt');
    const mentor = s.mentorOverrideId ?? ctx.classEntity.mentorId;
    await this.conflicts.lockMentors(m, [mentor]);
    if (!(await this.users.findActiveByRole(mentor, UserRole.MENTOR, m)))
      throw new ClassMentorNotEligibleException(HttpStatus.UNPROCESSABLE_ENTITY);
    // An advisory lock wait can cross midnight. Decide the day, cutoff and deadline only after it.
    const now = new Date();
    if (!recovery && !isAttendanceStartDay(now, s.startsAt, s.endsAt, this.teaching.timeZone()))
      throw new AttendanceConflictException(
        'ATTENDANCE_START_DAY_CLOSED',
        'Use staff recovery outside the session calendar days',
      );
    const at = recovery ? new Date(input.actualStartedAt ?? '') : now;
    if (!Number.isFinite(at.getTime()) || at > now)
      throw new UnprocessableEntityException('actualStartedAt must not be in the future');
    const [startsAt, endsAt] = this.teaching.checkedInterval(s, now);
    await this.conflicts.assertAvailable(m, [
      { sessionId: s.id, mentorId: mentor, startsAt, endsAt },
    ]);
    await this.lifecycle.start(m, ctx.classEntity, s, actor.userId, at, input.reason);
    // Historical starts require activation before the supplied timestamp; today's ACTIVE is insufficient.
    return this.admit(
      m,
      ctx,
      actor,
      now,
      input.reason,
      recovery ? 'RECOVERY_START' : 'START',
      false,
    );
  }

  private async recoverRows(
    m: EntityManager,
    ctx: SessionContext,
    input: RecoverAttendanceDto,
    actor: AuthenticatedUser,
  ): Promise<string[]> {
    const s = ctx.session;
    if (
      ctx.classEntity.status === ClassStatus.DRAFT ||
      ![SessionStatus.SCHEDULED, SessionStatus.COMPLETED].includes(s.status)
    )
      throw new AttendanceConflictException(
        'SESSION_STATE_CONFLICT',
        'Session cannot be recovered',
      );
    const start = new Date(input.actualStartedAt),
      end = new Date(input.actualEndedAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end)
      throw new UnprocessableEntityException('actualStartedAt < actualEndedAt <= now is required');
    if (!isSingleTeachingDay(start, end, this.teaching.timeZone()))
      throw new ClassSessionOvernightNotAllowedException();
    if (
      (s.actualStartedAt && s.actualStartedAt.getTime() !== start.getTime()) ||
      (s.actualEndedAt && s.actualEndedAt.getTime() !== end.getTime())
    )
      throw new AttendanceConflictException(
        'ATTENDANCE_RECOVERY_CLOCK_CONFLICT',
        'Recovery must preserve known clocks',
      );
    const ids = input.records.map((r) => r.enrollmentId);
    if (
      !ids.length ||
      ids.length > 1000 ||
      new Set(ids).size !== ids.length ||
      !input.evidenceNote.trim() ||
      input.records.some(
        (r) => ![AttendanceStatus.PRESENT, AttendanceStatus.ABSENT].includes(r.status),
      )
    )
      throw new AttendanceRecoveryEvidenceInvalidException();
    if (
      await m
        .getRepository(AttendanceRecordEntity)
        .existsBy({ sessionId: s.id, enrollmentId: In(ids) })
    )
      throw new AttendanceConflictException(
        'ATTENDANCE_RECOVERY_RECORD_EXISTS',
        'Use correction for existing rows',
      );
    const enrollments = await this.enrollments.attendanceHistory(m, ids);
    const payments = await this.payments.read(
      m,
      enrollments.map((e) => e.orderDetailId),
    );
    // Evaluate after Class/Session locks and all evidence reads; never lock Order/Payment here.
    const now = new Date();
    if (end > now)
      throw new UnprocessableEntityException('actualEndedAt must not be in the future');
    const byId = new Map(enrollments.map((e) => [e.id, e]));
    for (const r of input.records) {
      const e = byId.get(r.enrollmentId);
      if (
        !e ||
        !hasRecoveryEvidence(
          e,
          payments.get(e.orderDetailId),
          ctx.classEntity.id,
          start,
          now,
          r.admissionBasis,
        )
      )
        throw new AttendanceRecoveryEvidenceInvalidException();
    }
    const old = {
      status: s.status,
      start: s.actualStartedAt,
      end: s.actualEndedAt,
      deadline: s.editableUntil,
    };
    await this.lifecycle.recover(
      m,
      ctx.classEntity,
      s,
      actor.userId,
      start,
      end,
      input.reason ?? '',
    );
    if (!s.editableUntil) throw new Error('Missing recovered calendar deadline');
    const audit = await m.getRepository(AttendanceRecoveryAuditEntity).save({
      sessionId: s.id,
      actorId: actor.userId,
      version: s.version,
      reason: input.reason ?? '',
      evidenceNote: input.evidenceNote,
      oldStatus: old.status,
      newStatus: s.status,
      oldActualStartedAt: old.start,
      newActualStartedAt: start,
      oldActualEndedAt: old.end,
      newActualEndedAt: end,
      oldEditableUntil: old.deadline,
      newEditableUntil: s.editableUntil,
      occurredAt: now,
    });
    const rows = await m.getRepository(AttendanceRecordEntity).save(
      input.records.map((r) => ({
        classId: ctx.classEntity.id,
        sessionId: s.id,
        enrollmentId: r.enrollmentId,
        status: r.status,
        checkedInAt: r.status === AttendanceStatus.PRESENT ? now : null,
        admittedAt: now,
        recordedBy: actor.userId,
        admissionSource: 'EVIDENCE_RECOVERY',
      })),
    );
    const recordInputs = new Map(input.records.map((r) => [r.enrollmentId, r]));
    const items = rows.map((row) => {
      const e = byId.get(row.enrollmentId),
        r = recordInputs.get(row.enrollmentId);
      const p = e && payments.get(e.orderDetailId);
      if (!p || !r) throw new Error('Missing validated recovery evidence');
      return {
        recoveryAuditId: audit.id,
        sessionId: s.id,
        attendanceId: row.id,
        enrollmentId: row.enrollmentId,
        admissionBasis: r.admissionBasis,
        orderDetailId: p.orderDetailId,
        orderId: p.orderId,
        paymentId: p.paymentId,
        paidAt: p.paidAt,
      };
    });
    await m.getRepository(AttendanceRecoveryAuditItemEntity).insert(items);
    // Batch the potentially 1000 audit rows; each carries the same committed session version.
    await m.query(
      `INSERT INTO attendance_audits(attendance_id,actor_id,old_status,new_status,reason,action,version,occurred_at)
      SELECT x.id,$1::uuid,NULL,x.status::attendance_status_enum,$2,'RECOVER',$3,$4
      FROM jsonb_to_recordset($5::jsonb) AS x(id uuid,status text)`,
      [
        actor.userId,
        input.reason,
        s.version,
        now,
        JSON.stringify(rows.map((r) => ({ id: r.id, status: r.status }))),
      ],
    );
    return rows.map((r) => r.enrollmentId);
  }

  private async admit(
    m: EntityManager,
    ctx: SessionContext,
    actor: AuthenticatedUser,
    now: Date,
    reason: string | undefined,
    source: string,
    cash: boolean,
  ): Promise<string[]> {
    const s = ctx.session;
    if (!s.actualStartedAt)
      throw new AttendanceConflictException('SESSION_STATE_CONFLICT', 'Session has never started');
    const eligible = await this.enrollments.attendanceCandidates(
      m,
      ctx.classEntity.id,
      s.actualStartedAt,
      cash,
    );
    const existing = new Set(
      (
        await m
          .getRepository(AttendanceRecordEntity)
          .find({ where: { sessionId: s.id }, select: { enrollmentId: true } })
      ).map((r) => r.enrollmentId),
    );
    const candidates = eligible.filter((e) => !existing.has(e.id));
    const status =
      s.status === SessionStatus.COMPLETED ? AttendanceStatus.ABSENT : AttendanceStatus.UNMARKED;
    const rows = await m.getRepository(AttendanceRecordEntity).save(
      candidates.map((e) => ({
        classId: ctx.classEntity.id,
        enrollmentId: e.id,
        sessionId: s.id,
        status,
        checkedInAt: null,
        recordedBy: actor.userId,
        admittedAt: now,
        admissionSource: source,
      })),
    );
    for (const row of rows)
      await this.audit(
        m,
        row,
        actor.userId,
        null,
        reason,
        'ADMIT',
        source === 'START' || source === 'RECOVERY_START' ? s.version : s.version + 1,
      );
    return rows.map((r) => r.enrollmentId);
  }

  private async bulkBatch(
    m: EntityManager,
    id: string,
    input: BulkMarkAttendanceDto,
  ): Promise<MarkAttendanceDto> {
    if (typeof input.checked !== 'boolean')
      throw new UnprocessableEntityException('checked must be a boolean');
    // Called only after the Session lock, authorization, receipt and version checks.
    const regular: { enrollment_id: string }[] = await m.query(
      'SELECT enrollment_id FROM attendance_records WHERE session_id=$1',
      [id],
    );
    const guests: { placement_id: string }[] = await m.query(
      'SELECT placement_id FROM guest_attendance_records WHERE session_id=$1',
      [id],
    );
    const status = input.checked ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT;
    return {
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      records: regular.map((r) => ({ enrollmentId: r.enrollment_id, status })),
      guestRecords: guests.map((r) => ({ makeupPlacementId: r.placement_id, status })),
    };
  }

  private async markRows(
    m: EntityManager,
    ctx: SessionContext,
    input: MarkAttendanceDto,
    actor: AuthenticatedUser,
    now: Date,
  ): Promise<string[]> {
    const ids = input.records.map((r) => r.enrollmentId);
    if (!ids.length && !input.guestRecords?.length)
      throw new UnprocessableEntityException('At least one regular or guest record is required');
    if (
      ctx.session.status !== SessionStatus.IN_PROGRESS &&
      input.records.some((r) => r.status === AttendanceStatus.UNMARKED)
    )
      throw new UnprocessableEntityException('Closed sessions require PRESENT or ABSENT');
    if (new Set(ids).size !== ids.length) throw new AttendanceEnrollmentNotEligibleException();
    const rows = await m
      .getRepository(AttendanceRecordEntity)
      .findBy({ sessionId: ctx.session.id, enrollmentId: In(ids) });
    if (rows.length !== ids.length) throw new AttendanceEnrollmentNotEligibleException();
    const changed: string[] = [];
    for (const row of rows) {
      const next = input.records.find((r) => r.enrollmentId === row.enrollmentId)?.status;
      if (!next) throw new AttendanceEnrollmentNotEligibleException();
      if (next === row.status) continue;
      const old = row.status;
      row.status = next;
      row.checkedInAt = next === AttendanceStatus.PRESENT ? now : null;
      row.recordedBy = actor.userId;
      await m.getRepository(AttendanceRecordEntity).save(row);
      await this.audit(
        m,
        row,
        actor.userId,
        old,
        input.reason,
        ctx.session.status === SessionStatus.IN_PROGRESS ? 'MARK' : 'CORRECT',
        ctx.session.version + 1,
      );
      changed.push(row.enrollmentId);
    }
    return changed;
  }

  private async close(
    m: EntityManager,
    ctx: SessionContext,
    input: FinalizeSessionDto,
    actor: AuthenticatedUser,
    now: Date,
  ): Promise<string[]> {
    if (input.actualEndedAt !== undefined && !this.staff(actor))
      throw new UnprocessableEntityException('Only staff may provide actualEndedAt');
    const at = input.actualEndedAt === undefined ? now : new Date(input.actualEndedAt);
    if (
      !Number.isFinite(at.getTime()) ||
      at > now ||
      !ctx.session.actualStartedAt ||
      at <= ctx.session.actualStartedAt
    )
      throw new UnprocessableEntityException('actualStartedAt < actualEndedAt <= now is required');
    const rows = await m
      .getRepository(AttendanceRecordEntity)
      .findBy({ sessionId: ctx.session.id, status: AttendanceStatus.UNMARKED });
    await this.lifecycle.finalize(m, ctx.session, actor.userId, at, input.reason);
    for (const row of rows) {
      row.status = AttendanceStatus.ABSENT;
      row.checkedInAt = null;
      row.recordedBy = actor.userId;
      await m.getRepository(AttendanceRecordEntity).save(row);
      await this.audit(
        m,
        row,
        actor.userId,
        AttendanceStatus.UNMARKED,
        input.reason,
        'FINALIZE',
        ctx.session.version,
      );
    }
    return rows.map((r) => r.enrollmentId);
  }

  private staff(actor: AuthenticatedUser): boolean {
    return [UserRole.ADMIN, UserRole.MANAGER].includes(actor.role);
  }

  private async authorize(
    m: EntityManager,
    ctx: SessionContext,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (
      (!this.staff(actor) && actor.role !== UserRole.MENTOR) ||
      !(await this.users.findActiveByRole(actor.userId, actor.role, m)) ||
      (actor.role === UserRole.MENTOR &&
        effectiveMentorId(ctx.session, ctx.classEntity.mentorId) !== actor.userId)
    )
      throw new SessionAssignmentRequiredException();
  }

  private assertWritable(
    ctx: SessionContext,
    actor: AuthenticatedUser,
    now: Date,
    op: Operation,
  ): void {
    const s = ctx.session;
    const staffSync = op === 'sync' && this.staff(actor) && s.status === SessionStatus.COMPLETED;
    const correction =
      (op === 'mark' || op === 'bulk-mark') &&
      (s.status === SessionStatus.COMPLETED ||
        (this.staff(actor) && s.status === SessionStatus.CANCELLED));
    if (!s.actualStartedAt || (s.status !== SessionStatus.IN_PROGRESS && !staffSync && !correction))
      throw new AttendanceConflictException(
        'SESSION_STATE_CONFLICT',
        'Operation requires an in-progress session',
      );
    if (!this.staff(actor) && ctx.classEntity.status === ClassStatus.CANCELLED)
      throw new AttendanceConflictException(
        'SESSION_STATE_CONFLICT',
        'Cancelled classes require staff recovery',
      );
    if (!this.staff(actor) && !isAttendanceEditable(now, s.editableUntil))
      throw new AttendanceConflictException(
        'ATTENDANCE_EDIT_WINDOW_EXPIRED',
        'Ask staff to finalize or admit after the deadline',
      );
  }

  private permissions(
    ctx: SessionContext,
    actor: AuthenticatedUser,
    now: Date,
  ): AttendancePermissionsDto {
    const s = ctx.session;
    const writable =
      s.actualStartedAt !== null &&
      (this.staff(actor) ||
        (ctx.classEntity.status !== ClassStatus.CANCELLED &&
          isAttendanceEditable(now, s.editableUntil)));
    return {
      canStart:
        s.status === SessionStatus.SCHEDULED &&
        [ClassStatus.OPEN, ClassStatus.IN_PROGRESS].includes(ctx.classEntity.status) &&
        isAttendanceStartDay(now, s.startsAt, s.endsAt, this.teaching.timeZone()),
      canEditAttendance:
        writable &&
        (s.status === SessionStatus.IN_PROGRESS ||
          s.status === SessionStatus.COMPLETED ||
          (this.staff(actor) && s.status === SessionStatus.CANCELLED)),
      canRecover:
        this.staff(actor) &&
        ctx.classEntity.status !== ClassStatus.DRAFT &&
        [SessionStatus.SCHEDULED, SessionStatus.COMPLETED].includes(s.status),
      canViewAttendanceAudits: this.staff(actor),
      canFinalize: s.status === SessionStatus.IN_PROGRESS && writable,
      canSyncRoster:
        writable &&
        (s.status === SessionStatus.IN_PROGRESS ||
          (this.staff(actor) && s.status === SessionStatus.COMPLETED)),
    };
  }

  private async view(
    m: EntityManager,
    ctx: SessionContext,
    actor: AuthenticatedUser,
    now: Date,
  ): Promise<AttendanceSessionDto> {
    const session = (await this.teaching.sessionViews(m, [ctx.session], now))[0];
    if (!session) throw new Error('Missing session view');
    return { ...session, permissions: this.permissions(ctx, actor, now) };
  }

  private async totals(m: EntityManager, id: string): Promise<AttendanceTotalsDto> {
    const rows: { status: AttendanceStatus; count: string }[] = await m.query(
      `SELECT status,count(*) FROM (SELECT status FROM attendance_records WHERE session_id=$1
        UNION ALL SELECT status FROM guest_attendance_records WHERE session_id=$1) r GROUP BY status`,
      [id],
    );
    const counts = new Map(rows.map((r) => [r.status, Number(r.count)]));
    const present = counts.get(AttendanceStatus.PRESENT) ?? 0,
      absent = counts.get(AttendanceStatus.ABSENT) ?? 0,
      unmarked = counts.get(AttendanceStatus.UNMARKED) ?? 0;
    return { present, absent, unmarked, eligible: present + absent + unmarked };
  }

  private async audit(
    m: EntityManager,
    row: AttendanceRecordEntity,
    actor: string,
    old: AttendanceStatus | null,
    reason: string | undefined,
    action: string,
    version: number,
  ): Promise<void> {
    await m.query(
      `INSERT INTO attendance_audits(attendance_id,actor_id,old_status,new_status,reason,action,version,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [row.id, actor, old, row.status, reason ?? null, action, version, new Date()],
    );
  }
}
