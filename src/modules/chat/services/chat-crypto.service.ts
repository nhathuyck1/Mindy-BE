import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import type { ChatIdentity, EncryptedChatBody } from '../chat.contracts.js';
import { ChatException } from '../exceptions/chat.exceptions.js';

/** Validates at startup, even when no message is encrypted yet. Never logs key material. */
export function parseChatKeyring(raw: string, active: number): ReadonlyMap<number, Buffer> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Invalid chat keyring');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid chat keyring');
  const keys = new Map<number, Buffer>();
  for (const [version, encoded] of Object.entries(value)) {
    if (
      !/^[1-9]\d*$/.test(version) ||
      !Number.isSafeInteger(Number(version)) ||
      typeof encoded !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(encoded)
    )
      throw new Error('Invalid chat keyring entry');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded)
      throw new Error('Chat keys must be canonical Base64 encoding of 32 bytes');
    keys.set(Number(version), key);
  }
  if (!Number.isSafeInteger(active) || !keys.has(active))
    throw new Error('Active chat encryption key is missing');
  return keys;
}

@Injectable()
export class ChatCryptoService {
  async reserveEncryption(manager: EntityManager): Promise<void> {
    const rows: { key_version: number }[] = await manager.query(
      `WITH reserved AS (
      INSERT INTO chat_key_usage(key_version,encryptions) VALUES($1,1) ON CONFLICT(key_version)
      DO UPDATE SET encryptions=chat_key_usage.encryptions+1 WHERE chat_key_usage.encryptions<1000000
      RETURNING key_version) SELECT * FROM reserved`,
      [this.activeKeyVersion],
    );
    if (!rows.length) throw new ChatException(503, 'CHAT_CRYPTO_UNAVAILABLE');
  }
  readonly activeKeyVersion: number;
  private readonly keys: ReadonlyMap<number, Buffer>;
  constructor(config: ConfigService) {
    this.activeKeyVersion = config.get<number>('CHAT_ENCRYPTION_ACTIVE_KEY_VERSION', 1);
    this.keys = config.get<boolean>('CHAT_ENABLED', false)
      ? parseChatKeyring(config.get<string>('CHAT_ENCRYPTION_KEYS', ''), this.activeKeyVersion)
      : new Map();
  }
  encrypt(identity: ChatIdentity, body: string): EncryptedChatBody {
    const iv = randomBytes(12),
      keyVersion = this.activeKeyVersion,
      cryptoVersion = 1;
    const cipher = createCipheriv('aes-256-gcm', this.key(keyVersion), iv);
    cipher.setAAD(aad(identity, cryptoVersion));
    const ciphertext = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
    return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion, cryptoVersion };
  }
  decrypt(identity: ChatIdentity, encrypted: EncryptedChatBody): string {
    if (encrypted.cryptoVersion !== 1 || encrypted.iv.length !== 12 || encrypted.tag.length !== 16)
      throw new Error('Invalid encrypted chat body');
    const decipher = createDecipheriv('aes-256-gcm', this.key(encrypted.keyVersion), encrypted.iv);
    decipher.setAAD(aad(identity, encrypted.cryptoVersion));
    decipher.setAuthTag(encrypted.tag);
    return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString(
      'utf8',
    );
  }
  fingerprint(request: readonly unknown[], keyVersion = this.activeKeyVersion): string {
    const key = hkdfSync(
      'sha256',
      this.key(keyVersion),
      Buffer.alloc(0),
      'mindy-chat-receipt-v1',
      32,
    );
    return createHmac('sha256', Buffer.from(key)).update(JSON.stringify(request)).digest('hex');
  }
  matches(request: readonly unknown[], hash: string, keyVersion: number): boolean {
    const expected = Buffer.from(this.fingerprint(request, keyVersion), 'hex');
    const received = Buffer.from(hash, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
  private key(version: number): Buffer {
    const key = this.keys.get(version);
    if (!key) throw new Error('Chat encryption key unavailable');
    return key;
  }
}
function aad(identity: ChatIdentity, version: number): Buffer {
  return Buffer.from(
    JSON.stringify([
      version,
      identity.messageId.toLowerCase(),
      identity.conversationId.toLowerCase(),
      identity.senderId.toLowerCase(),
    ]),
    'utf8',
  );
}
