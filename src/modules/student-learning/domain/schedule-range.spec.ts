import { describe, expect, it } from 'vitest';

import { scheduleRangeError, ZONED_TIMESTAMP_PATTERN } from './schedule-range.js';

describe('scheduleRangeError', () => {
  const from = new Date('2026-10-01T00:00:00Z');

  it('accepts a non-empty range of up to 31 days', () => {
    expect(scheduleRangeError(from, new Date('2026-10-01T00:00:00.001Z'))).toBeNull();
    expect(scheduleRangeError(from, new Date('2026-11-01T00:00:00Z'))).toBeNull();
  });

  it('rejects empty, reversed, too long and invalid ranges', () => {
    expect(scheduleRangeError(from, from)).not.toBeNull();
    expect(scheduleRangeError(from, new Date('2026-09-30T00:00:00Z'))).not.toBeNull();
    expect(scheduleRangeError(from, new Date('2026-11-01T00:00:00.001Z'))).not.toBeNull();
    expect(scheduleRangeError(from, new Date('invalid'))).not.toBeNull();
  });
});

describe('ZONED_TIMESTAMP_PATTERN', () => {
  it('requires an explicit Z or ±HH:MM offset', () => {
    expect(ZONED_TIMESTAMP_PATTERN.test('2026-10-11T17:00:00Z')).toBe(true);
    expect(ZONED_TIMESTAMP_PATTERN.test('2026-10-12T00:00+07:00')).toBe(true);
    expect(ZONED_TIMESTAMP_PATTERN.test('2026-10-12T00:00:00.123456-05:30')).toBe(true);
    expect(ZONED_TIMESTAMP_PATTERN.test('2026-10-12T00:00:00')).toBe(false);
    expect(ZONED_TIMESTAMP_PATTERN.test('2026-10-12T00:00:00+0700')).toBe(false);
    expect(ZONED_TIMESTAMP_PATTERN.test('2026-10-12')).toBe(false);
  });
});
