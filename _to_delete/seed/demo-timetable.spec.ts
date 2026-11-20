import { describe, expect, it } from 'vitest';

import { createDemoTimetable, splitDemoTimetable } from './demo-timetable.js';

describe('current demo timetable', () => {
  it('supports the offline morning slot with the same ten dates', () => {
    const now = new Date('2026-10-12T20:00:00+07:00');
    const starts = createDemoTimetable(now, '09:00');
    expect(starts).toHaveLength(10);
    expect(starts[0]).toEqual(new Date('2026-10-13T09:00:00+07:00'));
    expect(starts[9]).toEqual(new Date('2026-11-14T09:00:00+07:00'));
  });

  it.each([4, 5, 6])('distributes all ten sessions once across %i units in order', (unitCount) => {
    const starts = createDemoTimetable(new Date('2026-10-12T20:00:00+07:00'));
    const units = splitDemoTimetable(starts, unitCount);
    expect(units).toHaveLength(unitCount);
    expect(units.flat()).toEqual(starts);
    expect(units.every((unit) => unit.length > 0)).toBe(true);
    expect(
      Math.max(...units.map((unit) => unit.length)) - Math.min(...units.map((unit) => unit.length)),
    ).toBeLessThanOrEqual(1);
  });

  it.each([0, 11, 1.5])('rejects an unsupported unit count %s', (unitCount) => {
    expect(() =>
      splitDemoTimetable(createDemoTimetable(new Date('2026-10-12T20:00:00+07:00')), unitCount),
    ).toThrow();
  });

  it('creates ten consecutive Tuesday/Saturday slots across five weeks from today', () => {
    const now = new Date('2026-10-12T20:00:00+07:00');
    const starts = createDemoTimetable(now);
    expect(starts.map((start) => start.toISOString())).toEqual(
      [
        '2026-10-13',
        '2026-10-17',
        '2026-10-20',
        '2026-10-24',
        '2026-10-27',
        '2026-10-31',
        '2026-11-03',
        '2026-11-07',
        '2026-11-10',
        '2026-11-14',
      ].map((date) => `${date}T08:00:00.000Z`),
    );
    expect(starts.every((start) => start >= now)).toBe(true);
    expect(createDemoTimetable(now)).toEqual(starts);
  });

  it('includes today before the slot and skips it once the starting time has passed', () => {
    const before = createDemoTimetable(new Date('2026-10-13T14:59:59+07:00'));
    const atStart = createDemoTimetable(new Date('2026-10-13T15:00:00+07:00'));
    const after = createDemoTimetable(new Date('2026-10-13T15:00:01+07:00'));
    expect(before[0]).toEqual(new Date('2026-10-13T15:00:00+07:00'));
    expect(atStart).toEqual(before);
    expect(after[0]).toEqual(new Date('2026-10-17T15:00:00+07:00'));
    expect(after).toHaveLength(10);
  });

  it('uses the Vietnam calendar date near a UTC date boundary', () => {
    const starts = createDemoTimetable(new Date('2026-12-31T18:00:00Z'));
    expect(starts[0]).toEqual(new Date('2027-01-02T15:00:00+07:00'));
    expect(starts).toHaveLength(10);
  });
});
