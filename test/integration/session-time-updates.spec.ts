import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceProjectionService } from '../../src/modules/attendance/services/attendance-projection.service.js';
import { toLocalDate } from '../../src/modules/classes/domain/class-calendar.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { SessionStatus } from '../../src/modules/classes/enums/session-status.enum.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { MySchedulePageDto } from '../../src/modules/student-learning/dtos/my-schedule.dto.js';
import { MyScheduleService } from '../../src/modules/student-learning/services/my-schedule.service.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const ZONE = 'Asia/Ho_Chi_Minh';
const TIMES = { startTime: '07:30', endTime: '09:30' };

describe.skipIf(!separateTestUrl('session_times'))('session time updates (PostgreSQL)', () => {
  let db: DataSource;
  let f: ReturnType<typeof paymentFixture>;
  beforeAll(async () => {
    db = await paymentDatabase('session_times');
    f = paymentFixture(db);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function fixture(nextDay = false) {
    const order = await f.order({ paymentType: PaymentType.CASH });
    const classId = order.classIds[0] ?? '';
    const detail = await f.read.getDetail(classId);
    const first = detail.units[0]?.sessions[0];
    if (!first) throw new Error('Missing first session');
    const date = toLocalDate(new Date(first.startsAt.getTime() + (nextDay ? 86400000 : 0)), ZONE);
    if (nextDay) await db.getRepository(ClassEntity).update(classId, { endDate: date });
    const added = await f.classes.scheduleSession(classId, {
      classUnitId: first.classUnitId,
      title: 'Session two',
      startsAt: `${date}T12:00:00+07:00`,
      endsAt: `${date}T13:00:00+07:00`,
    });
    const second = added.units[0]?.sessions[1];
    if (!second) throw new Error('Missing second session');
    return { order, classId, first, second };
  }

  async function stored(id: string) {
    return db.getRepository(ClassSessionEntity).findOneByOrFail({ id });
  }

  it('updates one session, preserves its date/identity and refreshes the student calendar fields', async () => {
    const { classId, first, second, order } = await fixture();
    await f.classes.updateSessionTimes(classId, [first.id], TIMES);
    const updated = await stored(first.id);
    expect(toLocalDate(updated.startsAt, ZONE)).toBe(toLocalDate(first.startsAt, ZONE));
    expect(updated.startsAt).toEqual(
      new Date(`${toLocalDate(first.startsAt, ZONE)}T07:30:00+07:00`),
    );
    expect(updated.endsAt).toEqual(new Date(`${toLocalDate(first.endsAt, ZONE)}T09:30:00+07:00`));
    expect(updated).toMatchObject({
      classUnitId: first.classUnitId,
      title: first.title,
      sessionNumber: first.sessionNumber,
    });
    expect((await stored(second.id)).startsAt).toEqual(second.startsAt);
    const calendar = new MySchedulePageDto(
      await new MyScheduleService(db, f.config, new AttendanceProjectionService(), f.users).list(
        order.student.id,
        {
          classId,
          from: new Date(first.startsAt.getTime() - 86400000),
          to: new Date(first.endsAt.getTime() + 86400000),
          page: 1,
          pageSize: 100,
          includeCancelled: true,
        },
      ),
    );
    expect(calendar.items.find((event) => event.sessionId === first.id)).toMatchObject(TIMES);
  });

  it('updates selected dates together and is idempotent when retried', async () => {
    const { classId, first, second } = await fixture(true);
    for (let attempt = 0; attempt < 2; attempt++)
      await f.classes.updateSessionTimes(classId, [first.id, second.id], TIMES);
    for (const original of [first, second]) {
      expect((await stored(original.id)).startsAt).toEqual(
        new Date(`${toLocalDate(original.startsAt, ZONE)}T07:30:00+07:00`),
      );
    }
  });

  it('rejects an unknown or other-class session before saving any selected session', async () => {
    const a = await fixture(true);
    const b = await fixture();
    for (const badId of [randomUUID(), b.first.id]) {
      await expect(
        f.classes.updateSessionTimes(a.classId, [a.first.id, badId], TIMES),
      ).rejects.toMatchObject({ status: 404 });
      expect((await stored(a.first.id)).startsAt).toEqual(a.first.startsAt);
    }
  });

  it('rejects reversed/equal times and completed/cancelled sessions or classes without partial updates', async () => {
    const { classId, first, second } = await fixture(true);
    for (const endTime of ['07:30', '06:30']) {
      await expect(
        f.classes.updateSessionTimes(classId, [first.id], { startTime: '07:30', endTime }),
      ).rejects.toMatchObject({ status: 422 });
    }
    for (const status of [SessionStatus.COMPLETED, SessionStatus.CANCELLED]) {
      await db.getRepository(ClassSessionEntity).update(second.id, { status });
      await expect(
        f.classes.updateSessionTimes(classId, [first.id, second.id], TIMES),
      ).rejects.toMatchObject({ status: 409 });
      expect((await stored(first.id)).startsAt).toEqual(first.startsAt);
    }
    for (const status of [ClassStatus.COMPLETED, ClassStatus.CANCELLED]) {
      await db.getRepository(ClassEntity).update(classId, { status });
      await expect(f.classes.updateSessionTimes(classId, [first.id], TIMES)).rejects.toMatchObject({
        status: 409,
      });
    }
  });

  it('rolls back overlaps against unselected and selected sessions in the same class', async () => {
    const { classId, first, second } = await fixture();
    for (const ids of [[first.id], [first.id, second.id]]) {
      await expect(
        f.classes.updateSessionTimes(classId, ids, { startTime: '12:30', endTime: '13:30' }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await stored(first.id)).startsAt).toEqual(first.startsAt);
      expect((await stored(second.id)).startsAt).toEqual(second.startsAt);
    }
    // Adjacent sessions are allowed by the half-open overlap rule.
    await f.classes.updateSessionTimes(classId, [first.id], {
      startTime: '10:00',
      endTime: '12:00',
    });
  });

  it('rejects edits to a legacy overnight session without changing its stored dates or version', async () => {
    const { classId, first, second } = await fixture(true);
    const firstDate = toLocalDate(first.startsAt, ZONE);
    const secondDate = toLocalDate(second.startsAt, ZONE);
    await db.getRepository(ClassSessionEntity).update(first.id, {
      startsAt: new Date(`${firstDate}T23:00:00+07:00`),
      endsAt: new Date(`${secondDate}T01:00:00+07:00`),
    });
    const before = await stored(first.id);
    await expect(
      f.classes.updateSessionTimes(classId, [first.id], {
        startTime: '23:30',
        endTime: '01:30',
      }),
    ).rejects.toMatchObject({ response: { code: 'CLASS_SESSION_OVERNIGHT_NOT_ALLOWED' } });
    expect(await stored(first.id)).toMatchObject({
      startsAt: before.startsAt,
      endsAt: before.endsAt,
      version: before.version,
    });
  });

  it('serializes concurrent edits across classes sharing a mentor and rolls back the losing request', async () => {
    const { classId, first } = await fixture();
    const original = (await f.read.getDetail(classId)).classEntity;
    const other = await f.classes.create({
      courseId: original.courseId,
      mentorId: original.mentorId,
      code: randomUUID(),
      name: 'Other class',
      startDate: original.startDate,
      endDate: original.endDate,
      maxStudents: 10,
      deliveryMode: original.deliveryMode,
    });
    const unit = other.units[0];
    if (!unit) throw new Error('Missing unit');
    const scheduled = await f.classes.scheduleSession(other.classEntity.id, {
      classUnitId: unit.unit.id,
      title: 'Other session',
      startsAt: `${original.startDate}T10:00:00+07:00`,
      endsAt: `${original.startDate}T11:00:00+07:00`,
    });
    const otherSession = scheduled.units[0]?.sessions[0];
    if (!otherSession) throw new Error('Missing other session');
    await f.classes.open(other.classEntity.id);
    const results = await Promise.allSettled([
      f.classes.updateSessionTimes(classId, [first.id], TIMES),
      f.classes.updateSessionTimes(other.classEntity.id, [otherSession.id], TIMES),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    const storedStarts = [
      (await stored(first.id)).startsAt,
      (await stored(otherSession.id)).startsAt,
    ];
    expect(
      storedStarts.filter((date) => date.toISOString() === `${original.startDate}T00:30:00.000Z`),
    ).toHaveLength(1);
  });
});
