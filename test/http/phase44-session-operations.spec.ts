import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase44a_http'))('Phase 4.4a built-app HTTP', () => {
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
    const dbUrl = separateTestUrl('phase44a_http'),
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

  it('enforces staff roles, strict DTOs, UUID/key validation, safe schemas and no-store responses', async () => {
    const body = { expectedVersion: (await source()).version, reason: 'Cancel' };
    expect(
      (await request(`/management/class-sessions/${sourceId}/cancel`, undefined, body)).status,
    ).toBe(401);
    for (const cookie of [mentor, student])
      expect(
        (
          await request(
            `/management/class-sessions/${sourceId}/cancel`,
            cookie,
            body,
            'POST',
            randomUUID(),
          )
        ).status,
      ).toBe(403);
    for (const invalid of [
      { ...body, reason: ' ' },
      { ...body, expectedVersion: '1' },
      { ...body, reason: null },
      { ...body, unknown: true },
    ])
      expect(
        (
          await request(
            `/management/class-sessions/${sourceId}/cancel`,
            manager,
            invalid,
            'POST',
            randomUUID(),
          )
        ).status,
      ).toBe(422);
    expect(
      (await request(`/management/class-sessions/${sourceId}/cancel`, manager, body)).status,
    ).toBe(422);
    expect(
      (
        await request(
          `/management/class-sessions/${sourceId}/cancel`,
          manager,
          body,
          'POST',
          'invalid',
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          '/management/class-sessions/not-a-uuid/cancel',
          manager,
          body,
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/management/class-sessions/${randomUUID()}/cancel`,
          manager,
          body,
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(404);
    const s = await source();
    for (const invalid of [
      { ...body, startsAt: '2026-11-02T10:00:00', endsAt: s.ends_at.toISOString() },
      { ...body, startsAt: s.starts_at.toISOString(), endsAt: null },
    ])
      expect(
        (
          await request(
            `/management/class-sessions/${sourceId}/schedule`,
            manager,
            invalid,
            'PATCH',
            randomUUID(),
          )
        ).status,
      ).toBe(422);
    const swagger = (await (await fetch(`${url.replace('/api/v1', '')}/docs-json`)).json()) as {
      paths: Record<string, Record<string, { parameters: unknown[] }>>;
      components: {
        schemas: {
          TeachingSessionDto: { properties: { makeupRootSessionId: { nullable: boolean } } };
        };
      };
    };
    for (const [path, method] of [
      ['schedule', 'patch'],
      ['cancel', 'post'],
      ['makeups', 'post'],
    ] as const) {
      const op = swagger.paths[`/api/v1/management/class-sessions/{sessionId}/${path}`]?.[method];
      expect(op?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Idempotency-Key', required: true }),
        ]),
      );
    }
    expect(
      swagger.components.schemas.TeachingSessionDto.properties.makeupRootSessionId,
    ).toMatchObject({ nullable: true });
  });

  it('reschedules, cancels, creates and replays a replacement through real guards; manager retains scoped permissions', async () => {
    const s = await source(),
      body = {
        expectedVersion: s.version,
        reason: 'Move lesson',
        startsAt: new Date(s.starts_at.getTime() + 7200000).toISOString(),
        endsAt: new Date(s.ends_at.getTime() + 7200000).toISOString(),
      },
      key = randomUUID();
    const moved = await request(
      `/management/class-sessions/${s.id}/schedule`,
      manager,
      body,
      'PATCH',
      key,
    );
    expect(moved.status).toBe(200);
    expect(moved.headers.get('cache-control')).toBe('private, no-store');
    const view = (await moved.json()) as { version: number };
    expect(view).toMatchObject({
      sessionId: s.id,
      version: s.version + 1,
      makeupForSessionId: null,
    });
    expect(
      await (
        await request(`/management/class-sessions/${s.id}/schedule`, manager, body, 'PATCH', key)
      ).json(),
    ).toEqual(view);
    const reused = await request(
      `/management/class-sessions/${s.id}/schedule`,
      manager,
      { ...body, reason: 'Other' },
      'PATCH',
      key,
    );
    expect(reused.status).toBe(409);
    expect(((await reused.json()) as { code: string }).code).toBe('IDEMPOTENCY_KEY_REUSED');
    const cancelled = await request(
      `/management/class-sessions/${s.id}/cancel`,
      admin,
      { expectedVersion: view.version, reason: 'Cannot hold lesson' },
      'POST',
      randomUUID(),
    );
    expect(cancelled.status).toBe(200);
    const cancelledView = (await cancelled.json()) as { version: number };
    const input = {
      classUnitId: s.class_unit_id.toUpperCase(),
      title: 'Makeup lesson',
      reason: 'Replace cancelled lesson',
      expectedVersion: cancelledView.version,
      startsAt: new Date(new Date(body.startsAt).getTime() + 86400000).toISOString(),
      endsAt: new Date(new Date(body.endsAt).getTime() + 86400000).toISOString(),
    };
    const makeupKey = randomUUID(),
      made = await request(
        `/management/class-sessions/${s.id}/makeups`,
        manager,
        input,
        'POST',
        makeupKey,
      );
    expect(made.status).toBe(201);
    const outcome = await made.json();
    expect(outcome).toMatchObject({
      originalSessionId: s.id,
      session: {
        status: 'SCHEDULED',
        makeupForSessionId: s.id,
        makeupRootSessionId: s.id,
        actualStartedAt: null,
        editableUntil: null,
      },
    });
    expect(
      await (
        await request(
          `/management/class-sessions/${s.id}/makeups`,
          manager,
          input,
          'POST',
          makeupKey,
        )
      ).json(),
    ).toEqual(outcome);
    expect((await request(`/admin/classes/${classId}/cancel`, manager, {})).status).toBe(403);
    await db.query("UPDATE users SET status='SUSPENDED' WHERE email='other@http.test'");
    expect(
      (
        await request(
          `/management/class-sessions/${s.id}/makeups`,
          manager,
          input,
          'POST',
          makeupKey,
        )
      ).status,
    ).toBe(401);
  });

  it('cancels open class sessions atomically through the existing admin route with authenticated actor audits', async () => {
    const res = await request(`/admin/classes/${classId}/cancel`, admin, {});
    expect(res.status).toBe(200);
    const rows = await db.query(
      'SELECT status FROM class_sessions WHERE class_unit_id IN (SELECT id FROM class_units WHERE class_id=$1)',
      [classId],
    );
    expect(rows.every((row: { status: string }) => row.status === 'CANCELLED')).toBe(true);
    const audits = await db.query(
      "SELECT a.actor_id FROM session_schedule_audits a JOIN users u ON u.id=a.actor_id WHERE a.class_id=$1 AND a.action='CLASS_CANCEL' AND u.email='admin@http.test'",
      [classId],
    );
    expect(audits).toHaveLength(1);
  });
});
