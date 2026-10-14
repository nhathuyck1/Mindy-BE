import { isSingleTeachingDay, toLocalDate } from '../../classes/domain/class-calendar.js';

/** No overnight teaching; an exclusive midnight end still belongs to the start day. */
export function isAttendanceStartDay(now: Date, start: Date, end: Date, zone: string): boolean {
  const day = toLocalDate(now, zone);
  return isSingleTeachingDay(start, end, zone) && day === toLocalDate(start, zone);
}

export function isAttendanceEditable(now: Date, deadline: Date | null): boolean {
  return deadline !== null && now < deadline;
}
