import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { MyScheduleQueryDto } from './my-schedule-query.dto.js';

async function errorsOf(query: Record<string, string>): Promise<string[]> {
  const dto = plainToInstance(MyScheduleQueryDto, query);
  return (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map(
    (error) => error.property,
  );
}

const WEEK = { from: '2026-10-11T17:00:00Z', to: '2026-10-18T17:00:00Z' };

describe('MyScheduleQueryDto', () => {
  it('accepts a zoned range and applies defaults', async () => {
    const dto = plainToInstance(MyScheduleQueryDto, WEEK);
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 1, pageSize: 100, includeCancelled: true });
  });

  it('accepts offsets equivalent to UTC and fractional seconds', async () => {
    expect(
      await errorsOf({ from: '2026-10-12T00:00:00+07:00', to: '2026-10-19T00:00:00.000+07:00' }),
    ).toEqual([]);
  });

  it('rejects timestamps without a timezone or with an invalid calendar date', async () => {
    for (const from of ['2026-10-11T17:00:00', '2026-10-11', '2026-02-30T00:00:00Z', 'tomorrow']) {
      expect(await errorsOf({ ...WEEK, from })).toContain('from');
    }
  });

  it('rejects empty, reversed and over-31-day ranges', async () => {
    expect(await errorsOf({ ...WEEK, to: WEEK.from })).toEqual(['to']);
    expect(await errorsOf({ from: WEEK.to, to: WEEK.from })).toEqual(['to']);
    expect(
      await errorsOf({ from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00.001Z' }),
    ).toEqual(['to']);
    expect(await errorsOf({ from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' })).toEqual(
      [],
    );
  });

  it('parses includeCancelled strictly and bounds pagination', async () => {
    const dto = plainToInstance(MyScheduleQueryDto, { ...WEEK, includeCancelled: 'false' });
    expect(dto.includeCancelled).toBe(false);
    expect(await errorsOf({ ...WEEK, includeCancelled: 'yes' })).toEqual(['includeCancelled']);
    expect(await errorsOf({ ...WEEK, pageSize: '101' })).toEqual(['pageSize']);
    expect(await errorsOf({ ...WEEK, classId: 'not-a-uuid' })).toEqual(['classId']);
    expect(await errorsOf({ ...WEEK, studentId: '11111111-1111-4111-8111-111111111111' })).toEqual([
      'studentId',
    ]);
  });
});
