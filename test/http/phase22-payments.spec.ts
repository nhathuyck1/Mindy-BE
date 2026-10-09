import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
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

  it('lets admins create managers who can authenticate without inheriting other role permissions', async () => {
    const input = {
      email: 'manager@http.test',
      password: 'Http-test-password1!',
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
});
