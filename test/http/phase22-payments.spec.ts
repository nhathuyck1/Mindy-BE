import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { PayOS } from '@payos/node';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('http'))('Phase 2.2 built-app HTTP E2E', () => {
  let server: ChildProcess;
  let db: DataSource;
  let url: string;
  let classId: string;
  let studentCookie: string;
  let otherCookie: string;
  let adminCookie: string;
  let mentorCookie: string;
  let cashCookie: string;
  let learnerCookie: string;
  const sdk = new PayOS({
    clientId: 'http-client',
    apiKey: 'http-key',
    checksumKey: 'http-checksum',
    logLevel: 'off',
    logger: null,
  });
  beforeAll(async () => {
    const dbUrl = separateTestUrl('http');
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
    otherCookie = await login('other@http.test');
    adminCookie = await login('admin@http.test');
    mentorCookie = await login('mentor@http.test');
    cashCookie = await login('cash@http.test');
    learnerCookie = await login('learner@http.test');
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
  ) {
    return fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('protects admin class student reads, validates input and exposes their Swagger contracts', async () => {
    const roster = `/admin/classes/${classId}/students`;
    const detail = `${roster}/${randomUUID()}`;
    for (const path of [roster, detail]) {
      expect((await request(path)).status).toBe(401);
      for (const cookie of [studentCookie, mentorCookie])
        expect((await request(path, cookie)).status).toBe(403);
    }
    for (const query of ['page=0', 'pageSize=101', 'pageSize=1.5', 'studentId=x'])
      expect((await request(`${roster}?${query}`, adminCookie)).status).toBe(422);
    expect((await request('/admin/classes/invalid/students', adminCookie)).status).toBe(400);
    expect((await request(`${roster}/invalid`, adminCookie)).status).toBe(400);
    const missing = await request(`/admin/classes/${randomUUID()}/students`, adminCookie);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'CLASS_NOT_FOUND' });
    const absent = await request(detail, adminCookie);
    expect(absent.status).toBe(404);
    expect(await absent.json()).toMatchObject({ code: 'CLASS_STUDENT_NOT_FOUND' });
    const swagger = (await (await fetch(`${url.replace('/api/v1', '')}/docs-json`)).json()) as {
      paths: Record<string, unknown>;
    };
    expect(swagger.paths).toHaveProperty('/api/v1/admin/classes/{classId}/students');
    expect(swagger.paths).toHaveProperty('/api/v1/admin/classes/{classId}/students/{studentId}');
  });

  it('lists class students with pagination and scopes student details to effective class registrations', async () => {
    const input = {
      email: 'roster@http.test',
      password: '123456',
      displayName: 'Roster student',
      phone: '+84901234567',
      role: 'STUDENT',
    };
    const created = await request('/admin/users', adminCookie, input);
    expect(created.status).toBe(201);
    const student = (await created.json()) as { id: string; createdAt: string };
    const login = await request('/auth/login', undefined, {
      email: input.email,
      password: input.password,
    });
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    expect((await request('/me/cart/items', cookie, { classId })).status).toBe(201);
    expect((await request('/me/cart/checkout', cookie, { paymentType: 'PAYOS' })).status).toBe(201);
    const roster = `/admin/classes/${classId}/students`;
    const path = `${roster}/${student.id}`;
    const list = await request(`${roster}?pageSize=1`, adminCookie);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      items: [
        {
          studentId: student.id,
          studentName: input.displayName,
          enrollmentStatus: 'PENDING_PAYMENT',
        },
      ],
      page: 1,
      pageSize: 1,
      total: 1,
    });
    expect(await (await request(`${roster}?page=2&pageSize=1`, adminCookie)).json()).toMatchObject({
      items: [],
      page: 2,
      pageSize: 1,
      total: 1,
    });
    const response = await request(path, adminCookie);
    expect(response.status).toBe(200);
    const body = await response.text();
    const detail = JSON.parse(body) as {
      enrollmentId: string;
      registeredAt: string;
      orderDetailId: string;
    };
    expect(detail).toMatchObject({
      classId,
      studentId: student.id,
      studentName: input.displayName,
      email: input.email,
      phone: input.phone,
      studentStatus: 'ACTIVE',
      enrollmentStatus: 'PENDING_PAYMENT',
      enrolledAt: null,
      accountCreatedAt: student.createdAt,
    });
    for (const field of ['passwordHash', 'password', 'accessToken', 'refreshToken'])
      expect(detail).not.toHaveProperty(field);
    expect(detail.orderDetailId).toBeTruthy();
    expect(detail.registeredAt).toBeTruthy();
    const original = (await (await request(`/admin/classes/${classId}`, adminCookie)).json()) as {
      courseId: string;
      mentor: { id: string };
      startDate: string;
      endDate: string;
    };
    const emptyClass = await request('/admin/classes', adminCookie, {
      courseId: original.courseId,
      mentorId: original.mentor.id,
      code: randomUUID(),
      name: 'Empty roster',
      deliveryMode: 'ONLINE',
      startDate: original.startDate,
      endDate: original.endDate,
      maxStudents: 10,
    });
    expect(emptyClass.status).toBe(201);
    const emptyId = ((await emptyClass.json()) as { id: string }).id;
    expect(await (await request(`/admin/classes/${emptyId}/students`, adminCookie)).json()).toEqual(
      {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      },
    );
    const unrelated = await request(
      `/admin/classes/${emptyId}/students/${student.id}`,
      adminCookie,
    );
    expect(unrelated.status).toBe(404);
    expect(await unrelated.json()).toMatchObject({ code: 'CLASS_STUDENT_NOT_FOUND' });
    for (const status of ['ACTIVE', 'COMPLETED']) {
      await db.query('UPDATE enrollments SET status=$1, enrolled_at=now() WHERE id=$2', [
        status,
        detail.enrollmentId,
      ]);
      expect(await (await request(path, adminCookie)).json()).toMatchObject({
        enrollmentStatus: status,
      });
      expect(await (await request(roster, adminCookie)).json()).toMatchObject({ total: 1 });
    }
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [student.id]);
    expect(await (await request(path, adminCookie)).json()).toMatchObject({
      studentStatus: 'SUSPENDED',
    });
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE id=$1", [detail.enrollmentId]);
    expect((await request(path, adminCookie)).status).toBe(404);
    expect(await (await request(roster, adminCookie)).json()).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('lets admins create managers who can authenticate without inheriting other role permissions', async () => {
    const input = {
      email: 'manager@http.test',
      password: '123456',
      displayName: 'Material Manager',
      role: 'MANAGER',
    };
    expect((await request('/admin/users', mentorCookie, input)).status).toBe(403);
    const created = await request('/admin/users', adminCookie, input);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ email: input.email, role: 'MANAGER' });

    const login = await request('/auth/login', undefined, {
      email: input.email,
      password: input.password,
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const me = await request('/auth/me', cookie);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ role: 'MANAGER' });
    const refresh = await request('/auth/refresh', cookie, {});
    expect(refresh.status).toBe(200);
    const rotated = refresh.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect((await request('/auth/me', rotated)).status).toBe(200);
    expect((await request('/admin/users', rotated)).status).toBe(403);
    expect((await request('/admin/courses', rotated)).status).toBe(403);
    expect((await request('/me/cart', rotated)).status).toBe(403);
  });

  it.each(['ADMIN', 'MANAGER', 'MENTOR', 'STUDENT'])(
    'uses the same 6–128 character creation password policy for %s',
    async (role) => {
      const input = {
        email: `${randomUUID()}@http.test`,
        displayName: 'Password policy test',
        role,
      };
      for (const password of ['12345', 'a'.repeat(129)]) {
        expect((await request('/admin/users', adminCookie, { ...input, password })).status).toBe(
          422,
        );
      }
      const created = await request('/admin/users', adminCookie, { ...input, password: '123456' });
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({ email: input.email, role });
      const login = await request('/auth/login', undefined, {
        email: input.email,
        password: '123456',
      });
      expect(login.status).toBe(200);
      expect(await login.json()).toMatchObject({ user: { role } });
      expect(
        (
          await request('/admin/users', adminCookie, {
            ...input,
            email: `${randomUUID()}@http.test`,
            password: 'a'.repeat(128),
          })
        ).status,
      ).toBe(201);
    },
  );

  it('enforces auth/ownership/DTO, signed callback, own-order summary, full access and public privacy', async () => {
    expect((await request(`/me/classes/${classId}`)).status).toBe(401);
    expect((await request(`/me/classes/${classId}`, studentCookie)).status).toBe(403);
    expect((await request('/me/cart/items', studentCookie, { classId })).status).toBe(201);
    const checkoutRes = await request('/me/cart/checkout', studentCookie, { paymentType: 'PAYOS' });
    expect(checkoutRes.status).toBe(201);
    const checkout = (await checkoutRes.json()) as { orders: { id: string }[] };
    const id = checkout.orders[0]?.id;
    const path = `/me/orders/${id}/payments/payos`;
    expect((await request(path, otherCookie, {})).status).toBe(403);
    expect((await request(path, studentCookie, { amount: 1, success: true })).status).toBe(422);
    const created = await request(path, studentCookie, {});
    expect(created.status).toBe(201);
    const payment = (await created.json()) as {
      paymentId: string;
      checkoutUrl: string;
      providerOrderCode: number;
    };
    const resultPath = `/me/orders/payment-result?orderCode=${payment.providerOrderCode}`;
    expect((await request(resultPath)).status).toBe(401);
    expect((await request(resultPath, otherCookie)).status).toBe(403);
    const resolved = await request(resultPath, studentCookie);
    expect(resolved.status).toBe(200);
    expect(await resolved.json()).toMatchObject({ id, status: 'PENDING' });
    for (const code of ['abc', '0', '-1', '1.5', '1e9'])
      expect(
        (await request(`/me/orders/payment-result?orderCode=${code}`, studentCookie)).status,
      ).toBe(422);
    expect((await request('/me/orders/payment-result?orderCode=1', studentCookie)).status).toBe(
      404,
    );
    const retry = await request(path, studentCookie, {});
    expect(retry.status).toBe(201);
    expect(((await retry.json()) as { paymentId: string }).paymentId).toBe(payment.paymentId);
    const [d] = await db.query(
      'SELECT payos_order_code, payment_link_id FROM payos_payment_details WHERE payment_transaction_id=$1',
      [payment.paymentId],
    );
    const data = {
      orderCode: Number(d.payos_order_code),
      amount: 5000,
      description: 'HTTP',
      accountNumber: 'test-account',
      reference: `http-${id}`,
      transactionDateTime: '2026-10-05 12:00:00',
      currency: 'VND',
      paymentLinkId: d.payment_link_id,
      code: '00',
      desc: 'success',
      extraSignedField: 'preserved',
    };
    const body = {
      code: '00',
      desc: 'success',
      success: true,
      data,
      signature: await sdk.crypto.createSignatureFromObj(data, 'http-checksum'),
    };
    expect(
      (await request('/payment-callbacks/payos', undefined, { ...body, signature: '0'.repeat(64) }))
        .status,
    ).toBe(400);
    expect(
      (
        await request('/payment-callbacks/payos', undefined, {
          ...body,
          data: { ...data, amount: 1 },
        })
      ).status,
    ).toBe(400);
    const callbacks = await Promise.all([
      request('/payment-callbacks/payos', undefined, body),
      request('/payment-callbacks/payos', undefined, body),
    ]);
    expect(callbacks.map((c) => c.status)).toEqual([200, 200]);
    const own = (await (await request(`/me/orders/${id}`, studentCookie)).json()) as {
      status: string;
      payment: { status: string; checkoutUrl: string | null };
    };
    expect(own.status).toBe('PAID');
    expect(own.payment.status).toBe('SUCCEEDED');
    expect(own.payment.checkoutUrl).toBeNull();
    const access = (await (await request(`/me/classes/${classId}`, studentCookie)).json()) as {
      meetingUrl: string;
      units: { sessions: { meetingUrl: string }[] }[];
    };
    expect(access.meetingUrl).toContain('paid-class');
    expect(access.units[0]?.sessions[0]?.meetingUrl).toContain('paid-session');
    expect((await request(`/me/classes/${classId}`, otherCookie)).status).toBe(403);
    expect((await request(path, studentCookie, {})).status).toBe(409);
    expect(
      await db.query(
        'SELECT count(*)::int AS count FROM payment_confirmation_emails WHERE order_id=$1',
        [id],
      ),
    ).toEqual([{ count: 1 }]);
    expect((await request('/admin/payments/reconciliation', studentCookie)).status).toBe(403);
    expect((await request('/admin/payments/reconciliation', adminCookie)).status).toBe(200);
    const browse = await request(`/classes/${classId}`);
    const publicText = await browse.text();
    expect(browse.status).toBe(200);
    expect(publicText).not.toContain('paid-class');
  });

  it('cash preview hides private URLs; only mentor confirms full amount and retries preserve one payment', async () => {
    await request('/me/cart/items', cashCookie, { classId });
    const checkout = await request('/me/cart/checkout', cashCookie, { paymentType: 'CASH' });
    expect(checkout.status).toBe(201);
    const { orders } = (await checkout.json()) as { orders: { id: string; totalAmount: number }[] };
    const order = orders[0];
    if (!order) throw new Error('Missing cash order');
    const preview = `/me/classes/${classId}/preview`;
    expect((await request(preview, otherCookie)).status).toBe(403);
    const pending = await request(preview, cashCookie);
    expect(pending.status).toBe(200);
    const content = await pending.text();
    expect(content).toContain('Session');
    expect(content).not.toContain('meetingUrl');
    expect(content).not.toContain('paid-session');
    expect((await request(`/me/classes/${classId}`, cashCookie)).status).toBe(403);
    const path = `/mentor/cash-orders/${order.id}/confirm`;
    const body = { receivedAmount: order.totalAmount };
    expect((await request(path, cashCookie, body)).status).toBe(403);
    expect((await request(path, adminCookie, body)).status).toBe(403);
    expect((await request(path, mentorCookie, { ...body, status: 'PAID' })).status).toBe(422);
    expect(
      (await request(path, mentorCookie, { receivedAmount: order.totalAmount - 1 })).status,
    ).toBe(409);
    const list = await request('/mentor/cash-orders', mentorCookie);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ items: [{ id: order.id }] });
    for (let n = 0; n < 2; n++) expect((await request(path, mentorCookie, body)).status).toBe(200);
    expect((await request(`/me/classes/${classId}`, cashCookie)).status).toBe(200);
    const own = await request(`/me/orders/${order.id}`, cashCookie);
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({
      status: 'PAID',
      payment: { status: 'SUCCEEDED', providerOrderCode: null },
    });
  });

  it('maps JSON parse/body limits to 400/413 without requiring browser credentials', async () => {
    const res = await fetch(`${url}/payment-callbacks/payos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(res.status).toBe(400);
    const big = await request('/payment-callbacks/payos', undefined, {
      padding: 'x'.repeat(70000),
    });
    expect(big.status).toBe(413);
    expect((await request('/health/ready')).status).toBe(200);
  });

  it('does not ACK or leave partial access when outbox persistence fails; retry recovers', async () => {
    await request('/me/cart/items', otherCookie, { classId });
    const checkout = (await (
      await request('/me/cart/checkout', otherCookie, { paymentType: 'PAYOS' })
    ).json()) as { orders: { id: string }[] };
    const id = checkout.orders[0]?.id;
    const payment = (await (
      await request(`/me/orders/${id}/payments/payos`, otherCookie, {})
    ).json()) as { paymentId: string };
    const [d] = await db.query(
      'SELECT payos_order_code, payment_link_id FROM payos_payment_details WHERE payment_transaction_id=$1',
      [payment.paymentId],
    );
    const data = {
      orderCode: Number(d.payos_order_code),
      amount: 5000,
      description: 'HTTP',
      accountNumber: 'test-account',
      reference: `http-${id}`,
      transactionDateTime: '2026-10-05 12:00:00',
      currency: 'VND',
      paymentLinkId: d.payment_link_id,
      code: '00',
      desc: 'success',
    };
    const body = {
      code: '00',
      desc: 'success',
      success: true,
      data,
      signature: await sdk.crypto.createSignatureFromObj(data, 'http-checksum'),
    };
    await db.query(
      "CREATE FUNCTION fail_test_mail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test persistence failure'; END $$",
    );
    await db.query(
      'CREATE TRIGGER fail_test_mail BEFORE INSERT ON payment_confirmation_emails FOR EACH ROW EXECUTE FUNCTION fail_test_mail()',
    );
    try {
      expect((await request('/payment-callbacks/payos', undefined, body)).status).toBe(503);
      expect((await request(`/me/classes/${classId}`, otherCookie)).status).toBe(403);
      expect(await db.query('SELECT status FROM orders WHERE id=$1', [id])).toEqual([
        { status: 'PENDING' },
      ]);
    } finally {
      await db.query('DROP TRIGGER fail_test_mail ON payment_confirmation_emails');
      await db.query('DROP FUNCTION fail_test_mail()');
    }
    expect((await request('/payment-callbacks/payos', undefined, body)).status).toBe(200);
    expect((await request(`/me/classes/${classId}`, otherCookie)).status).toBe(200);
  });
  it('Phase 2.3: My Classes and schedule follow CASH preview → FULL without leaking private data', async () => {
    for (const path of [
      '/me/classes',
      '/me/schedule?from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z',
    ]) {
      expect((await request(path)).status).toBe(401);
      expect((await request(path, mentorCookie)).status).toBe(403);
    }
    const empty = await request('/me/classes', learnerCookie);
    expect(empty.status).toBe(200);
    expect(empty.headers.get('cache-control')).toBe('private, no-store');
    expect(await empty.json()).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0 });

    expect((await request('/me/cart/items', learnerCookie, { classId })).status).toBe(201);
    const checkout = await request('/me/cart/checkout', learnerCookie, { paymentType: 'CASH' });
    const order = ((await checkout.json()) as { orders: { id: string; totalAmount: number }[] })
      .orders[0];
    if (!order) throw new Error('Missing cash order');

    type Row = {
      enrollmentId: string;
      classId: string;
      startDate: string;
      accessMode: string;
      canViewSchedule: boolean;
      order: { orderId: string; orderStatus: string };
    };
    const listed = await request('/me/classes', learnerCookie);
    const listText = await listed.text();
    expect(listText).not.toContain('meet.example.test');
    const row = (JSON.parse(listText) as { items: Row[] }).items[0];
    expect(row).toMatchObject({
      classId,
      accessMode: 'CASH_PREVIEW',
      accessReason: 'PENDING_CASH',
      canViewSchedule: true,
      order: { orderId: order.id, orderStatus: 'PENDING', paymentType: 'CASH' },
    });
    if (!row) throw new Error('Missing My Classes row');

    const preview = await request(`/me/classes/${classId}/preview`, learnerCookie);
    expect(preview.headers.get('cache-control')).toBe('private, no-store');
    expect(await preview.json()).toMatchObject({
      id: classId,
      accessMode: 'CASH_PREVIEW',
      enrollmentId: row.enrollmentId,
      orderId: order.id,
      classStatus: 'OPEN',
    });

    const from = new Date(`${row.startDate}T00:00:00+07:00`);
    const to = new Date(from.getTime() + 86_400_000);
    const range = `from=${from.toISOString()}&to=${to.toISOString()}`;
    const events = await request(`/me/schedule?${range}&classId=${classId}`, learnerCookie);
    expect(events.status).toBe(200);
    expect(events.headers.get('cache-control')).toBe('private, no-store');
    const eventsText = await events.text();
    expect(eventsText).not.toContain('meet.example.test');
    expect(eventsText).not.toContain('meetingUrl');
    expect(JSON.parse(eventsText)).toMatchObject({
      timeZone: 'Asia/Ho_Chi_Minh',
      total: 1,
      pageSize: 100,
      items: [
        {
          classId,
          enrollmentId: row.enrollmentId,
          accessMode: 'CASH_PREVIEW',
          startTime: '08:00',
          endTime: '09:00',
          dayOfWeek: new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Ho_Chi_Minh',
            weekday: 'long',
          }).format(from),
        },
      ],
    });
    const offsetRange = `from=${encodeURIComponent(`${row.startDate}T00:00:00+07:00`)}&to=${to.toISOString()}`;
    expect(
      (
        (await (await request(`/me/schedule?${offsetRange}`, learnerCookie)).json()) as {
          total: number;
        }
      ).total,
    ).toBe(1);
    expect((await request(`/me/schedule?${range}&classId=${classId}`, otherCookie)).status).toBe(
      200,
    );

    for (const query of [
      `from=${row.startDate}T00:00:00&to=${to.toISOString()}`,
      `from=${to.toISOString()}&to=${from.toISOString()}`,
      `from=${from.toISOString()}&to=${new Date(from.getTime() + 32 * 86_400_000).toISOString()}`,
      `${range}&classId=not-a-uuid`,
      `${range}&includeCancelled=maybe`,
      `${range}&studentId=${row.enrollmentId}`,
      'to=2026-10-02T00:00:00Z',
    ])
      expect((await request(`/me/schedule?${query}`, learnerCookie)).status).toBe(422);
    for (const query of ['view=archived', 'pageSize=101', 'courseId=1', 'studentId=x'])
      expect((await request(`/me/classes?${query}`, learnerCookie)).status).toBe(422);
    expect((await request('/me/classes?classStatus=CANCELLED', learnerCookie)).status).toBe(200);

    const confirm = await request(`/mentor/cash-orders/${order.id}/confirm`, mentorCookie, {
      receivedAmount: order.totalAmount,
    });
    expect(confirm.status).toBe(200);
    const after = (await (await request('/me/classes', learnerCookie)).json()) as {
      items: Row[];
    };
    expect(after.items[0]).toMatchObject({
      enrollmentId: row.enrollmentId,
      accessMode: 'FULL',
      enrollmentStatus: 'ACTIVE',
      order: { orderStatus: 'PAID' },
    });
    expect((await request(`/me/classes/${classId}/preview`, learnerCookie)).status).toBe(403);
    const detail = await request(`/me/classes/${classId}`, learnerCookie);
    expect(detail.headers.get('cache-control')).toBe('private, no-store');
    expect(await detail.json()).toMatchObject({
      accessMode: 'FULL',
      enrollmentId: row.enrollmentId,
      enrollmentStatus: 'ACTIVE',
      classStatus: 'OPEN',
      meetingUrl: 'https://meet.example.test/paid-class',
    });
    const fullEvents = (await (await request(`/me/schedule?${range}`, learnerCookie)).json()) as {
      items: { accessMode: string }[];
    };
    expect(fullEvents.items.map((event) => event.accessMode)).toEqual(['FULL']);
  });

  it('admin can edit one session or a bulk selection with strict validation and atomic rollback', async () => {
    type Detail = {
      id: string;
      courseId: string;
      startDate: string;
      mentor: { id: string };
      units: { id: string; sessions: { id: string; startsAt: string; endsAt: string }[] }[];
    };
    const original = (await (
      await request(`/admin/classes/${classId}`, adminCookie)
    ).json()) as Detail;
    const date = original.startDate;
    const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10);
    const created = await request('/admin/classes', adminCookie, {
      code: `EDIT-${randomUUID()}`,
      courseId: original.courseId,
      mentorId: original.mentor.id,
      name: 'Time edit test',
      startDate: date,
      endDate: nextDate,
      maxStudents: 10,
      deliveryMode: 'ONLINE',
    });
    expect(created.status).toBe(201);
    const draft = (await created.json()) as Detail;
    const unitId = draft.units[0]?.id;
    if (!unitId) throw new Error('Missing copied unit');
    const route = `/admin/classes/${draft.id}/sessions`;
    for (const [sessionDate, start, end] of [
      [date, '15:00', '17:00'],
      [nextDate, '15:00', '17:00'],
      [date, '12:00', '13:00'],
    ]) {
      expect(
        (
          await request(route, adminCookie, {
            classUnitId: unitId,
            title: 'Session',
            startsAt: `${sessionDate}T${start}:00+07:00`,
            endsAt: `${sessionDate}T${end}:00+07:00`,
          })
        ).status,
      ).toBe(201);
    }
    const detail = (await (
      await request(`/admin/classes/${draft.id}`, adminCookie)
    ).json()) as Detail;
    const sessions = detail.units[0]?.sessions ?? [];
    const first = sessions.find(
      (session) => session.startsAt === new Date(`${date}T15:00:00+07:00`).toISOString(),
    );
    const second = sessions.find(
      (session) => session.startsAt === new Date(`${nextDate}T15:00:00+07:00`).toISOString(),
    );
    if (!first || !second) throw new Error('Missing scheduled sessions');
    const times = { startTime: '07:30', endTime: '09:30' };
    const single = `${route}/${first.id}`;
    const bulk = `${route}/bulk`;
    expect((await request(single, undefined, times, 'PATCH')).status).toBe(401);
    for (const cookie of [studentCookie, mentorCookie]) {
      expect((await request(single, cookie, times, 'PATCH')).status).toBe(403);
      expect(
        (await request(bulk, cookie, { ...times, sessionIds: [first.id, second.id] }, 'PATCH'))
          .status,
      ).toBe(403);
    }
    expect((await request(single, adminCookie, times, 'PATCH')).status).toBe(200);
    expect(
      (await request(bulk, adminCookie, { ...times, sessionIds: [first.id, second.id] }, 'PATCH'))
        .status,
    ).toBe(200);
    for (const body of [
      { ...times, sessionIds: [] },
      { ...times, sessionIds: [first.id, first.id] },
      { ...times, sessionIds: [first.id], startTime: '7:30' },
      { ...times, sessionIds: [first.id], startsAt: first.startsAt },
    ])
      expect((await request(bulk, adminCookie, body, 'PATCH')).status).toBe(422);
    expect(
      (await request(single, adminCookie, { startTime: '07:30', endTime: '07:30' }, 'PATCH'))
        .status,
    ).toBe(422);
    expect(
      (
        await request(
          bulk,
          adminCookie,
          { ...times, sessionIds: [first.id, randomUUID()] },
          'PATCH',
        )
      ).status,
    ).toBe(404);
    const conflict = await request(
      bulk,
      adminCookie,
      { startTime: '12:30', endTime: '13:30', sessionIds: [first.id, second.id] },
      'PATCH',
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: 'CLASS_SESSION_OVERLAP' });
    const after = (await (
      await request(`/admin/classes/${draft.id}`, adminCookie)
    ).json()) as Detail;
    expect(after.units[0]?.sessions.find((session) => session.id === first.id)).toMatchObject({
      startsAt: `${date}T00:30:00.000Z`,
      endsAt: `${date}T02:30:00.000Z`,
    });
    expect(after.units[0]?.sessions.find((session) => session.id === second.id)).toMatchObject({
      startsAt: `${nextDate}T00:30:00.000Z`,
      endsAt: `${nextDate}T02:30:00.000Z`,
    });
  });
});
