import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { fileConfig, storageFixture } from '../helpers/files-fixture.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

interface State {
  board: { id: string; epoch: string; sequence: string; controlVersion: string };
  binary: string;
  capabilities: { canEdit: boolean };
}
interface Ack {
  ok: boolean;
  data: State;
  error?: { statusCode: number; code: string };
}
describe.skipIf(!separateTestUrl('whiteboards_http'))(
  'Phase 7 compiled HTTP and WebSocket guards/durability',
  () => {
    let server: ChildProcess,
      db: DataSource,
      url: string,
      classId: string,
      sessionId: string,
      mentor: string,
      student: string,
      other: string;
    let remote: Awaited<ReturnType<typeof storageFixture>>;
    const sockets: Socket[] = [];
    let b: State['board'];
    beforeAll(async () => {
      const keys = generateKeyPairSync('rsa', { modulusLength: 2048 }),
        settings = fileConfig();
      remote = await storageFixture(settings);
      const databaseUrl = separateTestUrl('whiteboards_http');
      server = fork('test/http/payment-server.mjs', [], {
        execArgv: [],
        silent: true,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: databaseUrl,
          COOKIE_SECURE: 'false',
          CORS_ORIGINS: 'http://localhost:3001',
          SWAGGER_ENABLED: 'true',
          MAIL_ENABLED: 'false',
          GOOGLE_AUTH_ENABLED: 'false',
          ORDER_EXPIRY_JOB_ENABLED: 'false',
          PAYMENT_MAIL_JOB_ENABLED: 'false',
          ASSIGNMENT_TIMEOUT_JOB_ENABLED: 'false',
          CHAT_ENABLED: 'false',
          WHITEBOARD_ENABLED: 'true',
          WHITEBOARD_WORKER_ENABLED: 'true',
          WHITEBOARD_PDF_ENABLED: 'true',
          MINIO_ENABLED: 'true',
          MINIO_ENDPOINT: '127.0.0.1',
          MINIO_PORT: '19000',
          MINIO_USE_SSL: 'false',
          MINIO_PUBLIC_URL: 'http://127.0.0.1:19000',
          MINIO_ACCESS_KEY: 'mindy-files-test',
          MINIO_SECRET_KEY: 'mindy-files-test-only-password',
          MINIO_BUCKET: settings.getOrThrow('MINIO_BUCKET'),
          FILE_JOB_ENABLED: 'false',
          ACCESS_TOKEN_TTL_SECONDS: '3600',
          JWT_PRIVATE_KEY_BASE64: Buffer.from(
            keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
          ).toString('base64'),
          JWT_PUBLIC_KEY_BASE64: Buffer.from(
            keys.publicKey.export({ type: 'spki', format: 'pem' }),
          ).toString('base64'),
        },
      });
      let output = '';
      server.stdout?.on('data', (c) => {
        output += String(c);
      });
      server.stderr?.on('data', (c) => {
        output += String(c);
      });
      const ready = await new Promise<{ url: string; classId: string }>((resolve, reject) => {
        server.once('message', (m) => resolve(m as { url: string; classId: string }));
        server.once('exit', () => reject(new Error(`Fixture failed: ${output}`)));
        server.once('error', reject);
      });
      url = ready.url;
      classId = ready.classId;
      db = new DataSource({ type: 'postgres', url: databaseUrl });
      await db.initialize();
      const sessions: { id: string }[] = await db.query(
        'SELECT s.id FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id WHERE u.class_id=$1',
        [classId],
      );
      sessionId = sessions[0]?.id ?? '';
      async function login(email: string) {
        const res = await request('/auth/login', undefined, {
          email,
          password: 'Http-test-password1!',
        });
        expect(res.status).toBe(200);
        return res.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; ');
      }
      mentor = await login('mentor@http.test');
      student = await login('student@http.test');
      other = await login('other@http.test');
      await request('/me/cart/items', student, { classId });
      await request('/me/cart/checkout', student, { paymentType: 'CASH' });
    }, 60000);
    afterAll(async () => {
      for (const s of sockets) s.disconnect();
      if (db?.isInitialized) await db.destroy();
      if (server && server.exitCode === null)
        await new Promise<void>((resolve) => {
          server.once('exit', () => resolve());
          server.send('close');
          setTimeout(() => {
            server.kill();
            resolve();
          }, 5000).unref();
        });
      await remote?.cleanup();
    });
    function request(
      path: string,
      cookie?: string,
      body?: unknown,
      method = body === undefined ? 'GET' : 'POST',
      key?: string,
      origin = 'http://localhost:3001',
    ) {
      return fetch(`${url}/api/v1${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          origin,
          ...(cookie ? { cookie } : {}),
          ...(key ? { 'idempotency-key': key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function connect(cookie: string, origin = 'http://localhost:3001') {
      const s = io(url, {
        path: '/ws/whiteboards',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: { cookie, origin },
      });
      sockets.push(s);
      await new Promise<void>((resolve, reject) => {
        s.once('connect', resolve);
        s.once('connect_error', reject);
        setTimeout(() => reject(new Error('WS timeout')), 5000).unref();
      });
      return s;
    }
    const ack = (s: Socket, event: string, payload: unknown): Promise<Ack> =>
      s.timeout(5000).emitWithAck(event, payload);
    it('HTTP authentication, Origin, strict DTO and CASH denial; GET does not create', async () => {
      expect((await request(`/class-sessions/${sessionId}/whiteboard`)).status).toBe(401);
      expect((await request(`/class-sessions/${sessionId}/whiteboard`, student)).status).toBe(403);
      expect(
        (
          await request(
            `/class-sessions/${sessionId}/whiteboard`,
            mentor,
            {},
            'POST',
            randomUUID(),
            'https://evil.test',
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            `/class-sessions/${sessionId}/whiteboard`,
            mentor,
            { actorId: randomUUID() },
            'POST',
            randomUUID(),
          )
        ).status,
      ).toBe(422);
      expect(
        (
          (await (await request(`/class-sessions/${sessionId}/whiteboard`, mentor)).json()) as {
            board: unknown;
          }
        ).board,
      ).toBeNull();
      const created = await request(
        `/class-sessions/${sessionId}/whiteboard`,
        mentor,
        {},
        'POST',
        randomUUID(),
      );
      expect(created.status).toBe(201);
      b = ((await created.json()) as State).board;
      expect((await request(`/whiteboards/${b.id}`, other)).status).toBe(403);
    });
    it('requires cookie/Origin before joining and denies read-only sync-response mutations', async () => {
      await expect(connect('')).rejects.toThrow();
      await expect(connect(mentor, 'https://evil.test')).rejects.toThrow();
      await db.query("UPDATE enrollments SET status='ACTIVE',enrolled_at=now() WHERE class_id=$1", [
        classId,
      ]);
      const s = await connect(student);
      expect((await ack(s, 'board:join', { boardId: b.id })).ok).toBe(true);
      expect(
        await ack(s, 'board:update', { epoch: b.epoch, updateId: randomUUID(), binary: 'AAA=' }),
      ).toMatchObject({ ok: false, error: { statusCode: 403 } });
    });
    it('durable ACK, live peer sync, reset epoch and passive revoke close the stream', async () => {
      const m = await connect(mentor),
        viewer = await connect(student);
      const joined = await ack(m, 'board:join', { boardId: b.id });
      await ack(viewer, 'board:join', { boardId: b.id });
      const doc = new Y.Doc();
      Y.applyUpdate(doc, Buffer.from(joined.data.binary, 'base64'));
      const shape = new Y.Map<unknown>(),
        id = randomUUID();
      doc.transact(() => {
        for (const [k, v] of Object.entries({
          id,
          type: 'sticky',
          x: 30,
          y: 30,
          width: 220,
          height: 150,
          color: '#f9d85f',
        }))
          shape.set(k, v);
        shape.set('text', new Y.Text('Đã lưu'));
        doc.getMap('shapes').set(id, shape);
      });
      const received = new Promise<State>((resolve) => viewer.once('board:state', resolve));
      expect(
        await ack(m, 'board:update', {
          epoch: b.epoch,
          updateId: randomUUID(),
          binary: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        }),
      ).toMatchObject({ ok: true, data: { sequence: '1' } });
      const state = await received;
      expect(state.board.sequence).toBe('1');
      const persisted = await db.query('SELECT sequence FROM whiteboards WHERE id=$1', [b.id]);
      expect(persisted[0].sequence).toBe('1');
      const reset = await request(
        `/whiteboards/${b.id}/resets`,
        mentor,
        { expectedEpoch: b.epoch, expectedSequence: '1', expectedControlVersion: '1' },
        'POST',
        randomUUID(),
      );
      expect(reset.status).toBe(201);
      const next = (await reset.json()) as State['board'];
      expect(next.epoch).not.toBe(b.epoch);
      expect(
        await ack(m, 'board:update', {
          epoch: b.epoch,
          updateId: randomUUID(),
          binary: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        }),
      ).toMatchObject({ ok: false, error: { statusCode: 409 } });
      const disconnected = new Promise<void>((resolve) =>
        viewer.once('disconnect', () => resolve()),
      );
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE class_id=$1", [classId]);
      await disconnected;
      doc.destroy();
    });
  },
);
