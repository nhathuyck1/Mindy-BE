import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { SessionStatus } from '../../src/modules/classes/enums/session-status.enum.js';
import { MentorConflictService } from '../../src/modules/classes/services/mentor-conflict.service.js';
import { TeachingAssignmentService } from '../../src/modules/classes/services/teaching-assignment.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const PAGE = { page: 1, pageSize: 100 };
describe.skipIf(!separateTestUrl('teaching'))(
  'Phase 4.1 effective assignments (PostgreSQL)',
  () => {
    let db: DataSource;
    let f: ReturnType<typeof paymentFixture>;
    let read: TeachingReadService;
    let assignments: TeachingAssignmentService;
    let staff: AuthenticatedUser;
    beforeAll(async () => {
      db = await paymentDatabase('teaching');
      f = paymentFixture(db);
      read = new TeachingReadService(db, f.config, f.users);
      assignments = new TeachingAssignmentService(db, f.users, read, new MentorConflictService());
      staff = {
        userId: (await f.user(UserRole.MANAGER)).id,
        sessionId: randomUUID(),
        role: UserRole.MANAGER,
      };
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });

    async function fixture() {
      const order = await f.order();
      const classId = order.classIds[0] ?? '';
      const detail = await f.read.getDetail(classId);
      const session = detail.units[0]?.sessions[0];
      if (!session) throw new Error('Missing session');
      return { order, c: detail.classEntity, s: session };
    }
    async function parallelClass(
      base: Awaited<ReturnType<typeof fixture>>,
      mentorId: string,
      start = '08:00',
      end = '09:00',
    ) {
      const c = base.c;
      const view = await f.classes.create({
        courseId: c.courseId,
        mentorId,
        code: randomUUID(),
        name: 'Parallel',
        startDate: c.startDate,
        endDate: c.endDate,
        maxStudents: 10,
        deliveryMode: c.deliveryMode,
      });
      const unit = view.units[0];
      if (!unit) throw new Error('Missing unit');
      const result = await f.classes.scheduleSession(view.classEntity.id, {
        classUnitId: unit.unit.id,
        title: 'Parallel',
        startsAt: `${c.startDate}T${start}:00+07:00`,
        endsAt: `${c.startDate}T${end}:00+07:00`,
      });
      const session = result.units[0]?.sessions[0];
      if (!session) throw new Error('Missing parallel session');
      return { c: result.classEntity, s: session };
    }
    async function session(id: string) {
      return db.getRepository(ClassSessionEntity).findOneByOrFail({ id });
    }
    async function assign(
      id: string,
      mentorId: string | null,
      key = randomUUID(),
      expectedVersion?: number,
    ) {
      return assignments.assignSession(
        id,
        {
          mentorId,
          expectedVersion: expectedVersion ?? (await session(id)).version,
          reason: 'Cover session',
        },
        staff,
        key,
      );
    }

    it('rejects stale roles and inactive actors in the public session context provider', async () => {
      const a = await fixture();
      const student = await f.user();
      await expect(
        read.context(a.s.id, { ...staff, userId: student.id, role: UserRole.STUDENT }),
      ).rejects.toMatchObject({ status: 403 });
      const manager = await f.user(UserRole.MANAGER);
      const managerActor = { ...staff, userId: manager.id };
      expect((await read.context(a.s.id, managerActor)).accessScope).toBe('SESSION');
      await f.users.updateStatus(manager.id, UserStatus.SUSPENDED);
      await expect(read.context(a.s.id, managerActor)).rejects.toMatchObject({ status: 403 });
      await db.query("UPDATE users SET status='ACTIVE',role='STUDENT' WHERE id=$1", [manager.id]);
      await expect(read.context(a.s.id, managerActor)).rejects.toMatchObject({ status: 403 });
      await f.users.updateStatus(a.c.mentorId, UserStatus.SUSPENDED);
      await expect(
        read.context(a.s.id, { ...staff, userId: a.c.mentorId, role: UserRole.MENTOR }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lists paginated management metadata and grants only the substitute session context', async () => {
      const a = await fixture();
      const substitute = await f.user(UserRole.MENTOR);
      const assigned = await assign(a.s.id, substitute.id);
      expect(assigned).toMatchObject({
        assignmentType: 'SUBSTITUTE',
        effectiveMentor: { id: substitute.id },
      });
      const actor = { ...staff, role: UserRole.MENTOR, userId: substitute.id };
      const context = await read.context(a.s.id, actor);
      expect(context.meetingUrl).toBe(a.c.meetingUrl);
      expect(context).not.toHaveProperty('materials');
      await expect(read.context(a.s.id, { ...actor, userId: a.c.mentorId })).rejects.toMatchObject({
        status: 403,
      });
      const schedule = await read.schedule(substitute.id, {
        ...PAGE,
        from: a.s.startsAt.toISOString(),
        to: a.s.endsAt.toISOString(),
      });
      expect(schedule.items.map((s) => s.sessionId)).toContain(a.s.id);
      expect(
        (await read.classDetail(a.c.id, { page: 1, pageSize: 1 })).sessions.items,
      ).toHaveLength(1);
      expect((await read.listClasses(PAGE)).items.find((c) => c.id === a.c.id)).toMatchObject({
        primaryMentor: { id: a.c.mentorId },
      });
    });

    it('excludes occupied effective mentors, permits adjacent sessions and rechecks stale GET candidates', async () => {
      const a = await fixture();
      const b = await f.user(UserRole.MENTOR);
      expect((await read.sessionCandidates(a.s.id, PAGE)).items.map((u) => u.id)).toContain(b.id);
      const parallel = await parallelClass(a, b.id);
      await f.classes.open(parallel.c.id);
      expect((await read.sessionCandidates(a.s.id, PAGE)).items.map((u) => u.id)).not.toContain(
        b.id,
      );
      await expect(assign(a.s.id, b.id)).rejects.toMatchObject({ status: 409 });
      const adjacent = await parallelClass(a, b.id, '09:00', '10:00');
      await f.classes.open(adjacent.c.id);
      await assign(adjacent.s.id, a.c.mentorId);
    });

    it('serializes two managers competing for the last mentor interval; loser leaves no audit or receipt', async () => {
      const a = await fixture();
      const b = await parallelClass(a, (await f.user(UserRole.MENTOR)).id);
      await f.classes.open(b.c.id);
      const substitute = await f.user(UserRole.MENTOR);
      const results = await Promise.allSettled([
        assign(a.s.id, substitute.id),
        assign(b.s.id, substitute.id),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { status: 409 },
      });
      const rows: { count: string }[] = await db.query(
        'SELECT count(*) FROM teaching_assignment_audits WHERE new_mentor_id=$1',
        [substitute.id],
      );
      expect(rows[0]?.count).toBe('1');
    });

    it('replays atomically, rejects a reused payload and stale versions without duplicating history', async () => {
      const a = await fixture();
      const b = await f.user(UserRole.MENTOR);
      const key = randomUUID();
      const v = (await session(a.s.id)).version;
      const first = await assign(a.s.id, b.id, key, v);
      const retry = await assign(a.s.id, b.id, key, v);
      expect(JSON.parse(JSON.stringify(retry))).toEqual(JSON.parse(JSON.stringify(first)));
      expect((await session(a.s.id)).version).toBe(v + 1);
      await expect(assign(a.s.id, null, key, v)).rejects.toMatchObject({ status: 409 });
      await expect(assign(a.s.id, null, randomUUID(), v)).rejects.toMatchObject({ status: 409 });
      await expect(
        assignments.assignSession(
          a.s.id,
          { mentorId: b.id, reason: 'Retry', expectedVersion: v },
          { ...staff, role: UserRole.MENTOR, userId: b.id },
          key,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await db.query('SELECT 1 FROM teaching_assignment_audits WHERE session_id=$1', [a.s.id]))
          .length,
      ).toBe(1);
    });

    it('changes only scheduled primary assignments; preserves overrides and legacy unknown teachers', async () => {
      const a = await fixture();
      const substitute = await f.user(UserRole.MENTOR);
      const next = await f.user(UserRole.MENTOR);
      await assign(a.s.id, substitute.id);
      const detail = await f.classes.scheduleSession(a.c.id, {
        classUnitId: a.s.classUnitId,
        title: 'Later',
        startsAt: `${a.c.startDate}T10:00:00+07:00`,
        endsAt: `${a.c.startDate}T11:00:00+07:00`,
      });
      const added = detail.units[0]?.sessions[1];
      if (!added) throw new Error('Missing second session');
      const result = await assignments.assignClass(
        a.c.id,
        {
          mentorId: next.id,
          reason: 'New primary',
          expectedVersion: (await f.read.getDetail(a.c.id)).classEntity.assignmentVersion,
        },
        staff,
        randomUUID(),
      );
      expect(result.affectedSessionCount).toBe(1);
      expect((await session(a.s.id)).mentorOverrideId).toBe(substitute.id);
      expect((await session(added.id)).version).toBe(added.version + 1);
      await assign(a.s.id, null);
      expect(
        (await read.classDetail(a.c.id, PAGE)).sessions.items.find((s) => s.sessionId === a.s.id)
          ?.effectiveMentor?.id,
      ).toBe(next.id);
      await db
        .getRepository(ClassSessionEntity)
        .update(added.id, { status: SessionStatus.COMPLETED });
      expect(
        (await read.classDetail(a.c.id, PAGE)).sessions.items.find((s) => s.sessionId === added.id)
          ?.effectiveMentor,
      ).toBeNull();
    });

    it('rechecks override mentors in add, reschedule and open writers and keeps version changes atomic', async () => {
      const a = await fixture();
      const substitute = await f.user(UserRole.MENTOR);
      await assign(a.s.id, substitute.id);
      const other = await parallelClass(a, substitute.id, '10:00', '11:00');
      await f.classes.open(other.c.id);
      await expect(
        f.classes.updateSessionTimes(a.c.id, [a.s.id], { startTime: '10:00', endTime: '11:00' }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await session(a.s.id)).startsAt).toEqual(a.s.startsAt);
      const draft = await parallelClass(a, (await f.user(UserRole.MENTOR)).id);
      await assign(draft.s.id, substitute.id);
      await expect(f.classes.open(draft.c.id)).rejects.toMatchObject({ status: 409 });
      expect((await db.getRepository(ClassEntity).findOneByOrFail({ id: draft.c.id })).status).toBe(
        ClassStatus.DRAFT,
      );
      await expect(f.classes.update(a.c.id, { mentorId: substitute.id })).rejects.toMatchObject({
        status: 422,
      });
    });

    it('rejects wrong roles, inactive mentors and terminal session mutation', async () => {
      const a = await fixture();
      const student = await f.user();
      const inactive = await f.user(UserRole.MENTOR);
      await f.users.updateStatus(inactive.id, UserStatus.SUSPENDED);
      for (const id of [student.id, inactive.id])
        await expect(assign(a.s.id, id)).rejects.toMatchObject({ status: 422 });
      for (const status of [SessionStatus.COMPLETED, SessionStatus.CANCELLED]) {
        await db.getRepository(ClassSessionEntity).update(a.s.id, { status });
        await expect(assign(a.s.id, null)).rejects.toMatchObject({ status: 409 });
      }
    });

    it.each(['add', 'bulk', 'open', 'class'] as const)(
      'serializes session assignment racing with a %s writer on another class',
      async (writer) => {
        const a = await fixture();
        const cover = await f.user(UserRole.MENTOR);
        const b = await parallelClass(
          a,
          writer === 'class' ? (await f.user(UserRole.MENTOR)).id : cover.id,
          writer === 'add' || writer === 'bulk' ? '10:00' : '08:00',
          writer === 'add' || writer === 'bulk' ? '11:00' : '09:00',
        );
        if (writer !== 'open') await f.classes.open(b.c.id);
        const before = await f.read.getDetail(b.c.id);
        const key = randomUUID();
        const write = () => {
          if (writer === 'open') return f.classes.open(b.c.id);
          if (writer === 'class')
            return assignments.assignClass(
              b.c.id,
              {
                mentorId: cover.id,
                reason: 'Assign primary',
                expectedVersion: before.classEntity.assignmentVersion,
              },
              staff,
              randomUUID(),
            );
          if (writer === 'bulk')
            return f.classes.updateSessionTimes(b.c.id, [b.s.id], {
              startTime: '08:00',
              endTime: '09:00',
            });
          return f.classes.scheduleSession(b.c.id, {
            classUnitId: b.s.classUnitId,
            title: 'Competing slot',
            startsAt: `${a.c.startDate}T08:00:00+07:00`,
            endsAt: `${a.c.startDate}T09:00:00+07:00`,
          });
        };
        const results = await Promise.allSettled([assign(a.s.id, cover.id, key), write()]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.find((r) => r.status === 'rejected')).toMatchObject({
          reason: { status: 409 },
        });
        const occupied: { count: string }[] = await db.query(
          `SELECT count(*) FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id
           JOIN classes c ON c.id=u.class_id WHERE c.status IN ('OPEN','IN_PROGRESS')
           AND s.status='SCHEDULED' AND COALESCE(s.mentor_override_id,c.mentor_id)=$1
           AND s.starts_at<$3 AND s.ends_at>$2`,
          [cover.id, a.s.startsAt, a.s.endsAt],
        );
        expect(occupied[0]?.count).toBe('1');
        if (results[0]?.status === 'rejected') {
          expect((await session(a.s.id)).version).toBe(a.s.version);
          expect(
            await db.query('SELECT 1 FROM teaching_mutation_receipts WHERE key=$1', [key]),
          ).toHaveLength(0);
        } else {
          const after = await f.read.getDetail(b.c.id);
          expect(after.classEntity).toMatchObject({
            status: before.classEntity.status,
            mentorId: before.classEntity.mentorId,
            assignmentVersion: before.classEntity.assignmentVersion,
          });
          expect(after.units[0]?.sessions).toHaveLength(before.units[0]?.sessions.length ?? 0);
          expect((await session(b.s.id)).startsAt).toEqual(b.s.startsAt);
          expect((await session(b.s.id)).version).toBe(
            before.units[0]?.sessions.find((s) => s.id === b.s.id)?.version,
          );
        }
      },
    );

    it('rejects new overnight sessions atomically and refuses to open legacy overnight schedules', async () => {
      const a = await fixture();
      const nextDay = new Date(`${a.c.startDate}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      await expect(
        f.classes.scheduleSession(a.c.id, {
          classUnitId: a.s.classUnitId,
          title: 'Overnight',
          startsAt: `${a.c.startDate}T23:00:00+07:00`,
          endsAt: `${nextDay.toISOString().slice(0, 10)}T01:00:00+07:00`,
        }),
      ).rejects.toMatchObject({ response: { code: 'CLASS_SESSION_OVERNIGHT_NOT_ALLOWED' } });
      expect((await f.read.getDetail(a.c.id)).classEntity.assignmentVersion).toBe(
        a.c.assignmentVersion,
      );
      const draft = await parallelClass(a, (await f.user(UserRole.MENTOR)).id);
      await db.query('UPDATE class_sessions SET ends_at=$2 WHERE id=$1', [
        draft.s.id,
        new Date(`${nextDay.toISOString().slice(0, 10)}T01:00:00+07:00`),
      ]);
      await expect(f.classes.open(draft.c.id)).rejects.toMatchObject({
        response: { code: 'CLASS_NOT_READY_TO_OPEN' },
      });
      expect((await f.read.getDetail(draft.c.id)).classEntity.status).toBe('DRAFT');
    });

    it('checks only the affected primary set for class candidates and handles search, empty sets and terminal classes', async () => {
      const a = await fixture();
      const cover = await f.user(UserRole.MENTOR);
      await assign(a.s.id, cover.id);
      const detail = await f.classes.scheduleSession(a.c.id, {
        classUnitId: a.s.classUnitId,
        title: 'Primary slot',
        startsAt: `${a.c.startDate}T10:00:00+07:00`,
        endsAt: `${a.c.startDate}T11:00:00+07:00`,
      });
      const primary = detail.units[0]?.sessions.find((s) => s.id !== a.s.id);
      if (!primary) throw new Error('Missing primary slot');
      const free = await f.user(UserRole.MENTOR),
        blocked = await f.user(UserRole.MENTOR);
      await f.classes.open((await parallelClass(a, free.id)).c.id);
      await f.classes.open((await parallelClass(a, blocked.id, '10:00', '11:00')).c.id);
      const candidates = await read.classCandidates(a.c.id, PAGE);
      expect(candidates.affectedSessionCount).toBe(1);
      expect(candidates.items.map((u) => u.id)).toContain(free.id);
      expect(candidates.items.map((u) => u.id)).not.toContain(blocked.id);
      expect(candidates.items.find((u) => u.id === a.c.mentorId)?.isCurrent).toBe(true);
      await db.query('UPDATE users SET display_name=$2 WHERE id=$1', [free.id, 'Alpha_100%']);
      await db.query('UPDATE users SET display_name=$2 WHERE id=$1', [blocked.id, 'Alphax100zz']);
      expect(
        (await read.classCandidates(a.c.id, { ...PAGE, search: 'Alpha_100%' })).items.map(
          (u) => u.id,
        ),
      ).toEqual([free.id]);
      await assign(primary.id, cover.id);
      expect((await read.classCandidates(a.c.id, PAGE)).affectedSessionCount).toBe(0);
      expect((await read.classCandidates(a.c.id, PAGE)).items.map((u) => u.id)).toContain(
        blocked.id,
      );
      await f.users.updateStatus(blocked.id, UserStatus.SUSPENDED);
      expect((await read.classCandidates(a.c.id, PAGE)).items.map((u) => u.id)).not.toContain(
        blocked.id,
      );
      await db.getRepository(ClassEntity).update(a.c.id, { status: ClassStatus.COMPLETED });
      await expect(read.classCandidates(a.c.id, PAGE)).rejects.toMatchObject({ status: 409 });
    });

    it.each(['session', 'class'] as const)(
      'rolls back %s assignment, versions and receipt when audit fails',
      async (scope) => {
        const a = await fixture(),
          cover = await f.user(UserRole.MENTOR),
          key = randomUUID();
        await db.query(`CREATE FUNCTION reject_teaching_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Teaching audit failure'; END $$;
        CREATE TRIGGER test_teaching_audit_failure BEFORE INSERT ON teaching_assignment_audits FOR EACH ROW EXECUTE FUNCTION reject_teaching_audit();`);
        try {
          const action =
            scope === 'session'
              ? assign(a.s.id, cover.id, key)
              : assignments.assignClass(
                  a.c.id,
                  {
                    mentorId: cover.id,
                    reason: 'Change primary',
                    expectedVersion: a.c.assignmentVersion,
                  },
                  staff,
                  key,
                );
          await expect(action).rejects.toThrow('Teaching audit failure');
          expect(await session(a.s.id)).toMatchObject({
            mentorOverrideId: null,
            version: a.s.version,
          });
          expect((await f.read.getDetail(a.c.id)).classEntity).toMatchObject({
            mentorId: a.c.mentorId,
            assignmentVersion: a.c.assignmentVersion,
          });
          expect(
            await db.query('SELECT 1 FROM teaching_mutation_receipts WHERE key=$1', [key]),
          ).toHaveLength(0);
          expect(
            await db.query('SELECT 1 FROM teaching_assignment_audits WHERE class_id=$1', [a.c.id]),
          ).toHaveLength(0);
        } finally {
          await db.query(
            'DROP TRIGGER test_teaching_audit_failure ON teaching_assignment_audits; DROP FUNCTION reject_teaching_audit()',
          );
        }
      },
    );

    it('revokes assignment replay when staff status or role changes', async () => {
      const a = await fixture(),
        manager = await f.user(UserRole.MANAGER),
        cover = await f.user(UserRole.MENTOR);
      const localStaff = { ...staff, userId: manager.id },
        key = randomUUID();
      const input = { mentorId: cover.id, reason: 'Cover', expectedVersion: a.s.version };
      await assignments.assignSession(a.s.id, input, localStaff, key);
      await f.users.updateStatus(manager.id, UserStatus.SUSPENDED);
      await expect(assignments.assignSession(a.s.id, input, localStaff, key)).rejects.toMatchObject(
        { status: 403 },
      );
      await db.query("UPDATE users SET status='ACTIVE',role='MENTOR' WHERE id=$1", [manager.id]);
      await expect(assignments.assignSession(a.s.id, input, localStaff, key)).rejects.toMatchObject(
        { status: 403 },
      );
      expect((await session(a.s.id)).version).toBe(a.s.version + 1);
      expect(
        await db.query('SELECT 1 FROM teaching_assignment_audits WHERE session_id=$1', [a.s.id]),
      ).toHaveLength(1);
    });

    it('reassigns in-progress sessions without resetting clocks; overdue progress does not occupy the next slot', async () => {
      const a = await fixture();
      const original = new Date(Date.now() - 86400000);
      const deadline = new Date(original.getTime() + 86400000);
      await db.getRepository(ClassSessionEntity).update(a.s.id, {
        status: SessionStatus.IN_PROGRESS,
        teachingMentorId: a.c.mentorId,
        actualStartedAt: original,
        startedBy: a.c.mentorId,
        editableUntil: deadline,
      });
      const b = await f.user(UserRole.MENTOR);
      await assign(a.s.id, b.id);
      expect(await session(a.s.id)).toMatchObject({
        teachingMentorId: b.id,
        actualStartedAt: original,
        startedBy: a.c.mentorId,
        editableUntil: deadline,
      });
      await db.getRepository(ClassSessionEntity).update(a.s.id, {
        startsAt: new Date(Date.now() - 7200000),
        endsAt: new Date(Date.now() - 3600000),
      });
      const candidates = await read.sessionCandidates(a.s.id, PAGE);
      expect(candidates.checkedFrom).toEqual(candidates.checkedTo);
      expect(candidates.items.map((u) => u.id)).toContain(b.id);
    });
  },
);
