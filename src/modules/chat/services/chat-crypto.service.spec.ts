import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ChatCryptoService, parseChatKeyring } from './chat-crypto.service.js';

const key1 = randomBytes(32).toString('base64'),
  key2 = randomBytes(32).toString('base64');
const service = (version = 1) =>
  new ChatCryptoService(
    new ConfigService({
      CHAT_ENABLED: true,
      CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: key1, 2: key2 }),
      CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: version,
    }),
  );
const identity = { messageId: randomUUID(), conversationId: randomUUID(), senderId: randomUUID() };
describe('Phase 6 authenticated encryption and receipts', () => {
  it('roundtrips Unicode and empty captions; every encryption has a fresh nonce', () => {
    const crypto = service(),
      body = 'Xin chào 👩🏽‍💻 <script>không phải HTML</script>';
    const a = crypto.encrypt(identity, body),
      b = crypto.encrypt(identity, body);
    expect(crypto.decrypt(identity, a)).toBe(body);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.toString()).not.toContain('Xin chào');
    expect(crypto.decrypt(identity, crypto.encrypt(identity, ''))).toBe('');
    expect(crypto.decrypt({ ...identity, senderId: identity.senderId.toUpperCase() }, a)).toBe(
      body,
    );
  });
  it('fails closed for ciphertext, IV, tag, identity, version, and key tampering', () => {
    const crypto = service(),
      a = crypto.encrypt(identity, 'secret');
    for (const field of ['ciphertext', 'iv', 'tag'] as const) {
      const changed = Buffer.from(a[field]);
      changed[0] = (changed[0] ?? 0) ^ 1;
      expect(() => crypto.decrypt(identity, { ...a, [field]: changed })).toThrow();
    }
    for (const field of ['messageId', 'conversationId', 'senderId'] as const)
      expect(() => crypto.decrypt({ ...identity, [field]: randomUUID() }, a)).toThrow();
    expect(() => crypto.decrypt(identity, { ...a, keyVersion: 2 })).toThrow();
    expect(() => crypto.decrypt(identity, { ...a, cryptoVersion: 2 })).toThrow();
    expect(() => crypto.decrypt(identity, { ...a, keyVersion: 99 })).toThrow();
  });
  it('keeps old message and receipt keys usable after rotation', () => {
    const a = service(1),
      b = service(2),
      encrypted = a.encrypt(identity, 'old');
    expect(b.decrypt(identity, encrypted)).toBe('old');
    expect(b.encrypt(identity, 'new').keyVersion).toBe(2);
    const request = ['send', identity.conversationId, 'nội dung', null];
    const hash = a.fingerprint(request);
    expect(b.matches(request, hash, 1)).toBe(true);
    expect(b.matches([...request, 'changed'], hash, 1)).toBe(false);
    expect(b.matches(request, 'xyz', 1)).toBe(false);
    expect(a.fingerprint(request)).not.toBe(b.fingerprint(request));
  });
  it('rejects missing/short/noncanonical keys at startup; disabled mode needs no secrets', () => {
    for (const raw of [
      '',
      '[]',
      'null',
      '{}',
      '{"1":"bad"}',
      JSON.stringify({ 1: randomBytes(31).toString('base64') }),
      JSON.stringify({ '01': key1 }),
      JSON.stringify({ 2: key2 }),
    ])
      expect(() => parseChatKeyring(raw, 1)).toThrow();
    const disabled = new ChatCryptoService(new ConfigService({ CHAT_ENABLED: false }));
    expect(() => disabled.encrypt(identity, 'no plaintext fallback')).toThrow();
  });
});
