import { describe, expect, it } from 'vitest';
import { weeklySchedule } from './weekly-schedule.js';

describe('Weekly curriculum scheduling', () => {
  it('orders Monday/Thursday slot 2 from the selected calendar date in the center timezone', () => {
    const result = weeklySchedule(
      '2026-11-03',
      [
        { weekday: 4, slotId: 2 },
        { weekday: 1, slotId: 2 },
      ],
      4,
      'Asia/Ho_Chi_Minh',
    );
    expect(result.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-11-05T02:30:00.000Z',
      '2026-11-09T02:30:00.000Z',
      '2026-11-12T02:30:00.000Z',
      '2026-11-16T02:30:00.000Z',
    ]);
    expect(result.every((s) => s.endsAt.getTime() - s.startsAt.getTime() === 90 * 60_000)).toBe(
      true,
    );
  });
  it('includes a matching start day and handles month/year boundaries', () => {
    expect(
      weeklySchedule('2026-12-31', [{ weekday: 4, slotId: 7 }], 2, 'Asia/Ho_Chi_Minh').map((s) =>
        s.endsAt.toISOString(),
      ),
    ).toEqual(['2026-12-31T14:30:00.000Z', '2027-01-07T14:30:00.000Z']);
  });
  it('rejects impossible dates instead of normalizing to another date', () => {
    expect(() =>
      weeklySchedule('2026-02-30', [{ weekday: 1, slotId: 2 }], 1, 'Asia/Ho_Chi_Minh'),
    ).toThrow();
  });
});
