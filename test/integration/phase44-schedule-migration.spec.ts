import { SessionScheduleOperations1792022400000 } from '../../src/database/migrations/1792022400000-session-schedule-operations.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassScheduleService } from '../../src/modules/classes/services/class-schedule.service.js';
import { SessionOperationsService } from '../../src/modules/classes/services/session-operations.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase44a_migration'))('Phase 4.4a schedule migration', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await paymentDatabase('phase44a_migration');
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('clean up/down/up preserves legacy clocks, mentor unknowns, versions and statuses without backfill', async () => {
    const f = paymentFixture(db),
      a = await f.order();
    await db.query(
      "UPDATE class_sessions SET status='COMPLETED' WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)",
      [a.classIds[0]],
    );
    const before = await db.query(
      'SELECT id,status,starts_at,ends_at,teaching_mentor_id,actual_started_at,editable_until,version FROM class_sessions ORDER BY id',
    );
    await rehearseMigration(db, new SessionScheduleOperations1792022400000(), 'down');
    expect(
      await db.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name='class_sessions' AND column_name='makeup_for_session_id'",
      ),
    ).toHaveLength(0);
    await rehearseMigration(db, new SessionScheduleOperations1792022400000(), 'up');
    expect(
      await db.query(
        'SELECT id,status,starts_at,ends_at,teaching_mentor_id,actual_started_at,editable_until,version FROM class_sessions ORDER BY id',
      ),
    ).toEqual(before);
    expect(
      await db.query('SELECT makeup_for_session_id,makeup_root_session_id FROM class_sessions'),
    ).toEqual([{ makeup_for_session_id: null, makeup_root_session_id: null }]);
    expect(await db.query('SELECT 1 FROM session_schedule_audits')).toHaveLength(0);
  });

  it('protects same-unit ancestry, immutable roots, cancelled sources, unique successors, RESTRICT and history rollback', async () => {
    const f = paymentFixture(db),
      a = await f.order(),
      detail = await f.read.getDetail(a.classIds[0] ?? '');
    const s = detail.units[0]?.sessions[0],
      wrongUnit = detail.units[1]?.unit;
    if (!s || !wrongUnit) throw new Error('Missing ancestry fixture');
    const read = new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService()),
      op = new SessionOperationsService(
        db,
        read,
        f.users,
        new ClassScheduleService(f.config, new ScheduleReservationsService()),
      );
    const staff = {
      userId: (await f.user(UserRole.MANAGER)).id,
      role: UserRole.MANAGER,
      sessionId: randomUUID(),
    };
    const repo = db.getRepository(ClassSessionEntity);
    const child = {
      classUnitId: s.classUnitId,
      sessionNumber: 2,
      title: 'Child',
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      makeupForSessionId: s.id,
      makeupRootSessionId: s.id,
    };
    await expect(repo.save(repo.create(child))).rejects.toMatchObject({ code: '23514' });
    await op.cancel(
      s.id,
      { reason: 'Makeup needed', expectedVersion: s.version },
      staff,
      randomUUID(),
    );
    await expect(
      repo.save(repo.create({ ...child, classUnitId: wrongUnit.id })),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      repo.save(repo.create({ ...child, makeupRootSessionId: randomUUID() })),
    ).rejects.toMatchObject({ code: '23514' });
    const saved = await repo.save(repo.create(child));
    await expect(repo.save(repo.create({ ...child, sessionNumber: 3 }))).rejects.toMatchObject({
      code: '23505',
    });
    await expect(
      db.query('UPDATE class_sessions SET makeup_for_session_id=$2 WHERE id=$1', [
        saved.id,
        saved.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(db.query('DELETE FROM class_sessions WHERE id=$1', [s.id])).rejects.toMatchObject({
      code: '23503',
    });
    await expect(
      rehearseMigration(db, new SessionScheduleOperations1792022400000(), 'down'),
    ).rejects.toThrow('retain schema');
    expect((await repo.findOneByOrFail({ id: saved.id })).makeupRootSessionId).toBe(s.id);
  });
});
