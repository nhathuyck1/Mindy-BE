import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MentorTeachingScheduleDto } from '../../src/modules/classes/dtos/teaching.dto.js';
import type {
  LeaveApprovalDto,
  LeavePreviewDto,
  LeaveRequestDto,
  LeaveRequestPageDto,
  LeaveSlotsDto,
} from '../../src/modules/teaching-operations/dtos/leave.dto.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

describe.skipIf(!separateTestUrl('phase44leave_http'))(
  'Phase4.4 mentor leave built-app HTTP',
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
      const dbUrl = separateTestUrl('phase44leave_http'),
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
    async function source(): Promise<{
      id: string;
      version: number;
      class_unit_id: string;
      starts_at: Date;
      ends_at: Date;
    }> {
      const rows = await db.query(
        'SELECT id,version,class_unit_id,starts_at,ends_at FROM class_sessions WHERE id=$1',
        [sourceId],
      );
      return rows[0];
    }

    async function leaveInput() {
      const s = await source();
      const date = s.starts_at.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
      const target = new Date(`${date}T00:00:00Z`);
      target.setUTCDate(target.getUTCDate() + 1);
      const preview = await request('/mentor/leave-requests/preview', mentor, {
        fromDate: date,
        toDate: date,
        period: 'FULL_DAY',
      });
      expect(preview.status).toBe(200);
      const body = await json<LeavePreviewDto>(preview);
      return {
        fromDate: date,
        toDate: date,
        period: 'FULL_DAY',
        reason: 'Personal leave',
        sourceVersions: body.sourceVersions,
        dayMappings: [{ sourceDate: date, targetDate: target.toISOString().slice(0, 10) }],
      };
    }

    it('guards all leave roles, validates nested payloads and exposes all Swagger contracts', async () => {
      const input = await leaveInput();
      expect((await request('/mentor/leave-requests/preview', undefined, input)).status).toBe(401);
      for (const cookie of [admin, manager, student])
        expect(
          (await request('/mentor/leave-requests', cookie, input, 'POST', randomUUID())).status,
        ).toBe(403);
      for (const cookie of [mentor, student])
        expect((await request('/management/mentor-leave-requests', cookie)).status).toBe(403);
      for (const invalid of [
        { ...input, unknown: true },
        { ...input, reason: ' ' },
        { ...input, sourceVersions: [{ sessionId: sourceId, version: '1' }] },
        { ...input, dayMappings: [{ sourceDate: input.fromDate, targetDate: '2026-02-30' }] },
        { ...input, dayMappings: null },
      ])
        expect(
          (await request('/mentor/leave-requests', mentor, invalid, 'POST', randomUUID())).status,
        ).toBe(422);
      expect((await request('/mentor/leave-requests', mentor, input)).status).toBe(422);
      expect((await request('/mentor/leave-requests/not-a-uuid', mentor)).status).toBe(400);
      expect((await request(`/mentor/leave-requests/${randomUUID()}`, mentor)).status).toBe(404);
      const swagger = await json<{
        paths: Record<string, unknown>;
        components: {
          schemas: Record<string, { properties: Record<string, { nullable?: boolean }> }>;
        };
      }>(fetch(`${url.replace('/api/v1', '')}/docs-json`));
      for (const path of [
        '/mentor/leave-requests/preview',
        '/mentor/leave-requests/makeup-slots',
        '/mentor/leave-requests',
        '/mentor/leave-requests/{requestId}',
        '/mentor/leave-requests/{requestId}/withdraw',
        '/management/mentor-leave-requests',
        '/management/mentor-leave-requests/{requestId}',
        '/management/mentor-leave-requests/{requestId}/approve',
        '/management/mentor-leave-requests/{requestId}/reject',
      ])
        expect(swagger.paths[`/api/v1${path}`]).toBeDefined();
      expect(
        swagger.components.schemas.LeaveRequestDto?.properties.studentConflictCount?.nullable,
      ).toBe(true);
      expect(swagger.components.schemas.LeaveApprovalDto?.properties.replacements).toBeDefined();
    });
    it('runs preview, slots, create, list, own/staff detail, withdraw and reject through real cookies', async () => {
      const input = await leaveInput(),
        key = randomUUID();
      const slots = await request('/mentor/leave-requests/makeup-slots', mentor, {
        sourceSessionId: sourceId,
        targetDate: input.dayMappings[0]?.targetDate,
        targetPeriod: 'MORNING',
      });
      expect(slots.status).toBe(200);
      expect((await json<LeaveSlotsDto>(slots)).slots.length).toBeGreaterThan(0);
      const created = await request('/mentor/leave-requests', mentor, input, 'POST', key);
      expect(created.status).toBe(201);
      expect(created.headers.get('cache-control')).toBe('private, no-store');
      const body = await json<LeaveRequestDto>(created);
      expect(body).toMatchObject({ status: 'PENDING', version: 1, itemCount: 1 });
      expect(
        (await json<LeaveRequestDto>(request('/mentor/leave-requests', mentor, input, 'POST', key)))
          .id,
      ).toBe(body.id);
      const own = await json<LeaveRequestDto>(request(`/mentor/leave-requests/${body.id}`, mentor));
      expect(own.items).toHaveLength(1);
      expect(own).not.toHaveProperty('studentConflicts');
      const detail = await (
        await request(`/management/mentor-leave-requests/${body.id}`, manager)
      ).json();
      expect(detail).toMatchObject({ sourcesCurrent: true, studentConflictCount: 0 });
      const list = await json<LeaveRequestPageDto>(
        request('/mentor/leave-requests?pageSize=1&status=PENDING', mentor),
      );
      expect(list).toMatchObject({ total: 1, pageSize: 1 });
      expect(list.items[0]?.items).toEqual([]);
      const withdrawn = await request(
        `/mentor/leave-requests/${body.id}/withdraw`,
        mentor,
        { expectedVersion: 1, reason: 'Withdraw request' },
        'POST',
        randomUUID(),
      );
      expect(withdrawn.status).toBe(200);
      expect((await json<LeaveRequestDto>(withdrawn)).status).toBe('WITHDRAWN');
      const second = await json<LeaveRequestDto>(
        request('/mentor/leave-requests', mentor, input, 'POST', randomUUID()),
      );
      const rejected = await request(
        `/management/mentor-leave-requests/${second.id}/reject`,
        admin,
        { expectedVersion: 1, reason: 'Cannot approve' },
        'POST',
        randomUUID(),
      );
      expect(rejected.status).toBe(200);
      expect((await json<LeaveRequestDto>(rejected)).status).toBe('REJECTED');
    });
    it('approves atomically, replays receipt, updates mentor/student schedule and excludes approved leave from candidates', async () => {
      const input = await leaveInput();
      const pending = await json<LeaveRequestDto>(
        request('/mentor/leave-requests', mentor, input, 'POST', randomUUID()),
      );
      const key = randomUUID(),
        approval = {
          expectedVersion: 1,
          reason: 'Approve leave',
          acknowledgeStudentConflicts: true,
        };
      const res = await request(
        `/management/mentor-leave-requests/${pending.id}/approve`,
        manager,
        approval,
        'POST',
        key,
      );
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
      const result = await json<LeaveApprovalDto>(res);
      expect(result.request.status).toBe('APPROVED');
      expect(result.replacements).toHaveLength(1);
      expect((await source()).version).toBe((input.sourceVersions[0]?.version ?? 0) + 1);
      const replay = await request(
        `/management/mentor-leave-requests/${pending.id}/approve`,
        manager,
        approval,
        'POST',
        key,
      );
      expect(await replay.json()).toEqual(result);
      const list = await request('/management/mentor-leave-requests?status=APPROVED', manager);
      expect((await json<LeaveRequestPageDto>(list)).total).toBe(1);
      const schedule = await request(
        `/mentor/schedule?from=${encodeURIComponent(`${input.fromDate}T00:00:00+07:00`)}&to=${encodeURIComponent(`${input.dayMappings[0]?.targetDate}T23:59:59+07:00`)}`,
        mentor,
      );
      expect(schedule.status).toBe(200);
      const sessions = (await json<MentorTeachingScheduleDto>(schedule)).items;
      expect(
        sessions.some(
          (s: { sessionId: string }) => s.sessionId === result.replacements[0]?.sessionId,
        ),
      ).toBe(true);
      expect((await request('/me/cart/items', student, { classId })).status).toBe(201);
      expect((await request('/me/cart/checkout', student, { paymentType: 'CASH' })).status).toBe(
        201,
      );
      const replacement = result.replacements[0];
      if (!replacement) throw new Error('Missing replacement');
      const range = `from=${encodeURIComponent(String(replacement.startsAt))}&to=${encodeURIComponent(String(replacement.endsAt))}`;
      expect(await (await request(`/me/schedule?${range}`, student)).json()).toMatchObject({
        total: 1,
        items: [
          {
            sessionId: replacement.sessionId,
            accessMode: 'CASH_PREVIEW',
            attendanceApplicability: 'PAYMENT_PENDING',
          },
        ],
      });
      const fail = await request(
        `/management/mentor-leave-requests/${pending.id}/approve`,
        manager,
        approval,
        'POST',
        randomUUID(),
      );
      expect(fail.status).toBe(409);
    });
  },
);
