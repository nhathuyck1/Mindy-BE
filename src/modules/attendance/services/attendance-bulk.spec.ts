import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import { UserRole } from '../../users/user-role.enum.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';
import { AttendanceService } from './attendance.service.js';
import { GuestAttendanceService } from './guest-attendance.service.js';

function fixture(count = 101, guestCount = 2) {
  const actor = { userId: randomUUID(), role: UserRole.MENTOR, sessionId: randomUUID() };
  const session = {
    id: randomUUID(),
    version: 1,
    status: SessionStatus.IN_PROGRESS,
    actualStartedAt: new Date(),
    editableUntil: new Date(Date.now() + 86400000),
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 3600000),
    mentorOverrideId: null,
    teachingMentorId: actor.userId,
  };
  const classEntity = { id: randomUUID(), mentorId: actor.userId, status: ClassStatus.IN_PROGRESS };
  const regular = Array.from({ length: count }, () => ({
    id: randomUUID(),
    enrollmentId: randomUUID(),
    status: AttendanceStatus.UNMARKED,
    checkedInAt: null as Date | null,
    recordedBy: '',
  }));
  const guests = Array.from({ length: guestCount }, () => ({
    id: randomUUID(),
    placement_id: randomUUID(),
    status: AttendanceStatus.UNMARKED,
    checkedInAt: null as Date | null,
  }));
  const receipts = new Map<string, { payload_hash: string; outcome: unknown }>();
  const audits: unknown[][] = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('SELECT payload_hash')) {
      const receipt = receipts.get(`${params[1]}:${params[2]}`);
      return receipt ? [receipt] : [];
    }
    if (sql.startsWith('INSERT INTO attendance_mutation_receipts')) {
      receipts.set(`${params[1]}:${params[2]}`, {
        payload_hash: String(params[3]),
        outcome: JSON.parse(String(params[4])),
      });
      return [];
    }
    if (sql.startsWith('SELECT enrollment_id'))
      return regular.map((r) => ({ enrollment_id: r.enrollmentId }));
    if (sql.startsWith('SELECT placement_id')) return guests;
    if (sql.includes('SELECT g.id,g.placement_id,g.status')) return guests.map((r) => ({ ...r }));
    if (sql.startsWith('UPDATE guest_attendance_records')) {
      const row = guests.find((r) => r.id === params[0]);
      if (!row) throw new Error('Missing guest');
      row.status = params[1] as AttendanceStatus;
      row.checkedInAt = params[2] as Date | null;
      return [];
    }
    if (
      sql.startsWith('INSERT INTO attendance_audits') ||
      sql.startsWith('INSERT INTO guest_attendance_audits')
    ) {
      audits.push(params);
      return [];
    }
    if (sql.startsWith('SELECT status,count(*)')) {
      return Object.values(AttendanceStatus).map((status) => ({
        status,
        count: String([...regular, ...guests].filter((r) => r.status === status).length),
      }));
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const manager = {
    query,
    getRepository: () => ({
      findBy: async () => regular,
      save: async (row: unknown) => row,
    }),
  };
  const deps = [
    { transaction: async (work: (m: typeof manager) => Promise<unknown>) => work(manager) },
    {
      loadSession: vi.fn(async () => ({ session, classEntity })),
      sessionViews: async () => [session],
      timeZone: () => 'Asia/Bangkok',
    },
    {
      bumpVersion: vi.fn(async () => {
        session.version++;
      }),
    },
    {},
    {},
    { findActiveByRole: async () => actor },
    {},
    new GuestAttendanceService(),
  ] as unknown as ConstructorParameters<typeof AttendanceService>;
  return {
    service: new AttendanceService(...deps),
    actor,
    session,
    regular,
    guests,
    audits,
    query,
  };
}

describe('Bulk attendance', () => {
  it('checks and unchecks more than one page, including guests, with one version and individual audits', async () => {
    const f = fixture();
    const marked = await f.service.bulkMark(
      f.session.id,
      { expectedVersion: 1, checked: true },
      f.actor,
      randomUUID(),
    );
    expect(marked.totals).toEqual({ eligible: 103, present: 103, absent: 0, unmarked: 0 });
    expect(marked.changedEnrollmentIds).toHaveLength(101);
    expect(marked.changedMakeupPlacementIds).toHaveLength(2);
    expect(f.session.version).toBe(2);
    expect(f.audits).toHaveLength(103);
    expect(f.regular.every((r) => r.checkedInAt instanceof Date)).toBe(true);
    expect(f.guests.every((r) => r.checkedInAt instanceof Date)).toBe(true);
    const cleared = await f.service.bulkMark(
      f.session.id,
      { expectedVersion: 2, checked: false },
      f.actor,
      randomUUID(),
    );
    expect(cleared.totals).toEqual({ eligible: 103, present: 0, absent: 103, unmarked: 0 });
    expect(f.session.version).toBe(3);
    expect(f.audits).toHaveLength(206);
    expect([...f.regular, ...f.guests].every((r) => r.checkedInAt === null)).toBe(true);
  });

  it('replays without writes, distinguishes checked values and rejects stale versions', async () => {
    const f = fixture(2, 1),
      key = randomUUID();
    const input = { expectedVersion: 1, checked: true };
    const marked = await f.service.bulkMark(f.session.id, input, f.actor, key);
    expect(await f.service.bulkMark(f.session.id, input, f.actor, key)).toEqual(
      JSON.parse(JSON.stringify(marked)),
    );
    expect(f.audits).toHaveLength(3);
    await expect(
      f.service.bulkMark(f.session.id, { ...input, checked: false }, f.actor, key),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(
      f.service.bulkMark(f.session.id, input, f.actor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'SESSION_VERSION_CONFLICT' } });
    const noop = await f.service.bulkMark(
      f.session.id,
      { expectedVersion: 2, checked: true },
      f.actor,
      randomUUID(),
    );
    expect(noop.changedEnrollmentIds).toEqual([]);
    expect(noop.changedMakeupPlacementIds).toEqual([]);
    expect(f.session.version).toBe(2);
    expect(f.audits).toHaveLength(3);
  });

  it('handles an empty snapshot without incrementing the version', async () => {
    const f = fixture(0, 0);
    const result = await f.service.bulkMark(
      f.session.id,
      { expectedVersion: 1, checked: false },
      f.actor,
      randomUUID(),
    );
    expect(result.totals.eligible).toBe(0);
    expect(f.session.version).toBe(1);
  });

  it('preserves assignment, edit deadline, session state and staff reason checks', async () => {
    const f = fixture(1, 0);
    const input = { expectedVersion: 1, checked: true };
    await expect(
      f.service.bulkMark(f.session.id, input, { ...f.actor, userId: randomUUID() }, randomUUID()),
    ).rejects.toBeDefined();
    f.session.editableUntil = new Date(0);
    await expect(
      f.service.bulkMark(f.session.id, input, f.actor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'ATTENDANCE_EDIT_WINDOW_EXPIRED' } });
    f.session.editableUntil = new Date(Date.now() + 86400000);
    f.session.status = SessionStatus.SCHEDULED;
    await expect(
      f.service.bulkMark(f.session.id, input, f.actor, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'SESSION_STATE_CONFLICT' } });
    f.session.status = SessionStatus.COMPLETED;
    await expect(
      f.service.bulkMark(f.session.id, input, { ...f.actor, role: UserRole.MANAGER }, randomUUID()),
    ).rejects.toThrow('Staff mutations require a reason');
    await f.service.bulkMark(f.session.id, input, f.actor, randomUUID());
    expect(f.regular[0]?.status).toBe(AttendanceStatus.PRESENT);
  });
});
