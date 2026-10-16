import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { AttendanceStatus as Status } from '../../src/modules/attendance/enums/attendance-status.enum.js';
import { AttendanceService } from '../../src/modules/attendance/services/attendance.service.js';
import { AttendanceAuditService } from '../../src/modules/attendance/services/attendance-audit.service.js';
import { GuestAttendanceService } from '../../src/modules/attendance/services/guest-attendance.service.js';
import { MakeupPlacementService } from '../../src/modules/attendance/services/makeup-placement.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { toLocalDate } from '../../src/modules/classes/domain/class-calendar.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { DeliveryMode } from '../../src/modules/classes/enums/delivery-mode.enum.js';
import { ClassScheduleService } from '../../src/modules/classes/services/class-schedule.service.js';
import { MentorConflictService } from '../../src/modules/classes/services/mentor-conflict.service.js';
import { SessionLifecycleService } from '../../src/modules/classes/services/session-lifecycle.service.js';
import { SessionOperationsService } from '../../src/modules/classes/services/session-operations.service.js';
import { TeachingAssignmentService } from '../../src/modules/classes/services/teaching-assignment.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrderSettlementService } from '../../src/modules/commerce/services/order-settlement.service.js';
import { AttendancePaymentEvidenceService } from '../../src/modules/payments/services/attendance-payment-evidence.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const PAGE = { page: 1, pageSize: 100 };
const actor = (userId: string, role = UserRole.MANAGER): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});
const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe.skipIf(!separateTestUrl('phase44b'))('Phase 4.4b cross-class makeup (PostgreSQL)', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    staff: AuthenticatedUser,
    teaching: TeachingReadService,
    makeup: MakeupPlacementService,
    attendance: AttendanceService,
    operations: SessionOperationsService,
    audits: AttendanceAuditService;
  const reservations = new ScheduleReservationsService();
  beforeAll(async () => {
    db = await paymentDatabase('phase44b', { entities: [AttendanceRecordEntity] });
    f = paymentFixture(db);
    staff = actor((await f.user(UserRole.MANAGER)).id);
    teaching = new TeachingReadService(db, f.config, f.users, reservations);
    makeup = new MakeupPlacementService(db, teaching, f.users, reservations);
    operations = new SessionOperationsService(
      db,
      teaching,
      f.users,
      new ClassScheduleService(f.config, reservations),
    );
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
  }, 30000);
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  const stored = (id: string) => db.getRepository(ClassSessionEntity).findOneByOrFail({ id });
  async function fixture(capacity = 1, paid = true) {
    const a = await f.order({ paymentType: PaymentType.CASH, maxStudents: 10 });
    const sourceClassId = a.classIds[0] ?? '',
      detail = await f.read.getDetail(sourceClassId),
      original = detail.units[0]?.sessions[0];
    if (!original) throw new Error('Missing source');
    if (paid)
      await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
    await operations.cancel(
      original.id,
      { expectedVersion: original.version, reason: 'Replacement required' },
      staff,
      randomUUID(),
    );
    const replacement = await operations.makeup(
      original.id,
      {
        expectedVersion: (await stored(original.id)).version,
        classUnitId: original.classUnitId,
        title: 'Rescheduled source',
        startsAt: new Date(original.startsAt.getTime() + 86400000).toISOString(),
        endsAt: new Date(original.endsAt.getTime() + 86400000).toISOString(),
        reason: 'Rescheduled',
      },
      staff,
      randomUUID(),
    );
    const source = await stored(replacement.session.sessionId);
    async function another(days: number, maxStudents: number) {
      const mentor = await f.user(UserRole.MENTOR),
        day = toLocalDate(
          new Date(source.startsAt.getTime() + days * 86400000),
          teaching.timeZone(),
        );
      const c = await f.classes.create({
        courseId: detail.classEntity.courseId,
        mentorId: mentor.id,
        code: randomUUID(),
        name: 'Receiving class',
        startDate: day,
        endDate: day,
        maxStudents,
        deliveryMode: DeliveryMode.ONLINE,
        meetingUrl: 'https://meet.example.test/guest-only',
      });
      const unit = c.units[0]?.unit;
      if (!unit) throw new Error('Missing target unit');
      await f.classes.scheduleSession(c.classEntity.id, {
        classUnitId: unit.id,
        title: 'Equivalent content',
        startsAt: `${day}T08:00:00+07:00`,
        endsAt: `${day}T09:00:00+07:00`,
      });
      await f.classes.open(c.classEntity.id);
      const t = (await f.read.getDetail(c.classEntity.id)).units[0]?.sessions[0];
      if (!t) throw new Error('Missing target');
      return { c: c.classEntity, t, mentor };
    }
    const clash = await another(0, 10),
      target = await another(2, capacity);
    // Registration continues despite the approved replacement timetable; queue is atomic.
    await f.cart.addItem(a.student.id, clash.c.id);
    await f.checkout.checkout(a.student.id, PaymentType.CASH);
    const queue = await makeup.conflicts(staff, { ...PAGE, classId: sourceClassId });
    const conflict = queue.items.find((c) => c.enrollmentId);
    if (!conflict) throw new Error('Missing late-checkout conflict');
    const studentActor = actor(a.student.id, UserRole.STUDENT);
    return {
      ...a,
      sourceClassId,
      source,
      original,
      clash,
      target,
      conflict,
      another,
      studentActor,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const input = (a: Fixture) => ({
    targetSessionId: a.target.t.id,
    expectedVersion: a.conflict.version,
    expectedTargetVersion: a.target.t.version,
    contentMatchConfirmed: true,
    reason: 'Equivalent lesson confirmed',
  });
  const assign = (a: Fixture) => makeup.create(a.conflict.id, input(a), staff, randomUUID());
  async function start(a: Fixture) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(a.target.t.startsAt.getTime() + 1800000));
    return attendance.start(
      a.target.t.id,
      { expectedVersion: (await stored(a.target.t.id)).version },
      actor(a.target.mentor.id, UserRole.MENTOR),
      randomUUID(),
    );
  }

  it('queues late CASH checkout without rejecting it; candidates reserve nothing and use current capacity', async () => {
    const a = await fixture();
    expect(a.conflict).toMatchObject({ status: 'OPEN', sourceSession: { sessionId: a.source.id } });
    expect(a.conflict.conflictingIntervals.map((i) => i.sessionId)).toContain(a.clash.t.id);
    const candidates = await makeup.candidates(a.conflict.id, staff, PAGE);
    expect(candidates.items.map((c) => c.session.sessionId)).toEqual([a.target.t.id]);
    expect(candidates.items[0]?.remainingCapacity).toBe(1);
    expect(
      await db.query('SELECT 1 FROM makeup_placements WHERE conflict_id=$1', [a.conflict.id]),
    ).toHaveLength(0);
    for (const q of [
      { ...PAGE, from: new Date().toISOString() },
      {
        ...PAGE,
        from: new Date().toISOString(),
        to: new Date(Date.now() + 94 * 86400000).toISOString(),
      },
    ])
      await expect(makeup.candidates(a.conflict.id, staff, q)).rejects.toMatchObject({
        status: 422,
      });
  });

  it('creates one audited reservation, preserves payment/enrollment counts and replays only for current staff', async () => {
    const a = await fixture(),
      key = randomUUID(),
      body = input(a);
    const counts = await db.query(
      'SELECT (SELECT count(*) FROM enrollments) AS e,(SELECT count(*) FROM orders) AS o',
    );
    const result = await makeup.create(a.conflict.id, body, staff, key);
    expect(result.placement).toMatchObject({
      sourceClassId: a.sourceClassId,
      sourceRootSessionId: a.original.id,
      status: 'ASSIGNED',
      creditStatus: 'PENDING',
      attendanceStatus: null,
    });
    expect(json(await makeup.create(a.conflict.id, body, staff, key))).toEqual(json(result));
    expect(
      await db.query(
        'SELECT (SELECT count(*) FROM enrollments) AS e,(SELECT count(*) FROM orders) AS o',
      ),
    ).toEqual(counts);
    expect(
      await db.query('SELECT 1 FROM makeup_placement_audits WHERE placement_id=$1', [
        result.placement.id,
      ]),
    ).toHaveLength(1);
    await expect(
      makeup.create(a.conflict.id, { ...body, reason: 'Different' }, staff, key),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(makeup.create(a.conflict.id, body, a.studentActor, key)).rejects.toMatchObject({
      status: 403,
    });
    const manager = await f.user(UserRole.MANAGER),
      other = actor(manager.id),
      otherKey = randomUUID();
    await makeup.cancel(
      result.placement.id,
      { expectedVersion: 1, reason: 'Changed plan' },
      other,
      otherKey,
    );
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [manager.id]);
    await expect(
      makeup.cancel(
        result.placement.id,
        { expectedVersion: 1, reason: 'Changed plan' },
        other,
        otherKey,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('requires active source payment, explicit content confirmation, matching Course Unit and a different class', async () => {
    const a = await fixture(2, false);
    await expect(assign(a)).rejects.toMatchObject({ response: { code: 'MAKEUP_NOT_ELIGIBLE' } });
    await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
    await expect(
      makeup.create(
        a.conflict.id,
        { ...input(a), contentMatchConfirmed: false },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      makeup.create(
        a.conflict.id,
        { ...input(a), targetSessionId: a.source.id, expectedTargetVersion: a.source.version },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const wrong = (await f.read.getDetail(a.target.c.id)).units[1]?.unit;
    if (!wrong) throw new Error('Missing wrong unit');
    await db.query('UPDATE class_sessions SET class_unit_id=$2 WHERE id=$1', [
      a.target.t.id,
      wrong.id,
    ]);
    await expect(assign(a)).rejects.toMatchObject({ status: 422 });
  });

  it('rechecks target time, state, enrollment, student overlaps and both versions after discovery', async () => {
    const a = await fixture(2);
    await expect(
      makeup.create(a.conflict.id, { ...input(a), expectedVersion: 999 }, staff, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'MAKEUP_VERSION_CONFLICT' } });
    await expect(
      makeup.create(
        a.conflict.id,
        { ...input(a), expectedTargetVersion: 999 },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'MAKEUP_VERSION_CONFLICT' } });
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      a.target.t.id,
      a.clash.t.startsAt,
      a.clash.t.endsAt,
    ]);
    await expect(assign(a)).rejects.toMatchObject({
      response: { code: 'MAKEUP_STUDENT_CONFLICT' },
    });
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      a.target.t.id,
      a.target.t.startsAt,
      a.target.t.endsAt,
    ]);
    await f.cart.addItem(a.student.id, a.target.c.id);
    await f.checkout.checkout(a.student.id, PaymentType.PAYOS);
    await expect(assign(a)).rejects.toMatchObject({ response: { code: 'MAKEUP_TARGET_ENROLLED' } });
    expect((await makeup.candidates(a.conflict.id, staff, PAGE)).items).toHaveLength(0);
  });

  it('counts CASH and PayOS holds and excludes expired holds for placement capacity', async () => {
    const a = await fixture();
    const buyer = await f.user();
    await f.cart.addItem(buyer.id, a.target.c.id);
    const [order] = await f.checkout.checkout(buyer.id, PaymentType.PAYOS);
    await expect(assign(a)).rejects.toMatchObject({ response: { code: 'MAKEUP_TARGET_FULL' } });
    expect((await makeup.candidates(a.conflict.id, staff, PAGE)).items).toHaveLength(0);
    await db.query(
      "UPDATE orders SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' WHERE id=$1",
      [order?.order.id],
    );
    expect((await makeup.candidates(a.conflict.id, staff, PAGE)).items).toHaveLength(1);
    expect((await assign(a)).placement.status).toBe('ASSIGNED');
  });

  it('serializes a placement and checkout competing for the last target seat', async () => {
    const a = await fixture(),
      buyer = await f.user();
    await f.cart.addItem(buyer.id, a.target.c.id);
    const result = await Promise.allSettled([
      assign(a),
      f.checkout.checkout(buyer.id, PaymentType.CASH),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await reservations.remainingCapacity(db.manager, a.target.t.id, new Date())).toBe(0);
  });

  it('serializes duplicate placements and rejects stale or duplicate source obligations', async () => {
    const a = await fixture(2);
    const result = await Promise.allSettled([assign(a), assign(a)]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.query("SELECT 1 FROM makeup_placements WHERE conflict_id=$1 AND status='ASSIGNED'", [
        a.conflict.id,
      ]),
    ).toHaveLength(1);
  });

  it('scopes context to the own target session and revokes meeting access after cancellation or entitlement loss', async () => {
    const a = await fixture(),
      p = await assign(a);
    const ctx = await teaching.context(a.target.t.id, a.studentActor);
    expect(ctx).toMatchObject({
      makeupPlacementId: p.placement.id,
      meetingUrl: a.target.c.meetingUrl,
      accessScope: 'SESSION',
    });
    await expect(teaching.context(a.source.id, a.studentActor)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      teaching.context(a.target.t.id, actor((await f.user()).id, UserRole.STUDENT)),
    ).rejects.toMatchObject({ status: 403 });
    expect(await f.enrollments.hasActiveAccess(a.student.id, a.target.c.id)).toBe(false);
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [
      a.conflict.enrollmentId,
    ]);
    await expect(teaching.context(a.target.t.id, a.studentActor)).rejects.toMatchObject({
      status: 403,
    });
    expect((await makeup.own(a.studentActor, PAGE)).items[0]?.id).toBe(p.placement.id);
  });

  it('snapshots a separate guest roster, shares session version and totals, finalizes and corrects with audit', async () => {
    const a = await fixture(2),
      p = await assign(a),
      opened = await start(a),
      mentor = actor(a.target.mentor.id, UserRole.MENTOR);
    expect(opened.changedMakeupPlacementIds).toEqual([p.placement.id]);
    const roster = await attendance.roster(a.target.t.id, mentor, { page: 1, pageSize: 1 });
    expect(roster).toMatchObject({
      total: 1,
      totals: { eligible: 1, unmarked: 1 },
      items: [
        {
          entryType: 'MAKEUP',
          makeupPlacementId: p.placement.id,
          enrollmentId: a.conflict.enrollmentId,
        },
      ],
    });
    expect(
      await db.query('SELECT 1 FROM attendance_records WHERE session_id=$1', [a.target.t.id]),
    ).toHaveLength(0);
    const payload = {
        expectedVersion: opened.session.version,
        records: [],
        guestRecords: [{ makeupPlacementId: p.placement.id, status: Status.PRESENT }],
      },
      key = randomUUID();
    await expect(
      attendance.mark(a.target.t.id, payload, actor(a.mentor.id, UserRole.MENTOR), key),
    ).rejects.toMatchObject({ status: 403 });
    const marked = await attendance.mark(a.target.t.id, payload, mentor, key);
    expect(marked.totals).toMatchObject({ present: 1, eligible: 1 });
    expect(json(await attendance.mark(a.target.t.id, payload, mentor, key))).toEqual(json(marked));
    vi.setSystemTime(new Date(Date.now() + 60000));
    const closed = await attendance.finalize(
      a.target.t.id,
      { expectedVersion: marked.session.version },
      mentor,
      randomUUID(),
    );
    expect(closed.session.editableUntil).toEqual(opened.session.editableUntil);
    expect((await makeup.own(a.studentActor, PAGE)).items[0]).toMatchObject({
      status: 'COMPLETED',
      creditStatus: 'FINALIZED',
      attendanceStatus: Status.PRESENT,
    });
    const corrected = await attendance.mark(
      a.target.t.id,
      {
        expectedVersion: closed.session.version,
        records: [],
        guestRecords: [{ makeupPlacementId: p.placement.id, status: Status.ABSENT }],
      },
      mentor,
      randomUUID(),
    );
    expect(corrected.totals.absent).toBe(1);
    const history = await audits.list(a.target.t.id, staff, {
      ...PAGE,
      makeupPlacementId: p.placement.id,
    });
    expect(history.items.map((r) => r.action)).toContain('CORRECT');
    expect(
      history.items.every(
        (r) => r.entryType === 'MAKEUP' && r.makeupPlacementId === p.placement.id,
      ),
    ).toBe(true);
  });

  it('enforces deadline and current target mentor without resetting clocks or guest history', async () => {
    const a = await fixture(),
      p = await assign(a),
      opened = await start(a),
      mentor = actor(a.target.mentor.id, UserRole.MENTOR);
    vi.setSystemTime(new Date((opened.session.editableUntil?.getTime() ?? 0) + 1));
    const payload = {
      expectedVersion: opened.session.version,
      records: [],
      guestRecords: [{ makeupPlacementId: p.placement.id, status: Status.PRESENT }],
    };
    await expect(
      attendance.mark(a.target.t.id, payload, mentor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' } });
    await expect(
      attendance.mark(a.target.t.id, payload, staff, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
    const marked = await attendance.mark(
      a.target.t.id,
      { ...payload, reason: 'Verified late correction' },
      staff,
      randomUUID(),
    );
    const newMentor = await f.user(UserRole.MENTOR);
    const assignment = new TeachingAssignmentService(
      db,
      f.users,
      teaching,
      new MentorConflictService(),
    );
    await assignment.assignSession(
      a.target.t.id,
      { mentorId: newMentor.id, reason: 'Substitute', expectedVersion: marked.session.version },
      staff,
      randomUUID(),
    );
    const current = await stored(a.target.t.id);
    expect(current.editableUntil).toEqual(opened.session.editableUntil);
    await expect(attendance.roster(a.target.t.id, mentor, PAGE)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects mixed-batch guests from another session and rolls back regular and guest writes together', async () => {
    const a = await fixture(2),
      p = await assign(a),
      opened = await start(a);
    const body = {
      expectedVersion: opened.session.version,
      reason: 'Validate whole batch',
      records: [],
      guestRecords: [
        { makeupPlacementId: p.placement.id, status: Status.PRESENT },
        { makeupPlacementId: randomUUID(), status: Status.ABSENT },
      ],
    };
    await expect(attendance.mark(a.target.t.id, body, staff, randomUUID())).rejects.toMatchObject({
      response: { code: 'MAKEUP_ATTENDANCE_NOT_ELIGIBLE' },
    });
    expect((await attendance.roster(a.target.t.id, staff, PAGE)).totals.unmarked).toBe(1);
    expect((await stored(a.target.t.id)).version).toBe(opened.session.version);
  });

  it('requeues target cancellation atomically without ABSENT and retains guest snapshots and cancel replay', async () => {
    const a = await fixture(),
      p = await assign(a),
      opened = await start(a);
    await operations.cancel(
      a.target.t.id,
      { expectedVersion: opened.session.version, reason: 'Target unavailable' },
      staff,
      randomUUID(),
    );
    const own = (await makeup.own(a.studentActor, PAGE)).items[0];
    expect(own).toMatchObject({
      status: 'NEEDS_REASSIGNMENT',
      creditStatus: 'PENDING',
      attendanceStatus: Status.UNMARKED,
    });
    expect(
      (await makeup.conflicts(staff, { ...PAGE, classId: a.sourceClassId })).items[0]?.status,
    ).toBe('OPEN');
    await expect(teaching.context(a.target.t.id, a.studentActor)).rejects.toMatchObject({
      status: 403,
    });
    const key = randomUUID(),
      body = { expectedVersion: own?.version ?? 0, reason: 'Select a new target' };
    const cancelled = await makeup.cancel(p.placement.id, body, staff, key);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', creditStatus: 'REVOKED' });
    expect(json(await makeup.cancel(p.placement.id, body, staff, key))).toEqual(json(cancelled));
    expect(
      await db.query('SELECT 1 FROM guest_attendance_records WHERE placement_id=$1', [
        p.placement.id,
      ]),
    ).toHaveLength(1);
    vi.useRealTimers();
    const next = await a.another(3, 2),
      q = (await makeup.conflicts(staff, { ...PAGE, classId: a.sourceClassId })).items[0];
    const reassigned = await makeup.create(
      a.conflict.id,
      {
        ...input(a),
        targetSessionId: next.t.id,
        expectedTargetVersion: next.t.version,
        expectedVersion: q?.version ?? 0,
      },
      staff,
      randomUUID(),
    );
    expect(reassigned.placement.sourceRootSessionId).toBe(a.original.id);
  });

  it('blocks schedule changes and source completion with unresolved placements; permits completion after cancellation', async () => {
    const a = await fixture(),
      p = await assign(a);
    await expect(
      operations.reschedule(
        a.target.t.id,
        {
          expectedVersion: p.targetSessionVersion,
          startsAt: a.target.t.startsAt.toISOString(),
          endsAt: a.target.t.endsAt.toISOString(),
          reason: 'Move target',
        },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'SESSION_HAS_MAKEUP_PLACEMENTS' } });
    await f.classes.start(a.sourceClassId);
    await db.query("UPDATE class_sessions SET status='COMPLETED' WHERE id=$1", [a.source.id]);
    await expect(f.classes.complete(a.sourceClassId)).rejects.toMatchObject({
      response: { code: 'CLASS_HAS_UNRESOLVED_MAKEUPS' },
    });
    await makeup.cancel(
      p.placement.id,
      { expectedVersion: 1, reason: 'Withdraw makeup obligation' },
      staff,
      randomUUID(),
    );
    expect((await f.classes.complete(a.sourceClassId)).classEntity.status).toBe('COMPLETED');
  });

  it('rolls back reservation, conflict/session versions and audits when receipt persistence fails', async () => {
    const a = await fixture();
    await db.query(`CREATE FUNCTION fail_makeup_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt unavailable'; END $$;
      CREATE TRIGGER fail_makeup_receipt BEFORE INSERT ON makeup_mutation_receipts FOR EACH ROW EXECUTE FUNCTION fail_makeup_receipt()`);
    try {
      await expect(assign(a)).rejects.toThrow('receipt unavailable');
    } finally {
      await db.query(
        'DROP TRIGGER fail_makeup_receipt ON makeup_mutation_receipts; DROP FUNCTION fail_makeup_receipt()',
      );
    }
    expect(
      await db.query('SELECT 1 FROM makeup_placements WHERE conflict_id=$1', [a.conflict.id]),
    ).toHaveLength(0);
    expect((await stored(a.target.t.id)).version).toBe(a.target.t.version);
    expect(
      (await makeup.conflicts(staff, { ...PAGE, classId: a.sourceClassId })).items[0]?.version,
    ).toBe(a.conflict.version);
  });

  it('serializes different students competing for one guest seat', async () => {
    const a = await fixture(),
      student = await f.user();
    await f.cart.addItem(student.id, a.sourceClassId);
    const [order] = await f.checkout.checkout(student.id, PaymentType.CASH);
    if (!order) throw new Error('Missing source payment');
    await f.cash.confirm(
      (await f.user(UserRole.MANAGER)).id,
      order.order.id,
      order.order.totalAmount,
    );
    await f.cart.addItem(student.id, a.clash.c.id);
    await f.checkout.checkout(student.id, PaymentType.CASH);
    const conflicts = (await makeup.conflicts(staff, { ...PAGE, classId: a.sourceClassId })).items;
    const other = conflicts.find((c) => c.student.id === student.id);
    if (!other) throw new Error('Missing second conflict');
    const results = await Promise.allSettled([
      assign(a),
      makeup.create(other.id, { ...input(a), expectedVersion: other.version }, staff, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await reservations.remainingCapacity(db.manager, a.target.t.id, new Date())).toBe(0);
  });

  it('serializes placement against target start and target cancellation using the same target version', async () => {
    const a = await fixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(a.target.t.startsAt.getTime() - 600000));
    const raced = await Promise.allSettled([
      assign(a),
      attendance.start(
        a.target.t.id,
        { expectedVersion: a.target.t.version },
        actor(a.target.mentor.id, UserRole.MENTOR),
        randomUUID(),
      ),
    ]);
    expect(raced.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const session = await stored(a.target.t.id);
    const guests = await db.query('SELECT 1 FROM makeup_placements WHERE target_session_id=$1', [
      a.target.t.id,
    ]);
    if (session.status === 'IN_PROGRESS') expect(guests).toHaveLength(0);
    else {
      expect(guests).toHaveLength(1);
      const opened = await attendance.start(
        a.target.t.id,
        { expectedVersion: session.version },
        actor(a.target.mentor.id, UserRole.MENTOR),
        randomUUID(),
      );
      expect(opened.changedMakeupPlacementIds).toHaveLength(1);
    }
    vi.useRealTimers();
    const b = await fixture();
    const cancelled = await Promise.allSettled([
      assign(b),
      operations.cancel(
        b.target.t.id,
        { expectedVersion: b.target.t.version, reason: 'Target cancellation' },
        staff,
        randomUUID(),
      ),
    ]);
    expect(cancelled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const current = await stored(b.target.t.id);
    if (current.status !== 'CANCELLED')
      await operations.cancel(
        current.id,
        { expectedVersion: current.version, reason: 'Retry cancellation after refetch' },
        staff,
        randomUUID(),
      );
    expect(
      await db.query(
        "SELECT 1 FROM makeup_placements WHERE target_session_id=$1 AND status='ASSIGNED'",
        [b.target.t.id],
      ),
    ).toHaveLength(0);
  });

  it('paginates the combined regular and guest roster and rolls back mixed writes on an invalid guest', async () => {
    const a = await fixture(2),
      regular = await f.user();
    await f.cart.addItem(regular.id, a.target.c.id);
    const [order] = await f.checkout.checkout(regular.id, PaymentType.CASH);
    if (!order) throw new Error('Missing payment');
    await f.cash.confirm(
      (await f.user(UserRole.MANAGER)).id,
      order.order.id,
      order.order.totalAmount,
    );
    const p = await assign(a),
      opened = await start(a);
    const first = await attendance.roster(a.target.t.id, staff, { page: 1, pageSize: 1 }),
      second = await attendance.roster(a.target.t.id, staff, { page: 2, pageSize: 1 });
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(first.totals).toEqual(second.totals);
    expect(first.items[0]?.attendanceId).not.toBe(second.items[0]?.attendanceId);
    const e = await f.enrollments.findActive(regular.id, a.target.c.id);
    if (!e) throw new Error('Missing regular enrollment');
    await expect(
      attendance.mark(
        a.target.t.id,
        {
          expectedVersion: opened.session.version,
          reason: 'Atomic mixed batch',
          records: [{ enrollmentId: e.id, status: Status.PRESENT }],
          guestRecords: [{ makeupPlacementId: randomUUID(), status: Status.PRESENT }],
        },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'MAKEUP_ATTENDANCE_NOT_ELIGIBLE' } });
    expect((await attendance.roster(a.target.t.id, staff, PAGE)).totals).toMatchObject({
      unmarked: 2,
      present: 0,
    });
    vi.setSystemTime(new Date(Date.now() + 60000));
    const closed = await attendance.finalize(
      a.target.t.id,
      { expectedVersion: opened.session.version, reason: 'Close roster' },
      staff,
      randomUUID(),
    );
    expect(closed.totals).toMatchObject({ absent: 2, eligible: 2 });
    expect((await makeup.own(a.studentActor, PAGE)).items[0]).toMatchObject({
      id: p.placement.id,
      status: 'COMPLETED',
      attendanceStatus: 'ABSENT',
    });
  });

  it('requeues ineligible guest snapshots without inventing attendance and keeps staff correction independent of credit', async () => {
    const a = await fixture(),
      p = await assign(a);
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [
      a.conflict.enrollmentId,
    ]);
    const opened = await start(a);
    expect(opened.changedMakeupPlacementIds).toHaveLength(0);
    vi.setSystemTime(new Date(Date.now() + 60000));
    await attendance.finalize(
      a.target.t.id,
      { expectedVersion: opened.session.version, reason: 'No eligible guest' },
      staff,
      randomUUID(),
    );
    expect((await makeup.own(a.studentActor, PAGE)).items[0]).toMatchObject({
      id: p.placement.id,
      status: 'NEEDS_REASSIGNMENT',
      attendanceStatus: null,
    });
    vi.useRealTimers();
    const b = await fixture(),
      q = await assign(b),
      started = await start(b);
    const cancelled = await operations.cancel(
      b.target.t.id,
      { expectedVersion: started.session.version, reason: 'Target cancelled' },
      staff,
      randomUUID(),
    );
    const corrected = await attendance.mark(
      b.target.t.id,
      {
        expectedVersion: cancelled.version,
        reason: 'Retain physical attendance evidence',
        records: [],
        guestRecords: [{ makeupPlacementId: q.placement.id, status: Status.PRESENT }],
      },
      staff,
      randomUUID(),
    );
    expect(corrected.totals.present).toBe(1);
    expect((await makeup.own(b.studentActor, PAGE)).items[0]).toMatchObject({
      status: 'NEEDS_REASSIGNMENT',
      creditStatus: 'PENDING',
    });
  });

  it('settles late PayOS enrollment atomically and queues its replacement conflict instead of rejecting payment', async () => {
    const a = await fixture();
    // Remove the earlier fixture's CASH timetable so only the new PayOS activation creates the conflict.
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE class_id=$1", [a.clash.c.id]);
    await db.query('DELETE FROM student_schedule_conflicts WHERE id=$1', [a.conflict.id]);
    const clash = await a.another(0, 10);
    await f.cart.addItem(a.student.id, clash.c.id);
    const [order] = await f.checkout.checkout(a.student.id, PaymentType.PAYOS);
    if (!order) throw new Error('Missing PayOS order');
    expect(
      (await makeup.conflicts(staff, { ...PAGE, classId: a.sourceClassId })).items,
    ).toHaveLength(0);
    const link = await f.links.create(a.student.id, order.order.id),
      code = link.providerOrderCode ?? 0;
    expect(
      await f.settlement.settle(
        {
          orderCode: code,
          amount: order.order.totalAmount,
          currency: 'VND',
          paymentLinkId: f.provider.links.get(code)?.id ?? '',
          reference: randomUUID(),
          code: '00',
          isConfirmSample: false,
        },
        'WEBHOOK',
        null,
      ),
    ).toBe('SETTLED');
    const conflicts = await makeup.conflicts(staff, { ...PAGE, classId: a.sourceClassId });
    expect(conflicts.items).toHaveLength(1);
    expect(conflicts.items[0]?.conflictingIntervals.map((i) => i.sessionId)).toContain(clash.t.id);
    expect(await f.enrollments.hasActiveAccess(a.student.id, clash.c.id)).toBe(true);
  });
});
