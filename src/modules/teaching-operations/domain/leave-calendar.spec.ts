import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateLeaveInput } from '../dtos/leave.dto.js';
import { leaveDays, noticeDeadline, periodInterval } from './leave-calendar.js';

const zone = 'Asia/Ho_Chi_Minh';
describe('Leave calendar and input boundaries', () => {
  it('uses inclusive local dates and permits exactly 93 days', () => {
    expect(leaveDays('2026-01-01', '2026-04-03')).toHaveLength(93);
    expect(() => leaveDays('2026-01-01', '2026-04-04')).toThrow('93');
    for (const [from, to] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-03-02', '2026-03-01'],
      ['2026-1-1', '2026-01-02'],
    ])
      expect(() => leaveDays(from ?? '', to ?? '')).toThrow();
  });
  it('uses half-open morning/afternoon/evening intervals and next midnight for full-day', () => {
    expect(periodInterval('2026-10-17', 'MORNING', zone)).toEqual({
      startsAt: new Date('2026-10-17T00:00:00+07:00'),
      endsAt: new Date('2026-10-17T12:00:00+07:00'),
    });
    expect(periodInterval('2026-10-17', 'AFTERNOON', zone).endsAt).toEqual(
      periodInterval('2026-10-17', 'EVENING', zone).startsAt,
    );
    expect(periodInterval('2026-10-17', 'FULL_DAY', zone).endsAt).toEqual(
      new Date('2026-10-18T00:00:00+07:00'),
    );
  });
  it('sets exclusive notice boundary at the midnight immediately before the source teaching date', () => {
    expect(noticeDeadline(new Date('2026-10-23T08:00:00+07:00'), zone)).toEqual(
      new Date('2026-10-22T00:00:00+07:00'),
    );
  });
  it('rejects null, invalid nested dates, extra nested keys and nonnumeric versions', async () => {
    const valid = {
      fromDate: '2026-10-23',
      toDate: '2026-10-23',
      period: 'FULL_DAY',
      reason: 'Valid leave',
      sourceVersions: [{ sessionId: randomUUID(), version: 1 }],
      dayMappings: [{ sourceDate: '2026-10-23', targetDate: '2026-10-24' }],
    };
    expect(
      await validate(plainToInstance(CreateLeaveInput, valid), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
    for (const invalid of [
      { ...valid, dayMappings: null },
      { ...valid, dayMappings: [{ sourceDate: '2026-10-23', targetDate: '2026-02-30' }] },
      { ...valid, sourceVersions: [{ sessionId: randomUUID(), version: '1' }] },
      {
        ...valid,
        sourceVersions: [{ sessionId: randomUUID(), version: 1, mentorId: randomUUID() }],
      },
    ])
      expect(
        (
          await validate(plainToInstance(CreateLeaveInput, invalid), {
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        ).length,
      ).toBeGreaterThan(0);
  });
});
