import { describe, expect, it } from 'vitest';
import { literalSearch, managerRange, safeReviewReason } from './manager-read.js';

describe('manager read inputs', () => {
  it('requires paired positive bounded time intervals', () => {
    expect(managerRange(undefined, undefined, 31)).toBeNull();
    for (const [from, to] of [
      ['2026-10-01T00:00:00Z', undefined],
      [undefined, '2026-10-01T00:00:00Z'],
      ['2026-10-01', '2026-10-01'],
      ['2026-10-02', '2026-10-01'],
      ['2026-10-01', '2026-12-01'],
    ])
      expect(() => managerRange(from, to, 31)).toThrow();
    expect(
      managerRange('2026-10-01T07:00:00+07:00', '2026-10-02T00:00:00Z', 31)?.from.toISOString(),
    ).toBe('2026-10-01T00:00:00.000Z');
  });
  it('escapes SQL pattern syntax and only exposes known review reasons', () => {
    expect(literalSearch('a%_')).toBe('%a\\%\\_%');
    expect(safeReviewReason('AMOUNT_OR_METHOD_MISMATCH')).toBe('AMOUNT_OR_METHOD_MISMATCH');
    expect(safeReviewReason('secret untrusted reason')).toBeNull();
  });
});
