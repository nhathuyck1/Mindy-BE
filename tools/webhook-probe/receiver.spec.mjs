import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';

import { PayOS } from '@payos/node';

import { BODY_LIMIT, createReceiver, WEBHOOK_PATH } from './receiver.mjs';

const checksumKey = 'fixture-only-not-a-real-channel-key';
const payos = new PayOS({ clientId: 'fixture-client', apiKey: 'fixture-api', checksumKey });
/** @type {import('./receiver.mjs').LogEntry[]} */
const logs = [];
const server = createReceiver({
  verify: (body) => payos.webhooks.verify(body),
  log: (entry) => logs.push(entry),
});
let baseUrl = '';

before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve(undefined))),
  );
});

function fixture() {
  const data = {
    orderCode: 123,
    amount: 2000,
    description: 'probe-fixture',
    accountNumber: 'fixture-account',
    reference: 'fixture-reference',
    transactionDateTime: '2026-10-04 10:00:00',
    currency: 'VND',
    paymentLinkId: 'fixture-link',
    code: '00',
    desc: 'success',
  };
  // Independent signer for a flat synthetic fixture; production verification uses SDK.
  const signed = Object.entries(data)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const signature = createHmac('sha256', checksumKey).update(signed).digest('hex');
  return { code: '00', desc: 'success', success: true, data, signature };
}

/** @param {string} body @param {string} [contentType] */
function post(body, contentType = 'application/json') {
  return fetch(`${baseUrl}${WEBHOOK_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
    signal: AbortSignal.timeout(3000),
  });
}

test('ACKs SDK-verified input and emits only correlation metadata', async () => {
  const body = fixture();
  const response = await post(JSON.stringify(body));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.result, 'verified');
  assert.equal(result.requestId, response.headers.get('x-request-id'));
  const entry = logs.find((value) => value.requestId === result.requestId);
  assert.ok(entry);
  assert.equal(entry.outcome, 'verified');
  const serialized = JSON.stringify(entry);
  for (const secret of [
    checksumKey,
    body.signature,
    body.data.accountNumber,
    body.data.reference,
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('rejects tampered data, wrong signature and missing signature', async () => {
  const tampered = fixture();
  tampered.data.amount += 1;
  const wrongSignature = { ...fixture(), signature: '0'.repeat(64) };
  const missingSignature = { ...fixture(), signature: undefined };
  for (const body of [tampered, wrongSignature, missingSignature]) {
    assert.equal((await post(JSON.stringify(body))).status, 400);
  }
});

test('rejects invalid JSON and invalid envelopes without crashing', async () => {
  for (const body of ['{', 'null', '[]', '{}']) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post(JSON.stringify(fixture()), 'text/plain')).status, 415);
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
});

test('rejects oversized input and stays healthy', async () => {
  assert.equal((await post(JSON.stringify({ padding: 'x'.repeat(BODY_LIMIT) }))).status, 413);
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
});

test('ACKs concurrent duplicates without business side effects', async () => {
  const body = JSON.stringify(fixture());
  const responses = await Promise.all(Array.from({ length: 8 }, () => post(body)));
  for (const response of responses) assert.equal(response.status, 200);
  const ids = responses.map((response) => response.headers.get('x-request-id'));
  assert.equal(new Set(ids).size, responses.length);
});

test('exposes only health and exact POST callback route', async () => {
  assert.equal((await fetch(`${baseUrl}${WEBHOOK_PATH}`)).status, 405);
  assert.equal((await fetch(`${baseUrl}${WEBHOOK_PATH}/`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/other`)).status, 404);
});
