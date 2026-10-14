import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('attendance_migration'))('Phase 4.2 migration rehearsal', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await paymentDatabase('attendance_migration', {
      entities: [AttendanceRecordEntity],
      migrations: [SessionAttendance1791849600001],
    });
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  it('backfills only session ancestry, preserves legacy no-data, rolls down and reapplies', async () => {
    await db.undoLastMigration();
    const f = paymentFixture(db),
      order = await f.order();
    const classId = order.classIds[0] ?? '';
    await db.query(
      "UPDATE class_sessions SET status='COMPLETED' WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)",
      [classId],
    );
    await db.runMigrations();
    expect(await db.query('SELECT 1 FROM attendance_records')).toHaveLength(0);
    expect(
      (
        await db.query('SELECT class_id,actual_started_at,teaching_mentor_id FROM class_sessions')
      )[0],
    ).toMatchObject({ class_id: classId, actual_started_at: null, teaching_mentor_id: null });
    await db.undoLastMigration();
    expect(
      await db.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name='class_sessions' AND column_name='class_id'",
      ),
    ).toHaveLength(0);
    await db.runMigrations();
    expect(await db.query('SELECT 1 FROM attendance_records')).toHaveLength(0);
    const newOrder = await f.order();
    expect(
      await db.query('SELECT 1 FROM class_sessions WHERE class_id=$1', [newOrder.classIds[0]]),
    ).toHaveLength(1);
  });
});
