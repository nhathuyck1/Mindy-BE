import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../../modules/classes/domain/class-calendar.js';
import { ClassStatus } from '../../../modules/classes/enums/class-status.enum.js';
import { DEFAULT_DEMO_DATE, demoPlan } from './demo-plan.js';
import { CLASSES, classSessions, TIME_ZONE } from './standard-plan.js';

const UNITS: Record<string, number> = {
  'HTML-CSS-101': 5,
  'JS-101': 6,
  'REACT-201': 5,
  'NODE-201': 5,
  'PY-101': 4,
};

describe('additive demo plan', () => {
  const { anchor, classes } = demoPlan();
  const plans = classes.map((seed) => ({
    seed,
    times: classSessions(seed, UNITS[seed.courseCode] ?? 0, anchor).times,
  }));

  it('gives both mentors a scheduled session at 09:20 on demo day with separate paid rosters', () => {
    const live = plans.filter(({ seed }) => seed.status === ClassStatus.IN_PROGRESS);
    expect(live).toHaveLength(2);
    expect(live.map(({ seed }) => seed.mentorEmail).sort()).toEqual([
      'mentor.backend@example.com',
      'mentor.frontend@example.com',
    ]);
    for (const { seed, times } of live) {
      const demo = times.find((t) => toLocalDate(t.startsAt, TIME_ZONE) === DEFAULT_DEMO_DATE);
      expect(demo?.startsAt.toISOString()).toBe('2026-11-20T02:20:00.000Z');
      expect(demo?.endsAt.toISOString()).toBe('2026-11-20T03:50:00.000Z');
      expect(seed.students.length).toBeGreaterThanOrEqual(3);
      const completed = times.filter((t) => t.endsAt < new Date('2026-11-19T03:00:00Z'));
      expect(completed.length).toBeGreaterThanOrEqual(2);
      expect(completed.length).toBeLessThan(times.length);
    }
    expect(live[0]?.seed.students.some((s) => live[1]?.seed.students.includes(s))).toBe(false);
  });

  it('keeps the same codes and timetable when rerun on demo day', () => {
    expect(demoPlan()).toEqual(demoPlan(DEFAULT_DEMO_DATE));
    expect(new Set(classes.map((c) => c.code)).size).toBe(classes.length);
    expect(classes.every((c) => !CLASSES.some((old) => old.code === c.code))).toBe(true);
    const nextBatch = demoPlan('2026-11-27');
    expect(nextBatch.classes.every((c) => !classes.some((old) => old.code === c.code))).toBe(true);
  });

  it('retains completed, open, sold-out, underfilled and draft demo paths', () => {
    const beforeDemo = new Date('2026-11-20T02:20:00Z');
    for (const { seed, times } of plans) {
      const seats = seed.students.length + (seed.pendingCash?.length ?? 0);
      expect(seats).toBeLessThanOrEqual(seed.maxStudents);
      if (seed.status === ClassStatus.COMPLETED)
        expect(times.every((t) => t.endsAt < beforeDemo)).toBe(true);
      if ([ClassStatus.OPEN, ClassStatus.DRAFT].includes(seed.status))
        expect(times.every((t) => t.startsAt > beforeDemo)).toBe(true);
    }
    expect(classes.filter((c) => c.status === ClassStatus.COMPLETED)).toHaveLength(1);
    expect(classes.filter((c) => c.status === ClassStatus.DRAFT)).toHaveLength(1);
    expect(
      classes.some(
        (c) =>
          c.status === ClassStatus.OPEN &&
          c.students.length + (c.pendingCash?.length ?? 0) === c.maxStudents,
      ),
    ).toBe(true);
    expect(
      classes.some(
        (c) => c.status === ClassStatus.OPEN && c.students.length < 3 && c.expiredPayos?.length,
      ),
    ).toBe(true);
    expect(classes.some((c) => c.inCart?.length)).toBe(true);
  });

  it('does not overlap any mentor or paid/pending student in the batch or standard plan', () => {
    const all = [
      ...plans,
      ...CLASSES.map((seed) => ({
        seed,
        times: classSessions(seed, UNITS[seed.courseCode] ?? 0, anchor).times,
      })),
    ];
    const people = (seed: (typeof classes)[number]) => [
      seed.mentorEmail,
      ...seed.students,
      ...(seed.pendingCash ?? []),
    ];
    for (const [i, a] of all.entries())
      for (const b of all.slice(i + 1)) {
        if (!people(a.seed).some((person) => people(b.seed).includes(person))) continue;
        for (const x of a.times)
          for (const y of b.times)
            expect(
              x.startsAt < y.endsAt && y.startsAt < x.endsAt,
              `${a.seed.code}/${b.seed.code}`,
            ).toBe(false);
      }
  });

  it.each(['2026-11-31', '2026-02-29', '20/11/2026', '', 'invalid'])(
    'rejects invalid demo date %s',
    (date) => {
      expect(() => demoPlan(date)).toThrow('SEED_DEMO_DATE');
    },
  );

  it.each(['2026-11-23', '2026-11-25', '2026-12-31', '2027-01-03'])(
    'anchors a different demo date %s',
    (date) => {
      const plan = demoPlan(date);
      for (const seed of plan.classes.filter((c) => c.status === ClassStatus.IN_PROGRESS)) {
        const times = classSessions(seed, UNITS[seed.courseCode] ?? 0, plan.anchor).times;
        expect(
          times.some(
            (t) =>
              toLocalDate(t.startsAt, TIME_ZONE) === date &&
              t.startsAt.toISOString().includes('T02:20:00'),
          ),
        ).toBe(true);
      }
    },
  );
});
