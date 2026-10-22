import { describe, expect, it } from 'vitest';
import { storedPercent } from './stored-progress.service.js';

describe('stored progress interpretation', () => {
  it('keeps unknown separate from zero and flags inconsistent stored data', () => {
    expect(storedPercent(null)).toEqual({ progressPercent: null, dataQuality: 'UNTRACKED' });
    expect(storedPercent('0.00')).toEqual({ progressPercent: '0.00', dataQuality: 'VALID' });
    for (const value of ['NaN', 'Infinity', '-1', '100.01', '', 'abc'])
      expect(storedPercent(value)).toEqual({
        progressPercent: null,
        dataQuality: 'INVALID_PERCENT',
      });
  });
});
