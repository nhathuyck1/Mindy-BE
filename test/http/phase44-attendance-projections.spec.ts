import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase44c_http'))('Phase 4.4c built-app HTTP', () => {
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
    const dbUrl = separateTestUrl('phase44c_http'),
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

  it('enforces cookies, roles, ownership, query bounds and the static incomplete route', async () => {
    const own = `/me/classes/${randomUUID()}/attendance`,
      staff = '/management/class-sessions/incomplete';
    expect((await request(own)).status).toBe(401);
    expect((await request(own, mentor)).status).toBe(403);
    expect((await request(own, student)).status).toBe(404);
    expect((await request(`/me/classes/not-a-uuid/attendance`, student)).status).toBe(400);
    expect((await request(staff, student)).status).toBe(403);
    expect((await request(staff, mentor)).status).toBe(403);
    expect((await request(staff, manager)).status).toBe(200);
    const base = `/management/classes/${classId}/attendance-summary`;
    for (const query of [
      'pageSize=101',
      'page=0',
      'from=2026-10-16T00:00:00Z',
      'from=2026-10-16T00:00:00&to=2026-10-17T00:00:00',
      'from=2026-10-17T00:00:00Z&to=2026-10-16T00:00:00Z',
      'from=2026-01-01T00:00:00Z&to=2026-10-16T00:00:00Z',
      `studentId=${randomUUID()}`,
    ])
      expect((await request(`${base}?${query}`, manager)).status, query).toBe(422);
    expect((await request(`${staff}?issue=UNKNOWN`, admin)).status).toBe(422);
    expect((await request(`${staff}?classId=bad`, admin)).status).toBe(422);
    expect((await request(`${staff}?classId=${randomUUID()}`, admin)).status).toBe(200);
    expect(
      (await request(`/me/classes/${classId}/attendance-summary?page=1`, student)).status,
    ).toBe(422);
  });

  it('runs real CASH preview, finalized credit, history/management parity and terminal metadata over HTTP', async () => {
    expect((await request('/me/cart/items', student, { classId })).status).toBe(201);
    const res = await request('/me/cart/checkout', student, { paymentType: 'CASH' });
    expect(res.status).toBe(201);
    const order = ((await res.json()) as { orders: { id: string; totalAmount: number }[] })
      .orders[0];
    if (!order) throw new Error('Missing CASH order');
    const initial = await source();
    const range = `from=${encodeURIComponent(initial.starts_at.toISOString())}&to=${encodeURIComponent(initial.ends_at.toISOString())}`;
    expect(await (await request(`/me/schedule?${range}`, student)).json()).toMatchObject({
      total: 1,
      items: [
        {
          accessMode: 'CASH_PREVIEW',
          attendanceStatus: null,
          attendanceApplicability: 'PAYMENT_PENDING',
          creditedAttendanceStatus: null,
        },
      ],
    });
    expect(
      (
        await request(`/mentor/cash-orders/${order.id}/confirm`, mentor, {
          receivedAmount: order.totalAmount,
        })
      ).status,
    ).toBe(200);
    // Bring the fixture to today's calendar; all API clocks, role checks and writes remain real.
    await db.query(
      "UPDATE class_sessions SET starts_at=date_trunc('day',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'+interval '8 hours',ends_at=date_trunc('day',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'+interval '9 hours' WHERE id=$1",
      [sourceId],
    );
    const prefix = `/class-sessions/${sourceId}`;
    const opened = await request(
      `${prefix}/start`,
      mentor,
      { expectedVersion: initial.version },
      'POST',
      randomUUID(),
    );
    expect(opened.status).toBe(200);
    const roster = (await (await request(`${prefix}/attendance`, mentor)).json()) as {
      items: { enrollmentId: string }[];
      session: { version: number };
    };
    const enrollmentId = roster.items[0]?.enrollmentId;
    if (!enrollmentId) throw new Error('Missing roster');
    expect(
      (
        await request(
          `${prefix}/attendance`,
          mentor,
          {
            expectedVersion: roster.session.version,
            records: [{ enrollmentId, status: 'PRESENT' }],
          },
          'PUT',
          randomUUID(),
        )
      ).status,
    ).toBe(200);
    expect(
      await (await request(`/me/classes/${classId}/attendance-summary`, student)).json(),
    ).toMatchObject({ present: 0, finalizedEligibleCount: 0, rate: null });
    const finalized = await request(
      `${prefix}/finalize`,
      mentor,
      { expectedVersion: (await source()).version },
      'POST',
      randomUUID(),
    );
    expect(finalized.status).toBe(200);
    const response = await request(`/me/classes/${classId}/attendance-summary`, student);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const own = await response.json();
    expect(own).toMatchObject({ present: 1, absent: 0, finalizedEligibleCount: 1, rate: 100 });
    const management = await request(`/management/classes/${classId}/attendance-summary`, manager);
    expect(management.headers.get('cache-control')).toBe('private, no-store');
    expect(await management.json()).toMatchObject({
      total: 1,
      items: [{ enrollmentId, present: 1, rate: 100 }],
    });
    const history = await request(`/me/classes/${classId}/attendance?pageSize=1`, student);
    expect(history.headers.get('cache-control')).toBe('private, no-store');
    const records = (await history.json()) as { items: Record<string, unknown>[] };
    expect(records.items[0]).toMatchObject({
      sessionId: sourceId,
      attendanceStatus: 'PRESENT',
      creditedAttendanceStatus: 'PRESENT',
      excluded: false,
    });
    for (const forbidden of [
      'meetingUrl',
      'materials',
      'studentId',
      'email',
      'evidenceNote',
      'paymentId',
    ])
      expect(records.items[0]).not.toHaveProperty(forbidden);
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [enrollmentId]);
    expect((await request(`/me/classes/${classId}/attendance`, student)).status).toBe(200);
    expect(
      await (await request(`/me/classes/${classId}/attendance-summary`, student)).json(),
    ).toMatchObject({ present: 1 });
    const s = await source(),
      currentRange = `from=${encodeURIComponent(s.starts_at.toISOString())}&to=${encodeURIComponent(s.ends_at.toISOString())}`;
    expect(await (await request(`/me/schedule?${currentRange}`, student)).json()).toMatchObject({
      total: 0,
    });
  });

  it('publishes safe Swagger nullable fields and all four new read routes', async () => {
    const res = await fetch(`${url.replace('/api/v1', '')}/docs-json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      paths: Record<string, unknown>;
      components: {
        schemas: Record<
          string,
          { properties: Record<string, { nullable?: boolean; enum?: string[] }> }
        >;
      };
    };
    for (const path of [
      '/api/v1/me/classes/{classId}/attendance',
      '/api/v1/me/classes/{classId}/attendance-summary',
      '/api/v1/management/classes/{classId}/attendance-summary',
      '/api/v1/management/class-sessions/incomplete',
    ])
      expect(doc.paths).toHaveProperty(path);
    expect(doc.components.schemas.ScheduleEventDto?.properties.mentor?.nullable).toBe(true);
    expect(doc.components.schemas.ScheduleEventDto?.properties.accessMode?.enum).toContain(
      'SESSION_MAKEUP',
    );
    expect(doc.components.schemas.AttendanceSummaryDto?.properties.rate?.nullable).toBe(true);
    expect(doc.components.schemas.IncompleteSessionDto?.properties.deadlineExpired?.nullable).toBe(
      true,
    );
  });
});
