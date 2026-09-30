import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import { CodeChallengeMethod, type LoginTicket, OAuth2Client } from 'google-auth-library';
import type { GoogleCallbackQueryDto } from '../dtos/google-callback-query.dto.js';
import { GoogleAuthenticationFailedException } from '../exceptions/auth.exceptions.js';

interface GoogleStatePayload {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  readonly expiresAt: number;
}

export interface GoogleAuthorizationStart {
  readonly authorizationUrl: string;
  readonly stateCookie: string;
  readonly maxAgeMilliseconds: number;
}

export interface GoogleProfile {
  readonly subject: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

@Injectable()
export class GoogleOidcService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.getOrThrow<boolean>('GOOGLE_AUTH_ENABLED');
  }

  async begin(returnTo: string): Promise<GoogleAuthorizationStart> {
    const client = this.client();
    const ttlSeconds = this.config.getOrThrow<number>('GOOGLE_OAUTH_STATE_TTL_SECONDS');
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    if (codeChallenge === undefined) {
      throw new GoogleAuthenticationFailedException();
    }

    const payload: GoogleStatePayload = {
      state,
      nonce,
      codeVerifier,
      returnTo,
      expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const authorizationUrl = client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });

    return {
      authorizationUrl,
      stateCookie: this.seal(payload),
      maxAgeMilliseconds: ttlSeconds * 1000,
    };
  }

  async complete(
    query: GoogleCallbackQueryDto,
    stateCookie: string | undefined,
  ): Promise<{ profile: GoogleProfile; returnTo: string }> {
    if (
      query.error !== undefined ||
      query.code === undefined ||
      query.state === undefined ||
      stateCookie === undefined
    ) {
      throw new GoogleAuthenticationFailedException();
    }

    const state = this.unseal(stateCookie);
    if (state.expiresAt <= Math.floor(Date.now() / 1000) || state.state !== query.state) {
      throw new GoogleAuthenticationFailedException();
    }

    try {
      const client = this.client();
      const tokenResponse = await client.getToken({
        code: query.code,
        codeVerifier: state.codeVerifier,
        redirect_uri: this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
      });
      const idToken = tokenResponse.tokens.id_token;
      if (typeof idToken !== 'string' || idToken.length === 0) {
        throw new GoogleAuthenticationFailedException();
      }

      const ticket = await (client.verifyIdToken({
        idToken: idToken,
        audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      }) as Promise<LoginTicket>);
      const payload = ticket.getPayload();
      if (
        payload === undefined ||
        payload.sub.length === 0 ||
        payload.email === undefined ||
        payload.email_verified !== true ||
        payload.nonce !== state.nonce
      ) {
        throw new GoogleAuthenticationFailedException();
      }

      return {
        returnTo: state.returnTo,
        profile: {
          subject: payload.sub,
          email: payload.email.trim().toLowerCase(),
          displayName: this.safeDisplayName(payload.name),
          avatarUrl: this.safeAvatarUrl(payload.picture),
        },
      };
    } catch (error: unknown) {
      if (error instanceof GoogleAuthenticationFailedException) {
        throw error;
      }
      throw new GoogleAuthenticationFailedException();
    }
  }

  private client(): OAuth2Client {
    if (!this.isEnabled()) {
      throw new GoogleAuthenticationFailedException();
    }
    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI');
    if (clientId.length === 0 || clientSecret.length === 0 || redirectUri.length === 0) {
      throw new GoogleAuthenticationFailedException();
    }
    return new OAuth2Client({ clientId, clientSecret, redirectUri });
  }

  private seal(payload: GoogleStatePayload): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  private unseal(value: string): GoogleStatePayload {
    const [encoded, signature] = value.split('.');
    if (encoded === undefined || signature === undefined) {
      throw new GoogleAuthenticationFailedException();
    }
    const expected = Buffer.from(this.signature(encoded), 'base64url');
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new GoogleAuthenticationFailedException();
    }

    try {
      const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (!this.isStatePayload(parsed)) {
        throw new GoogleAuthenticationFailedException();
      }
      return parsed;
    } catch (error: unknown) {
      if (error instanceof GoogleAuthenticationFailedException) {
        throw error;
      }
      throw new GoogleAuthenticationFailedException();
    }
  }

  private signature(encoded: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'))
      .update(encoded, 'utf8')
      .digest('base64url');
  }

  private isStatePayload(value: unknown): value is GoogleStatePayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const state = value as Record<string, unknown>;
    return (
      typeof state.state === 'string' &&
      typeof state.nonce === 'string' &&
      typeof state.codeVerifier === 'string' &&
      typeof state.returnTo === 'string' &&
      typeof state.expiresAt === 'number'
    );
  }

  private safeDisplayName(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized === undefined || normalized.length === 0 ? null : normalized.slice(0, 150);
  }

  private safeAvatarUrl(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleusercontent.com')) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }
}
