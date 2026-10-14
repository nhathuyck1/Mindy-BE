import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { CalendarAttendanceDeadline1791849600002 } from '../../src/database/migrations/1791849600002-calendar-attendance-deadline.js';
import { AttendanceRecoveryEvidence1791849600003 } from '../../src/database/migrations/1791849600003-attendance-recovery-evidence.js';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase43_migration'))(
  'Phase 4.3 migration rehearsal (PostgreSQL)',
  () => {
    let db: DataSource;
    beforeAll(async () => {
      db = await paymentDatabase('phase43_migration', {
        entities: [AttendanceRecordEntity],
        migrations: [
          SessionAttendance1791849600001,
          CalendarAttendanceDeadline1791849600002,
          AttendanceRecoveryEvidence1791849600003,
        ],
      });
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });

    it('clean up/down/up preserves legacy no-data, actors and clocks without guessed backfill', async () => {
      await db.undoLastMigration();
      const f = paymentFixture(db),
        a = await f.order();
      await db.query("UPDATE class_sessions SET status='COMPLETED' WHERE class_id=$1", [
        a.classIds[0],
      ]);
      const before = await db.query(
        'SELECT id,status,actual_started_at,actual_ended_at,teaching_mentor_id,version FROM class_sessions',
      );
      await db.runMigrations();
      expect(
        await db.query(
          'SELECT id,status,actual_started_at,actual_ended_at,teaching_mentor_id,version FROM class_sessions',
        ),
      ).toEqual(before);
      expect(await db.query('SELECT 1 FROM attendance_recovery_audits')).toHaveLength(0);
      expect(await db.query('SELECT 1 FROM attendance_records')).toHaveLength(0);
      await db.undoLastMigration();
      await db.runMigrations();
      expect(
        await db.query(
          'SELECT id,status,actual_started_at,actual_ended_at,teaching_mentor_id,version FROM class_sessions',
        ),
      ).toEqual(before);
    });

    it('enforces exact session/attendance/enrollment/line/payment lineage and RESTRICT; refuses history rollback; paginated history uses index on 20k rows', async () => {
      const f = paymentFixture(db),
        a = await f.order({ paymentType: PaymentType.CASH });
      await f.cash.confirm(a.mentor.id, a.order.id, a.order.totalAmount);
      const classId = a.classIds[0],
        s = (await f.read.getDetail(classId ?? '')).units[0]?.sessions[0];
      const enrollments: { id: string; order_detail_id: string }[] = await db.query(
        'SELECT id,order_detail_id FROM enrollments WHERE class_id=$1',
        [classId],
      );
      const payments: { id: string; paid_at: Date }[] = await db.query(
        'SELECT id,paid_at FROM payment_transactions WHERE order_id=$1',
        [a.order.id],
      );
      const e = enrollments[0],
        p = payments[0];
      if (!s || !e || !p) throw new Error('Missing fixtures');
      const records: { id: string }[] = await db.query(
        `INSERT INTO attendance_records(class_id,enrollment_id,session_id,status,recorded_by,admitted_at,admission_source)
      VALUES($1,$2,$3,'ABSENT',$4,now(),'EVIDENCE_RECOVERY') RETURNING id`,
        [classId, e.id, s.id, a.mentor.id],
      );
      const record = records[0];
      if (!record) throw new Error('Missing record');
      const roots: { id: string }[] = await db.query(
        `INSERT INTO attendance_recovery_audits(session_id,actor_id,version,reason,evidence_note,
      old_status,new_status,new_actual_started_at,new_actual_ended_at,new_editable_until)
      VALUES($1,$2,3,'Verified','Classroom register','SCHEDULED','COMPLETED',now()-interval '1 hour',now(),now()) RETURNING id`,
        [s.id, a.mentor.id],
      );
      const root = roots[0];
      if (!root) throw new Error('Missing root');
      await db.query(
        `INSERT INTO attendance_recovery_audit_items(recovery_audit_id,attendance_id,session_id,enrollment_id,admission_basis,order_detail_id,order_id,payment_id,paid_at)
      VALUES($1,$2,$3,$4,'PAID_BEFORE_START',$5,$6,$7,$8)`,
        [root.id, record.id, s.id, e.id, e.order_detail_id, a.order.id, p.id, p.paid_at],
      );
      const other = await f.order({ paymentType: PaymentType.CASH });
      const foreignE: { id: string; order_detail_id: string }[] = await db.query(
        'SELECT id,order_detail_id FROM enrollments WHERE class_id=$1',
        [other.classIds[0]],
      );
      await expect(
        db.query('UPDATE attendance_recovery_audit_items SET order_detail_id=$1', [
          foreignE[0]?.order_detail_id,
        ]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
      await expect(
        db.query('UPDATE attendance_recovery_audit_items SET enrollment_id=$1', [foreignE[0]?.id]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
      await expect(
        db.query('UPDATE attendance_recovery_audit_items SET session_id=$1', [
          (await f.read.getDetail(other.classIds[0] ?? '')).units[0]?.sessions[0]?.id,
        ]),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
      for (const [table, id] of [
        ['payment_transactions', p.id],
        ['order_details', e.order_detail_id],
        ['attendance_records', record.id],
        ['attendance_recovery_audits', root.id],
      ])
        await expect(db.query(`DELETE FROM ${table} WHERE id=$1`, [id])).rejects.toMatchObject({
          driverError: { code: '23503' },
        });
      await expect(db.undoLastMigration()).rejects.toThrow('history exists');
      expect(await db.query('SELECT 1 FROM attendance_recovery_audit_items')).toHaveLength(1);
      await db.query(
        `INSERT INTO attendance_audits(attendance_id,actor_id,new_status,action,version,occurred_at)
      SELECT $1,$2,'ABSENT','RECOVER',3,now()-n*interval '1 second' FROM generate_series(1,20000) n`,
        [record.id, a.mentor.id],
      );
      await db.query('ANALYZE attendance_audits');
      await db.query('ANALYZE attendance_records');
      const plan = await db.query(
        `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT a.id FROM attendance_audits a
      JOIN attendance_records r ON r.id=a.attendance_id WHERE r.session_id=$1
      ORDER BY a.occurred_at DESC,a.id DESC LIMIT 20`,
        [s.id],
      );
      expect(JSON.stringify(plan)).toContain('Actual Rows');
      const filtered = await db.query(
        `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM attendance_audits
      WHERE attendance_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT 20`,
        [record.id],
      );
      expect(JSON.stringify(filtered)).toContain('idx_attendance_audits_history');
    });
  },
);
