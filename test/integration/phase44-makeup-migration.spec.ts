import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CrossClassMakeup1792022400001 } from '../../src/database/migrations/1792022400001-cross-class-makeup.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase44b_migration'))(
  'Phase 4.4b migration and database invariants',
  () => {
    let db: DataSource;
    beforeAll(async () => {
      db = await paymentDatabase('phase44b_migration');
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    it('clean up/down/up preserves legacy sessions and creates no placement or guest backfill', async () => {
      const f = paymentFixture(db);
      await f.order();
      const before = await db.query('SELECT * FROM class_sessions ORDER BY id');
      await db.undoLastMigration();
      expect(
        await db.query(
          "SELECT 1 FROM information_schema.tables WHERE table_name='makeup_placements'",
        ),
      ).toHaveLength(0);
      await db.runMigrations();
      expect(await db.query('SELECT * FROM class_sessions ORDER BY id')).toEqual(before);
      expect(await db.query('SELECT 1 FROM guest_attendance_records')).toHaveLength(0);
      expect(await db.query('SELECT 1 FROM student_schedule_conflicts')).toHaveLength(0);
    });
    it('protects ancestry, Course Unit, immutable identity, unique obligations/targets, guest identity, RESTRICT and history rollback', async () => {
      const f = paymentFixture(db),
        a = await f.order({ count: 2 }),
        source = await f.read.getDetail(a.classIds[0] ?? ''),
        target = await f.read.getDetail(a.classIds[1] ?? '');
      const s = source.units[0]?.sessions[0],
        t = target.units[0]?.sessions[0];
      if (!s || !t) throw new Error('Missing fixture');
      const enrollment = await f.enrollments.findPendingHold(
        a.student.id,
        source.classEntity.id,
        a.details.find((d) => d.classId === source.classEntity.id)?.id ?? '',
      );
      if (!enrollment) throw new Error('Missing enrollment');
      const conflicts: { id: string }[] = await db.query(
        'INSERT INTO student_schedule_conflicts(enrollment_id,source_session_id) VALUES($1,$2) RETURNING id',
        [enrollment.id, s.id],
      );
      const conflict = conflicts[0]?.id;
      const insert = (root = s.id, unit = source.units[0]?.unit.courseUnitId) =>
        db.query(
          `INSERT INTO makeup_placements(conflict_id,enrollment_id,student_id,source_class_id,
      source_session_id,source_root_session_id,target_class_id,target_session_id,course_unit_id,content_match_confirmed,reason,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'Verified content',$10) RETURNING id`,
          [
            conflict,
            enrollment.id,
            a.student.id,
            source.classEntity.id,
            s.id,
            root,
            target.classEntity.id,
            t.id,
            unit,
            a.mentor.id,
          ],
        );
      await expect(insert(randomUUID())).rejects.toMatchObject({ code: '23514' });
      await expect(insert(s.id, source.units[1]?.unit.courseUnitId)).rejects.toMatchObject({
        code: '23514',
      });
      const rows: { id: string }[] = await insert(),
        id = rows[0]?.id;
      await expect(insert()).rejects.toMatchObject({ code: '23505' });
      await expect(
        db.query('UPDATE makeup_placements SET target_session_id=$2 WHERE id=$1', [id, s.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query('UPDATE class_sessions SET class_unit_id=$2 WHERE id=$1', [
          t.id,
          target.units[1]?.unit.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query('UPDATE class_units SET course_unit_id=$2 WHERE id=$1', [
          t.classUnitId,
          source.units[1]?.unit.courseUnitId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query(
          `INSERT INTO guest_attendance_records(placement_id,session_id,enrollment_id,student_id,admitted_at,recorded_by)
      VALUES($1,$2,$3,$4,now(),$5)`,
          [id, s.id, enrollment.id, a.student.id, a.mentor.id],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        db.query('DELETE FROM class_sessions WHERE id=$1', [t.id]),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        db.query('DELETE FROM enrollments WHERE id=$1', [enrollment.id]),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(db.undoLastMigration()).rejects.toThrow('retain schema');
      expect(await db.query('SELECT 1 FROM makeup_placements WHERE id=$1', [id])).toHaveLength(1);
      // Refusal can also be rehearsed independently without relying on "latest" later on.
      await expect(
        db.transaction(async (m) => {
          if (!m.queryRunner) throw new Error('Missing transaction');
          await new CrossClassMakeup1792022400001().down(m.queryRunner);
        }),
      ).rejects.toThrow('retain schema');
    });
  },
);
