import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
import { type App, applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import type { Message } from 'firebase-admin/messaging';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushConfig } from './push-config.service.js';

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export interface PushRequest {
  token: string;
  notificationId: string;
  ttlSeconds: number;
}
export interface PushProvider {
  send(request: PushRequest): Promise<string>;
}
export type PushFailureCode =
  | 'UNREGISTERED'
  | 'INVALID_PAYLOAD'
  | 'QUOTA'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'CONFIGURATION'
  | 'PROVIDER_ERROR';
export class PushProviderError extends Error {
  constructor(
    readonly reason: PushFailureCode,
    readonly retryAfterMs = 0,
  ) {
    super(reason);
  }
}
export function providerFailure(error: unknown): PushProviderError {
  if (error instanceof PushProviderError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  switch (code) {
    case 'messaging/registration-token-not-registered':
    case 'messaging/invalid-registration-token':
      return new PushProviderError('UNREGISTERED');
    case 'messaging/invalid-argument':
    case 'messaging/invalid-payload':
    case 'messaging/payload-size-limit-exceeded':
      return new PushProviderError('INVALID_PAYLOAD');
    case 'messaging/message-rate-exceeded':
    case 'messaging/device-message-rate-exceeded':
    case 'messaging/topics-message-rate-exceeded':
    case 'messaging/quota-exceeded':
      return new PushProviderError('QUOTA', 60000);
    case 'messaging/server-unavailable':
    case 'messaging/internal-error':
    case 'app/network-error':
      return new PushProviderError('UNAVAILABLE', retryAfter(error));
    case 'app/network-timeout':
      return new PushProviderError('TIMEOUT');
    case 'messaging/authentication-error':
    case 'messaging/mismatched-credential':
    case 'messaging/third-party-auth-error':
    case 'app/invalid-credential':
      return new PushProviderError('CONFIGURATION');
    default:
      return new PushProviderError('PROVIDER_ERROR');
  }
}
function retryAfter(error: unknown): number {
  if (!error || typeof error !== 'object' || !('httpResponse' in error)) return 0;
  const response = error.httpResponse;
  if (!response || typeof response !== 'object' || !('headers' in response)) return 0;
  const headers = response.headers;
  if (!headers || typeof headers !== 'object' || !('retry-after' in headers)) return 0;
  const value = String(headers['retry-after']);
  return /^\d+$/.test(value)
    ? Number(value) * 1000
    : Math.max(0, Date.parse(value) - Date.now()) || 0;
}
export function pushMessage(config: PushConfig, r: PushRequest): Message {
  return {
    token: r.token,
    notification: { title: 'Tin nhắn mới', body: 'Bạn có tin nhắn mới.' },
    data: { schemaVersion: '1', notificationId: r.notificationId },
    webpush: {
      headers: { TTL: String(Math.max(0, Math.floor(r.ttlSeconds))) },
      notification: { tag: r.notificationId },
      fcmOptions: { link: config.link },
    },
  };
}
@Injectable()
export class FcmAdapter implements PushProvider, OnApplicationShutdown, OnModuleInit {
  private readonly app: App | undefined;
  private readonly project: string;
  constructor(
    private readonly config: PushConfig,
    env: ConfigService,
  ) {
    this.project = env.get<string>('FIREBASE_PROJECT_ID', '');
    if (!config.enabled) return;
    try {
      this.app = initializeApp(
        {
          projectId: env.getOrThrow<string>('FIREBASE_PROJECT_ID'),
          credential: applicationDefault(),
          httpAgent: undefined,
        },
        'mindy-push',
      );
    } catch {
      throw new Error('Firebase initialization failed; check server credentials');
    }
  }
  async onModuleInit(): Promise<void> {
    if (!this.app) return;
    try {
      await this.accessToken();
    } catch {
      throw new Error('Firebase credentials unavailable; verify ADC and project IAM');
    }
  }
  private async accessToken(): Promise<string> {
    const credential = this.app?.options.credential;
    if (!credential) throw new PushProviderError('CONFIGURATION');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        credential.getAccessToken(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new PushProviderError('TIMEOUT')), 10000);
        }),
      ]);
      return result.access_token;
    } finally {
      clearTimeout(timer);
    }
  }
  async send(request: PushRequest): Promise<string> {
    if (!this.app) throw new PushProviderError('CONFIGURATION');
    try {
      // Admin SDK ADC plus HTTP v1 gives a cancellable request and one durable retry owner.
      const started = Date.now();
      const token = await this.accessToken();
      const ttlSeconds = request.ttlSeconds - Math.ceil((Date.now() - started) / 1000);
      if (ttlSeconds <= 0) throw new PushProviderError('TIMEOUT');
      return await sendFcmHttp(
        this.project,
        token,
        pushMessage(this.config, { ...request, ttlSeconds }),
      );
    } catch (e) {
      if (e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name))
        throw new PushProviderError('TIMEOUT');
      if (e instanceof TypeError) throw new PushProviderError('UNAVAILABLE');
      throw providerFailure(e);
    }
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.app) await deleteApp(this.app);
  }
}

/** HTTP v1 transport; base override is for local contract simulation, never read from an API or env. */
export async function sendFcmHttp(
  project: string,
  accessToken: string,
  message: Message,
  base = 'https://fcm.googleapis.com',
): Promise<string> {
  const { webpush, ...rest } = message;
  const response = await fetch(`${base}/v1/projects/${project}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        ...rest,
        webpush: {
          headers: webpush?.headers,
          notification: webpush?.notification,
          fcm_options: webpush?.fcmOptions,
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw fcmHttpFailure(response.status, response.headers.get('retry-after'), body);
  if (!body || typeof body !== 'object' || !('name' in body) || typeof body.name !== 'string')
    throw new PushProviderError('PROVIDER_ERROR');
  return body.name;
}

export function fcmHttpFailure(
  status: number,
  retry: string | null,
  body: unknown,
): PushProviderError {
  let reason = '';
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object' &&
    'details' in body.error &&
    Array.isArray(body.error.details)
  ) {
    for (const detail of body.error.details)
      if (
        detail &&
        typeof detail === 'object' &&
        detail['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' &&
        typeof detail.errorCode === 'string'
      )
        reason = detail.errorCode;
  }
  if (reason === 'UNREGISTERED') return new PushProviderError('UNREGISTERED');
  if (status === 401 || status === 403) return new PushProviderError('CONFIGURATION');
  if (status === 400) return new PushProviderError('INVALID_PAYLOAD');
  const delay = retry
    ? /^\d+$/.test(retry)
      ? Number(retry) * 1000
      : Math.max(0, Date.parse(retry) - Date.now()) || 0
    : 0;
  if (status === 429) return new PushProviderError('QUOTA', Math.max(60000, delay));
  if (status >= 500) return new PushProviderError('UNAVAILABLE', delay);
  return new PushProviderError('PROVIDER_ERROR');
}
