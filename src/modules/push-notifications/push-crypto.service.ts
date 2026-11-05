import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';

export interface EncryptedPushToken {
  token_ciphertext: Buffer;
  nonce: Buffer;
  auth_tag: Buffer;
  key_version: number;
}
function secret(encoded: unknown): Buffer {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error('Invalid push key');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('Invalid push key');
  return key;
}
@Injectable()
export class PushCrypto {
  private readonly keys = new Map<number, Buffer>();
  private readonly fingerprintKey: Buffer;
  readonly active: number;
  constructor(config: ConfigService) {
    this.active = config.get<number>('PUSH_TOKEN_ACTIVE_KEY_VERSION', 1);
    this.fingerprintKey = Buffer.alloc(0);
    if (!config.get<boolean>('PUSH_ENABLED', false)) return;
    try {
      const value: unknown = JSON.parse(config.get<string>('PUSH_TOKEN_KEYRING', ''));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      for (const [version, key] of Object.entries(value)) {
        if (!/^[1-9]\d*$/.test(version) || !Number.isSafeInteger(Number(version)))
          throw new Error();
        this.keys.set(Number(version), secret(key));
      }
      if (!this.keys.has(this.active)) throw new Error();
      this.fingerprintKey = secret(config.get<string>('PUSH_TOKEN_FINGERPRINT_KEY', ''));
    } catch {
      throw new Error('Invalid push token keyring or fingerprint key');
    }
  }
  fingerprint(token: string): Buffer {
    if (!this.fingerprintKey.length) throw new Error('Push crypto disabled');
    return createHmac('sha256', this.fingerprintKey)
      .update('mindy-push-token-v1\0')
      .update(token)
      .digest();
  }
  encrypt(id: string, token: string): EncryptedPushToken {
    const nonce = randomBytes(12),
      key = this.keys.get(this.active);
    if (!key) throw new Error('Push key unavailable');
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`mindy-push-v1/${id.toLowerCase()}/${this.active}`));
    return {
      token_ciphertext: Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]),
      nonce,
      auth_tag: cipher.getAuthTag(),
      key_version: this.active,
    };
  }
  decrypt(id: string, value: EncryptedPushToken): string {
    const key = this.keys.get(value.key_version);
    if (!key) throw new Error('Push key unavailable');
    const decipher = createDecipheriv('aes-256-gcm', key, value.nonce);
    decipher.setAAD(Buffer.from(`mindy-push-v1/${id.toLowerCase()}/${value.key_version}`));
    decipher.setAuthTag(value.auth_tag);
    return Buffer.concat([decipher.update(value.token_ciphertext), decipher.final()]).toString(
      'utf8',
    );
  }
}
