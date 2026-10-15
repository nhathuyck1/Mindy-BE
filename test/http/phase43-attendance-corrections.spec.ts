import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase43_http'))('Phase 4.3 built-app HTTP E2E', () => {
  let server: ChildProcess;
  let db: DataSource;
  let url: string;
  let classId: string;
  let adminCookie: string;
  beforeAll(async () => {
    const dbUrl = separateTestUrl('phase43_http');
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
    adminCookie = await login('admin@http.test');
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
      const email = `${randomUUID()}@phase43.test`;
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

  async function historicalFixture() {
    const a = await staffFixture();
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const start = new Date(`${day}T12:00:00+07:00`),
      end = new Date(`${day}T13:00:00+07:00`);
    expect(
      (
        await request(`/mentor/cash-orders/${a.order.id}/confirm`, a.mentor.cookie, {
          receivedAmount: a.order.totalAmount,
        })
      ).status,
    ).toBe(200);
    await db.query('UPDATE class_sessions SET starts_at=$2,ends_at=$3 WHERE id=$1', [
      a.session.id,
      start,
      end,
    ]);
    await db.query(
      'UPDATE enrollments SET created_at=$2,enrolled_at=$2 WHERE order_detail_id IN (SELECT id FROM order_details WHERE order_id=$1)',
      [a.order.id, new Date(start.getTime() - 3600000)],
    );
    await db.query('UPDATE orders SET paid_at=$2 WHERE id=$1', [
      a.order.id,
      new Date(start.getTime() - 3600000),
    ]);
    await db.query('UPDATE payment_transactions SET paid_at=$2 WHERE order_id=$1', [
      a.order.id,
      new Date(start.getTime() - 3600000),
    ]);
    const rows: { id: string }[] = await db.query(
      'SELECT id FROM enrollments WHERE order_detail_id IN (SELECT id FROM order_details WHERE order_id=$1)',
      [a.order.id],
    );
    const enrollmentId = rows[0]?.id;
    if (!enrollmentId) throw new Error('Missing enrollment');
    return {
      ...a,
      start,
      end,
      enrollmentId,
      management: `/management/class-sessions/${a.session.id}`,
      body: {
        expectedVersion: a.session.version,
        reason: 'Verified register',
        evidenceNote: 'Staff confirms historical roster from classroom register',
        actualStartedAt: start.toISOString(),
        actualEndedAt: end.toISOString(),
        records: [{ enrollmentId, status: 'PRESENT', admissionBasis: 'PAID_BEFORE_START' }],
      },
    };
  }

  it('cookie role matrix, audit filters/private cache, recovery/correction/replay and safe Swagger', async () => {
    const a = await historicalFixture(),
      recover = `${a.management}/attendance/recover`,
      history = `${a.management}/attendance-audits`;
    expect((await request(recover, undefined, a.body, 'POST', randomUUID())).status).toBe(401);
    for (const cookie of [a.mentor.cookie, a.student.cookie]) {
      expect((await request(recover, cookie, a.body, 'POST', randomUUID())).status).toBe(403);
      expect((await request(history, cookie)).status).toBe(403);
    }
    expect(
      (await request('/management/class-sessions/not-uuid/attendance-audits', adminCookie)).status,
    ).toBe(400);
    expect((await request(`${history}?pageSize=101`, a.manager.cookie)).status).toBe(422);
    expect((await request(`${history}?enrollmentId=bad`, adminCookie)).status).toBe(422);
    expect((await request(`${history}?unknown=1`, adminCookie)).status).toBe(422);
    const empty = await request(history, a.manager.cookie);
    expect(empty.headers.get('cache-control')).toBe('private, no-store');
    expect(await empty.json()).toMatchObject({ items: [], total: 0 });
    const key = randomUUID(),
      res = await request(recover, a.manager.cookie, a.body, 'POST', key);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const r = (await res.json()) as { session: { version: number } };
    expect(r).toMatchObject({
      session: {
        status: 'COMPLETED',
        effectiveMentor: null,
        permissions: { canRecover: true, canViewAttendanceAudits: true },
      },
      totals: { present: 1, absent: 0 },
    });
    expect(await (await request(recover, a.manager.cookie, a.body, 'POST', key)).json()).toEqual(r);
    const h = await (
      await request(`${history}?enrollmentId=${a.enrollmentId}`, adminCookie)
    ).json();
    expect(h).toMatchObject({
      total: 1,
      items: [
        {
          action: 'RECOVER',
          recoveryAuditId: expect.any(String),
          recoveryEvidence: { evidenceNote: a.body.evidenceNote },
        },
      ],
    });
    const correction = {
      expectedVersion: r.session.version,
      reason: 'Correct paper register',
      records: [{ enrollmentId: a.enrollmentId, status: 'ABSENT' }],
    };
    expect(
      (
        await request(
          `${a.path}/attendance`,
          a.manager.cookie,
          { ...correction, reason: undefined },
          'PUT',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `${a.path}/attendance`,
          a.manager.cookie,
          { ...correction, records: [{ enrollmentId: a.enrollmentId, status: 'UNMARKED' }] },
          'PUT',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const marked = await request(
      `${a.path}/attendance`,
      a.manager.cookie,
      correction,
      'PUT',
      randomUUID(),
    );
    expect(marked.status).toBe(200);
    expect(await marked.json()).toMatchObject({
      session: { version: r.session.version + 1 },
      totals: { absent: 1, present: 0 },
    });
    expect(
      (await request(`${a.path}/attendance`, a.manager.cookie, correction, 'PUT', randomUUID()))
        .status,
    ).toBe(409);
    expect(await (await request(history, a.manager.cookie)).json()).toMatchObject({
      total: 2,
      items: expect.arrayContaining([expect.objectContaining({ action: 'CORRECT' })]),
    });
    const foreign = await historicalFixture();
    expect(
      (await request(`${history}?enrollmentId=${foreign.enrollmentId}`, adminCookie)).status,
    ).toBe(422);
    const spec = await (await fetch(`${url.replace('/api/v1', '')}/docs-json`)).json();
    expect(spec).toMatchObject({
      paths: {
        '/api/v1/management/class-sessions/{sessionId}/attendance-audits': { get: {} },
        '/api/v1/management/class-sessions/{sessionId}/attendance/recover': {
          post: {
            parameters: expect.arrayContaining([
              expect.objectContaining({ name: 'Idempotency-Key', required: true }),
            ]),
          },
        },
      },
      components: {
        schemas: {
          RecoverAttendanceDto: {
            properties: { records: { maxItems: 1000 } },
            required: expect.arrayContaining(['reason']),
          },
          AttendanceRecoveryRecordDto: { required: expect.arrayContaining(['admissionBasis']) },
        },
      },
    });
  }, 30000);

  it('rejects nested/unknown fields, reasons, key and invalid clocks before committing; canceled recovery is closed', async () => {
    const a = await historicalFixture(),
      path = `${a.management}/attendance/recover`;
    expect((await request(path, adminCookie, a.body)).status).toBe(422);
    for (const body of [
      { ...a.body, reason: '  ' },
      { ...a.body, reason: undefined },
      { ...a.body, evidenceNote: ' ' },
      { ...a.body, actualStartedAt: null },
      { ...a.body, actualStartedAt: '2026-10-10T12:00:00' },
      { ...a.body, completedBy: a.manager.id },
      { ...a.body, actualEndedAt: new Date(Date.now() + 3600000).toISOString() },
      {
        ...a.body,
        records: [
          { enrollmentId: a.enrollmentId, status: 'UNMARKED', admissionBasis: 'PAID_BEFORE_START' },
        ],
      },
      { ...a.body, records: [{ enrollmentId: a.enrollmentId, status: 'ABSENT' }] },
      { ...a.body, records: [{ ...a.body.records[0], actorId: a.manager.id }] },
      { ...a.body, records: [a.body.records[0], a.body.records[0]] },
      { ...a.body, records: [null] },
      {
        ...a.body,
        records: [
          a.body.records[0],
          { ...a.body.records[0], enrollmentId: a.enrollmentId.toUpperCase() },
        ],
      },
    ])
      expect((await request(path, adminCookie, body, 'POST', randomUUID())).status).toBe(422);
    expect(
      (
        await request(
          path,
          adminCookie,
          { ...a.body, actualStartedAt: new Date(a.start.getTime() - 86400000).toISOString() },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    expect(await (await request(`${a.path}/attendance`, adminCookie)).json()).toMatchObject({
      items: [],
      session: { version: a.session.version },
    });
    await db.query("UPDATE class_sessions SET status='CANCELLED' WHERE id=$1", [a.session.id]);
    const denied = await request(path, adminCookie, a.body, 'POST', randomUUID());
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({ code: 'SESSION_STATE_CONFLICT' });
  }, 30000);

  it('mentor corrects COMPLETED Class within calendar window, Staff corrects CANCELLED; never-started and revoked replay reject', async () => {
    const a = await historicalFixture();
    // Historical fixtures retain the actual teaching mentor; recovery itself never invents it.
    await db.query('UPDATE class_sessions SET teaching_mentor_id=$2 WHERE id=$1', [
      a.session.id,
      a.mentor.id,
    ]);
    const recovered = await request(
      `${a.management}/attendance/recover`,
      adminCookie,
      a.body,
      'POST',
      randomUUID(),
    );
    expect(recovered.status).toBe(200);
    const r = (await recovered.json()) as { session: { version: number } };
    await db.query(
      "UPDATE classes SET status='COMPLETED' WHERE id=(SELECT class_id FROM class_sessions WHERE id=$1)",
      [a.session.id],
    );
    const key = randomUUID(),
      body = {
        expectedVersion: r.session.version,
        records: [{ enrollmentId: a.enrollmentId, status: 'ABSENT' }],
      };
    const correction = await request(`${a.path}/attendance`, a.mentor.cookie, body, 'PUT', key);
    expect(correction.status).toBe(200);
    await db.query('UPDATE class_sessions SET teaching_mentor_id=NULL WHERE id=$1', [a.session.id]);
    expect((await request(`${a.path}/attendance`, a.mentor.cookie, body, 'PUT', key)).status).toBe(
      403,
    );
    await db.query(
      "UPDATE class_sessions SET status='CANCELLED',teaching_mentor_id=$2 WHERE id=$1",
      [a.session.id, a.mentor.id],
    );
    const next = {
      ...body,
      expectedVersion: r.session.version + 1,
      reason: 'Canceled history',
      records: [{ enrollmentId: a.enrollmentId, status: 'PRESENT' }],
    };
    expect(
      (await request(`${a.path}/attendance`, a.mentor.cookie, next, 'PUT', randomUUID())).status,
    ).toBe(409);
    const staffEdit = await request(`${a.path}/attendance`, adminCookie, next, 'PUT', randomUUID());
    expect(staffEdit.status).toBe(200);
    expect(await staffEdit.json()).toMatchObject({
      session: { status: 'CANCELLED' },
      totals: { present: 1 },
    });
    await db.query('UPDATE class_sessions SET actual_started_at=NULL WHERE id=$1', [a.session.id]);
    expect(
      (
        await request(
          `${a.path}/attendance`,
          adminCookie,
          { ...next, expectedVersion: r.session.version + 2 },
          'PUT',
          randomUUID(),
        )
      ).status,
    ).toBe(409);
  }, 30000);

  it('built app accepts 1000 evidenced rows above 64KiB, rejects 1001, enforces exact 256KiB parser and keeps other routes at 64KiB', async () => {
    const a = await historicalFixture();
    const classRows: { class_id: string }[] = await db.query(
      'SELECT class_id FROM class_sessions WHERE id=$1',
      [a.session.id],
    );
    const ids = Array.from({ length: 1000 }, () => ({
      order_id: randomUUID(),
      detail_id: randomUUID(),
      enrollment_id: randomUUID(),
    }));
    await db.transaction(async (m) => {
      await m.query(
        `INSERT INTO orders(id,student_id,order_code,total_amount,status,payment_type,cash_mentor_id,expires_at,paid_at,created_at)
        SELECT x.order_id,$1,x.order_id::text,$2,'PAID','CASH',$3,$4,$5::timestamptz,$5::timestamptz-interval '1 hour'
        FROM jsonb_to_recordset($6::jsonb) AS x(order_id uuid)`,
        [
          a.student.id,
          a.order.totalAmount,
          a.mentor.id,
          a.end,
          new Date(a.start.getTime() - 3600000),
          JSON.stringify(ids),
        ],
      );
      await m.query(
        `INSERT INTO order_details(id,order_id,class_id,course_title_snapshot,class_name_snapshot,price_snapshot,total_amount)
        SELECT x.detail_id,x.order_id,$1,'Test','Test',$2,$2 FROM jsonb_to_recordset($3::jsonb) AS x(detail_id uuid,order_id uuid)`,
        [classRows[0]?.class_id, a.order.totalAmount, JSON.stringify(ids)],
      );
      await m.query(
        `INSERT INTO enrollments(id,student_id,class_id,order_detail_id,status,created_at,enrolled_at)
        SELECT x.enrollment_id,$1,$2,x.detail_id,'CANCELLED',$3,$3 FROM jsonb_to_recordset($4::jsonb) AS x(enrollment_id uuid,detail_id uuid)`,
        [
          a.student.id,
          classRows[0]?.class_id,
          new Date(a.start.getTime() - 3600000),
          JSON.stringify(ids),
        ],
      );
      await m.query(
        `INSERT INTO payment_transactions(order_id,amount,status,reference_code,paid_at)
        SELECT x.order_id,$1,'SUCCEEDED','cash:'||$2::text||':'||x.order_id::text,$3
        FROM jsonb_to_recordset($4::jsonb) AS x(order_id uuid)`,
        [
          a.order.totalAmount,
          a.mentor.id,
          new Date(a.start.getTime() - 3600000),
          JSON.stringify(ids),
        ],
      );
    });
    const body = {
      ...a.body,
      records: ids.map((x) => ({
        enrollmentId: x.enrollment_id,
        status: 'ABSENT',
        admissionBasis: 'PAID_BEFORE_START',
      })),
    };
    const path = `${a.management}/attendance/recover`;
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(64 * 1024);
    expect(
      (
        await request(
          path,
          adminCookie,
          { ...body, records: [...body.records, a.body.records[0]] },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const boundary = { ...a.body, padding: '' };
    const pad = 256 * 1024 - Buffer.byteLength(JSON.stringify(boundary));
    expect(
      (
        await request(
          path,
          adminCookie,
          { ...boundary, padding: 'x'.repeat(pad) },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const oversized = await request(
      path,
      adminCookie,
      { ...boundary, padding: 'x'.repeat(pad + 1) },
      'POST',
      randomUUID(),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ code: 'INVALID_JSON_BODY' });
    expect(
      (
        await request(
          `${a.path}/attendance`,
          adminCookie,
          { ...body, padding: 'x'.repeat(66000) },
          'PUT',
          randomUUID(),
        )
      ).status,
    ).toBe(413);
    const res = await request(path, adminCookie, body, 'POST', randomUUID());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      totals: { absent: 1000, eligible: 1000, present: 0, unmarked: 0 },
    });
    const roster = await request(`${a.path}/attendance?pageSize=1`, adminCookie);
    expect(await roster.json()).toMatchObject({ total: 1000, totals: { absent: 1000 } });
    expect(
      await (await request(`${a.management}/attendance-audits?pageSize=1`, adminCookie)).json(),
    ).toMatchObject({ total: 1000 });
    // The paid enrollment omitted from the evidenced roster is still missing, never automatically ABSENT.
    expect(
      await db.query('SELECT 1 FROM attendance_records WHERE session_id=$1 AND enrollment_id=$2', [
        a.session.id,
        a.enrollmentId,
      ]),
    ).toHaveLength(0);
    expect(
      await db.query('SELECT 1 FROM attendance_recovery_audit_items WHERE session_id=$1', [
        a.session.id,
      ]),
    ).toHaveLength(1000);
  }, 30000);
});
