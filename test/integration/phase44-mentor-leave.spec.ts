import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MentorLeave1792195200000 } from '../../src/database/migrations/1792195200000-mentor-leave.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { toLocalDate } from '../../src/modules/classes/domain/class-calendar.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { DeliveryMode } from '../../src/modules/classes/enums/delivery-mode.enum.js';
import { ClassScheduleService } from '../../src/modules/classes/services/class-schedule.service.js';
import { MentorConflictService } from '../../src/modules/classes/services/mentor-conflict.service.js';
import { TeachingAssignmentService } from '../../src/modules/classes/services/teaching-assignment.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { shiftDate } from '../../src/modules/teaching-operations/domain/leave-calendar.js';
import type {
  CreateLeaveInput,
  LeaveApprovalDto,
} from '../../src/modules/teaching-operations/dtos/leave.dto.js';
import { LeavePlanningService } from '../../src/modules/teaching-operations/services/leave-planning.service.js';
import { MentorLeaveService } from '../../src/modules/teaching-operations/services/mentor-leave.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const actor = (userId: string, role: UserRole): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});
describe.skipIf(!separateTestUrl('leave'))('Phase4.4 mentor leave PostgreSQL', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    leaves: MentorLeaveService,
    read: TeachingReadService,
    schedule: ClassScheduleService,
    staff: AuthenticatedUser;
  beforeAll(async () => {
    db = await paymentDatabase('leave');
    f = paymentFixture(db);
    const reservations = new ScheduleReservationsService(),
      conflicts = new MentorConflictService();
    read = new TeachingReadService(db, f.config, f.users, reservations);
    schedule = new ClassScheduleService(f.config, reservations, conflicts);
    leaves = new MentorLeaveService(
      db,
      read,
      schedule,
      conflicts,
      reservations,
      f.users,
      new LeavePlanningService(),
    );
    staff = actor((await f.user(UserRole.MANAGER)).id, UserRole.MANAGER);
  }, 30000);
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function fixture() {
    const a = await f.order({ maxStudents: 10, paymentType: PaymentType.CASH });
    const classId = a.classIds[0];
    if (!classId) throw new Error('Missing class');
    const c = await read.loadClass(db.manager, classId);
    const detail = await f.read.getDetail(classId),
      s = detail.units[0]?.sessions[0];
    if (!s) throw new Error('Missing session');
    const mentor = actor(a.mentor.id, UserRole.MENTOR),
      date = toLocalDate(s.startsAt, read.timeZone());
    const preview = await leaves.preview(
      { fromDate: date, toDate: date, period: 'FULL_DAY' },
      mentor,
    );
    const input: CreateLeaveInput = {
      fromDate: date,
      toDate: date,
      period: 'FULL_DAY',
      reason: 'Personal leave',
      sourceVersions: preview.sourceVersions,
      dayMappings: [{ sourceDate: date, targetDate: shiftDate(date, 1) }],
    };
    return { ...a, c, s, mentor, date, input };
  }
  async function approve(id: string, ack = true) {
    return leaves.mutate(
      id,
      'approve',
      { expectedVersion: 1, reason: 'Approved leave', acknowledgeStudentConflicts: ack },
      staff,
      randomUUID(),
    ) as Promise<LeaveApprovalDto>;
  }
  async function row(id: string) {
    const rows = await db.query('SELECT * FROM mentor_leave_requests WHERE id=$1', [id]);
    return rows[0];
  }

  it('rehearses migration down/up and retains leave history across the UTC/local date boundary', async () => {
    await rehearseMigration(db, new MentorLeave1792195200000(), 'down');
    await rehearseMigration(db, new MentorLeave1792195200000(), 'up');
    vi.useFakeTimers({ toFake: ['Date'] });
    // Reproduce CI at 00:15 in Vietnam, when the UTC calendar is one day behind.
    vi.setSystemTime(new Date(`${toLocalDate(new Date(), read.timeZone())}T00:15:00+07:00`));
    const a = await fixture();
    await leaves.create(a.input, a.mentor, randomUUID());
    await expect(rehearseMigration(db, new MentorLeave1792195200000(), 'down')).rejects.toThrow(
      'Leave history exists',
    );
  });
  it('creates pending without changing schedules; approval atomically replaces source, extends class and is idempotent', async () => {
    const a = await fixture(),
      key = randomUUID();
    const request = await leaves.create(a.input, a.mentor, key);
    expect(request).toMatchObject({ status: 'PENDING', version: 1, itemCount: 1 });
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: a.s.id })).status,
    ).toBe('SCHEDULED');
    const replay = await leaves.create(JSON.parse(JSON.stringify(a.input)), a.mentor, key);
    expect(replay.id).toBe(request.id);
    const approvalKey = randomUUID(),
      input = { expectedVersion: 1, reason: 'Approved leave', acknowledgeStudentConflicts: true };
    const result = (await leaves.mutate(
      request.id,
      'approve',
      input,
      staff,
      approvalKey,
    )) as LeaveApprovalDto;
    expect(result.request).toMatchObject({ status: 'APPROVED', version: 2 });
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0]).toMatchObject({
      makeupForSessionId: a.s.id,
      effectiveMentor: { id: a.mentor.userId },
    });
    expect((await read.loadClass(db.manager, a.c.id)).endDate).toBe(shiftDate(a.date, 1));
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: a.s.id })).status,
    ).toBe('CANCELLED');
    expect(await leaves.mutate(request.id, 'approve', input, staff, approvalKey)).toEqual(
      JSON.parse(JSON.stringify(result)),
    );
    expect(
      await db.query('SELECT * FROM mentor_approved_leave_intervals WHERE request_id=$1', [
        request.id,
      ]),
    ).toHaveLength(1);
    expect(
      await db.query('SELECT * FROM mentor_leave_audits WHERE request_id=$1', [request.id]),
    ).toHaveLength(2);
    await expect(
      leaves.mutate(request.id, 'approve', { ...input, reason: 'Different' }, staff, approvalKey),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });
  it('uses two calendar days, not 48 hours; rejects the next calendar day', async () => {
    const a = await fixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${shiftDate(a.date, -2)}T23:00:00+07:00`));
    expect((await leaves.preview(a.input, a.mentor)).noticeEligible).toBe(true);
    await leaves.create(a.input, a.mentor, randomUUID());
    vi.setSystemTime(new Date(`${shiftDate(a.date, -1)}T00:00:00+07:00`));
    await expect(leaves.create(a.input, a.mentor, randomUUID())).rejects.toMatchObject({
      response: { code: 'LEAVE_NOTICE_TOO_SHORT' },
    });
  });
  it('rejects missing or stale source versions and leaves pending approval unchanged', async () => {
    const a = await fixture();
    await expect(
      leaves.create({ ...a.input, sourceVersions: [] }, a.mentor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'LEAVE_REQUEST_STALE' } });
    const request = await leaves.create(a.input, a.mentor, randomUUID());
    await db.query('UPDATE class_sessions SET version=version+1 WHERE id=$1', [a.s.id]);
    await expect(approve(request.id)).rejects.toMatchObject({
      response: { code: 'LEAVE_REQUEST_STALE' },
    });
    expect((await row(request.id)).status).toBe('PENDING');
    expect(
      await db.query('SELECT * FROM mentor_approved_leave_intervals WHERE request_id=$1', [
        request.id,
      ]),
    ).toHaveLength(0);
  });
  it('detects newly added affected sessions instead of approving a subset', async () => {
    const a = await fixture(),
      request = await leaves.create(a.input, a.mentor, randomUUID());
    await f.classes.scheduleSession(a.c.id, {
      classUnitId: a.s.classUnitId,
      title: 'New session',
      startsAt: `${a.date}T10:00:00+07:00`,
      endsAt: `${a.date}T11:00:00+07:00`,
    });
    await expect(approve(request.id)).rejects.toMatchObject({
      response: { code: 'LEAVE_REQUEST_STALE' },
    });
  });
  it('enforces ownership, active role, withdrawal and rejection terminal transitions', async () => {
    const a = await fixture(),
      request = await leaves.create(a.input, a.mentor, randomUUID());
    const other = actor((await f.user(UserRole.MENTOR)).id, UserRole.MENTOR);
    await expect(leaves.detail(request.id, { page: 1, pageSize: 20 }, other)).rejects.toMatchObject(
      { response: { code: 'LEAVE_NOT_FOUND' } },
    );
    await expect(
      leaves.mutate(
        request.id,
        'approve',
        { expectedVersion: 1, reason: 'No' },
        a.mentor,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'LEAVE_FORBIDDEN' } });
    const withdrawn = await leaves.mutate(
      request.id,
      'withdraw',
      { expectedVersion: 1, reason: 'Withdraw leave' },
      a.mentor,
      randomUUID(),
    );
    expect(withdrawn).toMatchObject({ status: 'WITHDRAWN' });
    await expect(approve(request.id)).rejects.toMatchObject({
      response: { code: 'LEAVE_STATE_CONFLICT' },
    });
    const another = await leaves.create(a.input, a.mentor, randomUUID());
    expect(
      await leaves.mutate(
        another.id,
        'reject',
        { expectedVersion: 1, reason: 'Cannot approve' },
        staff,
        randomUUID(),
      ),
    ).toMatchObject({ status: 'REJECTED' });
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: a.s.id })).status,
    ).toBe('SCHEDULED');
  });
  it('GET projects EXPIRED without writes; command persists expiration and an audit despite 409', async () => {
    const a = await fixture(),
      request = await leaves.create(a.input, a.mentor, randomUUID());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(a.s.startsAt);
    expect(await leaves.detail(request.id, { page: 1, pageSize: 20 }, a.mentor)).toMatchObject({
      status: 'EXPIRED',
      version: 1,
    });
    expect((await row(request.id)).status).toBe('PENDING');
    expect(
      (await leaves.list({ page: 1, pageSize: 100, status: 'EXPIRED' }, a.mentor)).items.map(
        (i) => i.id,
      ),
    ).toContain(request.id);
    await expect(approve(request.id)).rejects.toMatchObject({
      response: { code: 'LEAVE_REQUEST_EXPIRED' },
    });
    expect(await row(request.id)).toMatchObject({ status: 'EXPIRED', version: 2 });
    expect(
      await db.query('SELECT * FROM mentor_leave_audits WHERE request_id=$1', [request.id]),
    ).toHaveLength(2);
  });
  it('blocks targets in requested/approved leave and preserves the target period and duration', async () => {
    const a = await fixture();
    await expect(
      leaves.create(
        { ...a.input, dayMappings: [{ sourceDate: a.date, targetDate: a.date }] },
        a.mentor,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'LEAVE_TARGET_CONFLICT' } });
    const preview = await leaves.preview({ ...a.input, period: 'MORNING' }, a.mentor);
    const input: CreateLeaveInput = {
      ...a.input,
      period: 'MORNING',
      dayMappings: undefined,
      sourceVersions: preview.sourceVersions,
      sessionMappings: [
        {
          sourceSessionId: a.s.id,
          targetDate: shiftDate(a.date, 1),
          targetPeriod: 'AFTERNOON',
          startsAt: `${shiftDate(a.date, 1)}T11:30:00+07:00`,
          endsAt: `${shiftDate(a.date, 1)}T12:30:00+07:00`,
        },
      ],
    };
    await expect(leaves.create(input, a.mentor, randomUUID())).rejects.toMatchObject({
      response: { code: 'LEAVE_MAPPING_INVALID' },
    });
    const request = await leaves.create(a.input, a.mentor, randomUUID());
    await approve(request.id);
    expect(
      await new MentorConflictService().hasConflict(db.manager, {
        sessionId: randomUUID(),
        mentorId: a.mentor.userId,
        startsAt: a.s.startsAt,
        endsAt: a.s.endsAt,
      }),
    ).toBe(true);
    await expect(
      f.classes.scheduleSession(a.c.id, {
        classUnitId: a.s.classUnitId,
        title: 'Leave slot',
        startsAt: a.s.startsAt.toISOString(),
        endsAt: a.s.endsAt.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'CLASS_MENTOR_SCHEDULE_CONFLICT' } });
  });
  it('serializes concurrent approvals and rolls back a failed whole batch', async () => {
    const a = await fixture(),
      request = await leaves.create(a.input, a.mentor, randomUUID());
    const results = await Promise.allSettled([approve(request.id), approve(request.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.query('SELECT * FROM class_sessions WHERE makeup_for_session_id=$1', [a.s.id]),
    ).toHaveLength(1);
    const b = await fixture(),
      pending = await leaves.create(b.input, b.mentor, randomUUID());
    const fault = vi
      .spyOn(schedule, 'audit')
      .mockRejectedValueOnce(new Error('Injected audit failure'));
    await expect(approve(pending.id)).rejects.toThrow('Injected audit failure');
    fault.mockRestore();
    expect((await row(pending.id)).status).toBe('PENDING');
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: b.s.id })).status,
    ).toBe('SCHEDULED');
    expect(
      await db.query('SELECT * FROM class_sessions WHERE makeup_for_session_id=$1', [b.s.id]),
    ).toHaveLength(0);
  });
  it('candidate discovery and class/session reassignment exclude approved leave', async () => {
    const a = await fixture(),
      request = await leaves.create(a.input, a.mentor, randomUUID());
    await approve(request.id);
    const b = await fixture();
    await db.query('UPDATE classes SET start_date=$2,end_date=$2 WHERE id=$1', [b.c.id, a.date]);
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      b.s.id,
      a.s.startsAt,
      a.s.endsAt,
    ]);
    const candidates = await read.sessionCandidates(b.s.id, { page: 1, pageSize: 100 });
    expect(candidates.items.map((i) => i.id)).not.toContain(a.mentor.userId);
    const assignment = new TeachingAssignmentService(
      db,
      f.users,
      read,
      new MentorConflictService(),
    );
    await expect(
      assignment.assignSession(
        b.s.id,
        { mentorId: a.mentor.userId, expectedVersion: b.s.version, reason: 'Substitute' },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'CLASS_MENTOR_SCHEDULE_CONFLICT' } });
    const c = await db.getRepository(ClassEntity).findOneByOrFail({ id: b.c.id });
    await expect(
      assignment.assignClass(
        b.c.id,
        { mentorId: a.mentor.userId, expectedVersion: c.assignmentVersion, reason: 'Reassign' },
        staff,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'CLASS_MENTOR_SCHEDULE_CONFLICT' } });
  });

  async function studentConflict(a: Awaited<ReturnType<typeof fixture>>) {
    const targetDate = shiftDate(a.date, 1),
      mentor = await f.user(UserRole.MENTOR);
    const view = await f.classes.create({
      courseId: a.c.courseId,
      mentorId: mentor.id,
      code: randomUUID(),
      name: 'Conflicting class',
      deliveryMode: DeliveryMode.ONLINE,
      startDate: targetDate,
      endDate: targetDate,
      maxStudents: 10,
      meetingUrl: 'https://example.test/meeting',
    });
    const unit = view.units[0];
    if (!unit) throw new Error('Missing unit');
    await f.classes.scheduleSession(view.classEntity.id, {
      classUnitId: unit.unit.id,
      title: 'Student other class',
      startsAt: `${targetDate}T08:00:00+07:00`,
      endsAt: `${targetDate}T09:00:00+07:00`,
    });
    await f.classes.open(view.classEntity.id);
    await f.cart.addItem(a.student.id, view.classEntity.id);
    await f.checkout.checkout(a.student.id, PaymentType.CASH);
    return targetDate;
  }
  it('FULL_DAY requires current student-conflict acknowledgment, records queue and keeps mentor preview private', async () => {
    const a = await fixture();
    await studentConflict(a);
    const request = await leaves.create(a.input, a.mentor, randomUUID());
    const own = await leaves.detail(request.id, { page: 1, pageSize: 20 }, a.mentor);
    expect(own).toMatchObject({ studentConflictCount: 1 });
    expect(own).not.toHaveProperty('studentConflicts');
    const management = await leaves.detail(request.id, { page: 1, pageSize: 20 }, staff);
    expect(management).toMatchObject({ studentConflictCount: 1, sourcesCurrent: true });
    await expect(approve(request.id, false)).rejects.toMatchObject({
      response: { code: 'LEAVE_STUDENT_CONFLICT_ACK_REQUIRED' },
    });
    expect((await row(request.id)).status).toBe('PENDING');
    const result = await approve(request.id, true);
    expect(result.studentConflictCount).toBe(1);
    const replacementId = result.replacements[0]?.sessionId;
    const queue = await db.query(
      'SELECT * FROM student_schedule_conflicts WHERE source_session_id=$1',
      [replacementId],
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('OPEN');
    expect(
      (await leaves.detail(request.id, { page: 1, pageSize: 20 }, a.mentor)).studentConflictCount,
    ).toBe(1);
  });
  it('partial leave rejects CASH student collisions and slots exclude them; valid manual slot can be approved', async () => {
    const a = await fixture(),
      targetDate = await studentConflict(a);
    const input: CreateLeaveInput = {
      ...a.input,
      period: 'MORNING',
      dayMappings: undefined,
      sessionMappings: [
        {
          sourceSessionId: a.s.id,
          targetDate,
          targetPeriod: 'MORNING',
          startsAt: `${targetDate}T08:00:00+07:00`,
          endsAt: `${targetDate}T09:00:00+07:00`,
        },
      ],
    };
    await expect(leaves.create(input, a.mentor, randomUUID())).rejects.toMatchObject({
      response: { code: 'LEAVE_STUDENT_CONFLICT' },
    });
    const slots = await leaves.slots(
      { sourceSessionId: a.s.id, targetDate, targetPeriod: 'MORNING' },
      a.mentor,
    );
    expect(
      slots.slots.some(
        (s) => s.startsAt.toISOString() === new Date(`${targetDate}T08:00:00+07:00`).toISOString(),
      ),
    ).toBe(false);
    const mapping = {
      sourceSessionId: a.s.id,
      targetDate,
      targetPeriod: 'MORNING' as const,
      startsAt: `${targetDate}T10:00:00+07:00`,
      endsAt: `${targetDate}T11:00:00+07:00`,
    };
    const request = await leaves.create(
      { ...input, sessionMappings: [mapping] },
      a.mentor,
      randomUUID(),
    );
    expect((await approve(request.id)).request.status).toBe('APPROVED');
  });
  it('rechecks target conflicts at approval, without reserving pending targets', async () => {
    const a = await fixture(),
      request = await leaves.create(a.input, a.mentor, randomUUID());
    await studentConflict(a);
    await expect(approve(request.id, false)).rejects.toMatchObject({
      response: { code: 'LEAVE_STUDENT_CONFLICT_ACK_REQUIRED' },
    });
    expect((await row(request.id)).status).toBe('PENDING');
  });
  it('keeps multi-class approval atomic and requesting mentor on replacements', async () => {
    const a = await fixture();
    const view = await f.classes.create({
      courseId: a.c.courseId,
      mentorId: a.mentor.userId,
      code: randomUUID(),
      name: 'Second class',
      deliveryMode: DeliveryMode.ONLINE,
      startDate: a.date,
      endDate: a.date,
      maxStudents: 10,
      meetingUrl: 'https://example.test/meeting',
    });
    const unit = view.units[0];
    if (!unit) throw new Error('Missing unit');
    await f.classes.scheduleSession(view.classEntity.id, {
      classUnitId: unit.unit.id,
      title: 'Later session',
      startsAt: `${a.date}T10:00:00+07:00`,
      endsAt: `${a.date}T11:00:00+07:00`,
    });
    await f.classes.open(view.classEntity.id);
    const preview = await leaves.preview(a.input, a.mentor);
    expect(preview.affectedSessions).toHaveLength(2);
    const request = await leaves.create(
      { ...a.input, sourceVersions: preview.sourceVersions },
      a.mentor,
      randomUUID(),
    );
    const fault = vi.spyOn(schedule, 'audit');
    const original = schedule.audit.bind(schedule);
    let calls = 0;
    fault.mockImplementation(async (...args) => {
      calls++;
      if (calls === 3) throw new Error('Second class failure');
      return original(...args);
    });
    await expect(approve(request.id)).rejects.toThrow('Second class failure');
    fault.mockRestore();
    expect((await row(request.id)).status).toBe('PENDING');
    for (const s of preview.affectedSessions)
      expect(
        (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: s.sessionId })).status,
      ).toBe('SCHEDULED');
    const result = await approve(request.id);
    expect(result.replacements).toHaveLength(2);
    for (const s of result.replacements) expect(s.effectiveMentor?.id).toBe(a.mentor.userId);
  });

  it('keeps list query count constant across page sizes and rechecks inactive actor before receipt replay', async () => {
    const a = await fixture(),
      key = randomUUID();
    await leaves.create(a.input, a.mentor, key);
    await leaves.create(a.input, a.mentor, randomUUID());
    const queries = vi.spyOn(db.logger, 'logQuery');
    await leaves.list({ page: 1, pageSize: 1 }, a.mentor);
    const small = queries.mock.calls.length;
    queries.mockClear();
    const page = await leaves.list({ page: 1, pageSize: 100 }, a.mentor);
    expect(page.items).toHaveLength(2);
    expect(queries.mock.calls.length).toBe(small);
    queries.mockRestore();
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [a.mentor.userId]);
    await expect(leaves.create(a.input, a.mentor, key)).rejects.toMatchObject({
      response: { code: 'LEAVE_FORBIDDEN' },
    });
  });
});
