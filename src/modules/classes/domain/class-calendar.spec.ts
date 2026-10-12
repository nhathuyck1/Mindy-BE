import { describe, expect, it } from 'vitest';

import { isWithinClassPeriod, toLocalDate, withLocalTime } from './class-calendar.js';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

describe('class calendar', () => {
  it('changes only the local clock time, including midnight and a UTC date boundary', () => {
    const instant = new Date('2026-10-12T18:30:00Z');
    expect(withLocalTime(instant, '07:30', TIME_ZONE)).toEqual(new Date('2026-10-13T00:30:00Z'));
    expect(withLocalTime(instant, '00:00', TIME_ZONE)).toEqual(new Date('2026-10-12T17:00:00Z'));
  });

  it('handles a DST offset change on the same date and rejects a nonexistent local time', () => {
    const instant = new Date('2026-03-08T06:00:00Z');
    expect(withLocalTime(instant, '03:30', 'America/New_York')).toEqual(
      new Date('2026-03-08T07:30:00Z'),
    );
    expect(withLocalTime(instant, '02:30', 'America/New_York')).toBeNull();
  });

  it('preserves the original offset when choosing a repeated DST clock time', () => {
    expect(withLocalTime(new Date('2026-11-01T05:15:00Z'), '01:30', 'America/New_York')).toEqual(
      new Date('2026-11-01T05:30:00Z'),
    );
    expect(withLocalTime(new Date('2026-11-01T06:15:00Z'), '01:30', 'America/New_York')).toEqual(
      new Date('2026-11-01T06:30:00Z'),
    );
  });

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
