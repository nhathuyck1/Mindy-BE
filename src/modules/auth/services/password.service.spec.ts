import { describe, expect, it } from 'vitest';

import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  it('hashes and verifies passwords without storing the raw value', async () => {
    const service = new PasswordService();
    const hash = await service.hashPassword('correct horse battery staple');

    expect(hash).not.toContain('correct horse battery staple');
    expect(await service.verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await service.verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces different password hashes for the same password', async () => {
    const service = new PasswordService();

    const first = await service.hashPassword('same password');
    const second = await service.hashPassword('same password');

    expect(first).not.toBe(second);
  });

  it('hashes refresh tokens deterministically', () => {
    const service = new PasswordService();

    expect(service.hashRefreshToken('refresh-token')).toHaveLength(64);
    expect(service.hashRefreshToken('refresh-token')).toBe(
      service.hashRefreshToken('refresh-token'),
    );
    expect(service.hashRefreshToken('refresh-token')).not.toBe(
      service.hashRefreshToken('other-token'),
    );
  });
});
