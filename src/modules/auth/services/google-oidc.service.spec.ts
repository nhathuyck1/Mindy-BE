import { describe, expect, it } from 'vitest';

import { GoogleAuthenticationFailedException } from '../exceptions/auth.exceptions.js';
import { GoogleOidcService } from './google-oidc.service.js';

function config(overrides: Record<string, unknown> = {}): never {
  const values: Record<string, unknown> = {
    GOOGLE_AUTH_ENABLED: true,
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/google/callback',
    GOOGLE_OAUTH_STATE_TTL_SECONDS: 600,
    ...overrides,
  };
  return {
    getOrThrow<T>(key: string): T {
      if (!(key in values)) {
        throw new Error(`Missing test config: ${key}`);
      }
      return values[key] as T;
    },
  } as never;
}

describe('GoogleOidcService', () => {
  it('creates an authorization-code request with state, nonce, and PKCE', async () => {
    const service = new GoogleOidcService(config());

    const start = await service.begin('/dashboard');
    const url = new URL(start.authorizationUrl);

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(start.stateCookie).toContain('.');
    expect(start.maxAgeMilliseconds).toBe(600_000);
  });

  it('rejects a callback when its sealed state cookie was tampered with', async () => {
    const service = new GoogleOidcService(config());
    const start = await service.begin('/');
    const state = new URL(start.authorizationUrl).searchParams.get('state');

    await expect(
      service.complete(
        { code: 'authorization-code', state: state ?? undefined },
        `${start.stateCookie}tampered`,
      ),
    ).rejects.toBeInstanceOf(GoogleAuthenticationFailedException);
  });

  it('does not start Google authentication when the feature is disabled', async () => {
    const service = new GoogleOidcService(config({ GOOGLE_AUTH_ENABLED: false }));

    await expect(service.begin('/')).rejects.toBeInstanceOf(GoogleAuthenticationFailedException);
  });
});
