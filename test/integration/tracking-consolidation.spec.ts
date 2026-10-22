import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
import { ClassUnitReleaseAudit1791856800000 } from '../../src/database/migrations/1791856800000-class-unit-release-audit.js';
import { TeachingNotes1792627200000 } from '../../src/database/migrations/1792627200000-teaching-notes.js';
import { ConsolidateTracking1792627200002 } from '../../src/database/migrations/1792627200002-consolidate-tracking.js';
import { TrackingService } from '../../src/modules/tracking/tracking.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('tracking'))('Consolidated tracking PostgreSQL', () => {
  let db: DataSource;
  const migration = new ConsolidateTracking1792627200002();
  beforeAll(async () => {
    db = await paymentDatabase('tracking', {
      migrations: [
        PrivateFileUploads1791504000001,
        StudentMaterialReads1791763200000,
        TypedManagerMaterials1791849600000,
        ClassUnitReleaseAudit1791856800000,
        TeachingNotes1792627200000,
      ],
    });
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  it('copies populated history/receipt data and preserves old write contracts, FKs and rollback', async () => {
    const f = paymentFixture(db);
    const o = await f.order();
    const classId = o.classIds[0] ?? '';
    const detail = await f.read.getDetail(classId);
    const session = detail.units[0]?.sessions[0];
    if (!session) throw new Error('Missing session');
    const key = randomUUID();
    await db.query(
      `INSERT INTO teaching_assignment_audits(class_id,session_id,actor_id,new_mentor_id,reason,version)
      VALUES($1,$2,$3,$3,'Original assignment',1)`,
      [classId, session.id, o.mentor.id],
    );
    await db.query(
      `INSERT INTO teaching_note_audits(session_id,actor_id,version,snapshot) VALUES($1,$2,1,'{"note":"preserve"}')`,
      [session.id, o.mentor.id],
    );
    await db.query(
      `INSERT INTO teaching_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,'test',$2,'hash','{"saved":true}')`,
      [o.mentor.id, key],
    );
    await db.query(
      `INSERT INTO teaching_note_receipts(actor_id,idempotency_key,request_hash,response) VALUES($1,$2,'note-hash','{"version":1}')`,
      [o.mentor.id, key],
    );
    for (const table of ['attendance_mutation_receipts', 'makeup_mutation_receipts'])
      await db.query(
        `INSERT INTO ${table}(actor_id,route,key,payload_hash,outcome) VALUES($1,'test',$2,'other-hash','{"different":true}')`,
        [o.mentor.id, key],
      );
    const history = await db.query('SELECT * FROM teaching_assignment_audits ORDER BY id');
    const notes = await db.query('SELECT * FROM teaching_note_audits ORDER BY id');
    await rehearseMigration(db, migration, 'up');
    expect(await db.query('SELECT * FROM teaching_assignment_audits ORDER BY id')).toEqual(history);
    expect(await db.query('SELECT * FROM teaching_note_audits ORDER BY id')).toEqual(notes);
    expect((await db.query('SELECT count(*)::int AS n FROM mutation_receipts'))[0].n).toBe(4);
    await expect(
      db.query(
        `INSERT INTO teaching_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,'test',$2,'hash','{}')`,
        [o.mentor.id, key],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (
        await db.query(
          "SELECT relkind FROM pg_class WHERE oid='teaching_assignment_audits'::regclass",
        )
      )[0].relkind,
    ).toBe('v');
    await db.query(
      `INSERT INTO session_lifecycle_audits(session_id,actor_id,old_status,new_status,version)
      VALUES($1,$2,'SCHEDULED','IN_PROGRESS',2) RETURNING id`,
      [session.id, o.mentor.id],
    );
    await expect(
      db.query(
        `INSERT INTO teaching_note_audits(session_id,actor_id,version,snapshot) VALUES($1,$2,1,'{}')`,
        [session.id, o.mentor.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      db.query(
        `INSERT INTO session_lifecycle_audits(session_id,actor_id,old_status,new_status,version)
      VALUES($1,$2,'SCHEDULED','IN_PROGRESS',2)`,
        [randomUUID(), o.mentor.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      db.query(
        `INSERT INTO teaching_assignment_audits(class_id,session_id,actor_id,new_mentor_id,reason,version)
      VALUES($1,$2,$3,$3,'',2)`,
        [classId, session.id, o.mentor.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(db.query(`UPDATE audit_events SET data='{}'`)).rejects.toMatchObject({
      code: '23514',
    });
    await expect(db.query(`DELETE FROM teaching_note_audits`)).rejects.toMatchObject({
      code: '23514',
    });
    await rehearseMigration(db, migration, 'down');
    expect(
      (
        await db.query(
          'SELECT outcome FROM makeup_mutation_receipts WHERE actor_id=$1 AND key=$2',
          [o.mentor.id, key],
        )
      )[0].outcome,
    ).toEqual({ different: true });
    expect(await db.query('SELECT * FROM teaching_assignment_audits ORDER BY id')).toEqual(history);
    expect(await db.query('SELECT * FROM teaching_note_audits ORDER BY id')).toEqual(notes);
    await rehearseMigration(db, migration, 'up');
    expect((await db.query('SELECT count(*)::int AS n FROM audit_events'))[0].n).toBe(3);
    const adminUser = await f.user(UserRole.ADMIN);
    const admin = { userId: adminUser.id, role: UserRole.ADMIN, sessionId: randomUUID() };
    const tracking = new TrackingService(db, f.users);
    const listed = await tracking.list(admin, {
      page: 1,
      pageSize: 1,
      classId,
      actorId: o.mentor.id,
    });
    expect(listed.total).toBe(3);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).not.toHaveProperty('data');
    const event = listed.items[0];
    if (!event) throw new Error('Missing event');
    const eventDetail = await tracking.detail(admin, event.source, event.id);
    expect(eventDetail.data.actor_id).toBe(o.mentor.id);
    const filtered = await tracking.list(admin, {
      page: 1,
      pageSize: 20,
      source: 'teaching_note_audits',
      entityId: session.id,
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.action).toBe('UPDATE_NOTE');
    await expect(
      tracking.list({ ...admin, role: UserRole.MANAGER }, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      tracking.detail(admin, 'teaching_note_audits', randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await tracking.list(admin, { page: 1, pageSize: 20, from: '2099-01-01T00:00:00Z' })).total,
    ).toBe(0);
  });
});
