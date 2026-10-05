import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';

export const WEBHOOK_PATH = '/api/v1/payment-callbacks/payos';
export const BODY_LIMIT = 64 * 1024;

/** @typedef {{ requestId: string, timestamp: string, status: number, outcome: string, latencyMs: number }} LogEntry */
/** @typedef {{ verify: (body: import('@payos/node').Webhook) => Promise<unknown>, log: (entry: LogEntry) => void }} Options */

/** @param {unknown} value @returns {value is import('@payos/node').Webhook} */
function isWebhook(value) {
  if (!value || typeof value !== 'object') return false;
  const body = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof body.code === 'string' &&
    typeof body.desc === 'string' &&
    typeof body.success === 'boolean' &&
    typeof body.signature === 'string' &&
    /^[a-f\d]{64}$/i.test(body.signature) &&
    !!body.data &&
    typeof body.data === 'object' &&
    !Array.isArray(body.data)
  );
}

/** @param {Options} options @returns {import('node:http').Server} */
export function createReceiver({ verify, log }) {
  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    const started = performance.now();
    let outcome = 'not_found';
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => {
      log({
        requestId,
        timestamp: new Date().toISOString(),
        status: res.statusCode,
        outcome,
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
      });
    });
    /** @param {number} status @param {string} result */
    const reply = (status, result) => {
      outcome = result;
      res.statusCode = status;
      res.end(JSON.stringify({ result, requestId }));
    };
    if (req.url === '/health' && req.method === 'GET') return reply(200, 'ready');
    if (req.url !== WEBHOOK_PATH) return reply(404, 'not_found');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return reply(405, 'method_not_allowed');
    }
    if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      req.resume();
      return reply(415, 'json_required');
    }
    let size = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > BODY_LIMIT) {
          // Stop retaining input, ACK the rejection and close this connection.
          res.setHeader('Connection', 'close');
          reply(413, 'body_too_large');
          res.once('finish', () => req.destroy());
          return;
        }
        chunks.push(chunk);
      }
    } catch {
      if (!res.destroyed) reply(400, 'incomplete_body');
      return;
    }
    /** @type {unknown} */
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reply(400, 'invalid_json');
    }
    if (!isWebhook(body)) return reply(400, 'invalid_webhook');
    try {
      await verify(body);
    } catch {
      return reply(400, 'verification_failed');
    }
    return reply(200, 'verified');
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.setTimeout(10_000, (socket) => socket.destroy());
  return server;
}
