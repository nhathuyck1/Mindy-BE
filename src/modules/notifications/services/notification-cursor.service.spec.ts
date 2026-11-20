import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationCursorService } from './notification-cursor.service.js';

describe('Notification cursor scope and TTL', () => {
  const cursors = new NotificationCursorService(
    new ConfigService({ NOTIFICATION_CURSOR_SECRET: 'test-only-secret-32-bytes-minimum-123456' }),
  );
  afterEach(() => vi.useRealTimers());
  it('binds owner/category/unread and rejects tampering', () => {
    const owner = randomUUID(),
      position = `${new Date().toISOString()}|${randomUUID()}`;
    const token = cursors.encode(owner, 'BUSINESS/false', position);
    expect(cursors.decode(token, owner, 'BUSINESS/false')).toBe(position);
    expect(() => cursors.decode(token, randomUUID(), 'BUSINESS/false')).toThrow();
    expect(() => cursors.decode(token, owner, 'ALL/false')).toThrow();
    expect(() => cursors.decode(`${token}x`, owner, 'BUSINESS/false')).toThrow();
    expect(() => cursors.decode('x'.repeat(2049), owner, 'BUSINESS/false')).toThrow();
  });
  it('expires after 24 hours and never uses the chat keyring', () => {
    vi.useFakeTimers();
    const owner = randomUUID();
    const token = cursors.encode(
      owner,
      'BUSINESS/true',
      `${new Date().toISOString()}|${randomUUID()}`,
    );
    vi.advanceTimersByTime(86400001);
    expect(() => cursors.decode(token, owner, 'BUSINESS/true')).toThrow(
      expect.objectContaining({ code: 'NOTIFICATION_CURSOR_EXPIRED' }),
    );
  });
});
