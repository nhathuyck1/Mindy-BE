import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TeachingNotes1792627200000 } from '../../src/database/migrations/1792627200000-teaching-notes.js';
import { AttendanceProjectionService } from '../../src/modules/attendance/services/attendance-projection.service.js';
import { AttendanceReportsService } from '../../src/modules/attendance/services/attendance-reports.service.js';
import { MentorAttendanceReportsService } from '../../src/modules/attendance/services/mentor-attendance-reports.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { SessionStatus } from '../../src/modules/classes/enums/session-status.enum.js';
import { MentorProgressService } from '../../src/modules/classes/services/mentor-progress.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { StoredProgressService } from '../../src/modules/enrollments/services/stored-progress.service.js';
import { MentorClassRosterService } from '../../src/modules/payments/services/mentor-class-roster.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { TeachingNotesService } from '../../src/modules/teaching-operations/services/teaching-notes.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const PAGE = { page: 1, pageSize: 20 };
const actor = (userId: string, role = UserRole.MENTOR): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});
describe.skipIf(!separateTestUrl('phase46'))('Phase 4.6 workspace PostgreSQL', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    teaching: TeachingReadService,
    notes: TeachingNotesService,
    reports: MentorAttendanceReportsService,
    studentReports: AttendanceReportsService,
    progress: MentorProgressService,
    roster: MentorClassRosterService;
  beforeAll(async () => {
    db = await paymentDatabase('phase46', { migrations: [TeachingNotes1792627200000] });
    await rehearseMigration(db, new TeachingNotes1792627200000(), 'down');
    await rehearseMigration(db, new TeachingNotes1792627200000(), 'up');
    f = paymentFixture(db);
    teaching = new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService());
    notes = new TeachingNotesService(db, teaching, f.users);
    const projections = new AttendanceProjectionService();
    reports = new MentorAttendanceReportsService(
      db,
      f.workspace,
      projections,
      f.enrollments,
      teaching,
    );
    studentReports = new AttendanceReportsService(
      db,
      projections,
      teaching,
      f.enrollments,
      f.users,
    );
    progress = new MentorProgressService(
      db,
      f.workspace,
      new StoredProgressService(),
      f.enrollments,
      teaching,
    );
    roster = new MentorClassRosterService(db, f.read);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function setup() {
    const o = await f.order({ paymentType: PaymentType.CASH });
    const classId = o.classIds[0] ?? '';
    const detail = await f.read.getDetail(classId);
    const session = detail.units[0]?.sessions[0];
    if (!session) throw new Error('Missing session');
    const primary = actor(o.mentor.id),
      sub = actor((await f.user(UserRole.MENTOR)).id);
    return { ...o, classId, session, primary, sub, detail };
  }
  async function started(s: Awaited<ReturnType<typeof setup>>) {
    await db.getRepository(ClassSessionEntity).update(s.session.id, {
      status: SessionStatus.IN_PROGRESS,
      teachingMentorId: s.sub.userId,
      mentorOverrideId: s.sub.userId,
      actualStartedAt: new Date(),
      editableUntil: new Date(Date.now() + 86400000),
    });
  }
  it('discovers primary/substitute/both exactly once and filters scope before counts and pages', async () => {
    const s = await setup();
    await db
      .getRepository(ClassSessionEntity)
      .update(s.session.id, { mentorOverrideId: s.sub.userId });
    expect((await roster.classes(s.sub.userId, PAGE)).items.map((c) => c.classEntity.id)).toContain(
      s.classId,
    );
    expect(
      (await roster.classes(s.sub.userId, { ...PAGE, assignment: 'PRIMARY' })).items,
    ).toHaveLength(0);
    expect(
      (await roster.classes(s.sub.userId, { ...PAGE, assignment: 'SUBSTITUTE' })).items,
    ).toHaveLength(1);
    expect(await f.workspace.detail(s.sub, s.classId)).toMatchObject({
      accessScope: 'SESSION',
      visibleUnitCount: 1,
      visibleSessionCount: 1,
      capabilities: { readClassReports: false },
    });
    const page = await f.workspace.sessions(s.sub, s.classId, { page: 10, pageSize: 1 });
    expect(page).toMatchObject({ items: [], total: 1 });
    expect(JSON.stringify(await f.workspace.detail(s.sub, s.classId))).not.toMatch(
      /meeting|payment|email|phone/,
    );
    await expect(
      f.workspace.sessions(s.sub, s.classId, { ...PAGE, unitId: s.detail.units[1]?.unit.id ?? '' }),
    ).rejects.toMatchObject({ status: 404 });
    await db.getRepository(ClassEntity).update(s.classId, { mentorId: s.sub.userId });
    expect(
      (await roster.classes(s.sub.userId, PAGE)).items.filter(
        (c) => c.classEntity.id === s.classId,
      ),
    ).toHaveLength(1);
    expect(await f.workspace.detail(s.sub, s.classId)).toMatchObject({
      assignmentType: 'BOTH',
      accessScope: 'CLASS',
    });
    await db.getRepository(ClassSessionEntity).update(s.session.id, { mentorOverrideId: null });
    await expect(f.workspace.detail(s.primary, s.classId)).rejects.toMatchObject({ status: 403 });
  });
  it('does not infer legacy teaching credit, and revokes discovery access on override/role/suspension', async () => {
    const s = await setup();
    await db.getRepository(ClassSessionEntity).update(s.session.id, {
      status: SessionStatus.COMPLETED,
      mentorOverrideId: s.sub.userId,
      teachingMentorId: null,
    });
    await expect(f.workspace.detail(s.sub, s.classId)).rejects.toMatchObject({ status: 403 });
    await db
      .getRepository(ClassSessionEntity)
      .update(s.session.id, { teachingMentorId: s.sub.userId });
    expect((await f.workspace.sessions(s.sub, s.classId, PAGE)).total).toBe(1);
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [s.sub.userId]);
    await expect(
      f.workspace.sessions(s.sub, s.classId, { page: 99, pageSize: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE users SET status='ACTIVE',role='STUDENT' WHERE id=$1", [s.sub.userId]);
    await expect(f.workspace.detail(s.sub, s.classId)).rejects.toMatchObject({ status: 403 });
  });
  it('shares attendance credit with student/staff including zero denominator and blocks substitute reports', async () => {
    const s = await setup(),
      student = actor(s.student.id, UserRole.STUDENT);
    await started(s);
    const own = await studentReports.ownSummary(s.classId, student, {});
    const mentor = await reports.summary(s.primary, s.classId, s.student.id, {});
    expect(mentor).toMatchObject({
      rate: own.rate,
      present: own.present,
      absent: own.absent,
      finalizedEligibleCount: own.finalizedEligibleCount,
    });
    expect(mentor.rate).toBeNull();
    await expect(reports.classSummary(s.sub, s.classId, PAGE)).rejects.toMatchObject({
      status: 403,
    });
    await expect(reports.history(s.primary, s.classId, randomUUID(), PAGE)).rejects.toMatchObject({
      status: 404,
    });
    await db.getRepository(ClassEntity).update(s.classId, { status: ClassStatus.CANCELLED });
    expect((await f.workspace.detail(s.primary, s.classId)).readonly).toBe(true);
    expect((await reports.classSummary(s.primary, s.classId, PAGE)).total).toBe(1);
  });
  it('distinguishes untracked from stored zero and never fabricates an overall learning rate', async () => {
    const s = await setup();
    const untracked = await progress.units(s.primary, s.classId, s.student.id, PAGE);
    expect(untracked.items[0]).toMatchObject({
      trackingStatus: 'UNTRACKED',
      progressPercent: null,
    });
    await f.cash.confirm((await f.user(UserRole.MANAGER)).id, s.order.id, s.order.totalAmount);
    expect((await progress.units(s.primary, s.classId, s.student.id, PAGE)).items[0]).toMatchObject(
      { trackingStatus: 'STORED', progressPercent: '0.00' },
    );
    expect(await progress.summary(s.primary, s.classId, PAGE)).toMatchObject({
      completionPolicy: 'UNDEFINED',
      policyVersion: null,
      assignmentSummary: { availability: 'NOT_IMPLEMENTED', counts: null },
      items: [{ storedUnitCount: 2, untrackedUnitCount: 0 }],
    });
    await started(s);
    await expect(progress.summary(s.sub, s.classId, PAGE)).rejects.toMatchObject({ status: 403 });
    await expect(progress.units(s.primary, s.classId, randomUUID(), PAGE)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('serializes version races, replays identical key, rejects changed payload and keeps append-only audits', async () => {
    const s = await setup();
    await started(s);
    expect(await notes.get(s.session.id, s.primary)).toMatchObject({ note: null, version: 0 });
    const input = { expectedVersion: 0, content: 'Loops', nextSteps: 'Practice' };
    const results = await Promise.allSettled([
      notes.put(s.session.id, s.sub, input, randomUUID()),
      notes.put(s.session.id, s.sub, input, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const key = randomUUID(),
      body = { ...input, expectedVersion: 1 };
    const saved = await notes.put(s.session.id, s.sub, body, key);
    expect(await notes.put(s.session.id, s.sub, body, key)).toEqual(saved);
    await expect(
      notes.put(s.session.id, s.sub, { ...body, content: 'Changed' }, key),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      notes.put(s.session.id, s.primary, { ...body, expectedVersion: 2 }, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    const rows: { count: string }[] = await db.query(
      'SELECT count(*) FROM teaching_note_audits WHERE session_id=$1',
      [s.session.id],
    );
    expect(rows[0]?.count).toBe('2');
    await expect(
      db.query('UPDATE teaching_note_audits SET reason=$1 WHERE session_id=$2', [
        'edit',
        s.session.id,
      ]),
    ).rejects.toThrow('append only');
  });
  it('rechecks window, state, assignment and role on retries; staff correction requires reason', async () => {
    const s = await setup(),
      staff = actor((await f.user(UserRole.MANAGER)).id, UserRole.MANAGER);
    const body = { expectedVersion: 0, content: 'Teaching note', nextSteps: '' };
    await expect(notes.put(s.session.id, s.primary, body, randomUUID())).rejects.toMatchObject({
      status: 409,
    });
    await started(s);
    const key = randomUUID();
    await notes.put(s.session.id, s.sub, body, key);
    await db
      .getRepository(ClassSessionEntity)
      .update(s.session.id, { status: SessionStatus.COMPLETED, editableUntil: new Date(0) });
    await expect(
      notes.put(s.session.id, s.sub, { ...body, expectedVersion: 1 }, randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await notes.put(
          s.session.id,
          staff,
          { ...body, expectedVersion: 1, reason: 'Corrected after review' },
          randomUUID(),
          true,
        )
      ).version,
    ).toBe(2);
    await db
      .getRepository(ClassSessionEntity)
      .update(s.session.id, { teachingMentorId: s.primary.userId });
    await expect(notes.put(s.session.id, s.sub, body, key)).rejects.toMatchObject({ status: 403 });
    await db.getRepository(ClassEntity).update(s.classId, { status: ClassStatus.CANCELLED });
    await expect(
      notes.put(
        s.session.id,
        staff,
        { ...body, expectedVersion: 2, reason: 'Correction' },
        randomUUID(),
        true,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      notes.get(s.session.id, actor(s.student.id, UserRole.STUDENT)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('replays concurrent identical saves once, blocks expired replay and rechecks assignment after waiting for class lock', async () => {
    const s = await setup();
    await started(s);
    const input = { expectedVersion: 0, content: 'Concurrent', nextSteps: '' },
      key = randomUUID();
    const [a, b] = await Promise.all([
      notes.put(s.session.id, s.sub, input, key),
      notes.put(s.session.id, s.sub, input, key),
    ]);
    expect(a).toEqual(b);
    expect(a.version).toBe(1);
    await db.getRepository(ClassSessionEntity).update(s.session.id, { editableUntil: new Date(0) });
    await expect(notes.put(s.session.id, s.sub, input, key)).rejects.toMatchObject({
      response: { code: 'TEACHING_NOTE_WINDOW_CLOSED' },
    });
    await db
      .getRepository(ClassSessionEntity)
      .update(s.session.id, { editableUntil: new Date(Date.now() + 86400000) });
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await teaching.loadClass(runner.manager, s.classId, true);
      const save = notes.put(s.session.id, s.sub, { ...input, expectedVersion: 1 }, randomUUID());
      const denied = expect(save).rejects.toMatchObject({ status: 403 });
      await runner.manager
        .getRepository(ClassSessionEntity)
        .update(s.session.id, { teachingMentorId: s.primary.userId });
      await runner.commitTransaction();
      await denied;
      expect((await notes.get(s.session.id, s.primary)).version).toBe(1);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
  it('rolls back note and audit when receipt persistence fails, then permits an identical retry', async () => {
    const s = await setup();
    await started(s);
    const body = { expectedVersion: 0, content: 'Atomic save', nextSteps: '' },
      key = randomUUID();
    await db.query(
      `CREATE FUNCTION phase46_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Receipt failure'; END $$`,
    );
    await db.query(
      'CREATE TRIGGER phase46_fail_receipt BEFORE INSERT ON teaching_note_receipts FOR EACH ROW EXECUTE FUNCTION phase46_fail_receipt()',
    );
    try {
      await expect(notes.put(s.session.id, s.sub, body, key)).rejects.toThrow('Receipt failure');
      expect(await notes.get(s.session.id, s.sub)).toMatchObject({ note: null, version: 0 });
      const rows: { count: string }[] = await db.query(
        'SELECT count(*) FROM teaching_note_audits WHERE session_id=$1',
        [s.session.id],
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await db.query('DROP TRIGGER phase46_fail_receipt ON teaching_note_receipts');
      await db.query('DROP FUNCTION phase46_fail_receipt()');
    }
    expect((await notes.put(s.session.id, s.sub, body, key)).version).toBe(1);
  });
});
