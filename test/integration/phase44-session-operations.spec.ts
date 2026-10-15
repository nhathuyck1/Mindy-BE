import { SessionScheduleOperations1792022400000 } from '../../src/database/migrations/1792022400000-session-schedule-operations.js';
import { GuestAttendanceService } from '../../src/modules/attendance/services/guest-attendance.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { CalendarAttendanceDeadline1791849600002 } from '../../src/database/migrations/1791849600002-calendar-attendance-deadline.js';
import { AttendanceRecoveryEvidence1791849600003 } from '../../src/database/migrations/1791849600003-attendance-recovery-evidence.js';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { AttendanceStatus } from '../../src/modules/attendance/enums/attendance-status.enum.js';
import { AttendanceService } from '../../src/modules/attendance/services/attendance.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { toLocalDate } from '../../src/modules/classes/domain/class-calendar.js';

import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassScheduleService } from '../../src/modules/classes/services/class-schedule.service.js';
import { MentorConflictService } from '../../src/modules/classes/services/mentor-conflict.service.js';
import { SessionLifecycleService } from '../../src/modules/classes/services/session-lifecycle.service.js';
import { SessionOperationsService } from '../../src/modules/classes/services/session-operations.service.js';
import { TeachingAssignmentService } from '../../src/modules/classes/services/teaching-assignment.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrderSettlementService } from '../../src/modules/commerce/services/order-settlement.service.js';
import { AttendancePaymentEvidenceService } from '../../src/modules/payments/services/attendance-payment-evidence.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const actor = (id: string, role = UserRole.MANAGER): AuthenticatedUser => ({
  userId: id,
  role,
  sessionId: randomUUID(),
});
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe.skipIf(!separateTestUrl('phase44a'))('Phase 4.4a session operations (PostgreSQL)', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    staff: AuthenticatedUser,
    read: TeachingReadService,
    operations: SessionOperationsService,
    attendance: AttendanceService;
  beforeAll(async () => {
    db = await paymentDatabase('phase44a', {
      entities: [AttendanceRecordEntity],
      migrations: [
        SessionAttendance1791849600001,
        CalendarAttendanceDeadline1791849600002,
        AttendanceRecoveryEvidence1791849600003,
      ],
    });
    f = paymentFixture(db);
    read = new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService());
    operations = new SessionOperationsService(
      db,
      read,
      f.users,
      new ClassScheduleService(f.config, new ScheduleReservationsService()),
    );
    attendance = new AttendanceService(
      db,
      read,
      new SessionLifecycleService(f.config),
      new MentorConflictService(),
      f.enrollments,
      f.users,
      new AttendancePaymentEvidenceService(new OrderSettlementService()),
      new GuestAttendanceService(),
    );
    staff = actor((await f.user(UserRole.MANAGER)).id);
  }, 30000);
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function fixture() {
    const a = await f.order({ paymentType: PaymentType.CASH, maxStudents: 10 });
    const classId = a.classIds[0];
    if (!classId) throw new Error('Missing class');
    const detail = await f.read.getDetail(classId);
    const session = detail.units[0]?.sessions[0];
    if (!session) throw new Error('Missing session');
    return { ...a, c: detail.classEntity, s: session };
  }
  const stored = (id: string) => db.getRepository(ClassSessionEntity).findOneByOrFail({ id });
  const auditCount = async (id: string) =>
    (await db.query('SELECT * FROM session_schedule_audits WHERE session_id=$1', [id])).length;
  async function cancel(s: ClassSessionEntity) {
    return operations.cancel(
      s.id,
      { expectedVersion: s.version, reason: 'Cannot hold the class' },
      staff,
      randomUUID(),
    );
  }
  function target(s: ClassSessionEntity, days = 1) {
    return {
      classUnitId: s.classUnitId,
      title: 'Makeup',
      reason: 'Rescheduled teaching',
      expectedVersion: s.version,
      startsAt: new Date(s.startsAt.getTime() + days * 86400000).toISOString(),
      endsAt: new Date(s.endsAt.getTime() + days * 86400000).toISOString(),
    };
  }

  it('reschedules with audit/version/receipt; retries return the original result and check current actor before replay', async () => {
    const a = await fixture(),
      key = randomUUID();
    const input = {
      expectedVersion: a.s.version,
      reason: 'Room change',
      startsAt: new Date(a.s.startsAt.getTime() + 3600000).toISOString(),
      endsAt: new Date(a.s.endsAt.getTime() + 3600000).toISOString(),
    };
    const first = await operations.reschedule(a.s.id, input, staff, key);
    expect(first).toMatchObject({ version: a.s.version + 1, makeupForSessionId: null });
    expect(json(await operations.reschedule(a.s.id, input, staff, key))).toEqual(json(first));
    expect((await stored(a.s.id)).startsAt.toISOString()).toBe(input.startsAt);
    expect(await auditCount(a.s.id)).toBe(1);
    expect((await read.loadClass(db.manager, a.c.id)).assignmentVersion).toBe(
      a.c.assignmentVersion + 1,
    );
    await expect(
      operations.reschedule(a.s.id, { ...input, reason: 'Other' }, staff, key),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(operations.reschedule(a.s.id, input, staff, randomUUID())).rejects.toMatchObject({
      response: { code: 'SESSION_VERSION_CONFLICT' },
    });
    for (const role of [UserRole.MENTOR, UserRole.STUDENT])
      await expect(
        operations.reschedule(a.s.id, input, { ...staff, role }, key),
      ).rejects.toMatchObject({ status: 403 });
    const manager = await f.user(UserRole.MANAGER),
      scoped = actor(manager.id),
      replayKey = randomUUID();
    const updated = await stored(a.s.id),
      next = { ...input, expectedVersion: updated.version };
    await operations.reschedule(a.s.id, next, scoped, replayKey);
    await db.query("UPDATE users SET role='STUDENT' WHERE id=$1", [manager.id]);
    await expect(operations.reschedule(a.s.id, next, scoped, replayKey)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects past, overnight, invalid range, outside class period, same-class overlap, and missing keys without writes', async () => {
    const a = await fixture(),
      input = { ...target(a.s, 0) };
    for (const invalid of [
      { startsAt: new Date(Date.now() - 3600000).toISOString() },
      { endsAt: input.startsAt },
      { endsAt: new Date(a.s.endsAt.getTime() + 86400000).toISOString() },
      { startsAt: target(a.s).startsAt, endsAt: target(a.s).endsAt },
    ])
      await expect(
        operations.reschedule(a.s.id, { ...input, ...invalid }, staff, randomUUID()),
      ).rejects.toMatchObject({ status: 422 });
    await expect(operations.cancel(a.s.id, input, staff, undefined)).rejects.toMatchObject({
      status: 422,
    });
    const day = toLocalDate(a.s.startsAt, read.timeZone());
    await f.classes.scheduleSession(a.c.id, {
      classUnitId: a.s.classUnitId,
      title: 'Other',
      startsAt: `${day}T11:00:00+07:00`,
      endsAt: `${day}T12:00:00+07:00`,
    });
    await expect(
      operations.reschedule(
        a.s.id,
        { ...input, startsAt: `${day}T11:30:00+07:00`, endsAt: `${day}T12:30:00+07:00` },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await stored(a.s.id)).version).toBe(a.s.version);
    expect(await auditCount(a.s.id)).toBe(0);
  });

  it('uses the effective substitute for conflicts and serializes competing timetable writers', async () => {
    const a = await fixture(),
      b = await fixture(),
      mentor = await f.user(UserRole.MENTOR);
    await db.query('UPDATE classes SET start_date=$2,end_date=$2 WHERE id=$1', [
      b.c.id,
      a.c.startDate,
    ]);
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      b.s.id,
      a.s.startsAt,
      a.s.endsAt,
    ]);
    await db.query('UPDATE class_sessions SET mentor_override_id=$2 WHERE id=ANY($1::uuid[])', [
      [a.s.id, b.s.id],
      mentor.id,
    ]);
    const input = {
      expectedVersion: a.s.version,
      reason: 'Move',
      startsAt: new Date(a.s.startsAt.getTime() + 7200000).toISOString(),
      endsAt: new Date(a.s.endsAt.getTime() + 7200000).toISOString(),
    };
    const results = await Promise.allSettled([
      operations.reschedule(a.s.id, input, staff, randomUUID()),
      operations.reschedule(
        b.s.id,
        { ...input, expectedVersion: b.s.version },
        staff,
        randomUUID(),
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { response: { code: 'CLASS_MENTOR_SCHEDULE_CONFLICT' } },
    });
    expect((await auditCount(a.s.id)) + (await auditCount(b.s.id))).toBe(1);
  });

  it('cancels an in-progress session without changing attendance, clocks, teacher or deadline; cannot cancel completed', async () => {
    const a = await fixture();
    await f.cash.confirm(a.mentor.id, a.order.id, a.order.totalAmount);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(a.s.startsAt);
    const teacher = actor(a.mentor.id, UserRole.MENTOR);
    const started = await attendance.start(
      a.s.id,
      { expectedVersion: a.s.version },
      teacher,
      randomUUID(),
    );
    const entry = (await attendance.roster(a.s.id, teacher, { page: 1, pageSize: 100 })).items[0];
    if (!entry) throw new Error('Missing roster');
    await attendance.mark(
      a.s.id,
      {
        expectedVersion: started.session.version,
        records: [{ enrollmentId: entry.enrollmentId, status: AttendanceStatus.PRESENT }],
      },
      teacher,
      randomUUID(),
    );
    const before = await stored(a.s.id),
      rows = await db.query('SELECT * FROM attendance_records WHERE session_id=$1', [a.s.id]);
    const cancelled = await cancel(before);
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      actualStartedAt: before.actualStartedAt,
      editableUntil: before.editableUntil,
      effectiveMentor: { id: a.mentor.id },
    });
    expect(
      await db.query('SELECT * FROM attendance_records WHERE session_id=$1', [a.s.id]),
    ).toEqual(rows);
    expect((await stored(a.s.id)).actualEndedAt).toEqual(before.actualEndedAt);
    await expect(
      operations.reschedule(
        a.s.id,
        { ...target(before, 0), expectedVersion: cancelled.version },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'SESSION_STATE_CONFLICT' } });
    vi.useRealTimers();
    const b = await fixture();
    await db.query("UPDATE class_sessions SET status='COMPLETED' WHERE id=$1", [b.s.id]);
    await expect(cancel(b.s)).rejects.toMatchObject({
      response: { code: 'SESSION_STATE_CONFLICT' },
    });
  });

  it('creates a fresh replacement with inherited context and atomic class extension, no copied roster, and stable replay', async () => {
    const a = await fixture();
    await cancel(a.s);
    const s = await stored(a.s.id),
      mentor = await f.user(UserRole.MENTOR),
      input = { ...target(s), mentorId: mentor.id },
      key = randomUUID();
    const made = await operations.makeup(s.id, input, staff, key);
    expect(made).toMatchObject({
      originalSessionId: s.id,
      originalVersion: s.version + 1,
      classEndDate: toLocalDate(new Date(input.endsAt), read.timeZone()),
      session: {
        makeupForSessionId: s.id,
        makeupRootSessionId: s.id,
        status: 'SCHEDULED',
        version: 1,
        actualStartedAt: null,
        actualEndedAt: null,
        editableUntil: null,
        effectiveMentor: { id: mentor.id },
      },
    });
    expect(json(await operations.makeup(s.id, input, staff, key))).toEqual(json(made));
    const replacement = await stored(made.session.sessionId);
    expect(replacement.roomName).toBe(s.roomName);
    expect(replacement.meetingUrl).toBe(s.meetingUrl);
    expect(
      await db.query('SELECT * FROM attendance_records WHERE session_id=$1', [replacement.id]),
    ).toHaveLength(0);
    expect((await read.loadClass(db.manager, a.c.id)).endDate).toBe(made.classEndDate);
    expect(await auditCount(replacement.id)).toBe(1);
    await expect(
      rehearseMigration(db, new SessionScheduleOperations1792022400000(), 'down'),
    ).rejects.toThrow('retain schema');
  });

  it('continues ancestry through the latest cancelled replacement and never forks or revives a source', async () => {
    const a = await fixture();
    await cancel(a.s);
    const root = await stored(a.s.id),
      first = await operations.makeup(root.id, target(root), staff, randomUUID());
    await cancel(await stored(first.session.sessionId));
    const latest = await stored(first.session.sessionId);
    const second = await operations.makeup(latest.id, target(latest), staff, randomUUID());
    expect(second.session).toMatchObject({
      makeupForSessionId: latest.id,
      makeupRootSessionId: root.id,
    });
    await expect(
      operations.makeup(root.id, target(await stored(root.id), 3), staff, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'MAKEUP_ALREADY_EXISTS' } });
    await expect(
      db.query("UPDATE class_sessions SET status='SCHEDULED' WHERE id=$1", [root.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('UPDATE class_sessions SET makeup_root_session_id=id WHERE id=$1', [latest.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects mismatched unit, duration, mentor eligibility and future dates before class start without extending the class', async () => {
    const a = await fixture();
    await cancel(a.s);
    const s = await stored(a.s.id),
      input = target(s);
    const otherUnit = (await f.read.getDetail(a.c.id)).units[1]?.unit.id;
    if (!otherUnit) throw new Error('Missing other unit');
    await expect(
      operations.makeup(s.id, { ...input, classUnitId: otherUnit }, staff, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      operations.makeup(
        s.id,
        { ...input, endsAt: new Date(new Date(input.endsAt).getTime() + 1000).toISOString() },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      operations.makeup(s.id, { ...input, mentorId: a.student.id }, staff, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
    await expect(operations.makeup(s.id, target(s, -1), staff, randomUUID())).rejects.toMatchObject(
      { status: 422 },
    );
    expect((await read.loadClass(db.manager, a.c.id)).endDate).toBe(a.c.endDate);
    expect(await db.getRepository(ClassSessionEntity).countBy({ makeupRootSessionId: s.id })).toBe(
      0,
    );
  });

  it('races two replacements and commits only one source version, extension, audit and receipt', async () => {
    const a = await fixture();
    await cancel(a.s);
    const s = await stored(a.s.id);
    const results = await Promise.allSettled([
      operations.makeup(s.id, target(s, 1), staff, randomUUID()),
      operations.makeup(s.id, target(s, 2), staff, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { response: { code: 'SESSION_VERSION_CONFLICT' } },
    });
    expect((await stored(s.id)).version).toBe(s.version + 1);
    const children = await db
      .getRepository(ClassSessionEntity)
      .findBy({ makeupRootSessionId: s.id });
    expect(children).toHaveLength(1);
    expect(
      await db.query('SELECT 1 FROM teaching_mutation_receipts WHERE route=$1', [
        `session:${s.id}:makeups`,
      ]),
    ).toHaveLength(1);
    expect((await read.loadClass(db.manager, a.c.id)).endDate).toBe(
      toLocalDate(children[0]?.endsAt ?? new Date(0), read.timeZone()),
    );
  });

  it('rolls back replacement, source version, extension and receipt when audit persistence fails', async () => {
    const a = await fixture();
    await cancel(a.s);
    const s = await stored(a.s.id);
    await db.query(`CREATE FUNCTION fail_makeup_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='MAKEUP' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$`);
    await db.query(
      'CREATE TRIGGER test_fail_makeup_audit BEFORE INSERT ON session_schedule_audits FOR EACH ROW EXECUTE FUNCTION fail_makeup_audit()',
    );
    try {
      await expect(operations.makeup(s.id, target(s), staff, randomUUID())).rejects.toThrow(
        'Injected audit failure',
      );
    } finally {
      await db.query('DROP TRIGGER test_fail_makeup_audit ON session_schedule_audits');
      await db.query('DROP FUNCTION fail_makeup_audit()');
    }
    expect((await stored(s.id)).version).toBe(s.version);
    expect((await read.loadClass(db.manager, a.c.id)).endDate).toBe(a.c.endDate);
    expect(await db.getRepository(ClassSessionEntity).countBy({ makeupRootSessionId: s.id })).toBe(
      0,
    );
    expect(
      await db.query('SELECT 1 FROM teaching_mutation_receipts WHERE route=$1', [
        `session:${s.id}:makeups`,
      ]),
    ).toHaveLength(0);
  });

  it('cancels all scheduled/in-progress class sessions with audit and preserves completed sessions and attendance', async () => {
    const a = await fixture(),
      day = a.c.startDate;
    await f.classes.scheduleSession(a.c.id, {
      classUnitId: a.s.classUnitId,
      title: 'Next',
      startsAt: `${day}T10:00:00+07:00`,
      endsAt: `${day}T11:00:00+07:00`,
    });
    await f.classes.scheduleSession(a.c.id, {
      classUnitId: a.s.classUnitId,
      title: 'Done',
      startsAt: `${day}T12:00:00+07:00`,
      endsAt: `${day}T13:00:00+07:00`,
    });
    await db.query(
      "UPDATE class_sessions SET status='IN_PROGRESS',actual_started_at=starts_at,teaching_mentor_id=$2 WHERE id=$1",
      [a.s.id, a.mentor.id],
    );
    await db.query(
      "UPDATE class_sessions SET status='COMPLETED' WHERE title='Done' AND class_unit_id=$1",
      [a.s.classUnitId],
    );
    const result = await f.classes.cancel(a.c.id, staff.userId);
    expect(result.classEntity.status).toBe('CANCELLED');
    expect(result.units[0]?.sessions.map((s) => s.status)).toEqual([
      'CANCELLED',
      'CANCELLED',
      'COMPLETED',
    ]);
    expect(
      await db.query(
        "SELECT 1 FROM session_schedule_audits WHERE class_id=$1 AND action='CLASS_CANCEL' AND actor_id=$2",
        [a.c.id, staff.userId],
      ),
    ).toHaveLength(2);
    expect((await stored(a.s.id)).actualStartedAt).toEqual(a.s.startsAt);
  });

  it('serializes reschedule against mentor assignment and class cancellation without partial writes', async () => {
    const a = await fixture(),
      mentor = await f.user(UserRole.MENTOR);
    const assign = new TeachingAssignmentService(db, f.users, read, new MentorConflictService());
    const results = await Promise.allSettled([
      operations.reschedule(a.s.id, target(a.s, 0), staff, randomUUID()),
      assign.assignSession(
        a.s.id,
        { mentorId: mentor.id, expectedVersion: a.s.version, reason: 'Cover' },
        staff,
        randomUUID(),
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await stored(a.s.id)).version).toBe(a.s.version + 1);
    const current = await stored(a.s.id);
    await Promise.allSettled([
      operations.reschedule(current.id, target(current, 0), staff, randomUUID()),
      f.classes.cancel(a.c.id, staff.userId),
    ]);
    expect((await stored(current.id)).status).toBe('CANCELLED');
  });

  it('rolls back all schedule writes and audits when the last receipt insert fails', async () => {
    const a = await fixture();
    await db.query(`CREATE FUNCTION fail_schedule_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Injected receipt failure'; END $$`);
    await db.query(
      'CREATE TRIGGER test_fail_schedule_receipt BEFORE INSERT ON teaching_mutation_receipts FOR EACH ROW EXECUTE FUNCTION fail_schedule_receipt()',
    );
    try {
      await expect(
        operations.reschedule(
          a.s.id,
          {
            ...target(a.s, 0),
            startsAt: new Date(a.s.startsAt.getTime() + 3600000).toISOString(),
            endsAt: new Date(a.s.endsAt.getTime() + 3600000).toISOString(),
          },
          staff,
          randomUUID(),
        ),
      ).rejects.toThrow('Injected receipt failure');
      await expect(cancel(a.s)).rejects.toThrow('Injected receipt failure');
    } finally {
      await db.query('DROP TRIGGER test_fail_schedule_receipt ON teaching_mutation_receipts');
      await db.query('DROP FUNCTION fail_schedule_receipt()');
    }
    expect(await stored(a.s.id)).toEqual(a.s);
    expect(await auditCount(a.s.id)).toBe(0);
    expect((await read.loadClass(db.manager, a.c.id)).assignmentVersion).toBe(
      a.c.assignmentVersion,
    );
  });

  it('rolls back an entire class cancellation if a later session audit fails', async () => {
    const a = await fixture(),
      day = a.c.startDate;
    await f.classes.scheduleSession(a.c.id, {
      classUnitId: a.s.classUnitId,
      title: 'Another',
      startsAt: `${day}T15:00:00+07:00`,
      endsAt: `${day}T16:00:00+07:00`,
    });
    const before = await f.read.getDetail(a.c.id);
    await db.query(`CREATE FUNCTION fail_second_class_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='CLASS_CANCEL' AND EXISTS(SELECT 1 FROM session_schedule_audits a WHERE a.class_id=NEW.class_id AND a.action='CLASS_CANCEL')
      THEN RAISE EXCEPTION 'Injected batch failure'; END IF; RETURN NEW; END $$`);
    await db.query(
      'CREATE TRIGGER test_fail_second_class_cancel BEFORE INSERT ON session_schedule_audits FOR EACH ROW EXECUTE FUNCTION fail_second_class_cancel()',
    );
    try {
      await expect(f.classes.cancel(a.c.id, staff.userId)).rejects.toThrow(
        'Injected batch failure',
      );
    } finally {
      await db.query('DROP TRIGGER test_fail_second_class_cancel ON session_schedule_audits');
      await db.query('DROP FUNCTION fail_second_class_cancel()');
    }
    const after = await f.read.getDetail(a.c.id);
    expect(after).toEqual(before);
    expect(
      await db.query('SELECT 1 FROM session_schedule_audits WHERE class_id=$1', [a.c.id]),
    ).toHaveLength(0);
  });

  it('serializes start with class cancellation and never turns a retained snapshot into absent', async () => {
    const a = await fixture();
    await f.cash.confirm(a.mentor.id, a.order.id, a.order.totalAmount);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(a.s.startsAt);
    const results = await Promise.allSettled([
      attendance.start(
        a.s.id,
        { expectedVersion: a.s.version },
        actor(a.mentor.id, UserRole.MENTOR),
        randomUUID(),
      ),
      f.classes.cancel(a.c.id, staff.userId),
    ]);
    expect(results[1]?.status).toBe('fulfilled');
    expect((await stored(a.s.id)).status).toBe('CANCELLED');
    const rows = await db.getRepository(AttendanceRecordEntity).findBy({ sessionId: a.s.id });
    expect(rows).toHaveLength(results[0]?.status === 'fulfilled' ? 1 : 0);
    expect(rows.every((row) => row.status === AttendanceStatus.UNMARKED)).toBe(true);
  });
});
