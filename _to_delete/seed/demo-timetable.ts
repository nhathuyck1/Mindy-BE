import { toLocalDate } from '../../../modules/classes/domain/class-calendar.js';

/** Ten upcoming Tuesday/Saturday sessions in Vietnam time, starting today if possible. */
export function createDemoTimetable(now: Date, startTime = '15:00'): Date[] {
  const today = toLocalDate(now, 'Asia/Ho_Chi_Minh');
  const day = new Date(`${today}T00:00:00Z`);
  const starts: Date[] = [];
  while (starts.length < 10) {
    if (day.getUTCDay() === 2 || day.getUTCDay() === 6) {
      const startsAt = new Date(`${day.toISOString().slice(0, 10)}T${startTime}:00+07:00`);
      if (startsAt >= now) starts.push(startsAt);
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return starts;
}

/** Assign every slot once, in syllabus order, even when courses have different unit counts. */
export function splitDemoTimetable(starts: readonly Date[], unitCount: number): Date[][] {
  if (!Number.isInteger(unitCount) || unitCount < 1 || unitCount > starts.length) {
    throw new Error(
      'A demo course needs between one and ten units, with at least one session each',
    );
  }
  return Array.from({ length: unitCount }, (_, unitIndex) =>
    starts.slice(
      Math.floor((unitIndex * starts.length) / unitCount),
      Math.floor(((unitIndex + 1) * starts.length) / unitCount),
    ),
  );
}
