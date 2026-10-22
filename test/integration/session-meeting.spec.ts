import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { SessionStatus } from '../../src/modules/classes/enums/session-status.enum.js';
import { SessionMeetingService } from '../../src/modules/classes/services/session-meeting.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const actor = (userId: string, role = UserRole.MENTOR): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});
const url = 'https://meet.google.com/abc-defg-hij';
describe.skipIf(!separateTestUrl('session_meetings'))('Mentor meeting URL PostgreSQL', () => {
  let db: DataSource, f: ReturnType<typeof paymentFixture>, meetings: SessionMeetingService;
  beforeAll(async () => {
    db = await paymentDatabase('session_meetings');
    f = paymentFixture(db);
    meetings = new SessionMeetingService(
      db,
      f.workspace,
      new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService()),
    );
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function setup() {
    const order = await f.order();
    const classId = order.classIds[0] ?? '';
    const detail = await f.read.getDetail(classId);
    const session = detail.units[0]?.sessions[0];
    if (!session) throw new Error('Missing session');
    return { classId, session, mentor: actor(order.mentor.id) };
  }
  it('updates only this session, supports clearing/fallback and rejects stale versions', async () => {
    const s = await setup();
    const before = await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: s.session.id });
    await db
      .getRepository(ClassEntity)
      .update(s.classId, { meetingUrl: 'https://meet.google.com/class-room-url' });
    const saved = await meetings.update(s.session.id, s.mentor, {
      meetingUrl: url,
      expectedVersion: before.version,
    });
    expect(saved).toMatchObject({
      meetingUrl: url,
      effectiveMeetingUrl: url,
      version: before.version + 1,
    });
    const after = await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: s.session.id });
    expect({
      ...after,
      meetingUrl: before.meetingUrl,
      version: before.version,
      updatedAt: before.updatedAt,
    }).toEqual(before);
    expect(
      await meetings.update(s.session.id, s.mentor, {
        meetingUrl: url,
        expectedVersion: saved.version,
      }),
    ).toEqual(saved);
    await expect(
      meetings.update(s.session.id, s.mentor, {
        meetingUrl: null,
        expectedVersion: before.version,
      }),
    ).rejects.toMatchObject({ response: { code: 'SESSION_VERSION_CONFLICT' } });
    expect(
      await meetings.update(s.session.id, s.mentor, {
        meetingUrl: null,
        expectedVersion: saved.version,
      }),
    ).toMatchObject({
      meetingUrl: null,
      effectiveMeetingUrl: 'https://meet.google.com/class-room-url',
    });
  });
  it('checks active mentor role and effective assignment including substitute and teaching snapshot', async () => {
    const s = await setup();
    const sub = actor((await f.user(UserRole.MENTOR)).id);
    const before = await db.getRepository(ClassSessionEntity).findOneByOrFail({ id: s.session.id });
    const input = { meetingUrl: url, expectedVersion: before.version };
    await expect(meetings.update(s.session.id, sub, input)).rejects.toMatchObject({ status: 403 });
    await expect(
      meetings.update(s.session.id, actor(s.mentor.userId, UserRole.ADMIN), input),
    ).rejects.toMatchObject({ status: 403 });
    await db
      .getRepository(ClassSessionEntity)
      .update(s.session.id, { mentorOverrideId: sub.userId });
    await expect(meetings.update(s.session.id, s.mentor, input)).rejects.toMatchObject({
      status: 403,
    });
    const saved = await meetings.update(s.session.id, sub, input);
    await db.getRepository(ClassSessionEntity).update(s.session.id, {
      status: SessionStatus.IN_PROGRESS,
      teachingMentorId: sub.userId,
      mentorOverrideId: null,
    });
    await expect(
      meetings.update(s.session.id, s.mentor, { ...input, expectedVersion: saved.version }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await meetings.update(s.session.id, sub, {
        meetingUrl: null,
        expectedVersion: saved.version,
      }),
    ).toMatchObject({ meetingUrl: null });
  });
  it('blocks completed/cancelled sessions and classes, and missing sessions', async () => {
    const s = await setup();
    const input = { meetingUrl: url, expectedVersion: s.session.version };
    await expect(meetings.update(randomUUID(), s.mentor, input)).rejects.toMatchObject({
      status: 404,
    });
    for (const status of [SessionStatus.COMPLETED, SessionStatus.CANCELLED]) {
      await db
        .getRepository(ClassSessionEntity)
        .update(s.session.id, { status, teachingMentorId: s.mentor.userId });
      await expect(meetings.update(s.session.id, s.mentor, input)).rejects.toMatchObject({
        response: { code: 'SESSION_STATE_CONFLICT' },
      });
    }
    await db
      .getRepository(ClassSessionEntity)
      .update(s.session.id, { status: SessionStatus.SCHEDULED });
    for (const status of [ClassStatus.COMPLETED, ClassStatus.CANCELLED]) {
      await db.getRepository(ClassEntity).update(s.classId, { status });
      await expect(meetings.update(s.session.id, s.mentor, input)).rejects.toMatchObject({
        response: { code: 'SESSION_STATE_CONFLICT' },
      });
    }
  });
  it('serializes concurrent updates so one stale write cannot overwrite the winner', async () => {
    const s = await setup();
    const results = await Promise.allSettled(
      [url, 'https://meet.google.com/xyz-abcd-efg'].map((meetingUrl) =>
        meetings.update(s.session.id, s.mentor, { meetingUrl, expectedVersion: s.session.version }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toMatchObject([
      { reason: { response: { code: 'SESSION_VERSION_CONFLICT' } } },
    ]);
  });
});
