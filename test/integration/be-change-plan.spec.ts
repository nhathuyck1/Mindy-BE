import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassOpening1793836800000 } from '../../src/database/migrations/1793836800000-class-opening.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { CalendarValidationService } from '../../src/modules/classes/services/calendar-validation.service.js';
import { ClassOpeningService } from '../../src/modules/classes/services/class-opening.service.js';
import { ClassScheduleService } from '../../src/modules/classes/services/class-schedule.service.js';
import { MentorConflictService } from '../../src/modules/classes/services/mentor-conflict.service.js';
import { SessionLifecycleService } from '../../src/modules/classes/services/session-lifecycle.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { WeeklyScheduleService } from '../../src/modules/classes/services/weekly-schedule.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('be_changes'))('BE change plan PostgreSQL contracts', () => {
  let db: DataSource, f: ReturnType<typeof paymentFixture>, opening: ClassOpeningService;
  beforeAll(async () => {
    db = await paymentDatabase('be_changes');
    f = paymentFixture(db);
    opening = new ClassOpeningService(db);
  }, 30_000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function paidClass(count: number) {
    const a = await f.order({ maxStudents: 10, paymentType: PaymentType.CASH });
    const manager = await f.user(UserRole.MANAGER),
      id = a.classIds[0];
    if (!id) throw new Error('Class missing');
    await f.cash.confirm(manager.id, a.order.id, a.order.totalAmount);
    for (let n = 1; n < count; n += 1) {
      const student = await f.user();
      await f.cart.addItem(student.id, id);
      const order = (await f.checkout.checkout(student.id, PaymentType.CASH))[0];
      if (!order) throw new Error('Order missing');
      await f.cash.confirm(manager.id, order.order.id, order.order.totalAmount);
    }
    return { ...a, id, manager };
  }
  async function reachStart(id: string) {
    await db.query(
      "UPDATE classes SET start_date=(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,end_date=(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date WHERE id=$1",
      [id],
    );
    await db.query(
      "UPDATE class_sessions SET starts_at=clock_timestamp(),ends_at=clock_timestamp()+interval '1 hour' WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)",
      [id],
    );
  }
  it('upgrades existing paid enrollment history without changing class/session identities', async () => {
    const a = await paidClass(3),
      before = await f.read.getDetail(a.id);
    await rehearseMigration(db, new ClassOpening1793836800000(), 'down');
    await rehearseMigration(db, new ClassOpening1793836800000(), 'up');
    const after = await f.read.getDetail(a.id);
    expect(after.units.flatMap((u) => u.sessions.map((s) => s.id))).toEqual(
      before.units.flatMap((u) => u.sessions.map((s) => s.id)),
    );
    expect(await opening.eligibility(db.manager, after.classEntity)).toMatchObject({
      activeStudentCount: 3,
      startEligibility: 'TOO_EARLY',
    });
  });
  it.each([
    [2, false],
    [3, false],
    [2, true],
    [3, true],
  ] as const)(
    'requires three paid students to start a session (%i paid, before scheduled time: %s)',
    async (count, early) => {
      const a = await paidClass(count);
      if (!early) await reachStart(a.id);
      const lifecycle = new SessionLifecycleService(f.config, opening);
      const start = () =>
        db.transaction(async (m) => {
          const c = await m.getRepository(ClassEntity).findOneByOrFail({ id: a.id });
          const s = await m.getRepository(ClassSessionEntity).findOneByOrFail({
            classUnitId: (await f.read.getDetail(a.id)).units[0]?.unit.id ?? '',
          });
          await lifecycle.start(m, c, s, a.mentor.id, new Date());
        });
      if (count < 3) {
        await expect(start()).rejects.toMatchObject({
          response: { code: 'CLASS_START_INELIGIBLE' },
        });
        expect((await f.read.getDetail(a.id)).units[0]?.sessions[0]?.actualStartedAt).toBeNull();
      } else {
        await start();
        const detail = await f.read.getDetail(a.id);
        expect(detail.classEntity.status).toBe('IN_PROGRESS');
        const session = detail.units[0]?.sessions[0];
        expect(session).toMatchObject({
          status: 'IN_PROGRESS',
          teachingMentorId: a.mentor.id,
        });
        if (early) {
          expect(session?.actualStartedAt?.getTime()).toBeLessThan(
            session?.startsAt.getTime() ?? 0,
          );
          expect(
            await db.query(
              'SELECT outcome, active_student_count FROM class_opening_decisions WHERE class_id=$1',
              [a.id],
            ),
          ).toEqual([{ outcome: 'STARTED', active_student_count: 3 }]);
        }
      }
    },
  );
  function weeklyService() {
    const reservations = new ScheduleReservationsService(),
      mentors = new MentorConflictService();
    return new WeeklyScheduleService(
      db,
      new TeachingReadService(db, f.config, f.users, reservations),
      new CalendarValidationService(mentors, reservations),
      new ClassScheduleService(f.config, reservations, mentors),
      f.users,
    );
  }
  it('previews Monday/Thursday and moves an OPEN class atomically while preserving curriculum and enrollment links', async () => {
    const a = await f.order({ maxStudents: 10, paymentType: PaymentType.CASH });
    const id = a.classIds[0] ?? '',
      view = await f.read.getDetail(id),
      first = view.units[0]?.sessions[0];
    if (!first) throw new Error('Session missing');
    const second = await db.getRepository(ClassSessionEntity).save(
      db.getRepository(ClassSessionEntity).create({
        classUnitId: first.classUnitId,
        sessionNumber: 2,
        title: 'Keep second content',
        startsAt: new Date(first.startsAt.getTime() + 86400000),
        endsAt: new Date(first.endsAt.getTime() + 86400000),
        status: first.status,
      }),
    );
    const manager = await f.user(UserRole.MANAGER),
      actor = { userId: manager.id, role: UserRole.MANAGER, sessionId: randomUUID() };
    const service = weeklyService(),
      key = randomUUID();
    const input = {
      startDate: '2030-01-07',
      weeklySlots: [
        { weekday: 1, slotId: 1 },
        { weekday: 4, slotId: 6 },
      ],
      sessions: [first, second].map((s) => ({
        sessionId: s.id,
        classUnitId: s.classUnitId,
        title: 'Client must not replace existing content',
      })),
      expectedVersion: view.classEntity.assignmentVersion,
      reason: 'Move entire timetable',
    };
    const preview = await service.preview(id, input);
    expect(preview.conflicts).toEqual([]);
    expect(preview.sessions.map((s) => s.startsAt.toISOString())).toEqual([
      '2030-01-07T00:30:00.000Z',
      '2030-01-10T11:00:00.000Z',
    ]);
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: first.id })).startsAt,
    ).toEqual(first.startsAt);
    const result = await service.apply(id, input, actor, key);
    expect(JSON.parse(JSON.stringify(await service.apply(id, input, actor, key)))).toEqual(
      JSON.parse(JSON.stringify(result)),
    );
    const moved = await f.read.getDetail(id);
    expect(moved.classEntity).toMatchObject({
      status: 'OPEN',
      startDate: input.startDate,
      endDate: '2030-01-10',
      assignmentVersion: input.expectedVersion + 1,
    });
    expect(
      moved.units.flatMap((u) => u.sessions).map((s) => [s.id, s.title, s.sessionNumber]),
    ).toEqual([
      [first.id, first.title, 1],
      [second.id, second.title, 2],
    ]);
    expect(await service.savedSlots(id)).toEqual(input.weeklySlots);
    expect(
      await db.query('SELECT class_id FROM enrollments WHERE student_id=$1', [a.student.id]),
    ).toEqual([{ class_id: id }]);
    await expect(
      service.apply(id, { ...input, reason: 'Different request' }, actor, key),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(service.apply(id, input, actor, randomUUID())).rejects.toMatchObject({
      response: { code: 'CLASS_VERSION_CONFLICT' },
    });
  });
  it('reports mentor/student conflicts before save, rolls back all changes, and allows adjacent sessions', async () => {
    const a = await f.order({ maxStudents: 10, paymentType: PaymentType.CASH }),
      b = await f.order({ maxStudents: 10, paymentType: PaymentType.CASH });
    const id = a.classIds[0] ?? '',
      otherId = b.classIds[0] ?? '',
      view = await f.read.getDetail(id),
      first = view.units[0]?.sessions[0];
    if (!first) throw new Error('Session missing');
    const input = {
      startDate: '2031-01-06',
      weeklySlots: [{ weekday: 1, slotId: 1 }],
      sessions: [{ sessionId: first.id, classUnitId: first.classUnitId, title: first.title }],
      expectedVersion: view.classEntity.assignmentVersion,
      reason: 'Conflict check',
    };
    const service = weeklyService(),
      preview = await service.preview(id, input),
      target = preview.sessions[0];
    if (!target) throw new Error('Preview missing');
    await db.query('UPDATE classes SET mentor_id=$2 WHERE id=$1', [otherId, a.mentor.id]);
    await db.query(
      'UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)',
      [otherId, target.startsAt, target.endsAt],
    );
    expect((await service.preview(id, input)).conflicts).toContainEqual(
      expect.objectContaining({ kind: 'MENTOR' }),
    );
    await db.query('UPDATE classes SET mentor_id=$2 WHERE id=$1', [otherId, b.mentor.id]);
    await db.query('UPDATE enrollments SET student_id=$2 WHERE class_id=$1', [
      otherId,
      a.student.id,
    ]);
    expect((await service.preview(id, input)).conflicts).toContainEqual(
      expect.objectContaining({ kind: 'STUDENT' }),
    );
    const manager = await f.user(UserRole.MANAGER),
      actor = { userId: manager.id, role: UserRole.MANAGER, sessionId: randomUUID() };
    await expect(service.apply(id, input, actor, randomUUID())).rejects.toMatchObject({
      response: { code: 'SCHEDULE_CONFLICT' },
    });
    expect((await f.read.getDetail(id)).classEntity.assignmentVersion).toBe(input.expectedVersion);
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: first.id })).startsAt,
    ).toEqual(first.startsAt);
    await db.query(
      'UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)',
      [otherId, target.endsAt, new Date(target.endsAt.getTime() + 3600000)],
    );
    await expect(service.apply(id, input, actor, randomUUID())).resolves.toMatchObject({
      conflicts: [],
    });
  });
  it.each([2, 3, 4])(
    'makes exactly one durable opening decision for %i paid students across replicas',
    async (count) => {
      const a = await paidClass(count);
      await expect(f.classes.start(a.id)).rejects.toMatchObject({
        response: { code: 'CLASS_START_INELIGIBLE' },
      });
      await reachStart(a.id);
      await Promise.all([opening.runBatch(), new ClassOpeningService(db).runBatch()]);
      expect((await db.getRepository(ClassEntity).findOneByOrFail({ id: a.id })).status).toBe(
        count >= 3 ? 'IN_PROGRESS' : 'OPEN',
      );
      expect(
        await db.query(
          'SELECT outcome,active_student_count FROM class_opening_decisions WHERE class_id=$1',
          [a.id],
        ),
      ).toEqual([{ outcome: count >= 3 ? 'STARTED' : 'BLOCKED', active_student_count: count }]);
      expect(
        (await f.read.getDetail(a.id)).units
          .flatMap((u) => u.sessions)
          .every((s) => s.status === 'SCHEDULED'),
      ).toBe(true);
    },
  );
  it('never opens a blocked class on late payment or worker restart', async () => {
    const a = await paidClass(2);
    await reachStart(a.id);
    await opening.runBatch();
    const student = await f.user();
    await f.cart.addItem(student.id, a.id);
    const order = (await f.checkout.checkout(student.id, PaymentType.CASH))[0];
    if (!order) throw new Error('Order missing');
    await f.cash.confirm(a.manager.id, order.order.id, order.order.totalAmount);
    await new ClassOpeningService(db).runBatch();
    await expect(f.classes.start(a.id)).rejects.toMatchObject({
      response: { code: 'CLASS_START_INELIGIBLE' },
    });
    expect((await db.getRepository(ClassEntity).findOneByOrFail({ id: a.id })).status).toBe('OPEN');
    const view = await f.read.getDetail(a.id),
      s = view.units[0]?.sessions[0];
    if (!s) throw new Error('Missing blocked session');
    await weeklyService().apply(
      a.id,
      {
        startDate: '2032-01-05',
        weeklySlots: [{ weekday: 1, slotId: 1 }],
        sessions: [{ sessionId: s.id, classUnitId: s.classUnitId, title: s.title }],
        expectedVersion: view.classEntity.assignmentVersion,
        reason: 'New opening cutoff',
      },
      { userId: a.manager.id, role: UserRole.MANAGER, sessionId: randomUUID() },
      randomUUID(),
    );
    await reachStart(a.id);
    await new ClassOpeningService(db).runBatch();
    expect((await f.read.getDetail(a.id)).classEntity.status).toBe('IN_PROGRESS');
    expect(
      await db.query(
        'SELECT outcome FROM class_opening_decisions WHERE class_id=$1 ORDER BY scheduled_start_at',
        [a.id],
      ),
    ).toEqual([{ outcome: 'BLOCKED' }, { outcome: 'STARTED' }]);
  });
  it('does not backdate a late ACTIVE transition from an older enrolled_at value', async () => {
    const a = await paidClass(3);
    const rows: { id: string }[] = await db.query(
      'SELECT id FROM enrollments WHERE class_id=$1 ORDER BY id LIMIT 1',
      [a.id],
    );
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [rows[0]?.id]);
    await reachStart(a.id);
    await db.query("UPDATE enrollments SET status='ACTIVE' WHERE id=$1", [rows[0]?.id]);
    await opening.runBatch();
    expect((await f.read.getDetail(a.id)).classEntity.status).toBe('OPEN');
    expect(
      await db.query(
        'SELECT outcome,active_student_count FROM class_opening_decisions WHERE class_id=$1',
        [a.id],
      ),
    ).toEqual([{ outcome: 'BLOCKED', active_student_count: 2 }]);
  });
  it('swaps twice with the same receipt without swapping back, and rejects stale versions', async () => {
    const a = await f.order({ maxStudents: 10, paymentType: PaymentType.CASH }),
      id = a.classIds[0];
    if (!id) throw new Error('Class missing');
    const first = (await f.read.getDetail(id)).units[0]?.sessions[0];
    if (!first) throw new Error('Session missing');
    const startsAt = new Date(first.startsAt.getTime() + 86400000),
      endsAt = new Date(first.endsAt.getTime() + 86400000);
    await db.query(
      "UPDATE classes SET end_date=(($2::timestamptz) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date WHERE id=$1",
      [id, endsAt],
    );
    const second = await db.getRepository(ClassSessionEntity).save(
      db.getRepository(ClassSessionEntity).create({
        classUnitId: first.classUnitId,
        sessionNumber: 2,
        title: 'Second curriculum session',
        startsAt,
        endsAt,
        status: first.status,
      }),
    );
    const reservations = new ScheduleReservationsService(),
      mentors = new MentorConflictService(),
      read = new TeachingReadService(db, f.config, f.users, reservations);
    const service = new WeeklyScheduleService(
      db,
      read,
      new CalendarValidationService(mentors, reservations),
      new ClassScheduleService(f.config, reservations, mentors),
      f.users,
    );
    const actor = { userId: a.mentor.id, role: UserRole.MENTOR, sessionId: randomUUID() },
      key = randomUUID();
    const input = {
      firstSessionId: first.id,
      secondSessionId: second.id,
      firstVersion: first.version,
      secondVersion: second.version,
      reason: 'Swap sessions',
    };
    await expect(
      service.swap(
        id,
        input,
        { ...actor, userId: (await f.user(UserRole.MENTOR)).id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE class_sessions SET ends_at=ends_at+interval '30 minutes' WHERE id=$1", [
      second.id,
    ]);
    await expect(service.swap(id, input, actor, randomUUID())).rejects.toMatchObject({
      response: { code: 'SESSION_DURATION_MISMATCH' },
    });
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: first.id })).startsAt,
    ).toEqual(first.startsAt);
    await db.query('UPDATE class_sessions SET ends_at=$2 WHERE id=$1', [second.id, endsAt]);
    await service.swap(id, input, actor, key);
    await service.swap(id, input, actor, key);
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: first.id })).startsAt,
    ).toEqual(startsAt);
    expect(
      (await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: second.id })).startsAt,
    ).toEqual(first.startsAt);
    await expect(service.swap(id, input, actor, randomUUID())).rejects.toMatchObject({
      response: { code: 'SESSION_VERSION_CONFLICT' },
    });
  });
});
