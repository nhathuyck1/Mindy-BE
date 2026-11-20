import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Correct existing clocks without changing attendance, actual times or historical teachers. */
export class CalendarAttendanceDeadline1791849600002 implements MigrationInterface {
  // Migration CLI reads deployment environment; the default matches environment.schema.ts.
  constructor(private readonly timeZone = process.env.APP_TIME_ZONE ?? 'Asia/Ho_Chi_Minh') {}

  async up(q: QueryRunner): Promise<void> {
    new Intl.DateTimeFormat('en', { timeZone: this.timeZone }).format(new Date());
    await q.query(
      `UPDATE class_sessions SET editable_until =
         (((starts_at AT TIME ZONE $1)::date + 2)::timestamp AT TIME ZONE $1),
         version = version + 1
       WHERE actual_started_at IS NOT NULL AND editable_until IS DISTINCT FROM
         (((starts_at AT TIME ZONE $1)::date + 2)::timestamp AT TIME ZONE $1)`,
      [this.timeZone],
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM class_sessions WHERE actual_started_at IS NOT NULL)
      THEN RAISE EXCEPTION 'Attendance calendar policy is in use; retain schema and policy, roll back application only'; END IF;
    END $$`);
  }
}
