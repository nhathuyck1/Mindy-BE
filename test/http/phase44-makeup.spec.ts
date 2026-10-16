import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase44b_http'))('Phase 4.4b built-app HTTP', () => {
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
    const dbUrl = separateTestUrl('phase44b_http'),
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

  let conflictId: string,
    targetId: string,
    targetClassId: string,
    placementId: string,
    targetMentor: string;
  it('creates a real replacement conflict through checkout and exposes staff-only candidates', async () => {
    expect((await request('/management/student-schedule-conflicts')).status).toBe(401);
    expect((await request('/management/student-schedule-conflicts', student)).status).toBe(403);
    expect(
      (await request('/management/student-schedule-conflicts?status=INVALID', manager)).status,
    ).toBe(422);
    expect((await request('/me/makeup-placements', mentor)).status).toBe(403);
    expect((await request('/me/cart/items', student, { classId })).status).toBe(201);
    const checkout = await request('/me/cart/checkout', student, { paymentType: 'CASH' });
    expect(checkout.status).toBe(201);
    const data = (await checkout.json()) as { orders: { id: string; totalAmount: number }[] };
    const order = data.orders[0];
    if (!order) throw new Error('Missing order');
    expect(
      (
        await request(`/manager/cash-orders/${order.id}/confirm`, manager, {
          receivedAmount: order.totalAmount,
        })
      ).status,
    ).toBe(200);
    const old = await source();
    const cancelled = await request(
      `/management/class-sessions/${sourceId}/cancel`,
      manager,
      { expectedVersion: old.version, reason: 'Move teaching' },
      'POST',
      randomUUID(),
    );
    const cancelledData = (await cancelled.json()) as { version: number };
    expect(cancelled.status).toBe(200);
    const makeup = await request(
      `/management/class-sessions/${sourceId}/makeups`,
      manager,
      {
        expectedVersion: cancelledData.version,
        classUnitId: old.class_unit_id,
        title: 'Replacement',
        startsAt: new Date(old.starts_at.getTime() + 86400000).toISOString(),
        endsAt: new Date(old.ends_at.getTime() + 86400000).toISOString(),
        reason: 'Replace source',
      },
      'POST',
      randomUUID(),
    );
    expect(makeup.status).toBe(201);
    await db.query("UPDATE users SET role='MENTOR' WHERE email='learner@http.test'");
    const login = await request('/auth/login', undefined, {
      email: 'learner@http.test',
      password: 'Http-test-password1!',
    });
    targetMentor = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const classes: { course_id: string }[] = await db.query(
      'SELECT course_id FROM classes WHERE id=$1',
      [classId],
    );
    const mentors: { id: string }[] = await db.query(
      "SELECT id FROM users WHERE email='learner@http.test'",
    );
    async function addClass(days: number) {
      const day = new Date(old.starts_at.getTime() + days * 86400000).toISOString().slice(0, 10);
      const created = await request('/admin/classes', admin, {
        courseId: classes[0]?.course_id,
        mentorId: mentors[0]?.id,
        code: randomUUID(),
        name: 'Makeup receiving class',
        deliveryMode: 'ONLINE',
        startDate: day,
        endDate: day,
        maxStudents: 2,
        meetingUrl: 'https://meet.example.test/makeup-http',
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as { id: string; units: { id: string }[] };
      const ids: { id: string }[] = await db.query(
        'SELECT id FROM class_units WHERE class_id=$1 ORDER BY position',
        [body.id],
      );
      const scheduled = await request(`/admin/classes/${body.id}/sessions`, admin, {
        classUnitId: ids[0]?.id,
        title: 'Equivalent session',
        startsAt: `${day}T08:00:00+07:00`,
        endsAt: `${day}T09:00:00+07:00`,
      });
      expect(scheduled.status).toBe(201);
      expect((await request(`/admin/classes/${body.id}/open`, admin, {})).status).toBe(200);
      return body.id;
    }
    const clash = await addClass(1);
    targetClassId = await addClass(3);
    expect((await request('/me/cart/items', student, { classId: clash })).status).toBe(201);
    expect((await request('/me/cart/checkout', student, { paymentType: 'CASH' })).status).toBe(201);
    const queue = await request(
      `/management/student-schedule-conflicts?classId=${classId}`,
      manager,
    );
    expect(queue.headers.get('cache-control')).toBe('private, no-store');
    const result = (await queue.json()) as { items: { id: string; version: number }[] };
    conflictId = result.items[0]?.id ?? '';
    expect(conflictId).not.toBe('');
    const candidates = await request(
      `/management/student-schedule-conflicts/${conflictId}/makeup-candidates`,
      manager,
    );
    expect(candidates.status).toBe(200);
    const list = (await candidates.json()) as { items: { session: { sessionId: string } }[] };
    targetId = list.items[0]?.session.sessionId ?? '';
    expect(targetId).not.toBe('');
  });
  it('validates DTOs and key, creates/replays a placement and scopes Student context without class entitlement', async () => {
    const route = `/management/student-schedule-conflicts/${conflictId}/makeup-placement`;
    const rows: { version: number }[] = await db.query(
      'SELECT version FROM class_sessions WHERE id=$1',
      [targetId],
    );
    const body = {
      targetSessionId: targetId,
      expectedVersion: 1,
      expectedTargetVersion: rows[0]?.version,
      contentMatchConfirmed: true,
      reason: 'Equivalent lesson confirmed',
    };
    for (const invalid of [
      { contentMatchConfirmed: false },
      { contentMatchConfirmed: 'true' },
      { reason: ' ' },
      { reason: null },
      { expectedTargetVersion: '1' },
      { targetSessionId: 'bad' },
      { extra: true },
    ])
      expect(
        (await request(route, manager, { ...body, ...invalid }, 'POST', randomUUID())).status,
      ).toBe(422);
    expect((await request(route, manager, body)).status).toBe(422);
    expect((await request(route, mentor, body, 'POST', randomUUID())).status).toBe(403);
    const key = randomUUID(),
      res = await request(route, manager, body, 'POST', key);
    expect(res.status).toBe(201);
    const result = (await res.json()) as {
      placement: { id: string; status: string };
      targetSessionVersion: number;
    };
    placementId = result.placement.id;
    expect(await (await request(route, manager, body, 'POST', key)).json()).toEqual(result);
    expect(
      (await request(route, manager, { ...body, reason: 'Changed' }, 'POST', key)).status,
    ).toBe(409);
    const ctx = await request(`/class-sessions/${targetId}/context`, student);
    expect(ctx.status).toBe(200);
    expect(await ctx.json()).toMatchObject({
      accessScope: 'SESSION',
      makeupPlacementId: placementId,
      meetingUrl: 'https://meet.example.test/makeup-http',
    });
    expect((await request(`/me/classes/${targetClassId}`, student)).status).toBe(403);
    const own = await request('/me/makeup-placements', student);
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({
      total: 1,
      items: [{ id: placementId, status: 'ASSIGNED', creditStatus: 'PENDING' }],
    });
  });
  it('marks/finalizes guest attendance through guards and cancels credit without deleting the snapshot', async () => {
    // Fixture brings the already-reserved target onto today's calendar; runtime clocks remain real.
    await db.query(
      "UPDATE class_sessions SET starts_at=date_trunc('day',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'+interval '8 hours',ends_at=date_trunc('day',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'+interval '9 hours' WHERE id=$1",
      [targetId],
    );
    const versions: { version: number }[] = await db.query(
      'SELECT version FROM class_sessions WHERE id=$1',
      [targetId],
    );
    const prefix = `/class-sessions/${targetId}`;
    const timetable = await request(
      `/me/schedule?from=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}&classId=${targetClassId}`,
      student,
    );
    expect(timetable.status).toBe(200);
    expect(await timetable.json()).toMatchObject({
      total: 1,
      items: [
        {
          sessionId: targetId,
          accessMode: 'SESSION_MAKEUP',
          sourceClassId: classId,
          makeupPlacementId: placementId,
        },
      ],
    });
    expect((await request(`/me/classes/${targetClassId}/attendance`, student)).status).toBe(404);
    expect(
      await (await request(`/me/classes/${classId}/attendance-summary`, student)).json(),
    ).toMatchObject({ makeupPending: 1, finalizedEligibleCount: 0, rate: null });
    const opened = await request(
      `${prefix}/start`,
      targetMentor,
      { expectedVersion: versions[0]?.version },
      'POST',
      randomUUID(),
    );
    expect(opened.status).toBe(200);
    const open = (await opened.json()) as { session: { version: number } };
    const roster = await request(`${prefix}/attendance`, targetMentor);
    expect(roster.status).toBe(200);
    expect(await roster.json()).toMatchObject({
      total: 1,
      items: [{ entryType: 'MAKEUP', makeupPlacementId: placementId }],
    });
    const marked = await request(
      `${prefix}/attendance`,
      targetMentor,
      {
        expectedVersion: open.session.version,
        records: [],
        guestRecords: [{ makeupPlacementId: placementId, status: 'PRESENT' }],
      },
      'PUT',
      randomUUID(),
    );
    expect(marked.status).toBe(200);
    const markedData = (await marked.json()) as { session: { version: number } };
    const finalized = await request(
      `${prefix}/finalize`,
      targetMentor,
      { expectedVersion: markedData.session.version },
      'POST',
      randomUUID(),
    );
    expect(finalized.status).toBe(200);
    expect(
      await (await request(`/me/classes/${classId}/attendance-summary`, student)).json(),
    ).toMatchObject({ present: 1, makeupPending: 0, finalizedEligibleCount: 1, rate: 100 });
    expect(
      await (await request(`/management/classes/${classId}/attendance-summary`, manager)).json(),
    ).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ present: 1, rate: 100 })]),
    });
    expect(
      await (
        await request(`/management/classes/${targetClassId}/attendance-summary`, manager)
      ).json(),
    ).toMatchObject({ total: 0 });
    const own = (await (await request('/me/makeup-placements', student)).json()) as {
      items: { version: number }[];
    };
    expect(own).toMatchObject({
      items: [{ status: 'COMPLETED', attendanceStatus: 'PRESENT', creditStatus: 'FINALIZED' }],
    });
    const history = await request(
      '/management/class-sessions/' +
        targetId +
        '/attendance-audits?makeupPlacementId=' +
        placementId,
      manager,
    );
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ entryType: 'MAKEUP', makeupPlacementId: placementId }),
      ]),
    });
    const cancelled = await request(
      `/management/makeup-placements/${placementId}/cancel`,
      manager,
      { expectedVersion: own.items[0]?.version, reason: 'Revoke makeup' },
      'POST',
      randomUUID(),
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ status: 'CANCELLED', creditStatus: 'REVOKED' });
    expect(
      await (await request(`/me/classes/${classId}/attendance-summary`, student)).json(),
    ).toMatchObject({ present: 0, absent: 0, makeupPending: 1, rate: null });
    expect((await request(`${prefix}/context`, student)).status).toBe(403);
    expect(
      await db.query('SELECT 1 FROM guest_attendance_records WHERE placement_id=$1', [placementId]),
    ).toHaveLength(1);
    const swagger = (await (await fetch(`${url.replace('/api/v1', '')}/docs-json`)).json()) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    expect(swagger.paths).toHaveProperty(
      '/api/v1/management/student-schedule-conflicts/{conflictId}/makeup-placement',
    );
    expect(swagger.components.schemas.MarkAttendanceDto?.properties.guestRecords).toBeDefined();
  });
});
