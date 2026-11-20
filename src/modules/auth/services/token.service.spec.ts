import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { UserRole } from '../../users/user-role.enum.js';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  it('signs and verifies RS256 access tokens', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const config = {
      getOrThrow<T>(key: string): T {
        const values: Record<string, unknown> = {
          ACCESS_TOKEN_TTL_SECONDS: 900,
          JWT_PRIVATE_KEY_BASE64: Buffer.from(privatePem).toString('base64'),
          JWT_PUBLIC_KEY_BASE64: Buffer.from(publicPem).toString('base64'),
        };
        return values[key] as T;
      },
    };
    const service = new TokenService(config as never);

    const signed = service.signAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      role: UserRole.ADMIN,
    });

    expect(service.verifyAccessToken(signed.token)).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      role: UserRole.ADMIN,
    });
  });

  it('rejects a token signed by a different key', () => {
    const first = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const second = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config = (privateKey: string, publicKey: string) => ({
      getOrThrow<T>(key: string): T {
        const values: Record<string, unknown> = {
          ACCESS_TOKEN_TTL_SECONDS: 900,
          JWT_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
          JWT_PUBLIC_KEY_BASE64: Buffer.from(publicKey).toString('base64'),
        };
        return values[key] as T;
      },
    });
    const signer = new TokenService(
      config(
        first.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        first.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      ) as never,
    );
    const verifier = new TokenService(
      config(
        second.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        second.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      ) as never,
    );
    const token = signer.signAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      role: UserRole.STUDENT,
    }).token;

    expect(() => verifier.verifyAccessToken(token)).toThrow();
  });
});
