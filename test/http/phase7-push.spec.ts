import { type ChildProcess, fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase7_http'))(
  'Phase 7 compiled HTTP guards, lifecycle, OpenAPI and redaction',
  () => {
    let server: ChildProcess,
      db: DataSource,
      url: string,
      student: string,
      other: string,
      manager: string;
    const logs: string[] = [],
      token = 'sensitive-fcm-token-canary',
      installationId = randomUUID();
    beforeAll(async () => {
      server = fork('test/http/payment-server.mjs', [], {
        execArgv: [],
        silent: true,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: separateTestUrl('phase7_http'),
          DATABASE_LOGGING: 'false',
          COOKIE_SECURE: 'false',
          CORS_ORIGINS: 'https://app.example.test',
          FRONTEND_BASE_URL: 'https://app.example.test',
          SWAGGER_ENABLED: 'true',
          GOOGLE_AUTH_ENABLED: 'false',
          MAIL_ENABLED: 'false',
          PAYOS_ENABLED: 'false',
          ORDER_EXPIRY_JOB_ENABLED: 'false',
          PAYMENT_MAIL_JOB_ENABLED: 'false',
          ASSIGNMENT_TIMEOUT_JOB_ENABLED: 'false',
          FILE_JOB_ENABLED: 'false',
          MINIO_ENABLED: 'false',
          CHAT_ATTACHMENTS_ENABLED: 'false',
          CHAT_ENABLED: 'true',
          CHAT_JOB_ENABLED: 'false',
          CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: '1',
          CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
          PUSH_ENABLED: 'true',
          PUSH_WORKER_ENABLED: 'false',
          PUSH_ACTIVATED_AT: '2026-01-01T00:00:00Z',
          FIREBASE_PROJECT_ID: 'mindy-test',
          PUSH_TOKEN_KEYRING: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
          PUSH_TOKEN_ACTIVE_KEY_VERSION: '1',
          PUSH_TOKEN_FINGERPRINT_KEY: randomBytes(32).toString('base64'),
          PUSH_WEB_INBOX_PATH: '/notifications',
        },
      });
      server.stdout?.on('data', (v) => logs.push(String(v)));
      server.stderr?.on('data', (v) => logs.push(String(v)));
      const ready = await new Promise<{ url: string }>((resolve, reject) => {
        server.once('message', (m) => resolve(m as { url: string }));
        server.once('error', reject);
        server.once('exit', (code) => reject(new Error(`server exited ${code}: ${logs.join('')}`)));
      });
      url = `${ready.url}/api/v1`;
      db = new DataSource({ type: 'postgres', url: separateTestUrl('phase7_http') });
      await db.initialize();
      async function login(email: string): Promise<string> {
        const r = await request(
          '/auth/login',
          undefined,
          { email, password: 'Http-test-password1!' },
          'POST',
        );
        expect(r.status).toBe(200);
        return r.headers
          .getSetCookie()
          .map((v) => v.split(';')[0])
          .join('; ');
      }
      student = await login('student@http.test');
      other = await login('other@http.test');
      manager = await login('manager@http.test');
    }, 60000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
      if (server?.exitCode === null)
        await new Promise<void>((resolve) => {
          server.once('exit', () => resolve());
          server.send('close');
          setTimeout(() => {
            server.kill();
            resolve();
          }, 5000).unref();
        });
    });
    function request(
      path: string,
      cookie?: string,
      body?: unknown,
      method = 'PUT',
      origin = 'https://app.example.test',
    ): Promise<Response> {
      return fetch(`${url}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          ...(cookie ? { cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    const route = `/notifications/push/installations/${installationId}`;
    it('requires session, STUDENT/MENTOR role and exact allowed Origin', async () => {
      const body = { platform: 'WEB', token };
      expect((await request(route, undefined, body)).status).toBe(401);
      expect((await request(route, manager, body)).status).toBe(403);
      expect((await request(route, student, body, 'PUT', 'https://evil.example.test')).status).toBe(
        403,
      );
      expect((await request(route, student, body, 'PUT', '')).status).toBe(403);
    });
    it('validates UUID, WEB, token, unknown fields, generation and body limit', async () => {
      for (const body of [
        { platform: 'IOS', token },
        { platform: 'WEB', token: '' },
        { platform: 'WEB', token: 'contains whitespace' },
        { platform: 'WEB', token, userId: randomUUID() },
        { platform: 'WEB', token: 'a'.repeat(4097) },
      ])
        expect((await request(route, student, body)).status).toBe(422);
      expect(
        (
          await request('/notifications/push/installations/bad', student, {
            platform: 'WEB',
            token,
          })
        ).status,
      ).toBe(400);
      expect((await request(`${route}?generation=0`, student, undefined, 'DELETE')).status).toBe(
        422,
      );
      expect(
        (await request(route, student, { platform: 'WEB', token: 'a'.repeat(9000) })).status,
      ).toBe(413);
    });
    it('returns redacted DTO, preserves replay generation, rejects foreign ownership and stale DELETE', async () => {
      const body = { platform: 'WEB', token };
      const result = await request(route, student, body);
      expect(result.status).toBe(200);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(await result.json()).toMatchObject({
        installationId,
        platform: 'WEB',
        status: 'ACTIVE',
        generation: '1',
      });
      expect(await (await request(route, student, body)).json()).toHaveProperty('generation', '1');
      expect((await request(route, other, body)).status).toBe(409);
      expect((await request(`${route}?generation=1`, other, undefined, 'DELETE')).status).toBe(404);
      expect(
        await (
          await request(route, student, { platform: 'WEB', token: `${token}-rotated` })
        ).json(),
      ).toHaveProperty('generation', '2');
      expect((await request(`${route}?generation=1`, student, undefined, 'DELETE')).status).toBe(
        409,
      );
      expect((await request(`${route}?generation=2`, student, undefined, 'DELETE')).status).toBe(
        204,
      );
      expect((await request(`${route}?generation=2`, student, undefined, 'DELETE')).status).toBe(
        204,
      );
      expect(JSON.stringify(await db.query('SELECT * FROM push_installations'))).not.toContain(
        token,
      );
      expect(logs.join('')).not.toContain(token);
    });
    it('Swagger exposes both installation mutations and existing inbox routes', async () => {
      const response = await fetch(`${url.replace('/api/v1', '')}/docs-json`);
      expect(response.status).toBe(200);
      const spec = (await response.json()) as { paths: Record<string, Record<string, unknown>> };
      expect(
        spec.paths['/api/v1/notifications/push/installations/{installationId}'],
      ).toHaveProperty('put');
      expect(
        spec.paths['/api/v1/notifications/push/installations/{installationId}'],
      ).toHaveProperty('delete');
      for (const path of [
        '/notifications',
        '/notifications/unread-count',
        '/notifications/read-all',
        '/notifications/{notificationId}/read',
      ])
        expect(spec.paths).toHaveProperty(`/api/v1${path}`);
      expect(JSON.stringify(spec)).not.toContain(token);
    });
    it('rate limits across mutations and emits Retry-After', async () => {
      await db.query('TRUNCATE push_mutation_events');
      for (let i = 0; i < 20; i++)
        expect((await request(route, student, { platform: 'WEB', token })).status).toBe(200);
      const result = await request(route, student, { platform: 'WEB', token });
      expect(result.status).toBe(429);
      expect(result.headers.get('retry-after')).toBe('60');
    });
    it('logout revokes binding atomically and denies old cookie', async () => {
      await db.query('TRUNCATE push_mutation_events');
      expect((await request('/auth/logout', student, undefined, 'POST')).status).toBe(204);
      expect(
        (await db.query('SELECT status FROM push_installations WHERE id=$1', [installationId]))[0]
          .status,
      ).toBe('REVOKED');
      expect((await request(route, student, { platform: 'WEB', token })).status).toBe(401);
      expect(logs.join('')).not.toContain(token);
    });
  },
);
