import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { CalendarAttendanceDeadline1791849600002 } from '../../src/database/migrations/1791849600002-calendar-attendance-deadline.js';
import { AttendanceRecordEntity } from '../../src/modules/attendance/entities/attendance-record.entity.js';
import { attendanceDeadline } from '../../src/modules/classes/domain/class-calendar.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('calendar_deadline'))(
  'Phase 4.2 calendar deadline migration',
  () => {
    let db: DataSource;
    beforeEach(async () => {
      db = await paymentDatabase('calendar_deadline', {
        entities: [AttendanceRecordEntity],
        migrations: [SessionAttendance1791849600001, CalendarAttendanceDeadline1791849600002],
      });
    }, 30000);
    afterEach(async () => {
      if (db?.isInitialized) await db.destroy();
    });

    it('rehearses an unused policy up/down/up on a clean database', async () => {
      await rehearseMigration(db, new CalendarAttendanceDeadline1791849600002(), 'down');
      await rehearseMigration(db, new CalendarAttendanceDeadline1791849600002(), 'up');
      expect(await db.query('SELECT 1 FROM attendance_records')).toHaveLength(0);
    });

    it('corrects an existing rolling deadline, preserves history and rejects rollback after use', async () => {
      await rehearseMigration(db, new CalendarAttendanceDeadline1791849600002(), 'down');
      const f = paymentFixture(db),
        order = await f.order();
      const session = (await f.read.getDetail(order.classIds[0] ?? '')).units[0]?.sessions[0];
      if (!session) throw new Error('Missing session');
      const start = new Date('2026-10-13T19:00:00+07:00'),
        actual = new Date('2026-10-13T20:00:00+07:00');
      await db.query(
        `UPDATE class_sessions SET starts_at=$2,ends_at=$3,actual_started_at=$4,
      teaching_mentor_id=$5,started_by=$5,editable_until=$6,status='IN_PROGRESS' WHERE id=$1`,
        [
          session.id,
          start,
          new Date('2026-10-13T21:00:00+07:00'),
          actual,
          order.mentor.id,
          new Date(actual.getTime() + 86400000),
        ],
      );
      await rehearseMigration(db, new CalendarAttendanceDeadline1791849600002(), 'up');
      const rows: {
        editable_until: Date;
        version: number;
        actual_started_at: Date;
        teaching_mentor_id: string;
      }[] = await db.query(
        'SELECT editable_until,version,actual_started_at,teaching_mentor_id FROM class_sessions WHERE id=$1',
        [session.id],
      );
      expect(rows[0]).toMatchObject({
        editable_until: attendanceDeadline(start, 'Asia/Ho_Chi_Minh'),
        actual_started_at: actual,
        teaching_mentor_id: order.mentor.id,
        version: session.version + 1,
      });
      expect(await db.query('SELECT 1 FROM attendance_records')).toHaveLength(0);
      await expect(
        rehearseMigration(db, new CalendarAttendanceDeadline1791849600002(), 'down'),
      ).rejects.toThrow('retain schema and policy');
    });

    it('matches application calendar deadlines through DST and leaves already-correct versions unchanged', async () => {
      const f = paymentFixture(db),
        order = await f.order({ count: 2 });
      const dates = ['2026-03-07T12:00:00-05:00', '2026-10-31T12:00:00-04:00'];
      const sessions: { id: string; startsAt: Date; version: number }[] = [];
      for (const [n, id] of order.classIds.entries()) {
        const session = (await f.read.getDetail(id)).units[0]?.sessions[0];
        const date = dates[n];
        if (!session || !date) throw new Error('Missing DST fixture');
        const at = new Date(date);
        await db.query(
          'UPDATE class_sessions SET starts_at=$2,actual_started_at=$2,editable_until=$3,ends_at=$4 WHERE id=$1',
          [session.id, at, new Date(at.getTime() + 86400000), new Date(at.getTime() + 3600000)],
        );
        sessions.push({ id: session.id, startsAt: at, version: session.version });
      }
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        const migration = new CalendarAttendanceDeadline1791849600002('America/New_York');
        await migration.up(runner);
        await migration.up(runner);
        for (const session of sessions) {
          const rows: { editable_until: Date; version: number }[] = await db.query(
            'SELECT editable_until,version FROM class_sessions WHERE id=$1',
            [session.id],
          );
          expect(rows[0]).toEqual({
            editable_until: attendanceDeadline(session.startsAt, 'America/New_York'),
            version: session.version + 1,
          });
        }
      } finally {
        await runner.release();
      }
    });
  },
);
