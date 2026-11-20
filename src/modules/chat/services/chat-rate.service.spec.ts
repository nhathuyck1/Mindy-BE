import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatRateService } from './chat-rate.service.js';

describe('Phase 6 shared one-instance send and typing limits', () => {
  afterEach(() => vi.useRealTimers());
  it('shares burst/minute windows across transports and clears expired windows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T00:00:00Z'));
    const rate = new ChatRateService();
    for (let minuteBatch = 0; minuteBatch < 4; minuteBatch++) {
      for (let i = 0; i < 5; i++) rate.send('same-user');
      expect(() => rate.send('same-user')).toThrow();
      vi.advanceTimersByTime(1001);
    }
    expect(() => rate.send('same-user')).toThrow();
    expect(() => rate.send('different-user')).not.toThrow();
    vi.advanceTimersByTime(60000);
    expect(() => rate.send('same-user')).not.toThrow();
  });
  it('limits typing by user and conversation across sockets and releases at TTL', () => {
    vi.useFakeTimers();
    const rate = new ChatRateService();
    rate.type('user', 'chat');
    expect(() => rate.type('user', 'chat')).toThrow();
    expect(() => rate.type('user', 'other-chat')).not.toThrow();
    vi.advanceTimersByTime(2000);
    expect(() => rate.type('user', 'chat')).not.toThrow();
  });
});
