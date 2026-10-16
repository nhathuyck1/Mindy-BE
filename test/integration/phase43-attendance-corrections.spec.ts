import { GuestAttendanceService } from '../../src/modules/attendance/services/guest-attendance.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { CalendarAttendanceDeadline1791849600002 } from '../../src/database/migrations/1791849600002-calendar-attendance-deadline.js';
import { AttendanceRecoveryEvidence1791849600003 } from '../../src/database/migrations/1791849600003-attendance-recovery-evidence.js';
import type { RecoverAttendanceDto } from '../../src/modules/attendance/dtos/attendance-input.dto.js';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { AttendanceRecoveryAuditEntity } from '../../src/modules/attendance/entities/attendance-recovery-audit.entity.js';
import { AttendanceRecoveryAuditItemEntity } from '../../src/modules/attendance/entities/attendance-recovery-audit-item.entity.js';
import { AttendanceAdmissionBasis as Basis } from '../../src/modules/attendance/enums/attendance-admission-basis.enum.js';
import { AttendanceStatus as Status } from '../../src/modules/attendance/enums/attendance-status.enum.js';
import { AttendanceService } from '../../src/modules/attendance/services/attendance.service.js';
import { AttendanceAuditService } from '../../src/modules/attendance/services/attendance-audit.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import {
  attendanceDeadline,
  toLocalDate,
} from '../../src/modules/classes/domain/class-calendar.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { MentorConflictService } from '../../src/modules/classes/services/mentor-conflict.service.js';
import { SessionLifecycleService } from '../../src/modules/classes/services/session-lifecycle.service.js';
import { TeachingAssignmentService } from '../../src/modules/classes/services/teaching-assignment.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrderSettlementService } from '../../src/modules/commerce/services/order-settlement.service.js';
import { AttendancePaymentEvidenceService } from '../../src/modules/payments/services/attendance-payment-evidence.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const PAGE = { page: 1, pageSize: 100 };
const NOW = new Date(
  `${toLocalDate(new Date(Date.now() + 86400000), 'Asia/Ho_Chi_Minh')}T15:00:00+07:00`,
);
const START = new Date(NOW.getTime() - 7200000),
  END = new Date(NOW.getTime() - 3600000);
const actor = (id: string, role = UserRole.MENTOR): AuthenticatedUser => ({
  userId: id,
  role,
  sessionId: randomUUID(),
});

describe.skipIf(!separateTestUrl('phase43'))('Phase 4.3 corrections/recovery (PostgreSQL)', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    teaching: TeachingReadService,
    attendance: AttendanceService,
    audits: AttendanceAuditService,
    staff: AuthenticatedUser;
  beforeAll(async () => {
    db = await paymentDatabase('phase43', {
      entities: [
        AttendanceRecordEntity,
        AttendanceRecoveryAuditEntity,
        AttendanceRecoveryAuditItemEntity,
      ],
      migrations: [
        SessionAttendance1791849600001,
        CalendarAttendanceDeadline1791849600002,
        AttendanceRecoveryEvidence1791849600003,
      ],
    });
    f = paymentFixture(db);
    teaching = new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService());
    attendance = new AttendanceService(
      db,
      teaching,
      new SessionLifecycleService(f.config),
      new MentorConflictService(),
      f.enrollments,
      f.users,
      new AttendancePaymentEvidenceService(new OrderSettlementService()),
      new GuestAttendanceService(),
    );
    audits = new AttendanceAuditService(db, teaching, f.users, f.enrollments);
    staff = actor((await f.user(UserRole.MANAGER)).id, UserRole.MANAGER);
  }, 30000);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function fixture(paid = true, paymentType = PaymentType.CASH) {
    vi.setSystemTime(new Date(START.getTime() - 3600000));
    const a = await f.order({ paymentType, maxStudents: 10 });
    const classId = a.classIds[0];
    if (!classId) throw new Error('Missing class');
    const s = (await f.read.getDetail(classId)).units[0]?.sessions[0];
    if (!s) throw new Error('Missing session');
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      s.id,
      START,
      END,
    ]);
    await db.query('UPDATE enrollments SET created_at=$2 WHERE class_id=$1', [
      classId,
      new Date(START.getTime() - 3600000),
    ]);
    if (paid) {
      if (paymentType === PaymentType.CASH)
        await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
      else {
        const link = await f.links.create(a.student.id, a.order.id);
        await f.settlement.settle(
          {
            orderCode: link.providerOrderCode ?? 0,
            amount: a.order.totalAmount,
            currency: 'VND',
            paymentLinkId: f.provider.links.get(link.providerOrderCode ?? 0)?.id ?? '',
            reference: randomUUID(),
            code: '00',
            isConfirmSample: false,
          },
          'WEBHOOK',
          null,
        );
      }
    }
    vi.setSystemTime(NOW);
    const rows: { id: string }[] = await db.query('SELECT id FROM enrollments WHERE class_id=$1', [
      classId,
    ]);
    const enrollmentId = rows[0]?.id;
    if (!enrollmentId) throw new Error('Missing hold');
    return {
      ...a,
      classId,
      sessionId: s.id,
      initialVersion: s.version,
      enrollmentId,
      mentorActor: actor(a.mentor.id),
    };
  }
  async function session(id: string) {
    return db.getRepository(ClassSessionEntity).findOneByOrFail({ id });
  }

  async function extraHold(a: Awaited<ReturnType<typeof fixture>>, paid: boolean) {
    vi.setSystemTime(new Date(START.getTime() - 3600000));
    const student = await f.user();
    await f.cart.addItem(student.id, a.classId);
    const [order] = await f.checkout.checkout(student.id, PaymentType.CASH);
    if (!order) throw new Error('Missing extra order');
    const rows: { id: string }[] = await db.query(
      'SELECT id FROM enrollments WHERE order_detail_id=$1',
      [order.details[0]?.id],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('Missing extra hold');
    await db.query('UPDATE enrollments SET created_at=$2 WHERE id=$1', [
      id,
      new Date(START.getTime() - 3600000),
    ]);
    if (paid)
      await f.cash.confirm(
        (await f.user(UserRole.MANAGER)).id,
        order.order.id,
        order.order.totalAmount,
      );
    vi.setSystemTime(NOW);
    return { id, order };
  }

  it('legacy COMPLETED null clocks and partial roster: existing-row batch rolls back, missing-row recovery preserves the other result', async () => {
    const a = await fixture(),
      b = await extraHold(a, true);
    await db.query("UPDATE class_sessions SET status='COMPLETED' WHERE id=$1", [a.sessionId]);
    const row = await db.getRepository(AttendanceRecordEntity).save({
      classId: a.classId,
      sessionId: a.sessionId,
      enrollmentId: a.enrollmentId,
      status: Status.PRESENT,
      checkedInAt: START,
      admittedAt: START,
      recordedBy: a.mentor.id,
      admissionSource: 'START',
    });
    const body = {
      ...recovery(a),
      records: [
        ...recovery(a).records,
        { enrollmentId: b.id, status: Status.ABSENT, admissionBasis: Basis.PAID_BEFORE_START },
      ],
    };
    await expect(attendance.recover(a.sessionId, body, staff, randomUUID())).rejects.toMatchObject({
      response: { code: 'ATTENDANCE_RECOVERY_RECORD_EXISTS' },
    });
    expect(await session(a.sessionId)).toMatchObject({
      actualStartedAt: null,
      actualEndedAt: null,
      version: a.initialVersion,
    });
    const r = await attendance.recover(
      a.sessionId,
      { ...body, records: body.records.slice(1) },
      staff,
      randomUUID(),
    );
    expect(r.totals).toEqual({ present: 1, absent: 1, unmarked: 0, eligible: 2 });
    expect(
      await db.getRepository(AttendanceRecordEntity).findOneByOrFail({ id: row.id }),
    ).toMatchObject({ checkedInAt: START, recordedBy: a.mentor.id });
    expect((await audits.list(a.sessionId, staff, PAGE)).items[0]?.recoveryEvidence).toMatchObject({
      oldSessionStatus: 'COMPLETED',
      oldActualStartedAt: null,
      oldActualEndedAt: null,
    });
  });

  it('correction/sync/finalize use one shared version; lost admission/audits cannot commit', async () => {
    const a = await fixture(),
      b = await extraHold(a, false),
      c = await closed(a);
    await f.cash.confirm(
      (await f.user(UserRole.MANAGER)).id,
      b.order.order.id,
      b.order.order.totalAmount,
    );
    const outcomes = await Promise.allSettled([
      mark(a, c.session.version, Status.PRESENT, staff),
      attendance.syncRoster(
        a.sessionId,
        { expectedVersion: c.session.version, reason: 'Verified late cash' },
        staff,
        randomUUID(),
      ),
      attendance.finalize(
        a.sessionId,
        { expectedVersion: c.session.version, reason: 'Already closed' },
        staff,
        randomUUID(),
      ),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await session(a.sessionId)).version).toBe(c.session.version + 1);
    const current = await attendance.roster(a.sessionId, staff, PAGE);
    expect([1, 2]).toContain(current.total);
    const h = await audits.list(a.sessionId, staff, PAGE);
    expect(h.items.filter((r) => r.version === c.session.version + 1)).toHaveLength(1);
    expect(
      await db.query('SELECT 1 FROM attendance_mutation_receipts WHERE route=$1 OR route=$2', [
        `session:${a.sessionId}:mark`,
        `session:${a.sessionId}:sync`,
      ]),
    ).toHaveLength(1);
  });

  it('recovery/correction/sync races never edit or infer absent before the evidenced recovery commits', async () => {
    const a = await fixture();
    const results = await Promise.allSettled([
      attendance.recover(a.sessionId, recovery(a), staff, randomUUID()),
      mark(a, a.initialVersion, Status.ABSENT, staff),
      attendance.syncRoster(
        a.sessionId,
        { expectedVersion: a.initialVersion, reason: 'Missing roster' },
        staff,
        randomUUID(),
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results[0]?.status).toBe('fulfilled');
    expect((await session(a.sessionId)).version).toBe(a.initialVersion + 1);
    expect((await attendance.roster(a.sessionId, staff, PAGE)).totals).toEqual({
      present: 1,
      absent: 0,
      unmarked: 0,
      eligible: 1,
    });
    expect((await audits.list(a.sessionId, staff, PAGE)).total).toBe(1);
  });

  it('recovery sees complete committed CASH settlement in Class lock order and retries missing evidence safely', async () => {
    const a = await fixture(false),
      key = randomUUID();
    const body = {
      ...recovery(a),
      records: [
        {
          enrollmentId: a.enrollmentId,
          status: Status.PRESENT,
          admissionBasis: Basis.CASH_LATE_ADMISSION,
        },
      ],
    };
    const results = await Promise.allSettled([
      attendance.recover(a.sessionId, body, staff, key),
      f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount),
    ]);
    expect(results[1]?.status).toBe('fulfilled');
    if (results[0]?.status === 'rejected')
      expect(results[0].reason).toMatchObject({
        response: { code: 'ATTENDANCE_RECOVERY_EVIDENCE_INVALID' },
      });
    const recovered = await attendance.recover(a.sessionId, body, staff, key);
    expect(recovered.totals.present).toBe(1);
    expect(recovered.session.version).toBe(a.initialVersion + 1);
    expect(
      await db.query('SELECT 1 FROM attendance_recovery_audits WHERE session_id=$1', [a.sessionId]),
    ).toHaveLength(1);
    expect((await audits.list(a.sessionId, staff, PAGE)).total).toBe(1);
  });

  it('historical withdrawal/cancel fixtures holding Class lock preserve recovery evidence and entitlement', async () => {
    const a = await fixture();
    // Test fixture for future 4.4 orchestration; production cancel/leave commands are outside 4.3.
    await Promise.all([
      attendance.recover(a.sessionId, recovery(a), staff, randomUUID()),
      db.transaction(async (m) => {
        await m.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE', [a.classId]);
        await m.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [a.enrollmentId]);
        await m.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [a.classId]);
      }),
    ]);
    expect(await session(a.sessionId)).toMatchObject({
      status: 'COMPLETED',
      version: a.initialVersion + 1,
    });
    expect((await f.read.getDetail(a.classId)).classEntity.status).toBe('CANCELLED');
    expect(
      await db.query("SELECT 1 FROM enrollments WHERE id=$1 AND status='CANCELLED'", [
        a.enrollmentId,
      ]),
    ).toHaveLength(1);
    expect((await audits.list(a.sessionId, staff, PAGE)).total).toBe(1);
  });
  async function closed(a: Awaited<ReturnType<typeof fixture>>) {
    vi.setSystemTime(START);
    const started = await attendance.start(
      a.sessionId,
      { expectedVersion: (await session(a.sessionId)).version },
      a.mentorActor,
      randomUUID(),
    );
    vi.setSystemTime(END);
    const result = await attendance.finalize(
      a.sessionId,
      { expectedVersion: started.session.version },
      a.mentorActor,
      randomUUID(),
    );
    vi.setSystemTime(NOW);
    return result;
  }
  function recovery(
    a: Awaited<ReturnType<typeof fixture>>,
    version = a.initialVersion,
  ): RecoverAttendanceDto {
    return {
      expectedVersion: version,
      reason: 'Verified paper roster',
      evidenceNote: 'Staff confirms historical attendance obligation from classroom register',
      actualStartedAt: START.toISOString(),
      actualEndedAt: END.toISOString(),
      records: [
        {
          enrollmentId: a.enrollmentId,
          status: Status.PRESENT,
          admissionBasis: Basis.PAID_BEFORE_START,
        },
      ],
    };
  }
  function mark(
    a: Awaited<ReturnType<typeof fixture>>,
    version: number,
    status = Status.PRESENT,
    who = a.mentorActor,
    key = randomUUID(),
  ) {
    return attendance.mark(
      a.sessionId,
      {
        expectedVersion: version,
        reason: 'Correct register',
        records: [{ enrollmentId: a.enrollmentId, status }],
      },
      who,
      key,
    );
  }

  it('corrects completed Class at deadline-1ms, preserves clocks; exact midnight rejects new write but replays authorized receipt', async () => {
    const a = await fixture(),
      c = await closed(a);
    await f.classes.complete(a.classId);
    const deadline = c.session.editableUntil;
    if (!deadline) throw new Error('Missing deadline');
    vi.setSystemTime(new Date(deadline.getTime() - 1));
    const key = randomUUID(),
      result = await mark(a, c.session.version, Status.PRESENT, a.mentorActor, key);
    expect(result).toMatchObject({
      session: {
        status: 'COMPLETED',
        actualStartedAt: c.session.actualStartedAt,
        actualEndedAt: c.session.actualEndedAt,
        editableUntil: deadline,
        permissions: { canEditAttendance: true },
      },
      totals: { present: 1 },
    });
    expect((await attendance.roster(a.sessionId, staff, PAGE)).items[0]?.checkedInAt).toEqual(
      new Date(deadline.getTime() - 1),
    );
    vi.setSystemTime(deadline);
    await expect(mark(a, result.session.version, Status.ABSENT)).rejects.toMatchObject({
      response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' },
    });
    expect(await mark(a, c.session.version, Status.PRESENT, a.mentorActor, key)).toEqual(
      JSON.parse(JSON.stringify(result)),
    );
    expect((await audits.list(a.sessionId, staff, PAGE)).items[0]).toMatchObject({
      action: 'CORRECT',
      oldStatus: 'ABSENT',
      newStatus: 'PRESENT',
      version: result.session.version,
    });
  });

  it('checks clock after a real Class lock wait crossing midnight', async () => {
    const a = await fixture(),
      c = await closed(a),
      deadline = c.session.editableUntil;
    if (!deadline) throw new Error('Missing deadline');
    const lock = db.createQueryRunner();
    await lock.connect();
    await lock.startTransaction();
    await lock.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE', [a.classId]);
    vi.setSystemTime(new Date(deadline.getTime() - 1));
    const pending = mark(a, c.session.version).catch((e: unknown) => e);
    let waiting = false;
    try {
      for (let n = 0; n < 100; n++) {
        const rows: unknown[] = await db.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%classes%'",
        );
        if (rows.length) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      vi.setSystemTime(deadline);
      await lock.commitTransaction();
      expect(await pending).toMatchObject({ response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' } });
      expect((await session(a.sessionId)).version).toBe(c.session.version);
    } finally {
      if (lock.isTransactionActive) await lock.rollbackTransaction();
      await lock.release();
    }
  });

  it('Staff corrects started CANCELLED history and terminal enrollment; no UNMARKED, no-op timestamps/version, atomic foreign-row rejection', async () => {
    const a = await fixture(),
      c = await closed(a),
      other = await fixture();
    await db.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [a.classId]);
    await db.query("UPDATE class_sessions SET status='CANCELLED' WHERE id=$1", [a.sessionId]);
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [a.enrollmentId]);
    await expect(mark(a, c.session.version)).rejects.toMatchObject({
      response: { code: 'SESSION_STATE_CONFLICT' },
    });
    const r = await mark(a, c.session.version, Status.PRESENT, staff);
    expect(r.session.status).toBe('CANCELLED');
    const row = (await attendance.roster(a.sessionId, staff, PAGE)).items[0];
    expect((await mark(a, r.session.version, Status.PRESENT, staff)).session.version).toBe(
      r.session.version,
    );
    expect((await attendance.roster(a.sessionId, staff, PAGE)).items[0]?.checkedInAt).toEqual(
      row?.checkedInAt,
    );
    await expect(mark(a, r.session.version, Status.UNMARKED, staff)).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      attendance.mark(
        a.sessionId,
        {
          expectedVersion: r.session.version,
          reason: 'Correct',
          records: [
            { enrollmentId: a.enrollmentId, status: Status.ABSENT },
            { enrollmentId: other.enrollmentId, status: Status.ABSENT },
          ],
        },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect((await attendance.roster(a.sessionId, staff, PAGE)).totals.present).toBe(1);
    expect((await mark(a, r.session.version, Status.ABSENT, staff)).totals.absent).toBe(1);
    expect((await attendance.roster(a.sessionId, staff, PAGE)).items[0]?.checkedInAt).toBeNull();
  });

  it('rejects never-started, unknown teaching mentor, missing deadline, revoked role/status and old assignment including replay', async () => {
    const a = await fixture();
    await expect(mark(a, a.initialVersion, Status.PRESENT, staff)).rejects.toMatchObject({
      status: 409,
    });
    const c = await closed(a),
      key = randomUUID();
    await mark(a, c.session.version, Status.PRESENT, a.mentorActor, key);
    await db.query('UPDATE class_sessions SET teaching_mentor_id=NULL WHERE id=$1', [a.sessionId]);
    await expect(
      mark(a, c.session.version, Status.PRESENT, a.mentorActor, key),
    ).rejects.toMatchObject({ status: 403 });
    await db.query(
      'UPDATE class_sessions SET teaching_mentor_id=$2,editable_until=NULL WHERE id=$1',
      [a.sessionId, a.mentor.id],
    );
    await expect(mark(a, (await session(a.sessionId)).version)).rejects.toMatchObject({
      response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' },
    });
    await db.query("UPDATE users SET role='STUDENT' WHERE id=$1", [a.mentor.id]);
    await expect(
      mark(a, c.session.version, Status.PRESENT, a.mentorActor, key),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE users SET role='MENTOR',status='SUSPENDED' WHERE id=$1", [a.mentor.id]);
    await expect(
      mark(a, c.session.version, Status.PRESENT, a.mentorActor, key),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('two corrections and correction/class completion serialize on shared version/locks', async () => {
    const a = await fixture(),
      c = await closed(a);
    const outcomes = await Promise.allSettled([
      mark(a, c.session.version, Status.PRESENT, staff),
      mark(a, c.session.version, Status.PRESENT, staff),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find((o) => o.status === 'rejected');
    expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({
      response: { code: 'SESSION_VERSION_CONFLICT' },
    });
    const v = (await session(a.sessionId)).version;
    await Promise.all([mark(a, v, Status.ABSENT, staff), f.classes.complete(a.classId)]);
    expect((await session(a.sessionId)).version).toBe(v + 1);
    expect((await f.read.getDetail(a.classId)).classEntity.status).toBe('COMPLETED');
  });

  it('audits are Staff-only, scoped, stably paginated with tied timestamps and safe recovery nulls', async () => {
    const a = await fixture(),
      c = await closed(a),
      other = await fixture();
    await mark(a, c.session.version, Status.PRESENT, staff);
    await expect(audits.list(a.sessionId, a.mentorActor, PAGE)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      audits.list(a.sessionId, actor(a.student.id, UserRole.STUDENT), PAGE),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      audits.list(a.sessionId, staff, { ...PAGE, enrollmentId: other.enrollmentId }),
    ).rejects.toMatchObject({ status: 422 });
    const all = await audits.list(a.sessionId, staff, { ...PAGE, enrollmentId: a.enrollmentId });
    expect(all.total).toBe(3);
    await db.query('UPDATE attendance_audits SET occurred_at=$2 WHERE attendance_id=$1', [
      all.items[0]?.attendanceId,
      NOW,
    ]);
    const ids: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const r = await audits.list(a.sessionId, staff, { page, pageSize: 1 });
      expect(r.total).toBe(3);
      expect(r.items[0]?.recoveryEvidence).toBeNull();
      ids.push(r.items[0]?.id ?? '');
    }
    expect(ids).toEqual([...ids].sort().reverse());
    expect(new Set(ids).size).toBe(3);
    expect((await audits.list(other.sessionId, staff, PAGE)).items).toEqual([]);
    const inactive = actor((await f.user(UserRole.ADMIN)).id, UserRole.ADMIN);
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [inactive.userId]);
    await expect(audits.list(a.sessionId, inactive, PAGE)).rejects.toMatchObject({ status: 403 });
  });

  it.each(['OPEN', 'COMPLETED', 'CANCELLED'])(
    'recovers SCHEDULED under %s Class without entitlement/status changes or invented historical actors',
    async (status) => {
      const a = await fixture();
      await db.query(`UPDATE classes SET status=$2 WHERE id=$1`, [a.classId, status]);
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [a.enrollmentId]);
      const beforeProgress = await db.query(
        'SELECT id FROM class_unit_progress WHERE enrollment_id=$1',
        [a.enrollmentId],
      );
      const r = await attendance.recover(a.sessionId, recovery(a), staff, randomUUID());
      expect(r).toMatchObject({
        session: {
          status: 'COMPLETED',
          actualStartedAt: START,
          actualEndedAt: END,
          effectiveMentor: null,
          permissions: { canRecover: true, canViewAttendanceAudits: true },
        },
        totals: { present: 1, absent: 0 },
      });
      expect(await session(a.sessionId)).toMatchObject({
        teachingMentorId: null,
        startedBy: null,
        completedBy: null,
        editableUntil: attendanceDeadline(START, teaching.timeZone()),
      });
      expect((await f.read.getDetail(a.classId)).classEntity.status).toBe(status);
      expect(
        await db.query('SELECT id FROM class_unit_progress WHERE enrollment_id=$1', [
          a.enrollmentId,
        ]),
      ).toEqual(beforeProgress);
      expect((await audits.list(a.sessionId, staff, PAGE)).items[0]).toMatchObject({
        action: 'RECOVER',
        oldStatus: null,
        newStatus: 'PRESENT',
        recoveryAuditId: expect.any(String),
        recoveryEvidence: {
          admissionBasis: Basis.PAID_BEFORE_START,
          oldSessionStatus: 'SCHEDULED',
          newSessionStatus: 'COMPLETED',
          oldActualStartedAt: null,
        },
      });
      const row = (await attendance.roster(a.sessionId, staff, PAGE)).items[0];
      expect(row?.admittedAt).toEqual(NOW);
      expect(row?.checkedInAt).toEqual(NOW);
    },
  );

  it('recovers legacy COMPLETED missing data; preserves known clocks, actors, mentor and deadline', async () => {
    const a = await fixture();
    await db.query(
      "UPDATE class_sessions SET status='COMPLETED',actual_started_at=$2,teaching_mentor_id=$3,started_by=$3,editable_until=$4 WHERE id=$1",
      [a.sessionId, START, a.mentor.id, attendanceDeadline(START, teaching.timeZone())],
    );
    const r = await attendance.recover(a.sessionId, recovery(a), staff, randomUUID());
    expect(await session(a.sessionId)).toMatchObject({
      teachingMentorId: a.mentor.id,
      startedBy: a.mentor.id,
      completedBy: null,
      actualStartedAt: START,
    });
    expect(r.session.version).toBe(a.initialVersion + 1);
    await expect(
      attendance.recover(
        a.sessionId,
        {
          ...recovery(a, a.initialVersion + 1),
          actualStartedAt: new Date(START.getTime() - 1).toISOString(),
        },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_RECOVERY_CLOCK_CONFLICT' } });
    await expect(
      attendance.recover(a.sessionId, recovery(a, a.initialVersion + 1), staff, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_RECOVERY_RECORD_EXISTS' } });
    expect((await session(a.sessionId)).version).toBe(a.initialVersion + 1);
  });

  it.each(['DRAFT', 'IN_PROGRESS', 'CANCELLED'])(
    'rejects invalid recovery state %s and keeps no-data',
    async (state) => {
      const a = await fixture();
      if (state === 'DRAFT')
        await db.query("UPDATE classes SET status='DRAFT' WHERE id=$1", [a.classId]);
      else await db.query('UPDATE class_sessions SET status=$2 WHERE id=$1', [a.sessionId, state]);
      await expect(
        attendance.recover(a.sessionId, recovery(a), staff, randomUUID()),
      ).rejects.toMatchObject({ response: { code: 'SESSION_STATE_CONFLICT' } });
      expect((await attendance.roster(a.sessionId, staff, PAGE)).items).toEqual([]);
    },
  );

  it('rejects future/overnight/inverted clocks, empty evidence, pending/unpaid, foreign and post-start holds', async () => {
    const a = await fixture(),
      unpaid = await fixture(false),
      foreign = await fixture();
    for (const body of [
      { ...recovery(a), actualEndedAt: new Date(NOW.getTime() + 1).toISOString() },
      { ...recovery(a), actualEndedAt: START.toISOString() },
      { ...recovery(a), actualStartedAt: new Date(START.getTime() - 86400000).toISOString() },
      { ...recovery(a), evidenceNote: ' ' },
      { ...recovery(a), records: recovery(foreign).records },
    ])
      await expect(
        attendance.recover(a.sessionId, body, staff, randomUUID()),
      ).rejects.toMatchObject({ status: 422 });
    await expect(
      attendance.recover(unpaid.sessionId, recovery(unpaid), staff, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
    await db.query('UPDATE enrollments SET created_at=$2 WHERE id=$1', [
      a.enrollmentId,
      new Date(START.getTime() + 1),
    ]);
    await expect(
      attendance.recover(a.sessionId, recovery(a), staff, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_RECOVERY_EVIDENCE_INVALID' } });
    expect((await session(a.sessionId)).version).toBe(a.initialVersion);
    expect((await attendance.roster(a.sessionId, staff, PAGE)).total).toBe(0);
  });

  it('requires verified settlement, exact line/student ancestry; supports paid PayOS but never late PayOS with cash basis', async () => {
    const a = await fixture(true, PaymentType.PAYOS);
    await db.query("UPDATE enrollments SET status='COMPLETED' WHERE id=$1", [a.enrollmentId]);
    const r = await attendance.recover(a.sessionId, recovery(a), staff, randomUUID());
    expect(r.totals.present).toBe(1);
    const b = await fixture(true, PaymentType.PAYOS);
    await db.query('UPDATE orders SET paid_at=$2 WHERE id=$1', [b.order.id, END]);
    await db.query('UPDATE payment_transactions SET paid_at=$2 WHERE order_id=$1', [
      b.order.id,
      END,
    ]);
    await expect(
      attendance.recover(
        b.sessionId,
        {
          ...recovery(b),
          records: [
            {
              enrollmentId: b.enrollmentId,
              status: Status.ABSENT,
              admissionBasis: Basis.CASH_LATE_ADMISSION,
            },
          ],
        },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const c = await fixture();
    await db.query("UPDATE payment_transactions SET status='PENDING' WHERE order_id=$1", [
      c.order.id,
    ]);
    await expect(
      attendance.recover(c.sessionId, recovery(c), staff, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
    const d = await fixture(),
      stranger = await f.user();
    await db.query('UPDATE enrollments SET student_id=$2 WHERE id=$1', [
      d.enrollmentId,
      stranger.id,
    ]);
    await expect(
      attendance.recover(d.sessionId, recovery(d), staff, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('accepts late committed CASH with pre-start hold, explicit basis; omissions stay no-data', async () => {
    const a = await fixture(false);
    await db.query('UPDATE orders SET expires_at=$2 WHERE id=$1', [
      a.order.id,
      new Date(NOW.getTime() + 3600000),
    ]);
    await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
    await expect(
      attendance.recover(a.sessionId, recovery(a), staff, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
    const body = {
      ...recovery(a),
      records: [
        {
          enrollmentId: a.enrollmentId,
          status: Status.ABSENT,
          admissionBasis: Basis.CASH_LATE_ADMISSION,
        },
      ],
    };
    const r = await attendance.recover(a.sessionId, body, staff, randomUUID());
    expect(r.totals).toEqual({ present: 0, absent: 1, unmarked: 0, eligible: 1 });
    expect((await attendance.roster(a.sessionId, staff, PAGE)).items[0]?.checkedInAt).toBeNull();
  });

  it('recovery replay has no duplicate evidence and changed payload/basis conflicts; auth checked before replay', async () => {
    const a = await fixture(),
      body = recovery(a),
      key = randomUUID();
    const r = await attendance.recover(a.sessionId, body, staff, key);
    expect(await attendance.recover(a.sessionId, body, staff, key)).toEqual(
      JSON.parse(JSON.stringify(r)),
    );
    await expect(
      attendance.recover(a.sessionId, { ...body, evidenceNote: 'Changed' }, staff, key),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(
      attendance.recover(
        a.sessionId,
        {
          ...body,
          records: [
            {
              ...body.records[0],
              enrollmentId: a.enrollmentId,
              status: Status.PRESENT,
              admissionBasis: Basis.CASH_LATE_ADMISSION,
            },
          ],
        },
        staff,
        key,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.query('SELECT 1 FROM attendance_recovery_audits WHERE session_id=$1', [a.sessionId]),
    ).toHaveLength(1);
    const temp = actor((await f.user(UserRole.ADMIN)).id, UserRole.ADMIN),
      b = await fixture(),
      k = randomUUID();
    await attendance.recover(b.sessionId, recovery(b), temp, k);
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [temp.userId]);
    await expect(attendance.recover(b.sessionId, recovery(b), temp, k)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('recovery/recovery and recovery/assignment races produce one coherent version, no lost audit', async () => {
    const a = await fixture();
    const result = await Promise.allSettled([
      attendance.recover(a.sessionId, recovery(a), staff, randomUUID()),
      attendance.recover(a.sessionId, recovery(a), staff, randomUUID()),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await session(a.sessionId)).version).toBe(a.initialVersion + 1);
    expect((await audits.list(a.sessionId, staff, PAGE)).total).toBe(1);
    const b = await fixture(),
      cover = await f.user(UserRole.MENTOR),
      assignments = new TeachingAssignmentService(
        db,
        f.users,
        teaching,
        new MentorConflictService(),
      );
    const raced = await Promise.allSettled([
      attendance.recover(b.sessionId, recovery(b), staff, randomUUID()),
      assignments.assignSession(
        b.sessionId,
        { expectedVersion: b.initialVersion, mentorId: cover.id, reason: 'Substitute' },
        staff,
        randomUUID(),
      ),
    ]);
    expect(raced.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await session(b.sessionId)).version).toBe(b.initialVersion + 1);
  });

  it.each([
    'attendance_recovery_audits',
    'attendance_recovery_audit_items',
    'attendance_records',
    'attendance_audits',
    'session_lifecycle_audits',
    'attendance_mutation_receipts',
  ])(
    'rolls back all recovery writes if %s persistence fails, then retries without extending deadline',
    async (table) => {
      const a = await fixture(),
        key = randomUUID(),
        body = recovery(a);
      await db.query(`CREATE FUNCTION test43_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected persistence failure'; END $$;
      CREATE TRIGGER test43_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION test43_failure();`);
      try {
        await expect(attendance.recover(a.sessionId, body, staff, key)).rejects.toThrow(
          'Injected persistence failure',
        );
        expect(await session(a.sessionId)).toMatchObject({
          version: a.initialVersion,
          status: 'SCHEDULED',
          actualStartedAt: null,
          actualEndedAt: null,
        });
        expect((await attendance.roster(a.sessionId, staff, PAGE)).total).toBe(0);
        expect(
          await db.query('SELECT 1 FROM attendance_recovery_audits WHERE session_id=$1', [
            a.sessionId,
          ]),
        ).toHaveLength(0);
        expect(
          await db.query('SELECT 1 FROM attendance_mutation_receipts WHERE key=$1', [key]),
        ).toHaveLength(0);
      } finally {
        await db.query(`DROP TRIGGER test43_failure ON ${table}; DROP FUNCTION test43_failure();`);
      }
      const r = await attendance.recover(a.sessionId, body, staff, key);
      expect(r.session.editableUntil).toEqual(attendanceDeadline(START, teaching.timeZone()));
    },
  );

  it.each(['attendance_audits', 'attendance_mutation_receipts'])(
    'rolls back correction on %s failure',
    async (table) => {
      const a = await fixture(),
        c = await closed(a),
        key = randomUUID();
      await db.query(`CREATE FUNCTION test43_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected correction failure'; END $$;
      CREATE TRIGGER test43_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION test43_failure();`);
      try {
        await expect(mark(a, c.session.version, Status.PRESENT, staff, key)).rejects.toThrow(
          'Injected correction failure',
        );
        expect((await session(a.sessionId)).version).toBe(c.session.version);
        expect((await attendance.roster(a.sessionId, staff, PAGE)).totals.absent).toBe(1);
        expect(
          await db.query('SELECT 1 FROM attendance_mutation_receipts WHERE key=$1', [key]),
        ).toHaveLength(0);
      } finally {
        await db.query(`DROP TRIGGER test43_failure ON ${table}; DROP FUNCTION test43_failure();`);
      }
    },
  );
});
