import { describe, expect, it } from 'vitest';

import { ClassStatus } from '../../../modules/classes/enums/class-status.enum.js';
import { CLASSES, classSessions, weekStart } from './standard-plan.js';

// Mirrors COURSES in standard.ts.
const UNITS: Record<string, number> = {
  'HTML-CSS-101': 5,
  'JS-101': 6,
  'REACT-201': 5,
  'NODE-201': 5,
  'PY-101': 4,
};

describe.each([
  '2026-11-02T01:00:00Z', // Monday morning
  '2026-11-06T13:30:00Z', // Friday 20:30 +07, during an evening slot
  '2026-11-08T16:59:00Z', // Sunday 23:59 +07
])('standard seed plan at %s', (iso) => {
  const now = new Date(iso);
  const plans = CLASSES.map((c) => ({
    c,
    times: classSessions(c, UNITS[c.courseCode] ?? 0, now).times,
  }));

  it('matches each class status to its timeline', () => {
    for (const { c, times } of plans) {
      const ended = times.filter((t) => t.endsAt <= now).length;
      if (c.status === ClassStatus.COMPLETED) expect(ended, c.code).toBe(times.length);
      if ([ClassStatus.OPEN, ClassStatus.DRAFT].includes(c.status))
        expect(
          times.every((t) => t.startsAt > now),
          c.code,
        ).toBe(true);
      if (c.status === ClassStatus.IN_PROGRESS) {
        expect(ended, c.code).toBeGreaterThanOrEqual(2); // quiz uses the 2nd taught session
        expect(ended, c.code).toBeLessThan(times.length);
      }
    }
  });

  it('never double-books a mentor or a student', () => {
    const people = (c: (typeof CLASSES)[number]) => [
      c.mentorEmail,
      ...c.students,
      ...(c.pendingCash ?? []),
    ];
    for (const [i, a] of plans.entries())
      for (const b of plans.slice(i + 1)) {
        if (!people(a.c).some((p) => people(b.c).includes(p))) continue;
        for (const x of a.times)
          for (const y of b.times)
            expect(x.startsAt < y.endsAt && y.startsAt < x.endsAt, `${a.c.code}/${b.c.code}`).toBe(
              false,
            );
      }
  });

  it('respects capacity and starts weeks on Monday', () => {
    for (const { c } of plans)
      expect(c.students.length + (c.pendingCash?.length ?? 0)).toBeLessThanOrEqual(c.maxStudents);
    expect(new Date(`${weekStart(now)}T00:00:00Z`).getUTCDay()).toBe(1);
  });
});
