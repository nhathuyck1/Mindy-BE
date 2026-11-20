import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardDto } from '../../src/modules/dashboard/dashboard.dto.js';
import { DASHBOARD_SQL } from '../../src/modules/dashboard/dashboard.sql.js';

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use a dedicated _test database');

describe.skipIf(!url)('Dashboard real PostgreSQL aggregation', () => {
  let db: DataSource;
  let runner: QueryRunner;
  const m1 = randomUUID(),
    m2 = randomUUID(),
    student = randomUUID();
  const course1 = randomUUID(),
    course2 = randomUUID();
  const c1 = randomUUID(),
    c2 = randomUUID(),
    c3 = randomUUID();
  beforeAll(async () => {
    db = await new DataSource({ type: 'postgres', url }).initialize();
    runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const schema = `dashboard_${randomUUID().replaceAll('-', '')}`;
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET LOCAL search_path TO "${schema}"`);
    await runner.query(`
      CREATE TABLE courses (id uuid PRIMARY KEY, title text);
      CREATE TABLE users (id uuid PRIMARY KEY, display_name text, role text);
      CREATE TABLE classes (id uuid PRIMARY KEY, course_id uuid, mentor_id uuid, name text, status text);
      CREATE TABLE enrollments (id uuid PRIMARY KEY, student_id uuid, class_id uuid, status text, enrolled_at timestamptz);
    `);
    await runner.query('INSERT INTO courses VALUES ($1, $2), ($3, $4)', [
      course1,
      'Course A',
      course2,
      'Course B',
    ]);
    await runner.query(
      "INSERT INTO users VALUES ($1, 'Mentor A', 'MENTOR'), ($2, 'Mentor B', 'MENTOR')",
      [m1, m2],
    );
    await runner.query(
      "INSERT INTO classes VALUES ($1,$2,$3,'A1','OPEN'), ($4,$2,$3,'A2','IN_PROGRESS'), ($5,$6,$7,'B1','COMPLETED')",
      [c1, course1, m1, c2, c3, course2, m2],
    );
    for (const [classId, status, date] of [
      [c1, 'ACTIVE', '2026-11-02T17:00:00Z'],
      [c2, 'COMPLETED', '2026-11-03T01:00:00Z'],
      [c3, 'ACTIVE', '2026-11-03T02:00:00Z'],
      [c1, 'PENDING_PAYMENT', '2026-11-03T03:00:00Z'],
      [c1, 'CANCELLED', '2026-11-03T03:00:00Z'],
      [c1, 'ACTIVE', '2026-10-01T00:00:00Z'],
      [c1, 'ACTIVE', '2026-11-03T12:00:00Z'],
    ])
      await runner.query('INSERT INTO enrollments VALUES ($1,$2,$3,$4,$5)', [
        randomUUID(),
        student,
        classId,
        status,
        date,
      ]);
  });
  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) await runner.release();
    if (db?.isInitialized) await db.destroy();
  });
  async function read(mentor: string | null, from = '2026-11-02T17:00:00Z') {
    const rows: DashboardDto[] = await runner.query(DASHBOARD_SQL, [
      mentor,
      from,
      '2026-11-03T12:00:00Z',
    ]);
    return rows[0];
  }
  it('counts confirmed registrations, distinct students and classes without join duplication', async () => {
    const result = await read(null);
    expect(result?.summary).toEqual({
      courses: 2,
      classes: 3,
      openClasses: 1,
      activeClasses: 1,
      registrations: 3,
      students: 1,
    });
    expect(result?.courses[0]).toMatchObject({
      id: course1,
      registrations: 2,
      students: 1,
      classes: 2,
    });
    expect(result?.mentors.find((row) => row.id === m1)).toMatchObject({
      registrations: 2,
      students: 1,
      classes: 2,
    });
    expect(result?.trend).toEqual([{ date: '2026-11-03', registrations: 3 }]);
  });
  it('excludes other mentor courses, classes and student counts', async () => {
    const result = await read(m1);
    expect(result?.summary).toMatchObject({
      courses: 1,
      classes: 2,
      registrations: 2,
      students: 1,
    });
    expect(result?.mentors).toEqual([]);
    expect(result?.classes.map((row) => row.id).sort()).toEqual([c1, c2].sort());
    expect(result?.courses.map((row) => row.id)).toEqual([course1]);
  });
  it('returns real zeros and fills inactive dates in the trend', async () => {
    const result = await read(randomUUID(), '2026-11-01T17:00:00Z');
    expect(result?.summary.students).toBe(0);
    expect(result?.courses).toEqual([]);
    expect(result?.trend).toEqual([
      { date: '2026-11-02', registrations: 0 },
      { date: '2026-11-03', registrations: 0 },
    ]);
  });
});
