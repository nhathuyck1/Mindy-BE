import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClassUnitReleaseAudit1791856800000 } from '../../src/database/migrations/1791856800000-class-unit-release-audit.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassUnitReleaseAuditEntity } from '../../src/modules/classes/entities/class-unit-release-audit.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { ClassUnitStatus } from '../../src/modules/classes/enums/class-unit-status.enum.js';
import { SessionStatus } from '../../src/modules/classes/enums/session-status.enum.js';
import { ClassUnitReleaseService } from '../../src/modules/classes/services/class-unit-release.service.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture } from '../helpers/payment-fixture.js';

describe('Phase 3.3.4 Class Unit release + PostgreSQL', () => {
  let db: DataSource;
  let fixture: ReturnType<typeof paymentFixture>;
  let courses: CoursesService;
  let service: ClassUnitReleaseService;
  let admin: AuthenticatedUser;
  const OPEN = ClassUnitStatus.OPEN;
  const LOCKED = ClassUnitStatus.LOCKED;
  const principal = (user: { id: string; role: UserRole }): AuthenticatedUser => ({
    userId: user.id,
    role: user.role,
    sessionId: randomUUID(),
  });
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated TEST_DATABASE_URL required');
    db = await paymentDatabase('unit_release', {
      entities: [ClassUnitReleaseAuditEntity],
      migrations: [ClassUnitReleaseAudit1791856800000],
    });
    fixture = paymentFixture(db);
    courses = new CoursesService(db);
    service = new ClassUnitReleaseService(db, fixture.users, courses);
    admin = principal(await fixture.user(UserRole.ADMIN));
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'down');
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'up');
  }, 60000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function setup(count = 1) {
    const order = await fixture.order({ count });
    const classId = order.classIds[0];
    if (!classId) throw new Error('Missing class');
    const unit = await db.getRepository(ClassUnitEntity).findOneByOrFail({ classId, position: 1 });
    return { order, classId, unit, actor: principal(order.mentor) };
  }
  const audit = (unitId: string) =>
    db
      .getRepository(ClassUnitReleaseAuditEntity)
      .find({ where: { classUnitId: unitId }, order: { occurredAt: 'ASC', id: 'ASC' } });

  it('keeps attendance and release constraints together after named release down/up', async () => {
    const constraints: { conname: string }[] = await db.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'class_units'::regclass
       AND conname IN ('uq_class_units_attendance_context', 'uq_class_units_id_class')
       AND contype = 'u' ORDER BY conname`,
    );
    expect(constraints.map((row) => row.conname)).toEqual([
      'uq_class_units_attendance_context',
      'uq_class_units_id_class',
    ]);
    const refs: { conname: string; index_name: string }[] = await db.query(
      `SELECT fk.conname, idx.relname AS index_name FROM pg_constraint fk
       JOIN pg_class idx ON idx.oid = fk.conindid
       WHERE fk.conname IN ('fk_class_sessions_unit_class', 'fk_class_unit_release_audit_unit')
       ORDER BY fk.conname`,
    );
    expect(refs.map((row) => row.conname)).toEqual([
      'fk_class_sessions_unit_class',
      'fk_class_unit_release_audit_unit',
    ]);
    expect(refs[0]?.index_name).toBe('uq_class_units_attendance_context');
    expect(await db.showMigrations()).toBe(false);
  });

  it('opens/locks and records actor plus before/after with safe context', async () => {
    const s = await setup();
    const opened = await service.update(s.actor, s.classId, s.unit.id, { status: OPEN });
    expect(opened).toMatchObject({
      id: s.unit.id,
      classId: s.classId,
      courseUnitId: s.unit.courseUnitId,
      status: OPEN,
      unlockAt: null,
    });
    expect(opened.title).not.toBe('');
    expect(Object.keys(opened).sort()).toEqual([
      'classId',
      'courseUnitId',
      'id',
      'position',
      'status',
      'title',
      'unlockAt',
    ]);
    await service.update(admin, s.classId, s.unit.id, { status: LOCKED });
    expect(await audit(s.unit.id)).toMatchObject([
      {
        actorId: s.actor.userId,
        beforeStatus: LOCKED,
        afterStatus: OPEN,
        beforeUnlockAt: null,
        afterUnlockAt: null,
      },
      { actorId: admin.userId, beforeStatus: OPEN, afterStatus: LOCKED },
    ]);
  });
  it('retains omitted schedule, clears null, and retries equal instants without save/audit', async () => {
    const s = await setup();
    await service.update(admin, s.classId, s.unit.id, {
      status: OPEN,
      unlockAt: '2026-10-13T19:00:00+07:00',
    });
    const before = await db.getRepository(ClassUnitEntity).findOneByOrFail({ id: s.unit.id });
    await service.update(s.actor, s.classId, s.unit.id, {
      status: OPEN,
      unlockAt: '2026-10-13T12:00:00Z',
    });
    expect(await db.getRepository(ClassUnitEntity).findOneByOrFail({ id: s.unit.id })).toEqual(
      before,
    );
    expect(await audit(s.unit.id)).toHaveLength(1);
    expect(
      (await service.update(admin, s.classId, s.unit.id, { status: LOCKED })).unlockAt,
    ).toEqual(before.unlockAt);
    expect(
      (await service.update(admin, s.classId, s.unit.id, { status: LOCKED, unlockAt: null }))
        .unlockAt,
    ).toBeNull();
    await service.update(admin, s.classId, s.unit.id, { status: LOCKED, unlockAt: null });
    expect(await audit(s.unit.id)).toHaveLength(3);
  });
  it('serializes concurrent equal and opposite requests into a consistent audit chain', async () => {
    const s = await setup();
    await Promise.all(
      [admin, s.actor].map((actor) =>
        service.update(actor, s.classId, s.unit.id, { status: OPEN }),
      ),
    );
    expect(await audit(s.unit.id)).toHaveLength(1);
    await Promise.all([
      service.update(admin, s.classId, s.unit.id, { status: LOCKED, unlockAt: null }),
      service.update(s.actor, s.classId, s.unit.id, {
        status: OPEN,
        unlockAt: '2030-01-01T00:00:00Z',
      }),
    ]);
    const events = await audit(s.unit.id);
    expect(events).toHaveLength(3);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]?.beforeStatus).toBe(events[i - 1]?.afterStatus);
      expect(events[i]?.beforeUnlockAt).toEqual(events[i - 1]?.afterUnlockAt);
    }
    const row = await db.getRepository(ClassUnitEntity).findOneByOrFail({ id: s.unit.id });
    expect(row.status).toBe(events.at(-1)?.afterStatus);
    expect(row.unlockAt).toEqual(events.at(-1)?.afterUnlockAt);
  });
  it('rejects other mentors, Manager/Student, stale roles and disabled actors', async () => {
    const s = await setup();
    for (const role of [UserRole.MENTOR, UserRole.MANAGER, UserRole.STUDENT]) {
      await expect(
        service.update(principal(await fixture.user(role)), s.classId, s.unit.id, { status: OPEN }),
      ).rejects.toMatchObject({ status: 403 });
    }
    await db.getRepository(UserEntity).update(s.actor.userId, { role: UserRole.STUDENT });
    await expect(
      service.update(s.actor, s.classId, s.unit.id, { status: OPEN }),
    ).rejects.toMatchObject({ status: 403 });
    await db
      .getRepository(UserEntity)
      .update(s.actor.userId, { role: UserRole.MENTOR, status: UserStatus.SUSPENDED });
    await expect(
      service.update(s.actor, s.classId, s.unit.id, { status: OPEN }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await audit(s.unit.id)).toHaveLength(0);
  });
  it('returns ancestry-specific 404 and never changes the other class', async () => {
    const s = await setup(2);
    await expect(
      service.update(admin, randomUUID(), s.unit.id, { status: OPEN }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update(admin, s.classId, randomUUID(), { status: OPEN }),
    ).rejects.toMatchObject({ status: 404 });
    const second = s.order.classIds[1];
    if (!second) throw new Error('Missing class');
    await expect(service.update(admin, second, s.unit.id, { status: OPEN })).rejects.toMatchObject({
      status: 404,
    });
    expect(await audit(s.unit.id)).toHaveLength(0);
  });
  it('conflicts on completed units/cancelled classes, even for no-op requests', async () => {
    const s = await setup();
    await db
      .getRepository(ClassUnitEntity)
      .update(s.unit.id, { status: ClassUnitStatus.COMPLETED });
    await expect(
      service.update(admin, s.classId, s.unit.id, { status: OPEN }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'UNIT_RELEASE_CONFLICT' } });
    await db.getRepository(ClassUnitEntity).update(s.unit.id, { status: LOCKED });
    await fixture.classes.cancel(s.classId);
    for (const actor of [admin, s.actor])
      await expect(
        service.update(actor, s.classId, s.unit.id, { status: LOCKED }),
      ).rejects.toMatchObject({ status: 409 });
    expect(await audit(s.unit.id)).toHaveLength(0);
  });
  it('allows release in a completed class when its unit is not completed', async () => {
    const s = await setup();
    await fixture.classes.start(s.classId);
    await expect(fixture.classes.complete(s.classId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'SESSION_STATE_CONFLICT' },
    });
    // Phase 4 requires terminal sessions before class completion; Unit release is independent.
    await db
      .getRepository(ClassSessionEntity)
      .createQueryBuilder()
      .update()
      .set({ status: SessionStatus.COMPLETED })
      .where('class_unit_id IN (SELECT id FROM class_units WHERE class_id = :classId)', {
        classId: s.classId,
      })
      .execute();
    await fixture.classes.complete(s.classId);
    expect((await service.update(s.actor, s.classId, s.unit.id, { status: OPEN })).status).toBe(
      OPEN,
    );
  });
  it('rolls back release when the audit insert fails', async () => {
    const s = await setup();
    const before = await db.getRepository(ClassUnitEntity).findOneByOrFail({ id: s.unit.id });
    await db.query(
      `ALTER TABLE class_unit_release_audit ADD CONSTRAINT test_reject_audit CHECK (class_unit_id <> '${s.unit.id}'::uuid)`,
    );
    try {
      await expect(
        service.update(admin, s.classId, s.unit.id, { status: OPEN }),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await db.getRepository(ClassUnitEntity).findOneByOrFail({ id: s.unit.id })).toEqual(
        before,
      );
      expect(await audit(s.unit.id)).toHaveLength(0);
    } finally {
      await db.query('ALTER TABLE class_unit_release_audit DROP CONSTRAINT test_reject_audit');
    }
  });
  it.each(['assignment', 'cancel', 'disable', 'role', 'complete'] as const)(
    'holds identity/Class/Unit locks through audit against %s changes',
    async (change) => {
      const s = await setup();
      let resume = () => {};
      let entered = () => {};
      const gate = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const original = courses.findUnitsByIds.bind(courses);
      vi.spyOn(courses, 'findUnitsByIds').mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        entered();
        await gate;
        return result;
      });
      const updating = service.update(s.actor, s.classId, s.unit.id, { status: OPEN });
      await locked;
      const replacement = await fixture.user(UserRole.MENTOR);
      let committed = false;
      const changing = db
        .transaction(async (tx) => {
          if (change === 'assignment')
            await tx.getRepository(ClassEntity).update(s.classId, { mentorId: replacement.id });
          if (change === 'cancel')
            await tx
              .getRepository(ClassEntity)
              .update(s.classId, { status: ClassStatus.CANCELLED });
          if (change === 'disable')
            await tx
              .getRepository(UserEntity)
              .update(s.actor.userId, { status: UserStatus.SUSPENDED });
          if (change === 'role')
            await tx.getRepository(UserEntity).update(s.actor.userId, { role: UserRole.STUDENT });
          if (change === 'complete')
            await tx
              .getRepository(ClassUnitEntity)
              .update(s.unit.id, { status: ClassUnitStatus.COMPLETED });
        })
        .then(() => {
          committed = true;
        });
      try {
        await db.query('SELECT pg_sleep(0.05)');
        expect(committed).toBe(false);
      } finally {
        resume();
      }
      expect((await updating).status).toBe(OPEN);
      await changing;
      await expect(
        service.update(s.actor, s.classId, s.unit.id, { status: LOCKED }),
      ).rejects.toMatchObject({ status: change === 'cancel' || change === 'complete' ? 409 : 403 });
      expect(await audit(s.unit.id)).toHaveLength(1);
    },
  );
  it('rechecks assignment/status after a competing Class transaction wins', async () => {
    const s = await setup();
    const replacement = await fixture.user(UserRole.MENTOR);
    const tx = db.createQueryRunner();
    await tx.connect();
    await tx.startTransaction();
    await tx.manager.getRepository(ClassEntity).update(s.classId, { mentorId: replacement.id });
    const updating = service.update(s.actor, s.classId, s.unit.id, { status: OPEN });
    const result = expect(updating).rejects.toMatchObject({ status: 403 });
    await tx.commitTransaction();
    await tx.release();
    await result;
    expect(await audit(s.unit.id)).toHaveLength(0);
  });
  it('enforces matching Class/Unit audit ancestry and no-op constraint in SQL', async () => {
    const s = await setup(2);
    const second = s.order.classIds[1];
    const event = {
      actorId: admin.userId,
      classId: second,
      classUnitId: s.unit.id,
      beforeStatus: LOCKED,
      afterStatus: OPEN,
      beforeUnlockAt: null,
      afterUnlockAt: null,
      occurredAt: new Date(),
    };
    await expect(db.getRepository(ClassUnitReleaseAuditEntity).save(event)).rejects.toMatchObject({
      code: '23503',
    });
    await expect(
      db
        .getRepository(ClassUnitReleaseAuditEntity)
        .save({ ...event, classId: s.classId, afterStatus: LOCKED }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps existing Class Unit release and enrollment data across test-only migration down/up', async () => {
    const s = await setup();
    await service.update(admin, s.classId, s.unit.id, {
      status: OPEN,
      unlockAt: '2030-01-01T00:00:00Z',
    });
    const units = await db.query('SELECT * FROM class_units ORDER BY id');
    const enrollments = await db.query('SELECT * FROM enrollments ORDER BY id');
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'down');
    expect(await db.query('SELECT * FROM class_units ORDER BY id')).toEqual(units);
    expect(await db.query('SELECT * FROM enrollments ORDER BY id')).toEqual(enrollments);
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'up');
    expect(await db.query('SELECT * FROM class_units ORDER BY id')).toEqual(units);
    expect(
      (await service.update(admin, s.classId, s.unit.id, { status: LOCKED })).unlockAt,
    ).toEqual(new Date('2030-01-01T00:00:00Z'));
    expect(await audit(s.unit.id)).toHaveLength(1);
  });
});
