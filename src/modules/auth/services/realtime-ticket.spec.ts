import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../users/user-role.enum.js';
import { TokenService } from './token.service.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const tokens = new TokenService(
  new ConfigService({
    ACCESS_TOKEN_TTL_SECONDS: 900,
    JWT_PRIVATE_KEY_BASE64: Buffer.from(
      keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    ).toString('base64'),
    JWT_PUBLIC_KEY_BASE64: Buffer.from(
      keys.publicKey.export({ type: 'spki', format: 'pem' }),
    ).toString('base64'),
  }),
);
const actor = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  role: UserRole.MENTOR,
};
const origin = 'https://frontend.test';
afterEach(() => vi.useRealTimers());
describe('Realtime handshake tickets', () => {
  it('is bounded to 60 seconds and cannot authenticate REST or a different origin/channel', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    const access = tokens.signAccessToken(actor);
    const issued = tokens.signRealtimeTicket(actor, access.expiresAt, origin, 'whiteboards');
    expect(issued.expiresAt).toBe('2026-11-04T12:01:00.000Z');
    expect(tokens.verifyRealtimeTicket(issued.ticket, origin, 'whiteboards')).toEqual({
      principal: actor,
      expiresAt: access.expiresAt,
    });
    expect(() => tokens.verifyAccessToken(issued.ticket)).toThrow();
    expect(() => tokens.verifyRealtimeTicket(access.token, origin, 'whiteboards')).toThrow();
    expect(() => tokens.verifyRealtimeTicket(issued.ticket, origin, 'chat')).toThrow();
    expect(() =>
      tokens.verifyRealtimeTicket(issued.ticket, 'https://evil.test', 'whiteboards'),
    ).toThrow();
    const parts = issued.ticket.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({
        sub: actor.userId,
        sid: actor.sessionId,
        role: actor.role,
        origin,
        channel: 'chat',
        exp: 9999999999,
      }),
    ).toString('base64url');
    expect(() => tokens.verifyRealtimeTicket(parts.join('.'), origin, 'chat')).toThrow();
    vi.advanceTimersByTime(60000);
    expect(() => tokens.verifyRealtimeTicket(issued.ticket, origin, 'whiteboards')).toThrow();
  });
  it('never extends the access lifetime, keeps cookie clients compatible and rejects invalid ticket downgrade', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    const expiry = new Date(Date.now() + 5000);
    const ticket = tokens.signRealtimeTicket(actor, expiry, origin, 'chat');
    expect(ticket.expiresAt).toBe(expiry.toISOString());
    const access = tokens.signAccessToken(actor);
    expect(
      tokens.verifySocketIdentity({}, `access_token=${access.token}`, origin, 'chat').principal,
    ).toEqual(actor);
    expect(
      tokens.verifySocketIdentity({ ticket: ticket.ticket }, undefined, origin, 'chat').principal,
    ).toEqual(actor);
    expect(() =>
      tokens.verifySocketIdentity(
        { ticket: 'bad' },
        `access_token=${access.token}`,
        origin,
        'chat',
      ),
    ).toThrow();
    expect(() => tokens.verifySocketIdentity({ ticket: 42 }, undefined, origin, 'chat')).toThrow();
    vi.advanceTimersByTime(5000);
    expect(() => tokens.verifyRealtimeTicket(ticket.ticket, origin, 'chat')).toThrow();
    expect(() => tokens.signRealtimeTicket(actor, expiry, origin, 'chat')).toThrow();
  });
});
