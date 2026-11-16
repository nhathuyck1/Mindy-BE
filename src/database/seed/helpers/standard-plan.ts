import { toLocalDate } from '../../../modules/classes/domain/class-calendar.js';
import { weeklySchedule } from '../../../modules/classes/domain/weekly-schedule.js';
import { ClassStatus } from '../../../modules/classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../../modules/classes/enums/delivery-mode.enum.js';

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const SESSIONS_PER_UNIT = 2;

export interface SeedClass {
  readonly code: string;
  readonly courseCode: string;
  readonly name: string;
  readonly mentorEmail: string;
  readonly status: ClassStatus;
  readonly deliveryMode: DeliveryMode;
  readonly maxStudents: number;
  /** Days from Monday of the current Vietnam week. */
  readonly startOffsetDays: number;
  /** weekday 1 = Monday ... 7 = Sunday; slotId from TEACHING_SLOTS. */
  readonly weeklySlots: readonly { weekday: number; slotId: number }[];
  readonly roomName: string | null;
  /** Student keys (see standard.ts) with an ACTIVE paid enrollment. */
  readonly students: readonly string[];
  readonly pendingCash?: readonly string[];
  readonly expiredPayos?: readonly string[];
  /** Students who have this class in their cart. */
  readonly inCart?: readonly string[];
}

const ONLINE = { deliveryMode: DeliveryMode.ONLINE, roomName: null } as const;
const range = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `s${String(from + i).padStart(2, '0')}`);

// Each mentor/student combination is chosen so no two classes overlap in time.
export const CLASSES: readonly SeedClass[] = [
  {
    code: 'HTML-CSS-101-K01',
    courseCode: 'HTML-CSS-101',
    name: 'HTML & CSS K01 — Online tối 3-5 (đã kết thúc)',
    mentorEmail: 'mentor.frontend@example.com',
    status: ClassStatus.COMPLETED,
    ...ONLINE,
    maxStudents: 20,
    startOffsetDays: -56,
    weeklySlots: [
      { weekday: 2, slotId: 7 },
      { weekday: 4, slotId: 7 },
    ],
    students: range(1, 8),
  },
  {
    code: 'JS-101-K01',
    courseCode: 'JS-101',
    name: 'JavaScript K01 — Online tối 2-4 (đang học)',
    mentorEmail: 'mentor.backend@example.com',
    status: ClassStatus.IN_PROGRESS,
    ...ONLINE,
    maxStudents: 20,
    startOffsetDays: -21,
    weeklySlots: [
      { weekday: 1, slotId: 7 },
      { weekday: 3, slotId: 7 },
    ],
    students: ['an', 'binh', ...range(9, 18)],
  },
  {
    code: 'PY-101-K01',
    courseCode: 'PY-101',
    name: 'Python K01 — Offline sáng cuối tuần (đang học)',
    mentorEmail: 'mentor.python@example.com',
    status: ClassStatus.IN_PROGRESS,
    deliveryMode: DeliveryMode.OFFLINE,
    roomName: 'Phòng Lab 1',
    maxStudents: 15,
    startOffsetDays: -14,
    weeklySlots: [
      { weekday: 6, slotId: 2 },
      { weekday: 7, slotId: 2 },
    ],
    students: ['chi', ...range(1, 4), ...range(19, 21)],
  },
  {
    code: 'REACT-201-K01',
    courseCode: 'REACT-201',
    name: 'ReactJS K01 — Online tối 2-4 (sắp khai giảng)',
    mentorEmail: 'mentor.frontend@example.com',
    status: ClassStatus.OPEN,
    ...ONLINE,
    maxStudents: 20,
    startOffsetDays: 7,
    weeklySlots: [
      { weekday: 1, slotId: 6 },
      { weekday: 3, slotId: 6 },
    ],
    students: ['an', ...range(5, 7)],
    pendingCash: ['s08'],
    inCart: ['chi'],
  },
  {
    // Full with the pending hold: capacity/sold-out path.
    code: 'NODE-201-K01',
    courseCode: 'NODE-201',
    name: 'Node.js K01 — Offline tối 3-5 (gần đầy)',
    mentorEmail: 'mentor.backend@example.com',
    status: ClassStatus.OPEN,
    deliveryMode: DeliveryMode.OFFLINE,
    roomName: 'Phòng Lab 2',
    maxStudents: 5,
    startOffsetDays: 14,
    weeklySlots: [
      { weekday: 2, slotId: 6 },
      { weekday: 4, slotId: 6 },
    ],
    students: ['binh', ...range(9, 11)],
    pendingCash: ['s12'],
  },
  {
    // Below the 3-student minimum: opening job will block it at the first session.
    code: 'HTML-CSS-101-K02',
    courseCode: 'HTML-CSS-101',
    name: 'HTML & CSS K02 — Online chiều cuối tuần (thiếu học viên)',
    mentorEmail: 'mentor.python@example.com',
    status: ClassStatus.OPEN,
    ...ONLINE,
    maxStudents: 20,
    startOffsetDays: 7,
    weeklySlots: [
      { weekday: 6, slotId: 5 },
      { weekday: 7, slotId: 5 },
    ],
    students: range(13, 14),
    expiredPayos: ['s15'],
  },
  {
    code: 'JS-101-K02',
    courseCode: 'JS-101',
    name: 'JavaScript K02 — Online chiều 2-4 (nháp)',
    mentorEmail: 'mentor.backend@example.com',
    status: ClassStatus.DRAFT,
    ...ONLINE,
    maxStudents: 20,
    startOffsetDays: 28,
    weeklySlots: [
      { weekday: 1, slotId: 5 },
      { weekday: 3, slotId: 5 },
    ],
    students: [],
  },
];

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** Monday of the current Vietnam week, so seeded history always looks recent. */
export function weekStart(now: Date): string {
  const today = toLocalDate(now, TIME_ZONE);
  return addDays(today, 1 - (new Date(`${today}T00:00:00Z`).getUTCDay() || 7));
}

export function classSessions(
  seed: SeedClass,
  unitCount: number,
  now: Date,
): { startDate: string; times: { startsAt: Date; endsAt: Date }[] } {
  const startDate = addDays(weekStart(now), seed.startOffsetDays);
  return {
    startDate,
    times: weeklySchedule(startDate, seed.weeklySlots, unitCount * SESSIONS_PER_UNIT, TIME_ZONE),
  };
}
