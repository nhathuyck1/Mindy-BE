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
    return this.verifyAccessTokenWithExpiry(token).principal;
  }

  verifyAccessTokenWithExpiry(token: string): {
    principal: AuthenticatedUser;
    expiresAt: Date;
  } {
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
      principal: {
        userId: payload.sub,
        sessionId: payload.sid,
        role: payload.role,
      },
      expiresAt: new Date(payload.exp * 1000),
    };
  }

  signRealtimeTicket(
    user: AuthenticatedUser,
    accessExpiresAt: Date,
    origin: string,
    channel: 'chat' | 'whiteboards',
  ) {
    const now = Math.floor(Date.now() / 1000);
    const sessionExpiresAt = Math.floor(accessExpiresAt.getTime() / 1000);
    if (sessionExpiresAt <= now) throw new Error('Access token expired');
    const expiresAt = Math.min(now + 60, sessionExpiresAt);
    const unsigned = [
      encodePart({ alg: 'RS256', typ: 'mindy-realtime+jwt' }),
      encodePart({
        sub: user.userId,
        sid: user.sessionId,
        role: user.role,
        origin,
        channel,
        iat: now,
        exp: expiresAt,
        sessionExpiresAt,
      }),
    ].join('.');
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return {
      ticket: `${unsigned}.${signer.sign(this.privateKey()).toString('base64url')}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  verifyRealtimeTicket(
    ticket: string,
    origin: string,
    channel: 'chat' | 'whiteboards',
  ): { principal: AuthenticatedUser; expiresAt: Date } {
    if (ticket.length > 4096) throw new Error('Invalid ticket');
    const parts = ticket.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2])
      throw new Error('Invalid ticket');
    const header = decodePart(parts[0]);
    if (header.alg !== 'RS256' || header.typ !== 'mindy-realtime+jwt')
      throw new Error('Invalid ticket type');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    if (!verifier.verify(this.publicKey(), Buffer.from(parts[2], 'base64url')))
      throw new Error('Invalid ticket signature');
    const payload = decodePart(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !isUserRole(payload.role) ||
      !Number.isSafeInteger(payload.exp) ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now ||
      !Number.isSafeInteger(payload.iat) ||
      typeof payload.iat !== 'number' ||
      payload.iat > now ||
      payload.exp - payload.iat > 60 ||
      !Number.isSafeInteger(payload.sessionExpiresAt) ||
      typeof payload.sessionExpiresAt !== 'number' ||
      payload.sessionExpiresAt < payload.exp ||
      payload.origin !== origin ||
      payload.channel !== channel
    )
      throw new Error('Invalid ticket claims');
    return {
      principal: { userId: payload.sub, sessionId: payload.sid, role: payload.role },
      expiresAt: new Date(payload.sessionExpiresAt * 1000),
    };
  }

  verifySocketIdentity(
    auth: Record<string, unknown>,
    cookie: string | undefined,
    origin: string | undefined,
    channel: 'chat' | 'whiteboards',
  ) {
    if (auth.ticket !== undefined) {
      if (typeof auth.ticket !== 'string' || !origin) throw new Error('Invalid realtime ticket');
      return this.verifyRealtimeTicket(auth.ticket, origin, channel);
    }
    const token = cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('access_token='))
      ?.slice(13);
    if (!token) throw new Error('Authentication required');
    return this.verifyAccessTokenWithExpiry(decodeURIComponent(token));
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
