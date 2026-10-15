import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('assignment_migration'))('Phase 4.1 migration rehearsal', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await paymentDatabase('assignment_migration');
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  it('rolls back an unused schema and reapplies without generating attendance for legacy completed sessions', async () => {
    const f = paymentFixture(db);
    const order = await f.order();
    const classId = order.classIds[0] ?? '';
    await db.query(
      "UPDATE class_sessions SET status='COMPLETED' WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)",
      [classId],
    );
    await db.undoLastMigration();
    expect(
      (
        await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='assignment_version'",
        )
      ).length,
    ).toBe(0);
    await db.runMigrations();
    const rows: { teaching_mentor_id: string | null }[] = await db.query(
      'SELECT teaching_mentor_id FROM class_sessions',
    );
    expect(rows[0]?.teaching_mentor_id).toBeNull();
    await db.query("UPDATE class_sessions SET status='IN_PROGRESS'");
    await expect(db.undoLastMigration()).rejects.toThrow('retain schema');
    expect(
      (
        await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='assignment_version'",
        )
      ).length,
    ).toBe(1);
  });
});
