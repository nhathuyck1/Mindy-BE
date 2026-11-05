import { localDateAtTime } from './class-calendar.js';

/** Shared API catalogue. Keep established center slot times, including slots 3/4 overlap. */
export const TEACHING_SLOTS = [
  { id: 1, startsAt: '07:30', endsAt: '09:00' },
  { id: 2, startsAt: '09:30', endsAt: '11:00' },
  { id: 3, startsAt: '12:00', endsAt: '14:00' },
  { id: 4, startsAt: '13:00', endsAt: '15:30' },
  { id: 5, startsAt: '16:00', endsAt: '17:30' },
  { id: 6, startsAt: '18:00', endsAt: '19:30' },
  { id: 7, startsAt: '20:00', endsAt: '21:30' },
] as const;

export function weeklySchedule(
  startDate: string,
  slots: readonly { weekday: number; slotId: number }[],
  count: number,
  zone: string,
): { startsAt: Date; endsAt: Date }[] {
  const day = new Date(`${startDate}T00:00:00Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== startDate ||
    slots.length === 0
  )
    throw new Error('Invalid weekly schedule');
  const result: { startsAt: Date; endsAt: Date }[] = [];
  for (let days = 0; result.length < count && days < 3660; days += 1) {
    const weekday = day.getUTCDay() || 7;
    for (const selected of [...slots]
      .filter((s) => s.weekday === weekday)
      .sort((a, b) => a.slotId - b.slotId)) {
      const slot = TEACHING_SLOTS.find((s) => s.id === selected.slotId);
      const date = day.toISOString().slice(0, 10);
      const startsAt = slot && localDateAtTime(date, slot.startsAt, zone);
      const endsAt = slot && localDateAtTime(date, slot.endsAt, zone);
      if (!startsAt || !endsAt) throw new Error('Invalid slot or local clock');
      if (result.length < count) result.push({ startsAt, endsAt });
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  if (result.length !== count) throw new Error('Schedule exceeds ten years');
  return result;
}
