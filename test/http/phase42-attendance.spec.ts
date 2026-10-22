import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase42_http'))('Phase 4.2 built-app HTTP E2E', () => {
  let server: ChildProcess;
  let db: DataSource;
  let url: string;
  let classId: string;
  let studentCookie: string;
  let adminCookie: string;
  let managerCookie: string;
  let mentorCookie: string;
  beforeAll(async () => {
    const dbUrl = separateTestUrl('phase42_http');
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
    managerCookie = await login('manager@http.test');
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

  async function staffFixture() {
    const accounts: { id: string; cookie: string }[] = [];
    for (const role of ['MENTOR', 'STUDENT', 'MANAGER']) {
      const email = `${randomUUID()}@phase42.test`;
      const created = await request('/admin/users', adminCookie, {
        email,
        displayName: role,
        password: 'Http-test-password1!',
        role,
      });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      const login = await request('/auth/login', undefined, {
        email,
        password: 'Http-test-password1!',
      });
      expect(login.status).toBe(200);
      accounts.push({
        id,
        cookie: login.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; '),
      });
    }
    const [mentor, student, manager] = accounts;
    if (!mentor || !student || !manager) throw new Error('Missing staff fixture accounts');
    const courses: { course_id: string }[] = await db.query(
      'SELECT course_id FROM classes WHERE id=$1',
      [classId],
    );
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const created = await request('/admin/classes', adminCookie, {
      courseId: courses[0]?.course_id,
      mentorId: mentor.id,
      code: randomUUID(),
      name: 'Staff recovery',
      startDate: day,
      endDate: day,
      maxStudents: 10,
      deliveryMode: 'ONLINE',
      meetingUrl: 'https://meet.example.test/staff',
    });
    expect(created.status).toBe(201);
    const detail = (await created.json()) as { id: string; units: { id: string }[] };
    expect(
      (
        await request(`/admin/classes/${detail.id}/sessions`, adminCookie, {
          classUnitId: detail.units[0]?.id,
          title: 'Scheduled session',
          startsAt: `${day}T12:00:00+07:00`,
          endsAt: `${day}T13:00:00+07:00`,
        })
      ).status,
    ).toBe(201);
    expect(
      (await request(`/admin/classes/${detail.id}/open`, adminCookie, undefined, 'POST')).status,
    ).toBe(200);
    expect((await request('/me/cart/items', student.cookie, { classId: detail.id })).status).toBe(
      201,
    );
    const checkout = await request('/me/cart/checkout', student.cookie, { paymentType: 'CASH' });
    expect(checkout.status).toBe(201);
    const orders = (await checkout.json()) as { orders: { id: string; totalAmount: number }[] };
    const order = orders.orders[0];
    const sessions: { id: string; version: number }[] = await db.query(
      'SELECT id,version FROM class_sessions WHERE class_id=$1',
      [detail.id],
    );
    const session = sessions[0];
    if (!order || !session) throw new Error('Missing staff fixture order/session');
    return { mentor, student, manager, order, session, day, path: `/class-sessions/${session.id}` };
  }

  it('validates/authenticates attendance and runs start, mark, finalize and replay over real cookies', async () => {
    const sessions: { id: string; version: number }[] = await db.query(
      'SELECT s.id,s.version FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id WHERE u.class_id=$1',
      [classId],
    );
    const s = sessions[0];
    if (!s) throw new Error('Missing session');
    const path = `/class-sessions/${s.id}`;
    expect((await request(`${path}/attendance`)).status).toBe(401);
    expect((await request(`${path}/attendance`, studentCookie)).status).toBe(403);
    expect((await request(`${path}/attendance`, mentorCookie)).status).toBe(200);
    expect((await request(`${path}/attendance?pageSize=101`, mentorCookie)).status).toBe(422);
    expect((await request('/class-sessions/not-a-uuid/attendance', mentorCookie)).status).toBe(400);
    expect(
      (await request(`${path}/start`, mentorCookie, { expectedVersion: s.version })).status,
    ).toBe(422);
    expect(
      (await request(`${path}/start`, mentorCookie, { expectedVersion: 0 }, 'POST', randomUUID()))
        .status,
    ).toBe(422);
    expect(
      (
        await request(
          `${path}/start`,
          mentorCookie,
          { expectedVersion: s.version },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(409);
    expect((await request('/me/cart/items', studentCookie, { classId })).status).toBe(201);
    const checkout = await request('/me/cart/checkout', studentCookie, { paymentType: 'CASH' });
    expect(checkout.status).toBe(201);
    const orders = (await checkout.json()) as { orders: { id: string; totalAmount: number }[] };
    const order = orders.orders[0];
    if (!order) throw new Error('Missing cash order');
    const confirmed = await request(`/manager/cash-orders/${order.id}/confirm`, managerCookie, {
      receivedAmount: order.totalAmount,
    });
    expect(confirmed.status).toBe(200);
    await db.query(
      `UPDATE class_sessions SET
        starts_at=date_trunc('day',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh',
        ends_at=(date_trunc('day',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '1 day'-interval '1 millisecond') AT TIME ZONE 'Asia/Ho_Chi_Minh'
        WHERE id=$1`,
      [s.id],
    );
    const key = randomUUID(),
      input = { expectedVersion: s.version };
    const opened = await request(`${path}/start`, mentorCookie, input, 'POST', key);
    expect(opened.status).toBe(200);
    const start = (await opened.json()) as {
      session: { version: number; editableUntil: string };
      totals: { unmarked: number };
    };
    expect(start.totals.unmarked).toBe(1);
    expect(await (await request(`${path}/start`, mentorCookie, input, 'POST', key)).json()).toEqual(
      start,
    );
    const rosterResponse = await request(`${path}/attendance?pageSize=1`, mentorCookie);
    expect(rosterResponse.headers.get('cache-control')).toBe('private, no-store');
    const roster = (await rosterResponse.json()) as {
      items: { enrollmentId: string }[];
      total: number;
      session: { permissions: { canEditAttendance: boolean } };
    };
    expect(roster).toMatchObject({
      total: 1,
      session: { permissions: { canEditAttendance: true } },
    });
    const enrollmentId = roster.items[0]?.enrollmentId;
    if (!enrollmentId) throw new Error('Missing row');
    const invalid = await request(
      `${path}/attendance`,
      mentorCookie,
      { expectedVersion: start.session.version, records: [{ enrollmentId, status: 'LATE' }] },
      'PUT',
      randomUUID(),
    );
    expect(invalid.status).toBe(422);
    const marked = await request(
      `${path}/attendance`,
      mentorCookie,
      { expectedVersion: start.session.version, records: [{ enrollmentId, status: 'PRESENT' }] },
      'PUT',
      randomUUID(),
    );
    expect(marked.status).toBe(200);
    const mark = (await marked.json()) as { session: { version: number } };
    const stale = await request(
      `${path}/finalize`,
      mentorCookie,
      { expectedVersion: start.session.version },
      'POST',
      randomUUID(),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'SESSION_VERSION_CONFLICT' });
    const endKey = randomUUID(),
      endInput = { expectedVersion: mark.session.version };
    const finalized = await request(`${path}/finalize`, mentorCookie, endInput, 'POST', endKey);
    expect(finalized.status).toBe(200);
    const end = await finalized.json();
    expect(end).toMatchObject({
      session: { status: 'COMPLETED' },
      totals: { present: 1, absent: 0, unmarked: 0 },
    });
    expect(
      await (await request(`${path}/finalize`, mentorCookie, endInput, 'POST', endKey)).json(),
    ).toEqual(end);
    expect(
      (
        await request(
          `${path}/attendance/sync-roster`,
          adminCookie,
          { expectedVersion: mark.session.version + 1 },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const spec = await (await fetch(`${url.replace('/api/v1', '')}/docs-json`)).json();
    expect(spec).toMatchObject({
      paths: {
        '/api/v1/class-sessions/{sessionId}/start': {
          post: {
            parameters: expect.arrayContaining([
              expect.objectContaining({ name: 'Idempotency-Key', required: true }),
            ]),
          },
        },
        '/api/v1/class-sessions/{sessionId}/attendance': { get: {}, put: {} },
      },
    });
  });
  it('validates Staff recovery timestamps and nested batches, then syncs paid cash and finalizes over HTTP', async () => {
    const a = await staffFixture();
    const base = { expectedVersion: a.session.version };
    for (const extra of [
      { actualStartedAt: null, reason: 'Recovery' },
      { actualStartedAt: '2026-10-13T12:00:00', reason: 'Recovery' },
      { actualStartedAt: new Date().toISOString(), reason: '   ' },
      { actualStartedAt: new Date().toISOString(), reason: 'Recovery', startedBy: a.manager.id },
    ])
      expect(
        (
          await request(
            `${a.path}/start`,
            a.manager.cookie,
            { ...base, ...extra },
            'POST',
            randomUUID(),
          )
        ).status,
      ).toBe(422);
    expect(
      (
        await request(
          `${a.path}/start`,
          a.mentor.cookie,
          { ...base, actualStartedAt: new Date().toISOString() },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `${a.path}/start`,
          a.manager.cookie,
          {
            ...base,
            reason: 'Recovery',
            actualStartedAt: new Date(Date.now() + 60000).toISOString(),
          },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    expect(
      (await request(`${a.path}/start`, a.mentor.cookie, base, 'POST', randomUUID())).status,
    ).toBe(409);
    const opened = await request(
      `${a.path}/start`,
      a.manager.cookie,
      { ...base, reason: ' Verified opening ', actualStartedAt: new Date().toISOString() },
      'POST',
      randomUUID(),
    );
    expect(opened.status).toBe(200);
    const opening = (await opened.json()) as {
      session: { version: number; actualStartedAt: string; editableUntil: string };
      totals: { eligible: number };
    };
    const day = new Date(`${a.day}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 2);
    expect(opening.session.editableUntil).toBe(
      new Date(`${day.toISOString().slice(0, 10)}T00:00:00+07:00`).toISOString(),
    );
    expect(opening.totals.eligible).toBe(0);
    expect(
      (
        await request(`/manager/cash-orders/${a.order.id}/confirm`, managerCookie, {
          receivedAmount: a.order.totalAmount,
        })
      ).status,
    ).toBe(200);
    const synced = await request(
      `${a.path}/attendance/sync-roster`,
      a.manager.cookie,
      { expectedVersion: opening.session.version, reason: 'Paid hold verified' },
      'POST',
      randomUUID(),
    );
    expect(synced.status).toBe(200);
    const sync = (await synced.json()) as {
      session: { version: number };
      totals: { eligible: number };
      changedEnrollmentIds: string[];
    };
    expect(sync.totals.eligible).toBe(1);
    const enrollmentId = sync.changedEnrollmentIds[0];
    if (!enrollmentId) throw new Error('Missing synced enrollment');
    for (const records of [
      [{ enrollmentId, status: 'PRESENT', recordedBy: a.manager.id }],
      [
        { enrollmentId, status: 'PRESENT' },
        { enrollmentId, status: 'ABSENT' },
      ],
      [{ enrollmentId, status: 'LATE' }],
    ])
      expect(
        (
          await request(
            `${a.path}/attendance`,
            a.manager.cookie,
            { expectedVersion: sync.session.version, reason: 'Verify marks', records },
            'PUT',
            randomUUID(),
          )
        ).status,
      ).toBe(422);
    const marked = await request(
      `${a.path}/attendance`,
      a.manager.cookie,
      {
        expectedVersion: sync.session.version,
        reason: 'Verified presence',
        records: [{ enrollmentId, status: 'PRESENT' }],
      },
      'PUT',
      randomUUID(),
    );
    expect(marked.status).toBe(200);
    const mark = (await marked.json()) as { session: { version: number } };
    expect(
      (
        await request(
          `${a.path}/finalize`,
          a.manager.cookie,
          {
            expectedVersion: mark.session.version,
            reason: 'Invalid end',
            actualEndedAt: opening.session.actualStartedAt,
          },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `${a.path}/finalize`,
          a.mentor.cookie,
          { expectedVersion: mark.session.version, actualEndedAt: new Date().toISOString() },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const finalized = await request(
      `${a.path}/finalize`,
      a.manager.cookie,
      {
        expectedVersion: mark.session.version,
        reason: 'Verified completion',
        actualEndedAt: new Date().toISOString(),
      },
      'POST',
      randomUUID(),
    );
    expect(finalized.status).toBe(200);
    expect(await finalized.json()).toMatchObject({
      session: { status: 'COMPLETED', editableUntil: opening.session.editableUntil },
      totals: { present: 1, absent: 0 },
    });
    expect((await request(`${a.path}/attendance`, a.student.cookie)).status).toBe(403);
  });

  it('admits committed cash after finalization only for Staff with a reason and replays the admission once', async () => {
    const a = await staffFixture();
    const opened = await request(
      `${a.path}/start`,
      a.manager.cookie,
      {
        expectedVersion: a.session.version,
        reason: 'Verified start',
        actualStartedAt: new Date().toISOString(),
      },
      'POST',
      randomUUID(),
    );
    expect(opened.status).toBe(200);
    const start = (await opened.json()) as { session: { version: number } };
    const finalized = await request(
      `${a.path}/finalize`,
      a.manager.cookie,
      { expectedVersion: start.session.version, reason: 'Verified close' },
      'POST',
      randomUUID(),
    );
    expect(finalized.status).toBe(200);
    const close = (await finalized.json()) as {
      session: { version: number };
      totals: { eligible: number };
    };
    expect(close.totals.eligible).toBe(0);
    expect(
      (
        await request(`/manager/cash-orders/${a.order.id}/confirm`, managerCookie, {
          receivedAmount: a.order.totalAmount,
        })
      ).status,
    ).toBe(200);
    const body = { expectedVersion: close.session.version, reason: 'Paid hold after close' },
      key = randomUUID();
    expect(
      (
        await request(
          `${a.path}/attendance/sync-roster`,
          a.mentor.cookie,
          body,
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `${a.path}/attendance/sync-roster`,
          a.manager.cookie,
          { expectedVersion: close.session.version },
          'POST',
          key,
        )
      ).status,
    ).toBe(422);
    const admission = await request(
      `${a.path}/attendance/sync-roster`,
      a.manager.cookie,
      body,
      'POST',
      key,
    );
    expect(admission.status).toBe(200);
    const outcome = await admission.json();
    expect(outcome).toMatchObject({
      totals: { absent: 1, eligible: 1 },
      session: { permissions: { canEditAttendance: true, canSyncRoster: true } },
    });
    expect(
      await (
        await request(`${a.path}/attendance/sync-roster`, a.manager.cookie, body, 'POST', key)
      ).json(),
    ).toEqual(outcome);
    expect(
      await db.query('SELECT 1 FROM attendance_records WHERE session_id=$1', [a.session.id]),
    ).toHaveLength(1);
  });
});
