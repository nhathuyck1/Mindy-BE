import { GuestAttendanceService } from '../../src/modules/attendance/services/guest-attendance.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { AttendanceStatus } from '../../src/modules/attendance/enums/attendance-status.enum.js';
import { AttendanceService } from '../../src/modules/attendance/services/attendance.service.js';
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
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const PAGE = { page: 1, pageSize: 100 };
describe.skipIf(!separateTestUrl('attendance'))('Phase 4.2 attendance (PostgreSQL)', () => {
  let db: DataSource;
  let f: ReturnType<typeof paymentFixture>;
  let attendance: AttendanceService;
  let teaching: TeachingReadService;
  let staff: AuthenticatedUser;
  const actor = (id: string, role = UserRole.MENTOR): AuthenticatedUser => ({
    userId: id,
    role,
    sessionId: randomUUID(),
  });
  beforeAll(async () => {
    db = await paymentDatabase('attendance', {
      entities: [AttendanceRecordEntity],
      migrations: [SessionAttendance1791849600001],
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
    staff = actor((await f.user(UserRole.MANAGER)).id, UserRole.MANAGER);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function fixture(paid = true) {
    const order = await f.order({ paymentType: PaymentType.CASH, maxStudents: 10 });
    const classId = order.classIds[0];
    if (!classId) throw new Error('Missing class');
    const session = (await f.read.getDetail(classId)).units[0]?.sessions[0];
    if (!session) throw new Error('Missing session');
    // Test only: schedule today, without changing the production day/range policy.
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      session.id,
      new Date(Date.now() - 3600000),
      new Date(Date.now() + 3600000),
    ]);
    if (paid)
      await f.cash.confirm(
        (await f.user(UserRole.MANAGER)).id,
        order.order.id,
        order.order.totalAmount,
      );
    const enrollments: { id: string }[] = await db.query(
      'SELECT id FROM enrollments WHERE class_id=$1',
      [classId],
    );
    const enrollmentId = enrollments[0]?.id;
    if (!enrollmentId) throw new Error('Missing enrollment');
    return {
      ...order,
      classId,
      sessionId: session.id,
      enrollmentId,
      mentorActor: actor(order.mentor.id),
    };
  }
  async function version(id: string) {
    return (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id })).version;
  }
  async function start(a: Awaited<ReturnType<typeof fixture>>) {
    return attendance.start(
      a.sessionId,
      { expectedVersion: await version(a.sessionId) },
      a.mentorActor,
      randomUUID(),
    );
  }

  it('starts atomically, closes registration, snapshots ACTIVE only and replays without resetting clocks or roster', async () => {
    const a = await fixture();
    const before = await attendance.roster(a.sessionId, a.mentorActor, PAGE);
    expect(before).toMatchObject({
      items: [],
      totals: { eligible: 0 },
      session: { permissions: { canStart: true } },
    });
    const input = { expectedVersion: before.session.version },
      key = randomUUID();
    const result = await attendance.start(a.sessionId, input, a.mentorActor, key);
    expect(result).toMatchObject({
      session: { status: 'IN_PROGRESS', effectiveMentor: { id: a.mentor.id } },
      totals: { unmarked: 1, absent: 0 },
    });
    const roster = await attendance.roster(a.sessionId, a.mentorActor, PAGE);
    expect(roster.items[0]?.enrollmentId).toBe(a.enrollmentId);
    expect((await f.read.getDetail(a.classId)).classEntity.status).toBe('IN_PROGRESS');
    expect(result.session.editableUntil).toEqual(
      attendanceDeadline(result.session.startsAt, teaching.timeZone()),
    );
    expect(await attendance.start(a.sessionId, input, a.mentorActor, key)).toEqual(
      JSON.parse(JSON.stringify(result)),
    );
    expect(
      await db.query('SELECT 1 FROM attendance_audits WHERE attendance_id=$1', [
        roster.items[0]?.attendanceId,
      ]),
    ).toHaveLength(1);
    await expect(
      attendance.start(
        a.sessionId,
        { expectedVersion: result.session.version },
        a.mentorActor,
        key,
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(f.classes.complete(a.classId)).rejects.toMatchObject({
      response: { code: 'SESSION_STATE_CONFLICT' },
    });
  });

  it('bulk checks and unchecks the snapshot, replays receipts and rejects stale or unauthorized writes', async () => {
    const a = await fixture();
    const opened = await start(a);
    const key = randomUUID();
    const input = { expectedVersion: opened.session.version, checked: true };
    const marked = await attendance.bulkMark(a.sessionId, input, a.mentorActor, key);
    expect(marked.totals.present).toBe(marked.totals.eligible);
    expect(marked.changedEnrollmentIds).toEqual([a.enrollmentId]);
    expect(marked.session.version).toBe(opened.session.version + 1);
    expect(await attendance.bulkMark(a.sessionId, input, a.mentorActor, key)).toEqual(
      JSON.parse(JSON.stringify(marked)),
    );
    await expect(
      attendance.bulkMark(a.sessionId, { ...input, checked: false }, a.mentorActor, key),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(
      attendance.bulkMark(a.sessionId, input, a.mentorActor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'SESSION_VERSION_CONFLICT' } });
    const unchanged = await attendance.bulkMark(
      a.sessionId,
      { expectedVersion: marked.session.version, checked: true },
      a.mentorActor,
      randomUUID(),
    );
    expect(unchanged.session.version).toBe(marked.session.version);
    expect(unchanged.changedEnrollmentIds).toEqual([]);
    const cleared = await attendance.bulkMark(
      a.sessionId,
      { expectedVersion: marked.session.version, checked: false },
      a.mentorActor,
      randomUUID(),
    );
    expect(cleared.totals.absent).toBe(cleared.totals.eligible);
    expect(cleared.totals.present).toBe(0);
    const rows = await db.query(
      'SELECT checked_in_at FROM attendance_records WHERE session_id=$1',
      [a.sessionId],
    );
    expect(rows.every((row: { checked_in_at: Date | null }) => row.checked_in_at === null)).toBe(
      true,
    );
    const audits = await db.query(
      `SELECT new_status FROM attendance_audits WHERE attendance_id IN
      (SELECT id FROM attendance_records WHERE session_id=$1) AND action='MARK' ORDER BY version`,
      [a.sessionId],
    );
    expect(audits.map((r: { new_status: string }) => r.new_status)).toEqual(['PRESENT', 'ABSENT']);
    await expect(
      attendance.bulkMark(
        a.sessionId,
        { expectedVersion: cleared.session.version, checked: true },
        actor((await f.user(UserRole.MENTOR)).id),
        randomUUID(),
      ),
    ).rejects.toBeDefined();
  });

  it('leaves cash pending out of the snapshot and admits only after committed activation; no-op keeps version', async () => {
    const a = await fixture(false);
    expect((await attendance.roster(a.sessionId, a.mentorActor, PAGE)).pendingPaymentCount).toBe(1);
    const opened = await start(a);
    expect(opened.totals.eligible).toBe(0);
    await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
    const admitted = await attendance.syncRoster(
      a.sessionId,
      { expectedVersion: opened.session.version },
      a.mentorActor,
      randomUUID(),
    );
    expect(admitted.changedEnrollmentIds).toEqual([a.enrollmentId]);
    expect(admitted.totals.unmarked).toBe(1);
    expect(
      (
        await attendance.syncRoster(
          a.sessionId,
          { expectedVersion: admitted.session.version },
          a.mentorActor,
          randomUUID(),
        )
      ).session.version,
    ).toBe(admitted.session.version);
  });

  it('never admits an enrollment created after start or a PayOS activation after start', async () => {
    const a = await fixture(false);
    const opened = await start(a);
    await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
    await db.query('UPDATE enrollments SET created_at=$2 WHERE id=$1', [
      a.enrollmentId,
      new Date(Date.now() + 1000),
    ]);
    expect(
      (
        await attendance.syncRoster(
          a.sessionId,
          { expectedVersion: opened.session.version },
          a.mentorActor,
          randomUUID(),
        )
      ).totals.eligible,
    ).toBe(0);
    await db.query('UPDATE enrollments SET created_at=$2 WHERE id=$1', [
      a.enrollmentId,
      new Date(Date.now() - 60000),
    ]);
    await db.query("UPDATE orders SET payment_type='PAYOS',cash_mentor_id=NULL WHERE id=$1", [
      a.order.id,
    ]);
    expect(
      (
        await attendance.syncRoster(
          a.sessionId,
          { expectedVersion: opened.session.version },
          a.mentorActor,
          randomUUID(),
        )
      ).totals.eligible,
    ).toBe(0);
  });

  it('marks and unmarks, rejects foreign roster rows atomically, and finalizes only unmarked rows once', async () => {
    const a = await fixture(),
      foreign = await fixture();
    let result = await start(a);
    const present = { enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT };
    result = await attendance.mark(
      a.sessionId,
      { expectedVersion: result.session.version, records: [present] },
      a.mentorActor,
      randomUUID(),
    );
    expect(result.totals.present).toBe(1);
    expect(
      (await attendance.roster(a.sessionId, a.mentorActor, PAGE)).items[0]?.checkedInAt,
    ).not.toBeNull();
    await expect(
      attendance.mark(
        a.sessionId,
        {
          expectedVersion: result.session.version,
          records: [
            { ...present, status: AttendanceStatus.UNMARKED },
            { ...present, enrollmentId: foreign.enrollmentId },
          ],
        },
        a.mentorActor,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_ENROLLMENT_NOT_ELIGIBLE' } });
    expect((await attendance.roster(a.sessionId, a.mentorActor, PAGE)).totals.present).toBe(1);
    result = await attendance.mark(
      a.sessionId,
      {
        expectedVersion: result.session.version,
        records: [{ ...present, status: AttendanceStatus.UNMARKED }],
      },
      a.mentorActor,
      randomUUID(),
    );
    const key = randomUUID(),
      input = { expectedVersion: result.session.version };
    const finalized = await attendance.finalize(a.sessionId, input, a.mentorActor, key);
    expect(finalized).toMatchObject({
      session: { status: 'COMPLETED' },
      totals: { present: 0, absent: 1, unmarked: 0 },
    });
    expect(await attendance.finalize(a.sessionId, input, a.mentorActor, key)).toEqual(
      JSON.parse(JSON.stringify(finalized)),
    );
    expect(
      await db.query(
        "SELECT 1 FROM attendance_audits a JOIN attendance_records r ON r.id=a.attendance_id WHERE r.session_id=$1 AND action='FINALIZE'",
        [a.sessionId],
      ),
    ).toHaveLength(1);
    expect((await f.classes.complete(a.classId)).classEntity.status).toBe('COMPLETED');
  });

  it('preserves present results on finalization and does not infer absent from elapsed schedule time', async () => {
    const a = await fixture();
    let result = await start(a);
    await db.query('UPDATE class_sessions SET ends_at=$2 WHERE id=$1', [
      a.sessionId,
      new Date(Date.now() - 1000),
    ]);
    expect((await attendance.roster(a.sessionId, a.mentorActor, PAGE)).totals).toMatchObject({
      unmarked: 1,
      absent: 0,
    });
    result = await attendance.mark(
      a.sessionId,
      {
        expectedVersion: result.session.version,
        records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
      },
      a.mentorActor,
      randomUUID(),
    );
    expect(
      (
        await attendance.finalize(
          a.sessionId,
          { expectedVersion: result.session.version },
          a.mentorActor,
          randomUUID(),
        )
      ).totals,
    ).toMatchObject({ present: 1, absent: 0 });
  });

  it('serializes concurrent mark/finalize: one commit and one stale version conflict', async () => {
    const a = await fixture(),
      opened = await start(a);
    const outcomes = await Promise.allSettled([
      attendance.mark(
        a.sessionId,
        {
          expectedVersion: opened.session.version,
          records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
        },
        a.mentorActor,
        randomUUID(),
      ),
      attendance.finalize(
        a.sessionId,
        { expectedVersion: opened.session.version },
        a.mentorActor,
        randomUUID(),
      ),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find((o) => o.status === 'rejected');
    expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({
      response: { code: 'SESSION_VERSION_CONFLICT' },
    });
  });

  it('requires current role/status/assignment even on replay, and substitution preserves deadline and cash ownership', async () => {
    const a = await fixture(false),
      key = randomUUID(),
      input = { expectedVersion: await version(a.sessionId) };
    const opened = await attendance.start(a.sessionId, input, a.mentorActor, key);
    const cover = await f.user(UserRole.MENTOR);
    const assignments = new TeachingAssignmentService(
      db,
      f.users,
      teaching,
      new MentorConflictService(),
    );
    const assigned = await assignments.assignSession(
      a.sessionId,
      { mentorId: cover.id, expectedVersion: opened.session.version, reason: 'Cover' },
      staff,
      randomUUID(),
    );
    expect(assigned.editableUntil).toEqual(opened.session.editableUntil);
    await expect(attendance.start(a.sessionId, input, a.mentorActor, key)).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.cash.confirm(cover.id, a.order.id, a.order.totalAmount)).rejects.toMatchObject({
      status: 403,
    });
    const coverActor = actor(cover.id);
    expect(
      (await attendance.roster(a.sessionId, coverActor, PAGE)).session.effectiveMentor?.id,
    ).toBe(cover.id);
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [cover.id]);
    await expect(attendance.roster(a.sessionId, coverActor, PAGE)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      attendance.roster(a.sessionId, actor(a.student.id, UserRole.STUDENT), PAGE),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects mentor clock injection and outside-day starts; manager recovery keeps the scheduled calendar deadline', async () => {
    const a = await fixture();
    const v = await version(a.sessionId),
      past = new Date(Date.now() - 3 * 86400000);
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      a.sessionId,
      past,
      new Date(past.getTime() + 3600000),
    ]);
    await expect(
      attendance.start(a.sessionId, { expectedVersion: v }, a.mentorActor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_START_DAY_CLOSED' } });
    await expect(
      attendance.start(
        a.sessionId,
        { expectedVersion: v, actualStartedAt: past.toISOString() },
        a.mentorActor,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      attendance.start(
        a.sessionId,
        {
          expectedVersion: v,
          actualStartedAt: new Date(Date.now() + 60000).toISOString(),
          reason: 'Recovery',
        },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      attendance.start(
        a.sessionId,
        { expectedVersion: v, actualStartedAt: past.toISOString() },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const opened = await attendance.start(
      a.sessionId,
      { expectedVersion: v, actualStartedAt: past.toISOString(), reason: 'Recovery' },
      staff,
      randomUUID(),
    );
    expect(opened.totals.eligible).toBe(0); // Today's paid enrollment is not historical evidence.
    expect(opened.session.editableUntil).toEqual(attendanceDeadline(past, teaching.timeZone()));
    await expect(
      attendance.finalize(
        a.sessionId,
        { expectedVersion: opened.session.version },
        a.mentorActor,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' } });
    const finalized = await attendance.finalize(
      a.sessionId,
      {
        expectedVersion: opened.session.version,
        reason: 'Verified end',
        actualEndedAt: new Date(past.getTime() + 3600000).toISOString(),
      },
      staff,
      randomUUID(),
    );
    expect(finalized.session.status).toBe('COMPLETED');
  });

  it('allows staff admission after finalization with a reason and keeps snapshot history after leaving class', async () => {
    const a = await fixture(false),
      opened = await start(a);
    const finalized = await attendance.finalize(
      a.sessionId,
      { expectedVersion: opened.session.version },
      a.mentorActor,
      randomUUID(),
    );
    await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
    await expect(
      attendance.syncRoster(
        a.sessionId,
        { expectedVersion: finalized.session.version },
        a.mentorActor,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'SESSION_STATE_CONFLICT' } });
    const admitted = await attendance.syncRoster(
      a.sessionId,
      { expectedVersion: finalized.session.version, reason: 'Cash verified after close' },
      staff,
      randomUUID(),
    );
    expect(admitted.totals.absent).toBe(1);
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [a.enrollmentId]);
    expect((await attendance.roster(a.sessionId, staff, { page: 1, pageSize: 1 })).total).toBe(1);
  });

  it('rolls back marks, version and receipt when audit persistence fails', async () => {
    const a = await fixture(),
      opened = await start(a);
    await db.query(`CREATE FUNCTION reject_attendance_mark() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='MARK' THEN RAISE EXCEPTION 'Audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_audit_failure BEFORE INSERT ON attendance_audits FOR EACH ROW EXECUTE FUNCTION reject_attendance_mark();`);
    const key = randomUUID();
    try {
      await expect(
        attendance.mark(
          a.sessionId,
          {
            expectedVersion: opened.session.version,
            records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
          },
          a.mentorActor,
          key,
        ),
      ).rejects.toThrow('Audit failure');
      expect(await version(a.sessionId)).toBe(opened.session.version);
      expect((await attendance.roster(a.sessionId, a.mentorActor, PAGE)).totals.unmarked).toBe(1);
      expect(
        await db.query('SELECT 1 FROM attendance_mutation_receipts WHERE key=$1', [key]),
      ).toHaveLength(0);
    } finally {
      await db.query(
        'DROP TRIGGER test_audit_failure ON attendance_audits; DROP FUNCTION reject_attendance_mark()',
      );
    }
  });

  it('enforces same-class ancestry in the database and refuses destructive migration rollback', async () => {
    const a = await fixture(),
      b = await fixture();
    await start(a);
    await expect(
      db.query(
        `INSERT INTO attendance_records(class_id,enrollment_id,session_id,recorded_by,admitted_at,admission_source) VALUES($1,$2,$3,$4,now(),'START')`,
        [a.classId, b.enrollmentId, a.sessionId, a.mentor.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      db.query('UPDATE class_sessions SET class_id=$2 WHERE id=$1', [a.sessionId, b.classId]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      rehearseMigration(db, new SessionAttendance1791849600001(), 'down'),
    ).rejects.toThrow('retain schema');
  });

  it('uses whole-roster totals across pages and keeps version, checked-in time and audits for a no-op mark', async () => {
    const a = await fixture();
    for (let n = 0; n < 3; n++) {
      const student = await f.user();
      await f.cart.addItem(student.id, a.classId);
      const order = (await f.checkout.checkout(student.id, PaymentType.CASH))[0];
      if (!order) throw new Error('Missing order');
      await f.cash.confirm(
        (await f.user(UserRole.MANAGER)).id,
        order.order.id,
        order.order.totalAmount,
      );
    }
    const opened = await start(a);
    const page1 = await attendance.roster(a.sessionId, a.mentorActor, { page: 1, pageSize: 2 });
    const page2 = await attendance.roster(a.sessionId, a.mentorActor, { page: 2, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.total).toBe(4);
    expect(page2.totals).toEqual(page1.totals);
    expect(page1.totals).toMatchObject({ eligible: 4, unmarked: 4 });
    const ids = [...page1.items, ...page2.items].map((r) => r.enrollmentId);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(4);
    const input = {
      expectedVersion: opened.session.version,
      records: [
        { enrollmentId: ids[0] ?? '', status: AttendanceStatus.PRESENT },
        { enrollmentId: ids[1] ?? '', status: AttendanceStatus.ABSENT },
      ],
    };
    const marked = await attendance.mark(a.sessionId, input, a.mentorActor, randomUUID());
    const before = await attendance.roster(a.sessionId, a.mentorActor, PAGE);
    const key = randomUUID();
    const noop = await attendance.mark(
      a.sessionId,
      { ...input, expectedVersion: marked.session.version },
      a.mentorActor,
      key,
    );
    expect(noop.session.version).toBe(marked.session.version);
    expect(noop.changedEnrollmentIds).toEqual([]);
    expect((await attendance.roster(a.sessionId, a.mentorActor, PAGE)).items).toEqual(before.items);
    expect(
      await db.query(
        "SELECT 1 FROM attendance_audits a JOIN attendance_records r ON r.id=a.attendance_id WHERE r.session_id=$1 AND action='MARK'",
        [a.sessionId],
      ),
    ).toHaveLength(2);
    expect(
      await db.query('SELECT 1 FROM attendance_mutation_receipts WHERE key=$1', [key]),
    ).toHaveLength(1);
    const finalized = await attendance.finalize(
      a.sessionId,
      { expectedVersion: noop.session.version },
      a.mentorActor,
      randomUUID(),
    );
    expect(finalized.totals).toEqual({ present: 1, absent: 3, unmarked: 0, eligible: 4 });
  });

  it('finalizes an empty snapshot without fabricating absent rows', async () => {
    const a = await fixture(false),
      opened = await start(a);
    const finalized = await attendance.finalize(
      a.sessionId,
      { expectedVersion: opened.session.version },
      a.mentorActor,
      randomUUID(),
    );
    expect(finalized.totals).toEqual({ present: 0, absent: 0, unmarked: 0, eligible: 0 });
    expect(finalized.changedEnrollmentIds).toEqual([]);
    expect(
      await db.query('SELECT 1 FROM attendance_records WHERE session_id=$1', [a.sessionId]),
    ).toHaveLength(0);
    expect(
      await db.query('SELECT 1 FROM session_lifecycle_audits WHERE session_id=$1', [a.sessionId]),
    ).toHaveLength(2);
  });

  it.each([UserRole.ADMIN, UserRole.MANAGER])(
    'requires reason and state but not a deadline for %s',
    async (role) => {
      const a = await fixture(),
        opened = await start(a);
      const localStaff = actor((await f.user(role)).id, role);
      await db.query('UPDATE class_sessions SET editable_until=$2 WHERE id=$1', [
        a.sessionId,
        new Date(Date.now() - 1000),
      ]);
      const input = {
        expectedVersion: opened.session.version,
        records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
      };
      expect(
        (await attendance.roster(a.sessionId, a.mentorActor, PAGE)).session.permissions
          .canEditAttendance,
      ).toBe(false);
      expect(
        (await attendance.roster(a.sessionId, localStaff, PAGE)).session.permissions
          .canEditAttendance,
      ).toBe(true);
      await expect(
        attendance.mark(a.sessionId, input, a.mentorActor, randomUUID()),
      ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' } });
      await expect(
        attendance.mark(a.sessionId, input, localStaff, randomUUID()),
      ).rejects.toMatchObject({ status: 422 });
      const marked = await attendance.mark(
        a.sessionId,
        { ...input, reason: 'Verified presence' },
        localStaff,
        randomUUID(),
      );
      const closed = await attendance.finalize(
        a.sessionId,
        { expectedVersion: marked.session.version, reason: 'Verified completion' },
        localStaff,
        randomUUID(),
      );
      await expect(
        attendance.mark(
          a.sessionId,
          {
            ...input,
            expectedVersion: closed.session.version,
            reason: 'Closed no-op supported by phase 4.3',
          },
          localStaff,
          randomUUID(),
        ),
      ).resolves.toMatchObject({
        session: { version: closed.session.version },
        changedEnrollmentIds: [],
      });
      await db.query("UPDATE class_sessions SET status='CANCELLED' WHERE id=$1", [a.sessionId]);
      await expect(
        attendance.syncRoster(
          a.sessionId,
          { expectedVersion: closed.session.version, reason: 'Cancelled' },
          localStaff,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ response: { code: 'SESSION_STATE_CONFLICT' } });
    },
  );

  it('checks staff status and role before replaying an attendance outcome', async () => {
    const a = await fixture(),
      manager = await f.user(UserRole.MANAGER),
      localStaff = actor(manager.id, UserRole.MANAGER);
    const key = randomUUID(),
      input = { expectedVersion: await version(a.sessionId), reason: 'Open verified roster' };
    await attendance.start(a.sessionId, input, localStaff, key);
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [manager.id]);
    await expect(attendance.start(a.sessionId, input, localStaff, key)).rejects.toMatchObject({
      status: 403,
    });
    await db.query("UPDATE users SET status='ACTIVE',role='STUDENT' WHERE id=$1", [manager.id]);
    await expect(attendance.start(a.sessionId, input, localStaff, key)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      await db.query('SELECT 1 FROM session_lifecycle_audits WHERE session_id=$1', [a.sessionId]),
    ).toHaveLength(1);
  });

  it.each(['start', 'mark'] as const)(
    'serializes %s against reassignment and revokes the old mentor',
    async (operation) => {
      const a = await fixture(),
        cover = await f.user(UserRole.MENTOR);
      if (operation === 'mark') await start(a);
      const before = await db
        .getRepository(ClassSessionEntity)
        .findOneByOrFail({ id: a.sessionId });
      const assignments = new TeachingAssignmentService(
        db,
        f.users,
        teaching,
        new MentorConflictService(),
      );
      const command =
        operation === 'start'
          ? attendance.start(
              a.sessionId,
              { expectedVersion: before.version },
              a.mentorActor,
              randomUUID(),
            )
          : attendance.mark(
              a.sessionId,
              {
                expectedVersion: before.version,
                records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
              },
              a.mentorActor,
              randomUUID(),
            );
      const results = await Promise.allSettled([
        command,
        assignments.assignSession(
          a.sessionId,
          { mentorId: cover.id, reason: 'Cover', expectedVersion: before.version },
          staff,
          randomUUID(),
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((r) => r.status === 'rejected');
      expect(failure?.status === 'rejected' ? failure.reason.status : null).toBeOneOf([403, 409]);
      const after = await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: a.sessionId });
      expect(after.version).toBe(before.version + 1);
      if (results[1]?.status === 'fulfilled') {
        await expect(attendance.roster(a.sessionId, a.mentorActor, PAGE)).rejects.toMatchObject({
          status: 403,
        });
        expect(
          (await attendance.roster(a.sessionId, actor(cover.id), PAGE)).session.effectiveMentor?.id,
        ).toBe(cover.id);
        expect(after.actualStartedAt).toEqual(before.actualStartedAt);
        expect(after.editableUntil).toEqual(before.editableUntil);
      }
    },
  );

  it('serializes cash settlement with start and admits the paid hold exactly once', async () => {
    const a = await fixture(false);
    const [opened] = await Promise.all([
      start(a),
      f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount),
    ]);
    const activation: { enrolled_at: Date }[] = await db.query(
      'SELECT enrolled_at FROM enrollments WHERE id=$1',
      [a.enrollmentId],
    );
    expect(opened.totals.eligible).toBe(
      (activation[0]?.enrolled_at.getTime() ?? Infinity) <=
        new Date(opened.session.actualStartedAt ?? '').getTime()
        ? 1
        : 0,
    );
    const synced = await attendance.syncRoster(
      a.sessionId,
      { expectedVersion: opened.session.version },
      a.mentorActor,
      randomUUID(),
    );
    expect(synced.totals.eligible).toBe(1);
    expect(
      await db.query('SELECT 1 FROM attendance_records WHERE session_id=$1', [a.sessionId]),
    ).toHaveLength(1);
    expect(
      await db.query(
        "SELECT 1 FROM attendance_audits a JOIN attendance_records r ON r.id=a.attendance_id WHERE r.session_id=$1 AND action='ADMIT'",
        [a.sessionId],
      ),
    ).toHaveLength(1);
  });

  it('serializes checkout with start without admitting pending or post-start enrollments', async () => {
    const a = await fixture(),
      student = await f.user();
    await f.cart.addItem(student.id, a.classId);
    const results = await Promise.allSettled([
      start(a),
      f.checkout.checkout(student.id, PaymentType.CASH),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    const roster = await attendance.roster(a.sessionId, a.mentorActor, PAGE);
    expect(roster.items.map((r) => r.enrollmentId)).toEqual([a.enrollmentId]);
    const checkout = results[1];
    if (checkout?.status === 'rejected') {
      expect(checkout.reason.status).toBe(409);
      expect(
        await db.query('SELECT 1 FROM enrollments WHERE student_id=$1 AND class_id=$2', [
          student.id,
          a.classId,
        ]),
      ).toHaveLength(0);
    } else if (checkout?.status === 'fulfilled') {
      const order = checkout.value[0];
      if (!order) throw new Error('Missing competing order');
      await f.cash.confirm(
        (await f.user(UserRole.MANAGER)).id,
        order.order.id,
        order.order.totalAmount,
      );
      const synced = await attendance.syncRoster(
        a.sessionId,
        { expectedVersion: roster.session.version },
        a.mentorActor,
        randomUUID(),
      );
      expect(synced.totals.eligible).toBe(2);
    }
  });

  it('serializes class completion with finalization and never completes unfinished sessions', async () => {
    const a = await fixture(),
      opened = await start(a);
    const results = await Promise.allSettled([
      attendance.finalize(
        a.sessionId,
        { expectedVersion: opened.session.version },
        a.mentorActor,
        randomUUID(),
      ),
      f.classes.complete(a.classId),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    const completion = results[1];
    if (completion?.status === 'rejected') {
      expect(completion.reason).toMatchObject({ response: { code: 'SESSION_STATE_CONFLICT' } });
      await f.classes.complete(a.classId);
    }
    expect((await f.read.getDetail(a.classId)).classEntity.status).toBe('COMPLETED');
    expect((await attendance.roster(a.sessionId, staff, PAGE)).totals).toMatchObject({
      absent: 1,
      unmarked: 0,
    });
  });

  it.each(['start', 'mark'] as const)(
    'serializes class cancellation with %s without losing attendance history',
    async (operation) => {
      const a = await fixture();
      if (operation === 'mark') await start(a);
      const v = await version(a.sessionId);
      const command =
        operation === 'start'
          ? attendance.start(a.sessionId, { expectedVersion: v }, a.mentorActor, randomUUID())
          : attendance.mark(
              a.sessionId,
              {
                expectedVersion: v,
                records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
              },
              a.mentorActor,
              randomUUID(),
            );
      const results = await Promise.allSettled([command, f.classes.cancel(a.classId)]);
      expect(results[1]?.status).toBe('fulfilled');
      const roster = await attendance.roster(a.sessionId, staff, PAGE);
      expect(roster.session.status).toBe('CANCELLED');
      // Never-started cancellation has no historical teacher; authorization precedes state.
      const expectedCode = roster.session.effectiveMentor
        ? 'SESSION_STATE_CONFLICT'
        : 'SESSION_ASSIGNMENT_REQUIRED';
      if (results[0]?.status === 'rejected')
        expect(results[0].reason).toMatchObject({
          status: roster.session.effectiveMentor ? 409 : 403,
        });
      expect(roster.total).toBe(operation === 'mark' || results[0]?.status === 'fulfilled' ? 1 : 0);
      expect(roster.totals.absent).toBe(0);
      await expect(
        attendance.mark(
          a.sessionId,
          {
            expectedVersion: roster.session.version,
            records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
          },
          a.mentorActor,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ response: { code: expectedCode } });
    },
  );

  it('does not start or recover a legacy overnight session', async () => {
    const a = await fixture(),
      day = toLocalDate(new Date(), teaching.timeZone());
    const nextDay = new Date(`${day}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      a.sessionId,
      new Date(`${day}T23:00:00+07:00`),
      new Date(`${nextDay.toISOString().slice(0, 10)}T01:00:00+07:00`),
    ]);
    const v = await version(a.sessionId);
    expect((await attendance.roster(a.sessionId, staff, PAGE)).session.permissions.canStart).toBe(
      false,
    );
    await expect(
      attendance.start(a.sessionId, { expectedVersion: v }, a.mentorActor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'CLASS_SESSION_OVERNIGHT_NOT_ALLOWED' } });
    await expect(
      attendance.start(
        a.sessionId,
        { expectedVersion: v, actualStartedAt: new Date().toISOString(), reason: 'Recovery' },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'CLASS_SESSION_OVERNIGHT_NOT_ALLOWED' } });
    expect(await version(a.sessionId)).toBe(v);
  });

  it('allows edits until the end of the following scheduled day and expires exactly at its midnight boundary', async () => {
    const a = await fixture();
    const day = toLocalDate(new Date(), teaching.timeZone());
    const startsAt = new Date(`${day}T08:00:00+07:00`);
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      a.sessionId,
      startsAt,
      new Date(`${day}T09:00:00+07:00`),
    ]);
    const v = await version(a.sessionId);
    const deadline = attendanceDeadline(startsAt, teaching.timeZone());
    if (!deadline) throw new Error('Missing calendar deadline');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${day}T23:00:00+07:00`));
    try {
      const opened = await attendance.start(
        a.sessionId,
        { expectedVersion: v },
        a.mentorActor,
        randomUUID(),
      );
      expect(opened.session.editableUntil).toEqual(deadline);
      vi.setSystemTime(new Date(deadline.getTime() - 1));
      const marked = await attendance.mark(
        a.sessionId,
        {
          expectedVersion: opened.session.version,
          records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.PRESENT }],
        },
        a.mentorActor,
        randomUUID(),
      );
      expect(marked.totals.present).toBe(1);
      vi.setSystemTime(deadline);
      expect(
        (await attendance.roster(a.sessionId, a.mentorActor, PAGE)).session.permissions
          .canEditAttendance,
      ).toBe(false);
      await expect(
        attendance.mark(
          a.sessionId,
          {
            expectedVersion: marked.session.version,
            records: [{ enrollmentId: a.enrollmentId, status: AttendanceStatus.ABSENT }],
          },
          a.mentorActor,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' } });
      const recovered = await attendance.finalize(
        a.sessionId,
        { expectedVersion: marked.session.version, reason: 'Staff completion after deadline' },
        staff,
        randomUUID(),
      );
      expect(recovered.session.editableUntil).toEqual(deadline);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rechecks the calendar day after waiting for a mentor advisory lock', async () => {
    const a = await fixture();
    const day = toLocalDate(new Date(), teaching.timeZone());
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      a.sessionId,
      new Date(`${day}T12:00:00+07:00`),
      new Date(`${day}T13:00:00+07:00`),
    ]);
    const initial = new Date(`${day}T23:59:59+07:00`);
    const conflicts = new MentorConflictService(),
      lock = conflicts.lockMentors.bind(conflicts);
    const service = new AttendanceService(
      db,
      teaching,
      new SessionLifecycleService(f.config),
      conflicts,
      f.enrollments,
      f.users,
      new AttendancePaymentEvidenceService(new OrderSettlementService()),
      new GuestAttendanceService(),
    );
    const v = await version(a.sessionId);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(initial);
    vi.spyOn(conflicts, 'lockMentors').mockImplementationOnce(async (m, ids) => {
      await lock(m, ids);
      vi.setSystemTime(new Date(initial.getTime() + 2000));
    });
    try {
      await expect(
        service.start(a.sessionId, { expectedVersion: v }, a.mentorActor, randomUUID()),
      ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_START_DAY_CLOSED' } });
      expect(await version(a.sessionId)).toBe(v);
      expect(
        await db.query('SELECT 1 FROM attendance_records WHERE session_id=$1', [a.sessionId]),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes duplicate start keys and cash admission racing with finalization', async () => {
    const a = await fixture(false),
      key = randomUUID(),
      input = { expectedVersion: await version(a.sessionId) };
    const results = await Promise.all([
      attendance.start(a.sessionId, input, a.mentorActor, key),
      attendance.start(a.sessionId, input, a.mentorActor, key),
    ]);
    expect(results[0]?.session.version).toBe(results[1]?.session.version);
    expect(
      await db.query('SELECT 1 FROM session_lifecycle_audits WHERE session_id=$1', [a.sessionId]),
    ).toHaveLength(1);
    await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
    const v = await version(a.sessionId);
    const outcomes = await Promise.allSettled([
      attendance.syncRoster(a.sessionId, { expectedVersion: v }, a.mentorActor, randomUUID()),
      attendance.finalize(a.sessionId, { expectedVersion: v }, a.mentorActor, randomUUID()),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find((o) => o.status === 'rejected');
    expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({
      response: { code: 'SESSION_VERSION_CONFLICT' },
    });
  });
});
