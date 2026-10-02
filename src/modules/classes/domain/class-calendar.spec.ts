import { describe, expect, it } from 'vitest';

import { isWithinClassPeriod, toLocalDate } from './class-calendar.js';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

describe('class calendar', () => {
  it('reads the calendar date in the center time zone, not in UTC', () => {
    // 18:30 UTC is already 01:30 of the next day in Vietnam.
    expect(toLocalDate(new Date('2026-11-01T18:30:00Z'), TIME_ZONE)).toBe('2026-11-02');
    expect(toLocalDate(new Date('2026-11-01T18:30:00Z'), 'UTC')).toBe('2026-11-01');
  });

  it('accepts a session on the first and last day of the class', () => {
    const period = { startDate: '2026-11-02', endDate: '2026-11-30' };

    expect(
      isWithinClassPeriod(
        {
          startsAt: new Date('2026-11-02T00:00:00+07:00'),
          endsAt: new Date('2026-11-02T02:00:00+07:00'),
        },
        period,
        TIME_ZONE,
      ),
    ).toBe(true);
    expect(
      isWithinClassPeriod(
        {
          startsAt: new Date('2026-11-30T21:00:00+07:00'),
          endsAt: new Date('2026-11-30T23:00:00+07:00'),
        },
        period,
        TIME_ZONE,
      ),
    ).toBe(true);
  });

  it('rejects a session that starts before or ends after the class period', () => {
    const period = { startDate: '2026-11-02', endDate: '2026-11-30' };

    expect(
      isWithinClassPeriod(
        {
          startsAt: new Date('2026-11-01T23:00:00+07:00'),
          endsAt: new Date('2026-11-02T01:00:00+07:00'),
        },
        period,
        TIME_ZONE,
      ),
    ).toBe(false);
    expect(
      isWithinClassPeriod(
        {
          startsAt: new Date('2026-11-30T23:00:00+07:00'),
          endsAt: new Date('2026-12-01T01:00:00+07:00'),
        },
        period,
        TIME_ZONE,
      ),
    ).toBe(false);
  });
});
