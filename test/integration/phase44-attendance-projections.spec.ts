import { MentorAttendanceReportsService } from '../../src/modules/attendance/services/mentor-attendance-reports.service.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ATTENDANCE_CREDIT_CTE } from '../../src/modules/attendance/domain/attendance-credit.js';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { AttendanceStatus } from '../../src/modules/attendance/enums/attendance-status.enum.js';
import { AttendanceService } from '../../src/modules/attendance/services/attendance.service.js';
import { AttendanceProjectionService } from '../../src/modules/attendance/services/attendance-projection.service.js';
import { AttendanceReportsService } from '../../src/modules/attendance/services/attendance-reports.service.js';
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
import { MyScheduleService } from '../../src/modules/student-learning/services/my-schedule.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const PAGE = { page: 1, pageSize: 100 };
const actor = (userId: string, role = UserRole.STUDENT): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});
const DAY = 86400000;
describe.skipIf(!separateTestUrl('phase44c'))(
  'Phase4.4c attendance projections (PostgreSQL)',
  () => {
    let db: DataSource,
      f: ReturnType<typeof paymentFixture>,
      staff: AuthenticatedUser,
      teaching: TeachingReadService,
      attendance: AttendanceService,
      reports: AttendanceReportsService,
      schedule: MyScheduleService,
      operations: SessionOperationsService,
      makeup: MakeupPlacementService;
    const projections = new AttendanceProjectionService(),
      reservations = new ScheduleReservationsService();
    beforeAll(async () => {
      db = await paymentDatabase('phase44c', { entities: [AttendanceRecordEntity] });
      f = paymentFixture(db);
      staff = actor((await f.user(UserRole.MANAGER)).id, UserRole.MANAGER);
      teaching = new TeachingReadService(db, f.config, f.users, reservations);
      reports = new AttendanceReportsService(db, projections, teaching, f.enrollments, f.users);
      schedule = new MyScheduleService(db, f.config, projections, f.users);
      operations = new SessionOperationsService(
        db,
        teaching,
        f.users,
        new ClassScheduleService(f.config, reservations),
      );
      makeup = new MakeupPlacementService(db, teaching, f.users, reservations);
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
    }, 30000);
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    const stored = (id: string) => db.getRepository(ClassSessionEntity).findOneByOrFail({ id });
    function clock(at: Date) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(at);
    }
    async function regular(paid = true) {
      const a = await f.order({ paymentType: PaymentType.CASH, maxStudents: 20 });
      const classId = a.classIds[0] ?? '',
        detail = await f.read.getDetail(classId),
        s = detail.units[0]?.sessions[0];
      if (!s) throw new Error('Missing Session');
      if (paid)
        await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
      const e: { id: string }[] = await db.query(
        'SELECT id FROM enrollments WHERE class_id=$1 AND student_id=$2',
        [classId, a.student.id],
      );
      return {
        ...a,
        classId,
        detail,
        s,
        studentActor: actor(a.student.id),
        enrollmentId: e[0]?.id ?? '',
      };
    }
    type Regular = Awaited<ReturnType<typeof regular>>;
    const query = (a: Regular) => ({
      ...PAGE,
      from: new Date(a.s.startsAt.getTime() - DAY),
      to: new Date(a.s.endsAt.getTime() + DAY),
      includeCancelled: true,
      classId: a.classId,
    });
    async function start(a: Regular) {
      clock(a.s.startsAt);
      await attendance.start(
        a.s.id,
        { expectedVersion: (await stored(a.s.id)).version },
        actor(a.mentor.id, UserRole.MENTOR),
        randomUUID(),
      );
    }
    async function mark(a: Regular, status = AttendanceStatus.PRESENT) {
      await attendance.mark(
        a.s.id,
        {
          expectedVersion: (await stored(a.s.id)).version,
          records: [{ enrollmentId: a.enrollmentId, status }],
          reason: 'Recorded result',
        },
        staff,
        randomUUID(),
      );
    }
    async function finalize(a: Regular) {
      vi.setSystemTime(a.s.endsAt);
      await attendance.finalize(
        a.s.id,
        { expectedVersion: (await stored(a.s.id)).version, reason: 'Closed' },
        staff,
        randomUUID(),
      );
    }
    const summary = async (a: Regular) => {
      const own = await reports.ownSummary(a.classId, a.studentActor, {});
      const mentorReports = new MentorAttendanceReportsService(
        db,
        f.workspace,
        projections,
        f.enrollments,
        teaching,
      );
      const mentor = await mentorReports.summary(
        actor(a.mentor.id, UserRole.MENTOR),
        a.classId,
        a.student.id,
        {},
      );
      const { asOf: _ownTime, ...ownMetrics } = own;
      const {
        asOf: _mentorTime,
        readonly: _readonly,
        aggregationScope: _aggregation,
        ...mentorMetrics
      } = mentor;
      expect(mentorMetrics).toEqual(ownMetrics);
      return own;
    };

    async function guest() {
      const a = await regular();
      await operations.cancel(
        a.s.id,
        { expectedVersion: a.s.version, reason: 'Reschedule' },
        staff,
        randomUUID(),
      );
      const replacement = await operations.makeup(
        a.s.id,
        {
          expectedVersion: (await stored(a.s.id)).version,
          classUnitId: a.s.classUnitId,
          title: 'Replacement',
          startsAt: new Date(a.s.startsAt.getTime() + DAY).toISOString(),
          endsAt: new Date(a.s.endsAt.getTime() + DAY).toISOString(),
          reason: 'Replacement',
        },
        staff,
        randomUUID(),
      );
      const source = await stored(replacement.session.sessionId);
      const targetMentor = await f.user(UserRole.MENTOR),
        day = toLocalDate(new Date(source.startsAt.getTime() + 3 * DAY), teaching.timeZone());
      const c = await f.classes.create({
        courseId: a.detail.classEntity.courseId,
        mentorId: targetMentor.id,
        code: randomUUID(),
        name: 'Guest target',
        startDate: day,
        endDate: day,
        maxStudents: 10,
        deliveryMode: DeliveryMode.ONLINE,
        meetingUrl: 'https://meet.example.test/target',
      });
      const unit = c.units[0]?.unit;
      if (!unit) throw new Error('Missing unit');
      await f.classes.scheduleSession(c.classEntity.id, {
        classUnitId: unit.id,
        title: 'Equivalent lesson',
        startsAt: `${day}T08:00:00+07:00`,
        endsAt: `${day}T09:00:00+07:00`,
      });
      await f.classes.open(c.classEntity.id);
      const target = (await f.read.getDetail(c.classEntity.id)).units[0]?.sessions[0];
      if (!target) throw new Error('Missing target');
      const conflicts: { id: string; version: number }[] = await db.query(
        `INSERT INTO student_schedule_conflicts(enrollment_id,source_session_id)
      VALUES($1,$2) RETURNING id,version`,
        [a.enrollmentId, source.id],
      );
      const conflict = conflicts[0];
      if (!conflict) throw new Error('Missing conflict');
      const placed = await makeup.create(
        conflict.id,
        {
          targetSessionId: target.id,
          expectedVersion: conflict.version,
          expectedTargetVersion: target.version,
          contentMatchConfirmed: true,
          reason: 'Confirmed equivalent',
        },
        staff,
        randomUUID(),
      );
      return {
        ...a,
        source,
        target,
        targetClassId: c.classEntity.id,
        targetMentor,
        placement: placed.placement,
        conflict,
      };
    }
    type Guest = Awaited<ReturnType<typeof guest>>;
    async function closeGuest(a: Guest, status = AttendanceStatus.PRESENT) {
      clock(a.target.startsAt);
      await attendance.start(
        a.target.id,
        { expectedVersion: (await stored(a.target.id)).version },
        actor(a.targetMentor.id, UserRole.MENTOR),
        randomUUID(),
      );
      await attendance.mark(
        a.target.id,
        {
          expectedVersion: (await stored(a.target.id)).version,
          records: [],
          guestRecords: [{ makeupPlacementId: a.placement.id, status }],
          reason: 'Guest present',
        },
        staff,
        randomUUID(),
      );
      vi.setSystemTime(a.target.endsAt);
      await attendance.finalize(
        a.target.id,
        { expectedVersion: (await stored(a.target.id)).version, reason: 'Guest finalized' },
        staff,
        randomUUID(),
      );
    }

    it('separates scheduled, unmarked, physical PRESENT and finalized credit', async () => {
      const a = await regular();
      expect(await summary(a)).toMatchObject({ present: 0, absent: 0, excluded: 1, rate: null });
      expect((await schedule.list(a.student.id, query(a))).items[0]).toMatchObject({
        attendanceApplicability: 'NOT_STARTED',
        attendanceStatus: null,
        attendanceExcluded: true,
      });
      await start(a);
      expect(await summary(a)).toMatchObject({ unmarked: 1, finalizedEligibleCount: 0 });
      await mark(a);
      expect((await schedule.list(a.student.id, query(a))).items[0]).toMatchObject({
        attendanceStatus: 'PRESENT',
        creditedAttendanceStatus: null,
      });
      expect(await summary(a)).toMatchObject({ present: 0, finalizedEligibleCount: 0 });
      await finalize(a);
      expect(await summary(a)).toMatchObject({
        present: 1,
        absent: 0,
        finalizedEligibleCount: 1,
        rate: 100,
      });
    });

    it('uses per-session override/snapshot and leaves legacy mentor unknown', async () => {
      const a = await regular(),
        sub = await f.user(UserRole.MENTOR);
      await new TeachingAssignmentService(
        db,
        f.users,
        teaching,
        new MentorConflictService(),
      ).assignSession(
        a.s.id,
        { mentorId: sub.id, expectedVersion: a.s.version, reason: 'Substitute' },
        staff,
        randomUUID(),
      );
      expect((await schedule.list(a.student.id, query(a))).items[0]).toMatchObject({
        mentorId: sub.id,
        assignmentType: 'SUBSTITUTE',
      });
      await db.query(
        "UPDATE class_sessions SET status='COMPLETED',teaching_mentor_id=NULL WHERE id=$1",
        [a.s.id],
      );
      expect((await schedule.list(a.student.id, query(a))).items[0]).toMatchObject({
        mentorId: null,
        attendanceApplicability: 'LEGACY_NO_DATA',
      });
    });

    it('masks live CASH preview and excludes expired CASH and pending PayOS timetable', async () => {
      const a = await regular(false);
      expect((await schedule.list(a.student.id, query(a))).items[0]).toMatchObject({
        accessMode: 'CASH_PREVIEW',
        attendanceStatus: null,
        creditedAttendanceStatus: null,
        attendanceApplicability: 'PAYMENT_PENDING',
      });
      expect(
        (
          await schedule.list(
            a.student.id,
            { ...query(a), classId: undefined },
            new Date(a.order.expiresAt.getTime() + 1),
          )
        ).total,
      ).toBe(0);
      const p = await f.order({ paymentType: PaymentType.PAYOS });
      const ps = (await f.read.getDetail(p.classIds[0] ?? '')).units[0]?.sessions[0];
      if (!ps) throw new Error('Missing pending PayOS timetable');
      expect(
        (
          await schedule.list(p.student.id, {
            ...query(a),
            classId: undefined,
            from: ps.startsAt,
            to: ps.endsAt,
          })
        ).items,
      ).toEqual([]);
    });

    it('keeps canceled physical PRESENT but never counts it as finalized absence or credit', async () => {
      const a = await regular();
      await start(a);
      await mark(a);
      await operations.cancel(
        a.s.id,
        { expectedVersion: (await stored(a.s.id)).version, reason: 'Canceled after start' },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({ present: 0, absent: 0, excluded: 1, rate: null });
      expect((await reports.history(a.classId, a.studentActor, PAGE)).items[0]).toMatchObject({
        attendanceStatus: 'PRESENT',
        excluded: true,
        creditedAttendanceStatus: null,
        sessionStatus: 'CANCELLED',
      });
    });

    it('exposes only own terminal metadata and rejects guessed or guest-only receiving Class history', async () => {
      const a = await regular();
      await start(a);
      await finalize(a);
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [a.enrollmentId]);
      expect(await summary(a)).toMatchObject({ absent: 1, rate: 0 });
      expect((await reports.history(a.classId, a.studentActor, PAGE)).total).toBe(1);
      await expect(
        reports.history(a.classId, actor((await f.user()).id), PAGE),
      ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_HISTORY_NOT_FOUND' } });
      await expect(reports.history(randomUUID(), a.studentActor, PAGE)).rejects.toBeDefined();
      await expect(reports.classSummary(a.classId, a.studentActor, PAGE)).rejects.toBeDefined();
    });

    it('retains no-data for partial legacy recovery and distinguishes provable late PayOS eligibility', async () => {
      const a = await regular();
      await db.query(
        "UPDATE class_sessions SET status='COMPLETED',actual_started_at=starts_at,actual_ended_at=ends_at WHERE id=$1",
        [a.s.id],
      );
      expect((await reports.history(a.classId, a.studentActor, PAGE)).items[0]).toMatchObject({
        attendanceStatus: null,
        attendanceApplicability: 'LEGACY_NO_DATA',
      });
      expect(await summary(a)).toMatchObject({ present: 0, absent: 0, excluded: 1 });
      await db.query("UPDATE orders SET payment_type='PAYOS',cash_mentor_id=NULL WHERE id=$1", [
        a.order.id,
      ]);
      await db.query('UPDATE enrollments SET enrolled_at=$2 WHERE id=$1', [
        a.enrollmentId,
        new Date(a.s.startsAt.getTime() + 1000),
      ]);
      expect(
        (await reports.history(a.classId, a.studentActor, PAGE)).items[0]?.attendanceApplicability,
      ).toBe('NOT_ELIGIBLE');
      // Persisted evidence is authoritative even if current entitlement later changes.
      await db.getRepository(AttendanceRecordEntity).insert({
        classId: a.classId,
        sessionId: a.s.id,
        enrollmentId: a.enrollmentId,
        status: AttendanceStatus.PRESENT,
        recordedBy: staff.userId,
        admittedAt: new Date(),
        admissionSource: 'EVIDENCE_RECOVERY',
        checkedInAt: null,
      });
      expect(await summary(a)).toMatchObject({ present: 1, rate: 100 });
    });

    it('resolves multi-step replacement before range filtering and counts one obligation', async () => {
      const a = await guest();
      await makeup.cancel(
        a.placement.id,
        { expectedVersion: a.placement.version, reason: 'Release for chain fixture' },
        staff,
        randomUUID(),
      );
      await db.query("UPDATE student_schedule_conflicts SET status='RESOLVED' WHERE id=$1", [
        a.conflict.id,
      ]);
      await operations.cancel(
        a.source.id,
        { expectedVersion: (await stored(a.source.id)).version, reason: 'Another date' },
        staff,
        randomUUID(),
      );
      const next = await operations.makeup(
        a.source.id,
        {
          expectedVersion: (await stored(a.source.id)).version,
          classUnitId: a.source.classUnitId,
          title: 'Third in chain',
          startsAt: new Date(a.source.startsAt.getTime() + DAY).toISOString(),
          endsAt: new Date(a.source.endsAt.getTime() + DAY).toISOString(),
          reason: 'Third date',
        },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({ excluded: 1, makeupPending: 0 });
      expect(
        (await reports.history(a.classId, a.studentActor, { page: 1, pageSize: 1 })).total,
      ).toBe(3);
      const oldRange = {
        from: new Date(a.s.startsAt.getTime() - 1).toISOString(),
        to: a.s.endsAt.toISOString(),
      };
      expect(await reports.ownSummary(a.classId, a.studentActor, oldRange)).toMatchObject({
        excluded: 0,
      });
      expect(
        await reports.ownSummary(a.classId, a.studentActor, {
          from: next.session.startsAt.toISOString(),
          to: next.session.endsAt.toISOString(),
        }),
      ).toMatchObject({ excluded: 1 });
    });

    it('keeps OPEN/ASSIGNED/reassigned/canceled placement obligations pending exactly once', async () => {
      const a = await guest();
      expect(await summary(a)).toMatchObject({ makeupPending: 1, excluded: 0, rate: null });
      await makeup.cancel(
        a.placement.id,
        { expectedVersion: a.placement.version, reason: 'Need a different target' },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({ makeupPending: 1, finalizedEligibleCount: 0 });
      await expect(
        schedule.list(a.student.id, {
          ...query(a),
          classId: a.targetClassId,
          from: a.target.startsAt,
          to: a.target.endsAt,
        }),
      ).rejects.toBeDefined();
    });

    it('shows own guest in physical target filter, deduplicates a later regular enrollment before page/count', async () => {
      const a = await guest();
      const q = {
        ...query(a),
        classId: a.targetClassId,
        from: a.target.startsAt,
        to: a.target.endsAt,
        pageSize: 1,
      };
      expect(await schedule.list(a.student.id, q)).toMatchObject({
        total: 1,
        items: [
          {
            accessMode: 'SESSION_MAKEUP',
            sourceClassId: a.classId,
            enrollmentId: a.enrollmentId,
            makeupPlacementId: a.placement.id,
          },
        ],
      });
      await expect(reports.history(a.targetClassId, a.studentActor, PAGE)).rejects.toBeDefined();
      await f.cart.addItem(a.student.id, a.targetClassId);
      await f.checkout.checkout(a.student.id, PaymentType.CASH);
      expect(await schedule.list(a.student.id, q)).toMatchObject({
        total: 1,
        items: [{ accessMode: 'CASH_PREVIEW' }],
      });
      expect((await schedule.list(a.student.id, { ...q, page: 2 })).items).toEqual([]);
    });

    it('credits finalized guest at source once with target outside the reporting range, without growing receiving Class totals', async () => {
      const a = await guest();
      await closeGuest(a);
      expect(await summary(a)).toMatchObject({
        present: 1,
        absent: 0,
        makeupPending: 0,
        finalizedEligibleCount: 1,
        rate: 100,
      });
      const sourceRange = {
        from: a.source.startsAt.toISOString(),
        to: a.source.endsAt.toISOString(),
      };
      expect(await reports.ownSummary(a.classId, a.studentActor, sourceRange)).toMatchObject({
        present: 1,
      });
      expect(
        await reports.ownSummary(a.classId, a.studentActor, {
          from: a.target.startsAt.toISOString(),
          to: a.target.endsAt.toISOString(),
        }),
      ).toMatchObject({ present: 0 });
      expect((await reports.classSummary(a.targetClassId, staff, PAGE)).total).toBe(0);
      const h = await reports.history(a.classId, a.studentActor, PAGE);
      expect(h.items.find((r) => r.sessionId === a.source.id)).toMatchObject({
        attendanceStatus: null,
        creditedAttendanceStatus: 'PRESENT',
        creditSessionId: a.target.id,
        attendanceApplicability: 'MAKEUP_CREDITED',
      });
      expect(h.items.find((r) => r.sessionId === a.s.id)).toMatchObject({
        creditedAttendanceStatus: null,
        excluded: true,
      });
    });

    it('guest correction changes source credit; placement cancellation revokes it and later physical correction cannot restore credit', async () => {
      const a = await guest();
      await closeGuest(a);
      await attendance.mark(
        a.target.id,
        {
          expectedVersion: (await stored(a.target.id)).version,
          records: [],
          guestRecords: [{ makeupPlacementId: a.placement.id, status: AttendanceStatus.ABSENT }],
          reason: 'Correction',
        },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({ present: 0, absent: 1, rate: 0 });
      const p = (await makeup.own(a.studentActor, PAGE)).items.find((p) => p.id === a.placement.id);
      if (!p) throw new Error('Missing placement');
      await makeup.cancel(
        p.id,
        { expectedVersion: p.version, reason: 'Credit revoked' },
        staff,
        randomUUID(),
      );
      await attendance.mark(
        a.target.id,
        {
          expectedVersion: (await stored(a.target.id)).version,
          records: [],
          guestRecords: [{ makeupPlacementId: p.id, status: AttendanceStatus.PRESENT }],
          reason: 'Physical correction only',
        },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({
        present: 0,
        absent: 0,
        makeupPending: 1,
        rate: null,
      });
    });

    it('target cancel/no eligible guest snapshot queues reassignment instead of fake ABSENT', async () => {
      const a = await guest();
      await operations.cancel(
        a.target.id,
        { expectedVersion: (await stored(a.target.id)).version, reason: 'Target canceled' },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({ makeupPending: 1, absent: 0 });
      await expect(
        schedule.list(a.student.id, {
          ...query(a),
          classId: a.targetClassId,
          from: a.target.startsAt,
          to: a.target.endsAt,
        }),
      ).rejects.toBeDefined();
    });

    it('keeps Student/management totals identical after re-enrollment instead of counting the same root twice', async () => {
      const a = await regular();
      await start(a);
      await mark(a);
      await finalize(a);
      vi.useRealTimers();
      await db.query("UPDATE classes SET status='OPEN' WHERE id=$1", [a.classId]);
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [a.enrollmentId]);
      await f.cart.addItem(a.student.id, a.classId);
      const checked = await f.checkout.checkout(a.student.id, PaymentType.CASH);
      const order = checked[0]?.order;
      if (!order) throw new Error('Missing rebuy');
      await f.cash.confirm((await f.user(UserRole.MANAGER)).id, order.id, order.totalAmount);
      expect(await summary(a)).toMatchObject({ present: 1, finalizedEligibleCount: 1 });
      const rows = await reports.classSummary(a.classId, staff, PAGE);
      expect(rows.total).toBe(2);
      expect(rows.items.reduce((n, r) => n + r.present, 0)).toBe(1);
      expect(rows.items.reduce((n, r) => n + r.excluded, 0)).toBe(0);
      expect((await reports.history(a.classId, a.studentActor, PAGE)).total).toBe(2);
      // Legacy/recovery can contain two physical results; latest evidenced enrollment owns credit.
      const latest: { id: string }[] = await db.query(
        'SELECT id FROM enrollments WHERE order_detail_id=$1',
        [checked[0]?.details[0]?.id],
      );
      const latestId = latest[0]?.id;
      if (!latestId) throw new Error('Missing new enrollment');
      await db.getRepository(AttendanceRecordEntity).insert({
        classId: a.classId,
        sessionId: a.s.id,
        enrollmentId: latestId,
        status: AttendanceStatus.ABSENT,
        recordedBy: staff.userId,
        admittedAt: new Date(),
        admissionSource: 'EVIDENCE_RECOVERY',
        checkedInAt: null,
      });
      expect(await summary(a)).toMatchObject({
        present: 0,
        absent: 1,
        finalizedEligibleCount: 1,
        rate: 0,
      });
      const both = await reports.classSummary(a.classId, staff, PAGE);
      expect(both.items.reduce((n, r) => n + r.finalizedEligibleCount, 0)).toBe(1);
      expect(
        (await reports.history(a.classId, a.studentActor, PAGE)).items.filter(
          (i) => i.creditedAttendanceStatus !== null,
        ),
      ).toHaveLength(1);
    });

    it('returns the entire overdue backlog with exact end boundary, nullable deadline, terminal exclusions and stable pages', async () => {
      const a = await regular(),
        b = await regular();
      await start(b);
      const at = new Date(Math.max(a.s.endsAt.getTime(), b.s.endsAt.getTime()) + 100 * DAY);
      const all = await reports.incomplete(staff, PAGE, at);
      expect(all.items.find((i) => i.session.sessionId === a.s.id)).toMatchObject({
        issue: 'OVERDUE_NOT_STARTED',
        deadlineExpired: null,
      });
      expect(all.items.find((i) => i.session.sessionId === b.s.id)).toMatchObject({
        issue: 'STARTED_NOT_FINALIZED',
        deadlineExpired: true,
      });
      const deadline = (await stored(b.s.id)).editableUntil;
      if (!deadline) throw new Error('Missing deadline');
      expect(
        (
          await reports.incomplete(
            staff,
            { ...PAGE, classId: b.classId },
            new Date(deadline.getTime() - 1),
          )
        ).items[0]?.deadlineExpired,
      ).toBe(false);
      expect(
        (await reports.incomplete(staff, { ...PAGE, classId: b.classId }, deadline)).items[0]
          ?.deadlineExpired,
      ).toBe(true);
      expect(
        (
          await reports.incomplete(
            staff,
            { ...PAGE, classId: b.classId, issue: 'OVERDUE_NOT_STARTED' },
            at,
          )
        ).total,
      ).toBe(0);
      expect(
        (await reports.incomplete(staff, { ...PAGE, classId: a.classId }, a.s.endsAt)).total,
      ).toBe(1);
      expect(
        (
          await reports.incomplete(
            staff,
            { ...PAGE, classId: a.classId },
            new Date(a.s.endsAt.getTime() - 1),
          )
        ).total,
      ).toBe(0);
      const first = await reports.incomplete(staff, { page: 1, pageSize: 1 }, at),
        second = await reports.incomplete(staff, { page: 2, pageSize: 1 }, at);
      expect(first.total).toBe(second.total);
      expect(first.items[0]?.session.sessionId).not.toBe(second.items[0]?.session.sessionId);
      await db.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [a.classId]);
      expect((await reports.incomplete(staff, { ...PAGE, classId: a.classId }, at)).total).toBe(0);
    });

    it('reads one consistent snapshot when finalize commits between authorization and projection; GET adds no audits', async () => {
      const a = await regular();
      await start(a);
      await mark(a);
      const original = projections.timetable.bind(projections);
      vi.spyOn(projections, 'timetable').mockImplementationOnce(async (m, ...args) => {
        await finalize(a);
        return original(m, ...args);
      });
      const prior = await schedule.list(a.student.id, query(a));
      expect(prior.items[0]).toMatchObject({
        sessionStatus: 'IN_PROGRESS',
        creditedAttendanceStatus: null,
      });
      expect((await schedule.list(a.student.id, query(a))).items[0]).toMatchObject({
        sessionStatus: 'COMPLETED',
        creditedAttendanceStatus: 'PRESENT',
      });
      const before = await db.query('SELECT count(*) FROM attendance_audits');
      await reports.history(a.classId, a.studentActor, { page: 1, pageSize: 1 });
      await summary(a);
      await reports.classSummary(a.classId, staff, PAGE);
      expect(await db.query('SELECT count(*) FROM attendance_audits')).toEqual(before);
    });

    it('validates paired/range limits and current principal even when services are invoked directly', async () => {
      const a = await regular();
      for (const q of [
        { from: a.s.startsAt.toISOString() },
        { from: a.s.endsAt.toISOString(), to: a.s.startsAt.toISOString() },
        {
          from: a.s.startsAt.toISOString(),
          to: new Date(a.s.startsAt.getTime() + 94 * DAY).toISOString(),
        },
      ])
        await expect(reports.ownSummary(a.classId, a.studentActor, q)).rejects.toBeDefined();
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [a.student.id]);
      await expect(summary(a)).rejects.toBeDefined();
      await expect(schedule.list(a.student.id, query(a))).rejects.toBeDefined();
    });

    it('does not invent absence when target finalizes without an eligible guest snapshot', async () => {
      const a = await guest();
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [a.enrollmentId]);
      clock(a.target.startsAt);
      await attendance.start(
        a.target.id,
        { expectedVersion: (await stored(a.target.id)).version },
        actor(a.targetMentor.id, UserRole.MENTOR),
        randomUUID(),
      );
      vi.setSystemTime(a.target.endsAt);
      await attendance.finalize(
        a.target.id,
        { expectedVersion: (await stored(a.target.id)).version, reason: 'No snapshot' },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({ makeupPending: 1, absent: 0, rate: null });
      expect(
        (await makeup.own(a.studentActor, PAGE)).items.find((p) => p.id === a.placement.id),
      ).toMatchObject({ status: 'NEEDS_REASSIGNMENT', attendanceStatus: null });
    });

    it('counts late CASH only after a persisted admission and never infers absent from the missing row', async () => {
      const a = await regular(false);
      // The checkout hold was live at start; real CASH confirmation is allowed later.
      await db.query('UPDATE orders SET expires_at=$2 WHERE id=$1', [
        a.order.id,
        new Date(a.s.endsAt.getTime() + DAY),
      ]);
      await start(a);
      vi.setSystemTime(new Date(a.s.startsAt.getTime() + 1000));
      await f.cash.confirm((await f.user(UserRole.MANAGER)).id, a.order.id, a.order.totalAmount);
      expect(await summary(a)).toMatchObject({ absent: 0, finalizedEligibleCount: 0 });
      await attendance.syncRoster(
        a.s.id,
        { expectedVersion: (await stored(a.s.id)).version, reason: 'Late CASH admission' },
        staff,
        randomUUID(),
      );
      expect(await summary(a)).toMatchObject({ unmarked: 1 });
      await finalize(a);
      expect(await summary(a)).toMatchObject({ absent: 1, finalizedEligibleCount: 1 });
    });

    it('rounds one of three credited lessons to 33.33 and ignores history pagination when summarizing', async () => {
      const a = await regular();
      const day = toLocalDate(a.s.startsAt, teaching.timeZone());
      for (const hour of ['10', '12'])
        await f.classes.scheduleSession(a.classId, {
          classUnitId: a.s.classUnitId,
          title: 'Another lesson',
          startsAt: `${day}T${hour}:00:00+07:00`,
          endsAt: `${day}T${Number(hour) + 1}:00:00+07:00`,
        });
      const sessions = await db
        .getRepository(ClassSessionEntity)
        .find({ where: { classUnitId: a.s.classUnitId }, order: { startsAt: 'ASC' } });
      for (const [i, s] of sessions.entries()) {
        const current = { ...a, s };
        await start(current);
        if (i === 0) await mark(current);
        await finalize(current);
      }
      expect(await summary(a)).toMatchObject({
        present: 1,
        absent: 2,
        finalizedEligibleCount: 3,
        rate: 33.33,
      });
      expect(
        (await reports.history(a.classId, a.studentActor, { page: 2, pageSize: 1 })).total,
      ).toBe(3);
      expect(await summary(a)).toMatchObject({ present: 1, rate: 33.33 });
    });

    it('aggregates a multi-Class fixture in PostgreSQL with bounded queries and records EXPLAIN evidence', async () => {
      const fixtures: Regular[] = [];
      for (let n = 0; n < 3; n++) {
        const a = await regular();
        fixtures.push(a);
        await db.query('UPDATE classes SET end_date=$2 WHERE id=$1', [
          a.classId,
          toLocalDate(new Date(a.s.endsAt.getTime() + 40 * DAY), teaching.timeZone()),
        ]);
        await db.query(
          `INSERT INTO class_sessions(class_unit_id,session_number,title,starts_at,ends_at)
          SELECT s.class_unit_id,s.session_number+n,'Scale lesson '||n,s.starts_at+n*interval '1 day',s.ends_at+n*interval '1 day'
          FROM class_sessions s CROSS JOIN generate_series(1,39) n WHERE s.id=$1`,
          [a.s.id],
        );
        for (let j = 0; j < 7; j++) {
          const student = await f.user();
          await f.cart.addItem(student.id, a.classId);
          const orders = await f.checkout.checkout(student.id, PaymentType.CASH),
            o = orders[0]?.order;
          if (!o) throw new Error('Missing scale order');
          await f.cash.confirm((await f.user(UserRole.MANAGER)).id, o.id, o.totalAmount);
        }
      }
      const a = fixtures[0];
      if (!a) throw new Error('Missing scale class');
      const log = vi.spyOn(db.logger, 'logQuery');
      await reports.classSummary(a.classId, staff, { page: 1, pageSize: 1 });
      const small = log.mock.calls.length;
      log.mockClear();
      await reports.classSummary(a.classId, staff, PAGE);
      expect(log.mock.calls.length).toBe(small);
      expect(small).toBeLessThan(12);
      const plan = await db.query(
        `EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${ATTENDANCE_CREDIT_CTE} SELECT count(*) FROM credit`,
        [fixtures.map((f) => f.classId), null],
      );
      expect(plan[0]?.['QUERY PLAN']?.[0]?.['Execution Time']).toBeTypeOf('number');
      console.info(
        'Phase4.4c query evidence',
        JSON.stringify({
          classes: 3,
          enrollments: 24,
          sessions: 120,
          obligations: 960,
          queriesPerSummary: small,
          executionMs: plan[0]?.['QUERY PLAN']?.[0]?.['Execution Time'],
        }),
      );
    }, 30000);
  },
);
