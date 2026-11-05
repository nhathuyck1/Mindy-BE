import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { pushConfig } from '../../../test/helpers/push-fixture.js';
import { FcmAdapter, fcmHttpFailure, providerFailure, pushMessage } from './fcm.adapter.js';
import { PushConfig } from './push-config.service.js';
import { PushCrypto } from './push-crypto.service.js';
import { retryDelay } from './push-worker.service.js';

describe('Phase 7 push configuration, crypto and provider contract', () => {
  it('disabled startup requires no keys, Firebase project, credentials or network', async () => {
    const env = new ConfigService({});
    expect(new PushConfig(env).enabled).toBe(false);
    new PushCrypto(env);
    const adapter = new FcmAdapter(new PushConfig(env), env);
    await adapter.onModuleInit();
    await expect(
      adapter.send({ token: 'fake', notificationId: randomUUID(), ttlSeconds: 1 }),
    ).rejects.toMatchObject({ reason: 'CONFIGURATION' });
    await adapter.onApplicationShutdown();
  });
  it.each([
    { PUSH_ACTIVATED_AT: '' },
    { PUSH_ACTIVATED_AT: 'today' },
    { PUSH_WORKER_ENABLED: true, PUSH_ENABLED: false },
    { FIREBASE_PROJECT_ID: '' },
    { PUSH_TTL_SECONDS: 59 },
    { PUSH_WEB_INBOX_PATH: '//evil.test' },
    { PUSH_WEB_INBOX_PATH: '/\\evil.test' },
    { PUSH_WEB_INBOX_PATH: '/%2f%2fevil.test' },
    { FRONTEND_BASE_URL: 'http://app.example.test' },
    { CORS_ORIGINS: 'https://other.test' },
    { CHAT_ENABLED: false },
  ])('rejects invalid enabled configuration %j', (overrides) => {
    expect(() => new PushConfig(pushConfig(overrides))).toThrow();
  });
  it('fails closed on missing, malformed, unavailable and noncanonical keys', () => {
    for (const overrides of [
      { PUSH_TOKEN_KEYRING: '' },
      { PUSH_TOKEN_KEYRING: '[]' },
      { PUSH_TOKEN_KEYRING: '{}' },
      { PUSH_TOKEN_FINGERPRINT_KEY: 'wrong' },
      { PUSH_TOKEN_ACTIVE_KEY_VERSION: 2 },
    ]) {
      expect(() => new PushCrypto(pushConfig(overrides))).toThrow('Invalid push token');
    }
  });
  it('encrypts tokens with random nonce and binds ciphertext to installation and key version', () => {
    const crypto = new PushCrypto(pushConfig()),
      id = randomUUID(),
      token = 'secret-fcm-token';
    const a = crypto.encrypt(id, token),
      b = crypto.encrypt(id, token);
    expect(crypto.decrypt(id, a)).toBe(token);
    expect(a.token_ciphertext.equals(b.token_ciphertext)).toBe(false);
    expect(a.token_ciphertext.includes(Buffer.from(token))).toBe(false);
    expect(() => crypto.decrypt(randomUUID(), a)).toThrow();
    expect(() => crypto.decrypt(id, { ...a, auth_tag: Buffer.alloc(16) })).toThrow();
    expect(crypto.fingerprint(token)).toEqual(crypto.fingerprint(token));
    expect(crypto.fingerprint(token)).not.toEqual(crypto.fingerprint(`${token}2`));
  });
  it('only emits generic application payload and allowlisted inbox link', () => {
    const config = new PushConfig(pushConfig()),
      id = randomUUID();
    expect(pushMessage(config, { token: 'fake', notificationId: id, ttlSeconds: 123.8 })).toEqual({
      token: 'fake',
      notification: { title: 'Tin nhắn mới', body: 'Bạn có tin nhắn mới.' },
      data: { schemaVersion: '1', notificationId: id },
      webpush: {
        headers: { TTL: '123' },
        notification: { tag: id },
        fcmOptions: { link: 'https://app.example.test/notifications' },
      },
    });
  });
  it('distinguishes invalid registration, malformed payload, configuration and transient failure', () => {
    expect(
      fcmHttpFailure(404, null, {
        error: {
          details: [
            {
              '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
              errorCode: 'UNREGISTERED',
            },
          ],
        },
      }).reason,
    ).toBe('UNREGISTERED');
    expect(fcmHttpFailure(400, null, {}).reason).toBe('INVALID_PAYLOAD');
    expect(fcmHttpFailure(403, null, {}).reason).toBe('CONFIGURATION');
    expect(fcmHttpFailure(429, '120', {})).toMatchObject({ reason: 'QUOTA', retryAfterMs: 120000 });
    expect(fcmHttpFailure(503, '90', {})).toMatchObject({
      reason: 'UNAVAILABLE',
      retryAfterMs: 90000,
    });
    expect(providerFailure(new Error('raw secret')).message).toBe('PROVIDER_ERROR');
    expect(retryDelay(1, true, 0, 0)).toBeGreaterThanOrEqual(60000);
    expect(retryDelay(3, false, 90000, 0.4)).toBe(90000);
    expect(retryDelay(3, false, 0, 0)).toBe(4000);
  });
});
