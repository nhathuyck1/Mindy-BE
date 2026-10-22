import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TeachingNoteResponseDto } from '../../src/modules/teaching-operations/dtos/teaching-note.dto.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}
describe.skipIf(!separateTestUrl('phase46_http'))(
  'Phase4.6 mentor workspace built-app HTTP',
  () => {
    let server: ChildProcess,
      db: DataSource,
      url: string,
      classId: string,
      admin: string,
      manager: string,
      mentor: string,
      student: string,
      sourceId: string;
    beforeAll(async () => {
      const dbUrl = separateTestUrl('phase46_http'),
        keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
      server = fork('test/http/payment-server.mjs', [], {
        execArgv: [],
        silent: true,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: dbUrl,
          DATABASE_LOGGING: 'false',
          COOKIE_SECURE: 'false',
          CORS_ORIGINS: 'http://localhost:3001',
          SWAGGER_ENABLED: 'true',
          GOOGLE_AUTH_ENABLED: 'false',
          MAIL_ENABLED: 'false',
          JWT_PRIVATE_KEY_BASE64: Buffer.from(
            keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
          ).toString('base64'),
          JWT_PUBLIC_KEY_BASE64: Buffer.from(
            keys.publicKey.export({ type: 'spki', format: 'pem' }),
          ).toString('base64'),
          ORDER_EXPIRY_JOB_ENABLED: 'false',
          PAYMENT_MAIL_JOB_ENABLED: 'false',
          PAYOS_ENABLED: 'true',
          PAYOS_CREATE_LINK_ENABLED: 'true',
          PAYOS_CLIENT_ID: 'http-client',
          PAYOS_API_KEY: 'http-key',
          PAYOS_CHECKSUM_KEY: 'http-checksum',
          PAYOS_RETURN_URL: 'https://example.test/paid',
          PAYOS_CANCEL_URL: 'https://example.test/cancel',
          PAYOS_WEBHOOK_URL: 'https://example.test/webhook',
        },
      });
      let output = '';
      server.stdout?.on('data', (chunk) => {
        output += String(chunk);
      });
      server.stderr?.on('data', (chunk) => {
        output += String(chunk);
      });
      const ready = await new Promise<{ url: string; classId: string }>((resolve, reject) => {
        server.once('message', (message) => resolve(message as { url: string; classId: string }));
        server.once('exit', (code) => reject(new Error(`HTTP server exited ${code}: ${output}`)));
        server.once('error', reject);
      });
      url = `${ready.url}/api/v1`;
      classId = ready.classId;
      db = new DataSource({ type: 'postgres', url: dbUrl });
      await db.initialize();
      await db.query("UPDATE users SET role='MANAGER' WHERE email='other@http.test'");
      async function login(email: string): Promise<string> {
        const res = await request('/auth/login', undefined, {
          email,
          password: 'Http-test-password1!',
        });
        expect(res.status, output).toBe(200);
        return res.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; ');
      }
      admin = await login('admin@http.test');
      manager = await login('other@http.test');
      mentor = await login('mentor@http.test');
      student = await login('student@http.test');
      const rows: { id: string }[] = await db.query(
        'SELECT id FROM class_sessions WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)',
        [classId],
      );
      sourceId = rows[0]?.id ?? '';
      if (!sourceId) throw new Error('Missing source');
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
      if (server && server.exitCode === null)
        await new Promise<void>((resolve) => {
          server.once('exit', () => resolve());
          server.send('close');
          const timer = setTimeout(() => {
            server.kill();
            resolve();
          }, 5000);
          timer.unref();
        });
    });
    function request(
      path: string,
      cookie?: string,
      body?: unknown,
      method = body === undefined ? 'GET' : 'POST',
      key?: string,
    ): Promise<Response> {
      return fetch(`${url}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }

    it('lets the assigned mentor update meeting URLs with role, Origin, DTO and version guards', async () => {
      const path = `/mentor/class-sessions/${sourceId}/meeting-url`;
      const update = (body: unknown, cookie?: string, origin = 'http://localhost:3001') =>
        fetch(`${url}${path}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
          body: JSON.stringify(body),
        });
      const rows: { version: number }[] = await db.query(
        'SELECT version FROM class_sessions WHERE id=$1',
        [sourceId],
      );
      const version = rows[0]?.version ?? 0;
      const input = {
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        expectedVersion: version,
      };
      expect((await update(input)).status).toBe(401);
      for (const cookie of [admin, manager, student])
        expect((await update(input, cookie)).status).toBe(403);
      expect((await update(input, mentor, 'https://evil.test')).status).toBe(403);
      expect((await request(path, mentor, input, 'PATCH')).status).toBe(403);
      for (const body of [
        {},
        { expectedVersion: version },
        { ...input, expectedVersion: 0 },
        { ...input, expectedVersion: '1' },
        { ...input, extra: true },
        { ...input, meetingUrl: '' },
        { ...input, meetingUrl: 'javascript:alert(1)' },
        { ...input, meetingUrl: 'ftp://example.com/meeting' },
        { ...input, meetingUrl: 'https://user:password@example.com/meeting' },
        { ...input, meetingUrl: `https://example.com/${'x'.repeat(2048)}` },
      ])
        expect((await update(body, mentor)).status).toBe(422);
      const response = await update(input, mentor);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const saved = await json<{ version: number }>(response);
      expect(saved).toMatchObject({
        sessionId: sourceId,
        classId,
        meetingUrl: input.meetingUrl,
        effectiveMeetingUrl: input.meetingUrl,
        version: version + 1,
      });
      expect(await json(request(`/class-sessions/${sourceId}/context`, mentor))).toMatchObject({
        meetingUrl: input.meetingUrl,
      });
      expect((await update({ ...input, meetingUrl: null }, mentor)).status).toBe(409);
      expect(
        (await update({ meetingUrl: null, expectedVersion: saved.version }, mentor)).status,
      ).toBe(200);
      const doc = await json<{ paths: Record<string, unknown> }>(
        fetch(`${url.replace('/api/v1', '')}/docs-json`),
      );
      expect(doc.paths).toHaveProperty('/api/v1/mentor/class-sessions/{sessionId}/meeting-url');
    });

    it('exposes consolidated tracking only to admin, validates filters and includes meeting before/after', async () => {
      const path = '/admin/tracking/events';
      expect((await request(path)).status).toBe(401);
      for (const cookie of [manager, mentor, student])
        expect((await request(path, cookie)).status).toBe(403);
      for (const query of [
        'pageSize=101',
        'source=mutation_receipts',
        'actorId=bad',
        'extra=true',
        'from=2026-10-22',
        'from=2026-10-23T00:00:00Z&to=2026-10-22T00:00:00Z',
      ])
        expect((await request(`${path}?${query}`, admin)).status).toBe(422);
      const response = await request(
        `${path}?source=session_meeting_audits&sessionId=${sourceId}&pageSize=1`,
        admin,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const page = await json<{
        items: { id: string; source: string; action: string }[];
        total: number;
      }>(response);
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(1);
      const event = page.items[0];
      if (!event) throw new Error('Missing event');
      expect(event.action).toBe('UPDATE_MEETING_URL');
      expect(event).not.toHaveProperty('data');
      const detail = await request(`${path}/${event.source}/${event.id}`, admin);
      expect(detail.status).toBe(200);
      expect(await json(detail)).toMatchObject({
        data: { old_meeting_url: 'https://meet.google.com/abc-defg-hij', new_meeting_url: null },
      });
      expect((await request(`${path}/${event.source}/${event.id}`, mentor)).status).toBe(403);
      expect((await request(`${path}/${event.source}/${randomUUID()}`, admin)).status).toBe(404);
      expect((await request(`${path}/mutation_receipts/${event.id}`, admin)).status).toBe(400);
      expect((await request(`${path}/session_meeting_audits/bad`, admin)).status).toBe(400);
      const doc = await json<{ paths: Record<string, unknown> }>(
        fetch(`${url.replace('/api/v1', '')}/docs-json`),
      );
      expect(doc.paths).toHaveProperty('/api/v1/admin/tracking/events');
      expect(doc.paths).toHaveProperty('/api/v1/admin/tracking/events/{source}/{eventId}');
    });

    it('enforces real cookie/role/path/query validation and publishes the workspace OpenAPI contract', async () => {
      expect((await request(`/mentor/classes/${classId}`)).status).toBe(401);
      expect((await request(`/mentor/classes/${classId}`, student)).status).toBe(403);
      const detail = await request(`/mentor/classes/${classId}`, mentor);
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({
        id: classId,
        accessScope: 'CLASS',
        assignmentType: 'PRIMARY',
      });
      expect(
        (await request(`/mentor/classes/${classId}/sessions?pageSize=101`, mentor)).status,
      ).toBe(422);
      expect(
        (await request(`/mentor/classes/${classId}/sessions?from=2026-10-22T00:00:00Z`, mentor))
          .status,
      ).toBe(422);
      expect((await request(`/mentor/classes/${classId}/progress`, mentor)).status).toBe(200);
      expect((await request(`/mentor/classes/${classId}/attendance-summary`, mentor)).status).toBe(
        200,
      );
      const doc = await json<{
        paths: Record<string, unknown>;
        components: { schemas: Record<string, unknown> };
      }>(fetch(`${url.replace('/api/v1', '')}/docs-json`));
      expect(Object.keys(doc.paths).some((p) => p.endsWith('/teaching-notes'))).toBe(true);
      expect(doc.components.schemas.TeachingNoteInput).toBeDefined();
    });
    it('returns provisional roster without starting, and keeps internal notes private with CSRF/version/replay protection', async () => {
      const path = `/class-sessions/${sourceId}/teaching-notes`;
      expect(await json(request(path, mentor))).toMatchObject({ note: null, version: 0 });
      expect((await request(path, student)).status).toBe(403);
      const candidates = await request(`/class-sessions/${sourceId}/attendance-candidates`, mentor);
      expect(candidates.status).toBe(200);
      expect(await candidates.json()).toMatchObject({ provisional: true });
      const input = { expectedVersion: 0, content: 'Loops', nextSteps: 'Practice' },
        key = randomUUID();
      const put = (cookie: string, body: object, origin = true, k: string = key) =>
        fetch(url + path, {
          method: 'PUT',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
            'Idempotency-Key': k,
            ...(origin ? { Origin: 'http://localhost:3001' } : {}),
          },
          body: JSON.stringify(body),
        });
      expect((await put(mentor, input, false)).status).toBe(403);
      expect((await put(mentor, { ...input, expectedVersion: -1 })).status).toBe(422);
      expect((await put(mentor, input, true, 'bad-key')).status).toBe(422);
      expect((await put(mentor, input)).status).toBe(409);
      await db.query(
        `UPDATE class_sessions SET status='IN_PROGRESS',teaching_mentor_id=(SELECT id FROM users WHERE email='mentor@http.test'),actual_started_at=now(),editable_until=now()+interval '1 day' WHERE id=$1`,
        [sourceId],
      );
      const saved = await put(mentor, input);
      expect(saved.status).toBe(200);
      const note = await json<TeachingNoteResponseDto>(saved);
      expect(note.version).toBe(1);
      expect(await json(put(mentor, input))).toEqual(note);
      expect((await put(mentor, { ...input, content: 'Other' })).status).toBe(409);
      const correction = await fetch(`${url}/management${path}`, {
        method: 'PUT',
        headers: {
          Cookie: manager,
          Origin: 'http://localhost:3001',
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ ...input, expectedVersion: 1, reason: 'Review correction' }),
      });
      expect(correction.status).toBe(200);
      expect((await request(`/management${path}`, admin)).status).toBe(200);
      expect((await request(`/management${path}`, mentor)).status).toBe(403);
    });
  },
);
