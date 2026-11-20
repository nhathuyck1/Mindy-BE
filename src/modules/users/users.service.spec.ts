import { describe, expect, it } from 'vitest';

import { normalizeEmail, normalizeOptionalPhone, userSearchPattern } from './users.service.js';

describe('UsersService normalization', () => {
  it('folds Vietnamese characters and treats wildcard characters literally', () => {
    expect(userSearchPattern('  NGUYỄN ĐẶNG  ')).toBe('%nguyen dang%');
    expect(userSearchPattern('50%_\\')).toBe('%50\\%\\_\\\\%');
  });
  it('normalizes email before persistence and lookup', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('normalizes optional phone values', () => {
    expect(normalizeOptionalPhone('  +66800000000 ')).toBe('+66800000000');
    expect(normalizeOptionalPhone('   ')).toBeNull();
    expect(normalizeOptionalPhone(undefined)).toBeNull();
  });
});
