import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
export function pushConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return new ConfigService({
    PUSH_ENABLED: true,
    PUSH_WORKER_ENABLED: true,
    CHAT_ENABLED: true,
    CHAT_JOB_ENABLED: true,
    PUSH_ACTIVATED_AT: '2026-01-01T00:00:00.000Z',
    PUSH_TTL_SECONDS: 300,
    FIREBASE_PROJECT_ID: 'mindy-test',
    FRONTEND_BASE_URL: 'https://app.example.test',
    CORS_ORIGINS: 'https://app.example.test',
    PUSH_WEB_INBOX_PATH: '/notifications',
    PUSH_TOKEN_KEYRING: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
    PUSH_TOKEN_ACTIVE_KEY_VERSION: 1,
    PUSH_TOKEN_FINGERPRINT_KEY: randomBytes(32).toString('base64'),
    CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
    CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: 1,
    ACCESS_TOKEN_TTL_SECONDS: 900,
    ...overrides,
  });
}
