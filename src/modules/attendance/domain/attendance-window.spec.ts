import { describe, expect, it } from 'vitest';
import { isAttendanceEditable, isAttendanceStartDay } from './attendance-window.js';

describe('Attendance calendar days and strict deadline', () => {
  const zone = 'Asia/Ho_Chi_Minh';
  it('allows any hour of the scheduled local day and rejects neighbouring days', () => {
    const start = new Date('2026-10-13T19:00:00+07:00'),
      end = new Date('2026-10-13T21:00:00+07:00');
    for (const now of ['2026-10-13T00:00:00+07:00', '2026-10-13T23:59:59.999+07:00'])
      expect(isAttendanceStartDay(new Date(now), start, end, zone)).toBe(true);
    expect(isAttendanceStartDay(new Date('2026-10-14T00:00:00+07:00'), start, end, zone)).toBe(
      false,
    );
  });
  it('never permits an overnight session, while allowing an exclusive midnight end on its start day', () => {
    const start = new Date('2026-10-13T23:00:00+07:00'),
      now = new Date('2026-10-14T18:00:00+07:00');
    expect(isAttendanceStartDay(now, start, new Date('2026-10-14T01:00:00+07:00'), zone)).toBe(
      false,
    );
    expect(isAttendanceStartDay(now, start, new Date('2026-10-14T00:00:00+07:00'), zone)).toBe(
      false,
    );
    expect(isAttendanceStartDay(start, start, new Date('2026-10-14T00:00:00+07:00'), zone)).toBe(
      true,
    );
  });
  it('expires at the exact deadline and never grants writes without one', () => {
    const deadline = new Date('2026-10-15T00:00:00+07:00');
    expect(isAttendanceEditable(new Date(deadline.getTime() - 1), deadline)).toBe(true);
    expect(isAttendanceEditable(deadline, deadline)).toBe(false);
    expect(isAttendanceEditable(deadline, null)).toBe(false);
  });
});
