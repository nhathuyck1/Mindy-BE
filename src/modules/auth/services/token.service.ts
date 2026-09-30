import { createPrivateKey, createPublicKey, createSign, createVerify } from 'node:crypto';

import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';

import { UserRole } from '../../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth.types.js';

interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly role: UserRole;
  readonly iat: number;
  readonly exp: number;
}

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  signAccessToken(user: AuthenticatedUser): { token: string; expiresAt: Date } {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttl = this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS');
    const claims: AccessTokenClaims = {
      sub: user.userId,
      sid: user.sessionId,
      role: user.role,
      iat: nowSeconds,
      exp: nowSeconds + ttl,
    };
    const header = encodePart({ alg: 'RS256', typ: 'JWT' });
    const payload = encodePart(claims);
    const unsigned = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(this.privateKey());

    return {
      token: `${unsigned}.${signature.toString('base64url')}`,
      expiresAt: new Date(claims.exp * 1000),
    };
  }

  verifyAccessToken(token: string): AuthenticatedUser {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT shape');
    }

    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const encodedSignature = parts[2];
    if (
      encodedHeader === undefined ||
      encodedPayload === undefined ||
      encodedSignature === undefined
    ) {
      throw new Error('Invalid JWT shape');
    }
    const header = decodePart(encodedHeader);
    if (header.alg !== 'RS256' || header.typ !== 'JWT') {
      throw new Error('Invalid JWT header');
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    if (!verifier.verify(this.publicKey(), Buffer.from(encodedSignature, 'base64url'))) {
      throw new Error('Invalid JWT signature');
    }

    const payload = decodePart(encodedPayload);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !isUserRole(payload.role) ||
      typeof payload.exp !== 'number' ||
      payload.exp <= nowSeconds
    ) {
      throw new Error('Invalid JWT claims');
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role,
    };
  }

  private privateKey(): ReturnType<typeof createPrivateKey> {
    const encoded = this.config.getOrThrow<string>('JWT_PRIVATE_KEY_BASE64');
    if (encoded.length === 0) {
      throw new Error('JWT_PRIVATE_KEY_BASE64 is required to issue access tokens');
    }

    return createPrivateKey({ key: Buffer.from(encoded, 'base64'), format: 'pem' });
  }

  private publicKey(): ReturnType<typeof createPublicKey> {
    const encoded = this.config.getOrThrow<string>('JWT_PUBLIC_KEY_BASE64');
    if (encoded.length === 0) {
      throw new Error('JWT_PUBLIC_KEY_BASE64 is required to verify access tokens');
    }

    return createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'pem' });
  }
}

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodePart(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid JWT part');
  }

  return parsed as Record<string, unknown>;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && Object.values(UserRole).includes(value as UserRole);
}
