import { SessionMentorAssignment1791849600000 } from '../../src/database/migrations/1791849600000-session-mentor-assignment.js';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { CalendarAttendanceDeadline1791849600002 } from '../../src/database/migrations/1791849600002-calendar-attendance-deadline.js';
import { AttendanceRecoveryEvidence1791849600003 } from '../../src/database/migrations/1791849600003-attendance-recovery-evidence.js';
import { SessionScheduleOperations1792022400000 } from '../../src/database/migrations/1792022400000-session-schedule-operations.js';
import { CrossClassMakeup1792022400001 } from '../../src/database/migrations/1792022400001-cross-class-makeup.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
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
    await rehearseMigration(db, new CrossClassMakeup1792022400001(), 'down');
    await rehearseMigration(db, new AttendanceRecoveryEvidence1791849600003(), 'down');
    await rehearseMigration(db, new CalendarAttendanceDeadline1791849600002(), 'down');
    await rehearseMigration(db, new SessionAttendance1791849600001(), 'down');
    await rehearseMigration(db, new SessionScheduleOperations1792022400000(), 'down');
    await rehearseMigration(db, new SessionMentorAssignment1791849600000(), 'down');
    expect(
      (
        await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='assignment_version'",
        )
      ).length,
    ).toBe(0);
    await rehearseMigration(db, new SessionMentorAssignment1791849600000(), 'up');
    await rehearseMigration(db, new SessionScheduleOperations1792022400000(), 'up');
    await rehearseMigration(db, new SessionAttendance1791849600001(), 'up');
    await rehearseMigration(db, new CalendarAttendanceDeadline1791849600002(), 'up');
    await rehearseMigration(db, new AttendanceRecoveryEvidence1791849600003(), 'up');
    await rehearseMigration(db, new CrossClassMakeup1792022400001(), 'up');
    const rows: { teaching_mentor_id: string | null }[] = await db.query(
      'SELECT teaching_mentor_id FROM class_sessions',
    );
    expect(rows[0]?.teaching_mentor_id).toBeNull();
    await db.query("UPDATE class_sessions SET status='IN_PROGRESS'");
    await expect(
      rehearseMigration(db, new SessionMentorAssignment1791849600000(), 'down'),
    ).rejects.toThrow('retain schema');
    expect(
      (
        await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='assignment_version'",
        )
      ).length,
    ).toBe(1);
  });
});
