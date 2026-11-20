import { isISO8601 } from 'class-validator';
import { localDateAtTime, toLocalDate } from '../../classes/domain/class-calendar.js';
import { LeaveException } from '../exceptions/leave.exceptions.js';

export const LEAVE_PERIODS = ['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY'] as const;
export type LeavePeriod = (typeof LEAVE_PERIODS)[number];

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function leaveDays(from: string, to: string): string[] {
  if (
    !isISO8601(from, { strict: true }) ||
    !isISO8601(to, { strict: true }) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    to < from ||
    to >= shiftDate(from, 93)
  )
    throw new LeaveException(
      'LEAVE_RANGE_INVALID',
      'Use an inclusive range of at most 93 calendar days',
      422,
    );
  const days: string[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) days.push(date);
  return days;
}

export function periodInterval(
  date: string,
  period: LeavePeriod,
  zone: string,
): { startsAt: Date; endsAt: Date } {
  const clocks = {
    MORNING: ['00:00', '12:00'],
    AFTERNOON: ['12:00', '18:00'],
    EVENING: ['18:00', '00:00'],
    FULL_DAY: ['00:00', '00:00'],
  } as const;
  const [from, to] = clocks[period];
  const startsAt = localDateAtTime(date, from, zone);
  const endsAt = localDateAtTime(to === '00:00' ? shiftDate(date, 1) : date, to, zone);
  if (!startsAt || !endsAt)
    throw new LeaveException('LEAVE_RANGE_INVALID', 'Invalid local calendar interval', 422);
  return { startsAt, endsAt };
}

export function noticeDeadline(source: Date, zone: string): Date {
  const result = localDateAtTime(shiftDate(toLocalDate(source, zone), -1), '00:00', zone);
  if (!result) throw new LeaveException('LEAVE_RANGE_INVALID', 'Invalid notice boundary', 422);
  return result;
}
