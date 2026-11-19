import { localDateAtTime } from '../../../modules/classes/domain/class-calendar.js';
import { ClassStatus } from '../../../modules/classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../../modules/classes/enums/delivery-mode.enum.js';
import { CLASSES, type SeedClass, TIME_ZONE, weekStart } from './standard-plan.js';

export const DEFAULT_DEMO_DATE = '2026-11-20';

/** A stable, dated batch: rerunning on demo day must reuse the same class codes. */
export function demoPlan(date = DEFAULT_DEMO_DATE): {
  anchor: Date;
  classes: readonly SeedClass[];
} {
  const anchor = new Date(`${date}T00:00:00+07:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(anchor.getTime()) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('SEED_DEMO_DATE must be a valid YYYY-MM-DD date');
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const otherDay = ((weekday + 3) % 7) + 1;
  const startsAt = localDateAtTime(date, '09:20', TIME_ZONE);
  const endsAt = localDateAtTime(date, '10:50', TIME_ZONE);
  if (!startsAt || !endsAt) throw new Error('Invalid demo session time');
  const suffix = `DEMO-${date.replaceAll('-', '')}`;
  const template = (code: string): SeedClass => {
    const seed = CLASSES.find((c) => c.code === code);
    if (!seed) throw new Error(`Missing standard template ${code}`);
    return seed;
  };
  const active = (track: 'FE' | 'BE', students: readonly string[]): SeedClass => ({
    ...template('JS-101-K01'),
    code: `JS-101-${track}-${suffix}`,
    name: `JavaScript ${track} — Demo ${date} lúc 09:20 (đang học)`,
    mentorEmail: `mentor.${track === 'FE' ? 'frontend' : 'backend'}@example.com`,
    startOffsetDays: -14,
    weeklySlots: [
      { weekday, slotId: 2 },
      { weekday: otherDay, slotId: 2 },
    ],
    sessionOverride: { date, startsAt, endsAt },
    students,
  });
  const copy = (code: string, changes: Partial<SeedClass>): SeedClass => ({
    ...template(code),
    code: `${code}-${suffix}`,
    ...changes,
  });
  return {
    // All dates are anchored to the selected demo week, never to the rerun date.
    anchor: new Date(`${weekStart(anchor)}T00:00:00+07:00`),
    classes: [
      copy('HTML-CSS-101-K01', {
        name: `HTML & CSS — Demo ${date} (đã kết thúc)`,
        weeklySlots: [
          { weekday: 3, slotId: 1 },
          { weekday: 6, slotId: 1 },
        ],
      }),
      active('FE', ['an', 's01', 's02', 's03', 's04', 's05', 's06', 's07']),
      active('BE', [
        'binh',
        'chi',
        's09',
        's10',
        's11',
        's12',
        's13',
        's14',
        's15',
        's16',
        's17',
        's18',
      ]),
      copy('REACT-201-K01', {
        name: `ReactJS — Demo ${date} (sắp khai giảng)`,
        weeklySlots: [
          { weekday: 1, slotId: 3 },
          { weekday: 4, slotId: 3 },
        ],
      }),
      copy('NODE-201-K01', {
        name: `Node.js — Demo ${date} (đầy 5/5 kể cả giữ chỗ)`,
        weeklySlots: [
          { weekday: 2, slotId: 3 },
          { weekday: 4, slotId: 3 },
        ],
      }),
      copy('HTML-CSS-101-K02', {
        name: `HTML & CSS — Demo ${date} (thiếu học viên)`,
        mentorEmail: 'mentor.frontend@example.com',
        weeklySlots: [
          { weekday: 6, slotId: 3 },
          { weekday: 7, slotId: 3 },
        ],
        deliveryMode: DeliveryMode.ONLINE,
      }),
      copy('JS-101-K02', {
        name: `JavaScript — Demo ${date} (nháp)`,
        status: ClassStatus.DRAFT,
        weeklySlots: [
          { weekday: 1, slotId: 1 },
          { weekday: 3, slotId: 1 },
        ],
      }),
    ],
  };
}
