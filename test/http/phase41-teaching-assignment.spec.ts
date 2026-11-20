import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase41_http'))('Phase 4.1 built-app HTTP E2E', () => {
  let server: ChildProcess;
  let db: DataSource;
  let url: string;
  let classId: string;
  let studentCookie: string;
  let adminCookie: string;
  let mentorCookie: string;
  beforeAll(async () => {
    const dbUrl = separateTestUrl('phase41_http');
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
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
    const login = async (email: string) => {
      const res = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'Http-test-password1!' }),
      });
      expect(res.status, output).toBe(200);
      return res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
    };
    studentCookie = await login('student@http.test');
    adminCookie = await login('admin@http.test');
    mentorCookie = await login('mentor@http.test');
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (server && server.exitCode === null) {
      await new Promise<void>((resolve) => {
        server.once('exit', () => resolve());
        server.send('close');
        const timer = setTimeout(() => {
          server.kill();
          resolve();
        }, 5000);
        timer.unref();
      });
    }
  });
  async function request(
    path: string,
    cookie?: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    key?: string,
  ) {
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

  it('enforces staff roles, validates paginated reads and limits substitute access to the assigned session', async () => {
    expect((await request('/management/classes')).status).toBe(401);
    for (const cookie of [studentCookie, mentorCookie])
      expect((await request('/management/classes', cookie)).status).toBe(403);
    expect((await request('/management/classes?pageSize=101', adminCookie)).status).toBe(422);
    expect((await request(`/management/classes/${classId}?pageSize=101`, adminCookie)).status).toBe(
      422,
    );
    const created = await request('/admin/users', adminCookie, {
      email: 'staff@phase41.test',
      displayName: 'Teaching manager',
      password: '123456',
      role: 'MANAGER',
    });
    expect(created.status).toBe(201);
    const login = await request('/auth/login', undefined, {
      email: 'staff@phase41.test',
      password: '123456',
    });
    const managerCookie = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const detailResponse = await request(`/management/classes/${classId}`, managerCookie);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.headers.get('cache-control')).toBe('private, no-store');
    const detail = (await detailResponse.json()) as {
      sessions: {
        items: { sessionId: string; version: number; startsAt: string; endsAt: string }[];
      };
    };
    const session = detail.sessions.items[0];
    if (!session) throw new Error('Missing HTTP session');
    const substituteResponse = await request('/admin/users', adminCookie, {
      email: 'cover@phase41.test',
      displayName: 'Cover',
      password: '123456',
      role: 'MENTOR',
    });
    const substitute = (await substituteResponse.json()) as { id: string };
    const candidates = await request(
      `/management/class-sessions/${session.sessionId}/available-mentors`,
      managerCookie,
    );
    expect(candidates.status).toBe(200);
    expect(
      ((await candidates.json()) as { items: { id: string }[] }).items.map((c) => c.id),
    ).toContain(substitute.id);
    const body = {
      mentorId: substitute.id,
      expectedVersion: session.version,
      reason: 'Cover teacher',
    };
    const path = `/management/class-sessions/${session.sessionId}/mentor`;
    expect((await request(path, managerCookie, body, 'PATCH')).status).toBe(422);
    expect((await request(path, managerCookie, { ...body, reason: '   ' }, 'PATCH')).status).toBe(
      422,
    );
    const mutation = async (payload: unknown, key: string) =>
      fetch(url + path, {
        method: 'PATCH',
        headers: {
          cookie: managerCookie,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(payload),
      });
    const key = randomUUID();
    const first = await mutation(body, key);
    expect(first.status).toBe(200);
    const outcome = await first.json();
    const replay = await mutation(body, key);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(outcome);
    expect((await mutation({ ...body, mentorId: null }, key)).status).toBe(409);
    expect((await mutation(body, randomUUID())).status).toBe(409);
    expect(
      (await request(`/class-sessions/${session.sessionId}/context`, mentorCookie)).status,
    ).toBe(403);
    expect(
      (await request(`/class-sessions/${session.sessionId}/context`, studentCookie)).status,
    ).toBe(403);
    const coverLogin = await request('/auth/login', undefined, {
      email: 'cover@phase41.test',
      password: '123456',
    });
    const coverCookie = coverLogin.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const context = await request(`/class-sessions/${session.sessionId}/context`, coverCookie);
    expect(context.status).toBe(200);
    expect(await context.json()).toMatchObject({
      accessScope: 'SESSION',
      session: { assignmentType: 'SUBSTITUTE' },
    });
    expect((await request('/mentor/classes', coverCookie)).status).toBe(200);
    const range = `?from=${encodeURIComponent(session.startsAt)}&to=${encodeURIComponent(session.endsAt)}`;
    expect((await request(`/mentor/schedule${range}`, coverCookie)).status).toBe(200);
    expect((await request('/mentor/schedule?from=2026-10-13T00:00:00Z', coverCookie)).status).toBe(
      422,
    );
    expect((await request('/admin/classes', managerCookie)).status).toBe(403);
    expect(
      (
        await request(
          `/admin/classes/${classId}`,
          adminCookie,
          { mentorId: substitute.id },
          'PATCH',
        )
      ).status,
    ).toBe(422);
  });

  it('uses the audited Admin class PATCH and preserves substitutes while checking class candidates', async () => {
    const mentors: string[] = [];
    for (let n = 0; n < 3; n++) {
      const created = await request('/admin/users', adminCookie, {
        email: `${randomUUID()}@phase41.test`,
        displayName: `Teacher ${n}`,
        password: 'Http-test-password1!',
        role: 'MENTOR',
      });
      expect(created.status).toBe(201);
      mentors.push(((await created.json()) as { id: string }).id);
    }
    const [primary, substitute, next] = mentors;
    if (!primary || !substitute || !next) throw new Error('Missing teachers');
    const courses: { course_id: string }[] = await db.query(
      'SELECT course_id FROM classes WHERE id=$1',
      [classId],
    );
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const created = await request('/admin/classes', adminCookie, {
      courseId: courses[0]?.course_id,
      mentorId: primary,
      code: randomUUID(),
      name: 'Audited HTTP class',
      startDate: day,
      endDate: day,
      maxStudents: 10,
      deliveryMode: 'ONLINE',
      meetingUrl: 'https://meet.example.test/audit',
    });
    expect(created.status).toBe(201);
    const detail = (await created.json()) as { id: string; units: { id: string }[] };
    for (const hour of ['08', '10']) {
      expect(
        (
          await request(`/admin/classes/${detail.id}/sessions`, adminCookie, {
            classUnitId: detail.units[0]?.id,
            title: `Session ${hour}`,
            startsAt: `${day}T${hour}:00:00+07:00`,
            endsAt: `${day}T${String(Number(hour) + 1).padStart(2, '0')}:00:00+07:00`,
          })
        ).status,
      ).toBe(201);
    }
    expect(
      (await request(`/admin/classes/${detail.id}/open`, adminCookie, undefined, 'POST')).status,
    ).toBe(200);
    const teaching = (await (
      await request(`/management/classes/${detail.id}`, adminCookie)
    ).json()) as {
      class: { assignmentVersion: number };
      sessions: { items: { sessionId: string; version: number }[] };
    };
    const session = teaching.sessions.items[0];
    if (!session) throw new Error('Missing session');
    expect(
      (
        await request(
          `/management/class-sessions/${session.sessionId}/mentor`,
          adminCookie,
          { mentorId: substitute, reason: 'Cover first session', expectedVersion: session.version },
          'PATCH',
          randomUUID(),
        )
      ).status,
    ).toBe(200);
    const candidates = await request(
      `/management/classes/${detail.id}/available-mentors`,
      adminCookie,
    );
    expect(candidates.status).toBe(200);
    expect(await candidates.json()).toMatchObject({
      classId: detail.id,
      affectedSessionCount: 1,
      items: expect.arrayContaining([expect.objectContaining({ id: next })]),
    });
    const path = `/admin/classes/${detail.id}`;
    const body = {
      mentorId: next,
      reason: ' Change primary ',
      expectedVersion: teaching.class.assignmentVersion,
    };
    const key = randomUUID();
    expect(
      (await request(path, adminCookie, { ...body, name: 'Mixed request' }, 'PATCH', key)).status,
    ).toBe(422);
    const updated = await request(path, adminCookie, body, 'PATCH', key);
    expect(updated.status).toBe(200);
    const outcome = await updated.json();
    expect(outcome).toMatchObject({
      assignmentVersion: body.expectedVersion + 1,
      mentor: { id: next },
    });
    expect(await (await request(path, adminCookie, body, 'PATCH', key)).json()).toEqual(outcome);
    expect((await request(path, adminCookie, body, 'PATCH', randomUUID())).status).toBe(409);
    expect(
      (await request(path, adminCookie, { ...body, reason: 'Different payload' }, 'PATCH', key))
        .status,
    ).toBe(409);
    const after = (await (
      await request(`/management/classes/${detail.id}`, adminCookie)
    ).json()) as {
      sessions: { items: { sessionId: string; effectiveMentor: { id: string } }[] };
    };
    expect(
      after.sessions.items.find((s) => s.sessionId === session.sessionId)?.effectiveMentor.id,
    ).toBe(substitute);
    expect(
      after.sessions.items.find((s) => s.sessionId !== session.sessionId)?.effectiveMentor.id,
    ).toBe(next);
    const audits: { reason: string }[] = await db.query(
      'SELECT reason FROM teaching_assignment_audits WHERE class_id=$1 AND session_id IS NULL',
      [detail.id],
    );
    expect(audits).toEqual([{ reason: 'Change primary' }]);
  });

  it('publishes the teaching contracts and cookie security in OpenAPI', async () => {
    const res = await fetch(url.replace('/api/v1', '/docs-json'));
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec).toMatchObject({
      paths: {
        '/api/v1/management/class-sessions/{sessionId}/mentor': {
          patch: {
            parameters: expect.arrayContaining([
              expect.objectContaining({ name: 'Idempotency-Key', required: true }),
            ]),
          },
        },
        '/api/v1/mentor/schedule': { get: { security: [{ access_token: [] }] } },
      },
      components: {
        schemas: { TeachingSessionDto: { properties: { effectiveMentor: { nullable: true } } } },
      },
    });
  });
});
