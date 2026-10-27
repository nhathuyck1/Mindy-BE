import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { io, type Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import type { ConversationDto, MessageDto } from '../../src/modules/chat/dtos/chat.dto.js';
import { fileConfig, storageFixture, upload } from '../helpers/files-fixture.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}
describe.skipIf(!separateTestUrl('phase6_http'))('Phase 6 compiled HTTP and real Socket.IO', () => {
  let server: ChildProcess,
    db: DataSource,
    url: string,
    classId: string,
    mentor: string,
    student: string,
    other: string,
    conversation: ConversationDto;
  const sockets: Socket[] = [];
  const serverLogs: string[] = [];
  const sensitive = new Set<string>();
  let tokenService: TokenService, remote: Awaited<ReturnType<typeof storageFixture>>;
  let runtimeEnvironment: NodeJS.ProcessEnv;
  beforeAll(async () => {
    const dbUrl = separateTestUrl('phase6_http'),
      keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const fileSettings = fileConfig();
    remote = await storageFixture(fileSettings);
    tokenService = new TokenService(
      new ConfigService({
        ACCESS_TOKEN_TTL_SECONDS: 1,
        JWT_PRIVATE_KEY_BASE64: Buffer.from(
          keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        ).toString('base64'),
        JWT_PUBLIC_KEY_BASE64: Buffer.from(
          keys.publicKey.export({ type: 'spki', format: 'pem' }),
        ).toString('base64'),
      }),
    );
    runtimeEnvironment = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: dbUrl,
      DATABASE_LOGGING: 'false',
      COOKIE_SECURE: 'false',
      CORS_ORIGINS: 'http://localhost:3001',
      SWAGGER_ENABLED: 'true',
      GOOGLE_AUTH_ENABLED: 'false',
      MAIL_ENABLED: 'false',
      ORDER_EXPIRY_JOB_ENABLED: 'false',
      PAYMENT_MAIL_JOB_ENABLED: 'false',
      ASSIGNMENT_TIMEOUT_JOB_ENABLED: 'false',
      CHAT_ENABLED: 'true',
      CHAT_JOB_ENABLED: 'true',
      CHAT_ATTACHMENTS_ENABLED: 'true',
      MINIO_ENABLED: 'true',
      MINIO_ENDPOINT: '127.0.0.1',
      MINIO_PORT: '19000',
      MINIO_USE_SSL: 'false',
      MINIO_PUBLIC_URL: 'http://127.0.0.1:19000',
      MINIO_ACCESS_KEY: 'mindy-files-test',
      MINIO_SECRET_KEY: 'mindy-files-test-only-password',
      MINIO_BUCKET: fileSettings.getOrThrow<string>('MINIO_BUCKET'),
      FILE_JOB_ENABLED: 'false',
      CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: '1',
      CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
      PAYOS_ENABLED: 'true',
      PAYOS_CREATE_LINK_ENABLED: 'true',
      PAYOS_CLIENT_ID: 'http-client',
      PAYOS_API_KEY: 'http-key',
      PAYOS_CHECKSUM_KEY: 'http-checksum',
      PAYOS_RETURN_URL: 'https://example.test/paid',
      PAYOS_CANCEL_URL: 'https://example.test/cancel',
      PAYOS_WEBHOOK_URL: 'https://example.test/webhook',
      JWT_PRIVATE_KEY_BASE64: Buffer.from(
        keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      ).toString('base64'),
      JWT_PUBLIC_KEY_BASE64: Buffer.from(
        keys.publicKey.export({ type: 'spki', format: 'pem' }),
      ).toString('base64'),
    };
    server = fork('test/http/payment-server.mjs', [], {
      execArgv: [],
      silent: true,
      env: runtimeEnvironment,
    });
    let output = '';
    server.stdout?.on('data', (c) => {
      output += String(c);
      serverLogs.push(String(c));
    });
    server.stderr?.on('data', (c) => {
      output += String(c);
      serverLogs.push(String(c));
    });
    const ready = await new Promise<{ url: string; classId: string }>((resolve, reject) => {
      server.once('message', (m) => resolve(m as { url: string; classId: string }));
      server.once('exit', (code) => reject(new Error(`HTTP server exited ${code}: ${output}`)));
      server.once('error', reject);
    });
    url = `${ready.url}/api/v1`;
    classId = ready.classId;
    db = new DataSource({ type: 'postgres', url: dbUrl });
    await db.initialize();
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
    mentor = await login('mentor@http.test');
    student = await login('student@http.test');
    other = await login('other@http.test');
    // Create the existing enrollment through checkout, without merchant network calls.
    expect((await request('/me/cart/items', student, { classId })).status).toBe(201);
    const checkout = await request('/me/cart/checkout', student, { paymentType: 'CASH' });
    expect(checkout.status).toBe(201);
    await eventually(async () => {
      const result = await request(`/classes/${classId}/chat`, student);
      if (result.status !== 200) throw new Error('Provisioning');
      conversation = await json<ConversationDto>(result);
    });
  }, 45000);
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
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
    if (remote) await remote.cleanup();
  });
  function request(
    path: string,
    cookie?: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    key?: string,
    origin = 'http://localhost:3001',
  ): Promise<Response> {
    if (cookie)
      for (const part of cookie.split(';'))
        sensitive.add(part.trim().split('=').slice(1).join('='));
    if (
      typeof body === 'object' &&
      body !== null &&
      'body' in body &&
      typeof body.body === 'string'
    )
      sensitive.add(body.body);
    return fetch(`${url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        origin,
        ...(cookie ? { cookie } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function eventually(check: () => Promise<void>): Promise<void> {
    let last: unknown;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        await check();
        return;
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw last;
  }
  async function connect(cookie: string): Promise<Socket> {
    const socket = io(`${url.replace('/api/v1', '')}/chat`, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { cookie, origin: 'http://localhost:3001' },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      setTimeout(() => reject(new Error('connect timeout')), 8000).unref();
    });
    return socket;
  }
  async function ack(
    socket: Socket,
    event: string,
    payload: unknown,
  ): Promise<{
    ok: boolean;
    data?: { message?: MessageDto; replayed?: boolean };
    error?: { code: string };
  }> {
    return await socket.timeout(8000).emitWithAck(event, payload);
  }
  it('guards HTTP/DTO/origin and exposes the CASH group without opening materials', async () => {
    expect((await request('/chat/conversations')).status).toBe(401);
    expect((await request(`/chat/conversations/${conversation.id}`, other)).status).toBe(404);
    expect(conversation.accessMode).toBe('CASH_PENDING');
    expect((await request('/files/upload-intents', student, {})).status).toBe(403);
    const mentorScope: { mentor_id: string }[] = await db.query(
      'SELECT mentor_id FROM classes WHERE id=$1',
      [classId],
    );
    const directs = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const response = await request('/chat/conversations/direct', student, {
          peerUserId: mentorScope[0]?.mentor_id,
        });
        expect([200, 201]).toContain(response.status);
        return json<{ conversation: ConversationDto }>(response);
      }),
    );
    expect(new Set(directs.map((d) => d.conversation.id)).size).toBe(1);
    expect(
      (
        await request(`/chat/conversations/${conversation.id}/messages`, student, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'forged',
          senderId: randomUUID(),
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          '/chat/conversations/direct',
          student,
          { peerUserId: randomUUID() },
          'POST',
          undefined,
          'https://evil.test',
        )
      ).status,
    ).toBe(403);
    const doc = await json<{ paths: Record<string, Record<string, unknown>> }>(
      fetch(`${url.replace('/api/v1', '')}/docs-json`),
    );
    expect(doc.paths).toHaveProperty('/api/v1/chat/conversations/{conversationId}/messages');
    interface CollectionRequest {
      method: string;
      url: string;
    }
    interface CollectionItem {
      request?: CollectionRequest;
      item?: CollectionItem[];
    }
    const collection = JSON.parse(
      await readFile('postman/Mindy-Chat-Phase6.postman_collection.json', 'utf8'),
    ) as {
      item: CollectionItem[];
    };
    function requests(items: CollectionItem[]): CollectionRequest[] {
      return items.flatMap((item) => (item.request ? [item.request] : requests(item.item ?? [])));
    }
    const allRequests = requests(collection.item);
    expect(allRequests.filter((r) => r.url === '{{base_url}}/api/v1/auth/login')).toHaveLength(10);
    expect(allRequests.filter((r) => r.url === '{{base_url}}/api/v1/auth/me')).toHaveLength(5);
    const canonicalPath = (path: string) => path.replace(/\{[^}]+\}/g, '{}');
    const documented = allRequests
      .filter((r) => !r.url.includes('/api/v1/auth/'))
      .map(
        (r) =>
          `${r.method.toLowerCase()} ${canonicalPath(
            r.url
              .replace('{{base_url}}', '')
              .split('?')[0]
              ?.replace(/\{\{[^}]+\}\}/g, '{}') ?? '',
          )}`,
      );
    const runtime = Object.entries(doc.paths)
      .filter(([path]) =>
        /^\/api\/v1\/(chat\/|notifications(?:\/|$)|classes\/\{classId\}\/chat$)/.test(path),
      )
      .flatMap(([path, operations]) =>
        Object.keys(operations)
          .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map((method) => `${method} ${canonicalPath(path)}`),
      );
    expect(documented).toHaveLength(19);
    expect(new Set(documented).size).toBe(19);
    expect(documented.sort()).toEqual(runtime.sort());
  });
  it('rejects missing/evil origins, enforces five sockets and expires passive verified tokens', async () => {
    const invalidHeaders: Record<string, string>[] = [
      { cookie: student },
      { cookie: student, origin: 'https://evil.test' },
      { cookie: 'access_token=forged', origin: 'http://localhost:3001' },
    ];
    for (const headers of invalidHeaders) {
      const socket = io(`${url.replace('/api/v1', '')}/chat`, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: headers,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => reject(new Error('Unauthorized socket connected')));
        socket.once('connect_error', () => resolve());
        setTimeout(() => reject(new Error('Missing handshake rejection')), 5000).unref();
      });
      socket.disconnect();
    }
    const live: Socket[] = [];
    for (let i = 0; i < 5; i++) live.push(await connect(student));
    await expect(connect(student)).rejects.toThrow();
    for (const socket of live) socket.disconnect();
    const raw = mentor
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('access_token='))
      ?.slice('access_token='.length);
    if (!raw) throw new Error('Missing test cookie');
    const principal = tokenService.verifyAccessToken(decodeURIComponent(raw));
    const short = await connect(`access_token=${tokenService.signAccessToken(principal).token}`);
    await eventually(async () => {
      expect(short.connected).toBe(false);
    });
    short.disconnect();
  });
  it('persists via real sockets, delivers only authorized projections and replays a lost ack', async () => {
    const sender = await connect(student),
      receiver = await connect(mentor);
    expect((await ack(sender, 'conversation:join', { conversationId: conversation.id })).ok).toBe(
      true,
    );
    expect((await ack(receiver, 'conversation:join', { conversationId: conversation.id })).ok).toBe(
      true,
    );
    const seen: unknown[] = [];
    receiver.on('message:created', (event) => seen.push(event));
    const payload = {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      type: 'TEXT',
      body: 'Socket private message',
    };
    const first = await ack(sender, 'message:send', payload);
    expect(first.ok).toBe(true);
    await eventually(async () => {
      expect(seen.length).toBeGreaterThan(0);
    });
    expect(JSON.stringify(seen)).toContain('Socket private message');
    expect(JSON.stringify(seen)).not.toMatch(/"(?:ciphertext|keyVersion|iv|tag)":/);
    const retry = await ack(sender, 'message:send', payload);
    expect(retry.data?.replayed).toBe(true);
    expect(retry.data?.message?.id).toBe(first.data?.message?.id);
    expect((await ack(sender, 'message:send', { ...payload, senderId: randomUUID() })).ok).toBe(
      false,
    );
    const history = await json<{ data: MessageDto[] }>(
      request(`/chat/conversations/${conversation.id}/messages`, mentor),
    );
    expect(history.data[0]?.clientMessageId).toBeNull();
    await eventually(async () => {
      const inbox = await json<{ data: unknown[] }>(request('/notifications', mentor));
      expect(inbox.data.length).toBe(1);
      expect(JSON.stringify(inbox)).not.toContain('Socket private message');
    });
    sender.disconnect();
    receiver.disconnect();
  });
  it('uploads, validates, attaches and downloads an image through compiled HTTP', async () => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } })
      .png()
      .toBuffer();
    const intent = await json<{ fileId: string; uploadUrl: string }>(
      request(
        `/chat/conversations/${conversation.id}/attachments/upload-intents`,
        student,
        {
          originalFilename: 'image.png',
          declaredMimeType: 'image/png',
          declaredSizeBytes: bytes.length,
        },
        'POST',
        randomUUID(),
      ),
    );
    expect(intent.fileId).toBeTruthy();
    sensitive.add(intent.uploadUrl);
    await upload(intent.uploadUrl, 'image/png', bytes);
    expect(
      (
        await request(
          `/chat/conversations/${conversation.id}/attachments/${intent.fileId}/complete`,
          student,
          {},
        )
      ).status,
    ).toBe(202);
    await eventually(async () => {
      const state = await json<{ status: string }>(
        request(`/chat/conversations/${conversation.id}/attachments/${intent.fileId}`, student),
      );
      expect(state.status).toBe('READY');
    });
    const sent = await json<{ message: MessageDto }>(
      request(`/chat/conversations/${conversation.id}/messages`, student, {
        clientMessageId: randomUUID(),
        type: 'IMAGE',
        fileObjectId: intent.fileId,
      }),
    );
    expect(sent.message.file?.id).toBe(intent.fileId);
    expect(sent.message.body).toBeNull();
    const signed = await json<{ url: string }>(
      request(
        `/chat/conversations/${conversation.id}/messages/${sent.message.id}/file-access`,
        mentor,
        {},
      ),
    );
    expect(Buffer.from(await (await fetch(signed.url)).arrayBuffer()).equals(bytes)).toBe(true);
    sensitive.add(signed.url);
    expect(
      (await request(`/chat/conversations/${conversation.id}/attachments/${intent.fileId}`, other))
        .status,
    ).toBe(404);
  });
  it('refreshes HTTP cookies, reconnects and recovers persisted history', async () => {
    const refreshed = await request('/auth/refresh', student, {}, 'POST');
    expect(refreshed.status).toBe(200);
    student = refreshed.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const socket = await connect(student);
    expect((await ack(socket, 'conversation:join', { conversationId: conversation.id })).ok).toBe(
      true,
    );
    const history = await json<{ data: MessageDto[] }>(
      request(`/chat/conversations/${conversation.id}/messages`, student),
    );
    expect(history.data.length).toBeGreaterThan(0);
    socket.disconnect();
  });
  it('enforces twenty subscriptions, cross-socket typing/send limits and the real packet ceiling', async () => {
    const first = await connect(mentor),
      second = await connect(mentor);
    try {
      for (let i = 0; i < 21; i++) {
        const id = randomUUID();
        await db.query(
          `INSERT INTO classes SELECT (jsonb_populate_record(NULL::classes,
          to_jsonb(c)||jsonb_build_object('id',$2::uuid,'code',$3::text))).* FROM classes c WHERE id=$1`,
          [classId, id, randomUUID()],
        );
        const rows: { id: string }[] = await db.query(
          `INSERT INTO chat_conversations(type,class_id) VALUES('CLASS',$1)
          ON CONFLICT(class_id) DO UPDATE SET class_id=EXCLUDED.class_id RETURNING id`,
          [id],
        );
        const conversationId = rows[0]?.id ?? '';
        await db.query(
          `INSERT INTO chat_members(conversation_id,user_id)
          SELECT $1,mentor_id FROM classes WHERE id=$2 ON CONFLICT DO NOTHING`,
          [conversationId, id],
        );
        expect((await ack(first, 'conversation:join', { conversationId })).ok).toBe(i < 20);
      }
      await ack(second, 'conversation:join', { conversationId: conversation.id });
      const third = await connect(mentor);
      await ack(third, 'conversation:join', { conversationId: conversation.id });
      expect((await ack(second, 'typing:start', { conversationId: conversation.id })).ok).toBe(
        true,
      );
      expect(
        (await ack(third, 'typing:start', { conversationId: conversation.id })).error?.code,
      ).toBe('CHAT_RATE_LIMITED');
      third.disconnect();
      // A new burst window; previous tests' sends do not influence this assertion.
      await new Promise((r) => setTimeout(r, 1100));
      for (let i = 0; i < 5; i++) {
        const body = { clientMessageId: randomUUID(), type: 'TEXT', body: 'Shared quota' };
        if (i % 2 === 0)
          expect(
            (await request(`/chat/conversations/${conversation.id}/messages`, mentor, body)).status,
          ).toBe(201);
        else
          expect(
            (await ack(second, 'message:send', { conversationId: conversation.id, ...body })).ok,
          ).toBe(true);
      }
      expect(
        (
          await ack(second, 'message:send', {
            conversationId: conversation.id,
            clientMessageId: randomUUID(),
            type: 'TEXT',
            body: 'Over burst',
          })
        ).error?.code,
      ).toBe('CHAT_RATE_LIMITED');
      const disconnected = new Promise<void>((resolve, reject) => {
        second.once('disconnect', () => resolve());
        setTimeout(() => reject(new Error('Oversized packet was not disconnected')), 5000).unref();
      });
      second.emit(
        'message:send',
        {
          conversationId: conversation.id,
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'x'.repeat(40000),
        },
        () => {},
      );
      await disconnected;
    } finally {
      first.disconnect();
      second.disconnect();
    }
  }, 30000);
  it('syncs conversation/inbox reads to own tabs and refetches after a missed notification', async () => {
    const first = await connect(mentor),
      second = await connect(mentor);
    try {
      for (const socket of [first, second])
        await ack(socket, 'conversation:join', { conversationId: conversation.id });
      const changed: unknown[] = [],
        read: unknown[] = [];
      second.on('conversation:read', (e) => changed.push(e));
      second.on('notifications:read', (e) => read.push(e));
      const sent = await json<{ message: MessageDto }>(
        request(`/chat/conversations/${conversation.id}/messages`, student, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'Own tabs cursor',
        }),
      );
      expect(
        (
          await request(
            `/chat/conversations/${conversation.id}/read`,
            mentor,
            { throughSequence: sent.message.sequence },
            'PUT',
          )
        ).status,
      ).toBe(200);
      await eventually(async () => {
        expect(changed.length).toBeGreaterThan(0);
        expect(read.length).toBeGreaterThan(0);
      });
      second.disconnect();
      const late = await json<{ message: MessageDto }>(
        request(`/chat/conversations/${conversation.id}/messages`, student, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'Missed notification',
        }),
      );
      await eventually(async () => {
        const list = await json<{ data: { messageId: string; readAt: string | null }[] }>(
          request('/notifications', mentor),
        );
        expect(list.data.some((n) => n.messageId === late.message.id && n.readAt === null)).toBe(
          true,
        );
      });
      const reconnected = await connect(mentor);
      const count = await json<{ unreadCount: number }>(
        request('/notifications/unread-count', mentor),
      );
      expect(count.unreadCount).toBe(1);
      reconnected.disconnect();
    } finally {
      first.disconnect();
      second.disconnect();
    }
  });
  it('edits/deletes with current-state replay and denies revoked passive recipients', async () => {
    const receiver = await connect(mentor);
    await ack(receiver, 'conversation:join', { conversationId: conversation.id });
    const sent = await json<{ message: MessageDto }>(
      request(`/chat/conversations/${conversation.id}/messages`, student, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'HTTP original',
      }),
    );
    expect(sent.message.id).toBeTruthy();
    const edited = await json<{ message: MessageDto }>(
      request(
        `/chat/conversations/${conversation.id}/messages/${sent.message.id}`,
        student,
        { expectedVersion: 1, body: 'HTTP edit' },
        'PATCH',
        randomUUID(),
      ),
    );
    expect(edited.message.version).toBe(2);
    const deleted = await json<{ message: MessageDto }>(
      request(
        '/chat/conversations/' +
          conversation.id +
          '/messages/' +
          sent.message.id +
          '?expectedVersion=2',
        student,
        undefined,
        'DELETE',
        randomUUID(),
      ),
    );
    expect(deleted.message.body).toBeNull();
    expect((await request('/auth/logout', mentor, {}, 'POST')).status).toBe(204);
    await eventually(async () => {
      expect(receiver.connected).toBe(false);
    });
    receiver.disconnect();
    const catchup = await json<{ data: { message: MessageDto }[] }>(
      request(`/chat/conversations/${conversation.id}/events?afterSequence=0`, student),
    );
    expect(
      catchup.data
        .filter((e) => e.message?.id === sent.message.id)
        .every((e) => e.message?.body === null),
    ).toBe(true);
  });
  it('preserves messages and receipts across an abrupt process restart and a disabled rollback', async () => {
    const input = {
      clientMessageId: randomUUID(),
      type: 'TEXT',
      body: 'Persist across process exit',
    };
    const sent = await json<{ message: MessageDto }>(
      request(`/chat/conversations/${conversation.id}/messages`, student, input),
    );
    async function stop(abrupt: boolean): Promise<void> {
      await new Promise<void>((resolve) => {
        server.once('exit', () => resolve());
        if (abrupt) server.kill('SIGKILL');
        else server.send('close');
      });
    }
    async function resume(enabled: boolean, workers = enabled): Promise<void> {
      server = fork('test/http/chat-resume-server.mjs', [], {
        execArgv: [],
        silent: true,
        env: {
          ...runtimeEnvironment,
          CHAT_ENABLED: String(enabled),
          CHAT_JOB_ENABLED: String(workers),
          PAYOS_ENABLED: 'false',
        },
      });
      server.stdout?.on('data', (c) => serverLogs.push(String(c)));
      server.stderr?.on('data', (c) => serverLogs.push(String(c)));
      const ready = await new Promise<{ url: string }>((resolve, reject) => {
        server.once('message', (m) => resolve(m as { url: string }));
        server.once('exit', () => reject(new Error('Resume server exited before ready')));
        server.once('error', reject);
      });
      url = `${ready.url}/api/v1`;
    }
    await stop(true);
    await resume(false);
    expect((await request('/chat/conversations', student)).status).toBe(503);
    expect((await request('/auth/me', student)).status).toBe(200);
    expect(
      await db.query('SELECT id FROM chat_messages WHERE id=$1', [sent.message.id]),
    ).toHaveLength(1);
    expect(
      await db.query("SELECT key FROM mutation_receipts WHERE namespace='chat' AND key=$1", [
        input.clientMessageId,
      ]),
    ).toHaveLength(1);
    await stop(false);
    await resume(true);
    const replay = await json<{ message: MessageDto; replayed: boolean }>(
      request(`/chat/conversations/${conversation.id}/messages`, student, input),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.message.id).toBe(sent.message.id);
    expect(replay.message.body).toBe(input.body);
    const socket = await connect(student);
    expect((await ack(socket, 'conversation:join', { conversationId: conversation.id })).ok).toBe(
      true,
    );
    socket.disconnect();
    await stop(false);
    await resume(true, false);
    function ipc(type: string): Promise<{ messageId?: string }> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.off('message', handler);
          reject(new Error(`Missing fixture barrier ${type}`));
        }, 8000);
        function handler(message: unknown): void {
          if (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === type
          ) {
            clearTimeout(timeout);
            server.off('message', handler);
            resolve({
              messageId:
                'messageId' in message && typeof message.messageId === 'string'
                  ? message.messageId
                  : undefined,
            });
          }
        }
        server.on('message', handler);
      });
    }
    const lost = {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      type: 'TEXT',
      body: 'Crash before ack',
    };
    const trapped = ipc('ack-trap-ready');
    server.send({ type: 'hold-send-ack', clientMessageId: lost.clientMessageId });
    await trapped;
    const sender = await connect(student);
    const persisted = ipc('send-persisted');
    let acked = false;
    sender.emit('message:send', lost, () => {
      acked = true;
    });
    const committed = await persisted;
    expect(acked).toBe(false);
    await stop(true);
    await resume(true, false);
    const retried = await json<{ message: MessageDto; replayed: boolean }>(
      request(`/chat/conversations/${conversation.id}/messages`, student, {
        clientMessageId: lost.clientMessageId,
        type: lost.type,
        body: lost.body,
      }),
    );
    expect(retried.replayed).toBe(true);
    expect(retried.message.id).toBe(committed.messageId);
    const receiver = await connect(student);
    await ack(receiver, 'conversation:join', { conversationId: conversation.id });
    const seen: { eventId: string; message: MessageDto }[] = [];
    receiver.on('message:created', (e) => seen.push(e));
    expect(
      (
        await request(
          `/chat/conversations/${conversation.id}/messages/${retried.message.id}?expectedVersion=1`,
          student,
          undefined,
          'DELETE',
          randomUUID(),
        )
      ).status,
    ).toBe(200);
    const created: { id: string; event_id: string }[] = await db.query(
      "SELECT j.id,j.event_id FROM chat_jobs j JOIN chat_events e ON e.id=j.event_id WHERE j.consumer='REALTIME' AND e.type='message:created' AND e.message_id=$1",
      [retried.message.id],
    );
    const emitted = ipc('dispatched-before-complete');
    server.send({ type: 'dispatch-before-complete', jobId: created[0]?.id });
    await emitted;
    await eventually(async () => {
      expect(
        seen.some(
          (e) =>
            e.eventId === created[0]?.event_id &&
            e.message.body === null &&
            e.message.version === 2,
        ),
      ).toBe(true);
    });
    await stop(true);
    await db.query(
      "UPDATE chat_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [created[0]?.id],
    );
    await resume(true, false);
    const recovered = await connect(student);
    await ack(recovered, 'conversation:join', { conversationId: conversation.id });
    recovered.on('message:created', (e) => seen.push(e));
    const started = ipc('workers-started');
    server.send('start-workers');
    await started;
    await eventually(async () => {
      expect(seen.filter((e) => e.eventId === created[0]?.event_id)).toHaveLength(2);
    });
    const deduped = new Map(seen.map((e) => [e.eventId, e]));
    expect(deduped.get(created[0]?.event_id ?? '')?.message.body).toBeNull();
    expect(
      await db.query('SELECT id FROM chat_messages WHERE client_message_id=$1', [
        lost.clientMessageId,
      ]),
    ).toHaveLength(1);
    recovered.disconnect();
  }, 45000);
  function fixtureSignal(type: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        server.off('message', handler);
        reject(new Error(`Missing fixture signal ${type}`));
      }, 8000);
      function handler(value: unknown): void {
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === type) {
          clearTimeout(timer);
          server.off('message', handler);
          resolve();
        }
      }
      server.on('message', handler);
    });
  }
  async function scopedPair() {
    const stopped = fixtureSignal('workers-stopped');
    server.send('stop-workers');
    await stopped;
    const mentorId = randomUUID(),
      studentId = randomUUID(),
      id = randomUUID(),
      unitId = randomUUID();
    const mentorEmail = `${mentorId}@fixture.test`,
      studentEmail = `${studentId}@fixture.test`;
    for (const [userId, email, template] of [
      [mentorId, mentorEmail, 'mentor@http.test'],
      [studentId, studentEmail, 'student@http.test'],
    ])
      await db.query(
        `INSERT INTO users SELECT (jsonb_populate_record(NULL::users,
        to_jsonb(u)||jsonb_build_object('id',$2::uuid,'email',$3::text))).* FROM users u WHERE email=$1`,
        [template, userId, email],
      );
    await db.query(
      `INSERT INTO classes SELECT (jsonb_populate_record(NULL::classes,
      to_jsonb(c)||jsonb_build_object('id',$2::uuid,'code',$3::text,'mentor_id',$4::uuid))).* FROM classes c WHERE id=$1`,
      [classId, id, randomUUID(), mentorId],
    );
    await db.query(
      `INSERT INTO class_units SELECT (jsonb_populate_record(NULL::class_units,
      to_jsonb(u)||jsonb_build_object('id',$2::uuid,'class_id',$3::uuid))).* FROM class_units u WHERE class_id=$1 ORDER BY position LIMIT 1`,
      [classId, unitId, id],
    );
    await db.query(
      `INSERT INTO class_sessions SELECT (jsonb_populate_record(NULL::class_sessions,
      to_jsonb(s)||jsonb_build_object('id',$2::uuid,'class_unit_id',$3::uuid,'class_id',$4::uuid))).* FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id WHERE u.class_id=$1 LIMIT 1`,
      [classId, randomUUID(), unitId, id],
    );
    async function login(email: string): Promise<string> {
      const response = await request('/auth/login', undefined, {
        email,
        password: 'Http-test-password1!',
      });
      expect(response.status).toBe(200);
      return response.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
    }
    const mentorCookie = await login(mentorEmail),
      studentCookie = await login(studentEmail);
    expect((await request('/me/cart/items', studentCookie, { classId: id })).status).toBe(201);
    expect(
      (await request('/me/cart/checkout', studentCookie, { paymentType: 'CASH' })).status,
    ).toBe(201);
    const conversationId = randomUUID();
    await db.query("INSERT INTO chat_conversations(id,type,class_id) VALUES($1,'CLASS',$2)", [
      conversationId,
      id,
    ]);
    await db.query('INSERT INTO chat_members(conversation_id,user_id) VALUES($1,$2),($1,$3)', [
      conversationId,
      mentorId,
      studentId,
    ]);
    return { id, conversationId, mentorId, studentId, mentorCookie, studentCookie };
  }
  const revokes = ['logout', 'suspend', 'reassign', 'cash-expiry'] as const;
  const packets = [
    'message:created',
    'message:updated',
    'message:deleted',
    'conversation:read',
    'typing:changed',
    'notification:created',
  ] as const;
  const revokeCases = revokes.flatMap((reason) => packets.map((packet) => ({ reason, packet })));
  it.each(revokeCases)(
    'blocks $packet after $reason commits at the delivery authorization barrier',
    async ({ reason, packet }) => {
      const p = await scopedPair();
      const studentReceives = reason === 'cash-expiry';
      const senderCookie = studentReceives ? p.mentorCookie : p.studentCookie;
      const recipientCookie = studentReceives ? p.studentCookie : p.mentorCookie;
      const recipientId = studentReceives ? p.studentId : p.mentorId;
      const sender = await connect(senderCookie),
        receiver = await connect(recipientCookie);
      const received: unknown[] = [],
        access: unknown[] = [];
      receiver.on(packet, (event) => received.push(event));
      receiver.on('conversation:access-changed', (event) => access.push(event));
      let action: Promise<unknown> | undefined;
      try {
        for (const socket of [sender, receiver])
          expect(
            (await ack(socket, 'conversation:join', { conversationId: p.conversationId })).ok,
          ).toBe(true);
        const original = await json<{ message: MessageDto }>(
          request(`/chat/conversations/${p.conversationId}/messages`, senderCookie, {
            clientMessageId: randomUUID(),
            type: 'TEXT',
            body: 'Protected delivery canary',
          }),
        );
        const ready = fixtureSignal('delivery-armed');
        server.send({
          type: 'arm-delivery',
          userId: recipientId,
          conversationId: p.conversationId,
          event: packet,
        });
        await ready;
        const blocked = fixtureSignal('delivery-before-authorize');
        if (packet === 'typing:changed')
          action = ack(sender, 'typing:start', { conversationId: p.conversationId });
        else if (packet === 'conversation:read')
          action = request(
            `/chat/conversations/${p.conversationId}/read`,
            senderCookie,
            { throughSequence: original.message.sequence },
            'PUT',
          );
        else {
          if (packet === 'message:updated')
            expect(
              (
                await request(
                  `/chat/conversations/${p.conversationId}/messages/${original.message.id}`,
                  senderCookie,
                  { expectedVersion: 1, body: 'Protected mutation canary' },
                  'PATCH',
                  randomUUID(),
                )
              ).status,
            ).toBe(200);
          if (packet === 'message:deleted')
            expect(
              (
                await request(
                  `/chat/conversations/${p.conversationId}/messages/${original.message.id}?expectedVersion=1`,
                  senderCookie,
                  undefined,
                  'DELETE',
                  randomUUID(),
                )
              ).status,
            ).toBe(200);
          const consumer = packet === 'notification:created' ? 'NOTIFICATION' : 'REALTIME';
          const type = packet === 'notification:created' ? 'message:created' : packet;
          const rows: { id: string }[] = await db.query(
            'SELECT j.id FROM chat_jobs j JOIN chat_events e ON e.id=j.event_id WHERE e.message_id=$1 AND e.type=$2 AND j.consumer=$3',
            [original.message.id, type, consumer],
          );
          const notification = packet === 'notification:created';
          action = fixtureSignal(
            notification ? 'notification-delivered' : 'dispatched-before-complete',
          );
          server.send({
            type: notification ? 'fanout-once' : 'dispatch-before-complete',
            jobId: rows[0]?.id,
          });
        }
        await blocked;
        if (reason === 'logout')
          expect((await request('/auth/logout', recipientCookie, {})).status).toBe(204);
        if (reason === 'suspend')
          await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [recipientId]);
        if (reason === 'reassign')
          await db.query(
            'UPDATE classes SET mentor_id=(SELECT mentor_id FROM classes WHERE id=$2) WHERE id=$1',
            [p.id, classId],
          );
        if (reason === 'cash-expiry')
          await db.query('UPDATE orders SET expires_at=clock_timestamp() WHERE student_id=$1', [
            recipientId,
          ]);
        server.send('release-delivery');
        await action;
        await new Promise<void>((resolve, reject) => {
          if (!receiver.connected) return resolve();
          const timer = setTimeout(() => reject(new Error('Missing delivery fence')), 5000);
          const done = () => {
            clearTimeout(timer);
            resolve();
          };
          receiver.once('fixture:delivery-fence', done);
          receiver.once('disconnect', done);
          server.send({ type: 'delivery-fence', userId: recipientId });
        });
        expect(received).toHaveLength(0);
        if (reason === 'reassign' || reason === 'cash-expiry')
          expect(access).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                conversationId: p.conversationId,
                reason: 'ACCESS_REVOKED',
              }),
            ]),
          );
        if (packet === 'notification:created')
          expect((await request('/notifications', recipientCookie)).status).toBe(
            reason === 'logout' || reason === 'suspend' ? 401 : 200,
          );
      } finally {
        server.send('release-delivery');
        sender.disconnect();
        receiver.disconnect();
        if (action) await action.catch(() => {});
      }
    },
    20000,
  );
  it('matches socket command/ack/event/capability contracts and redacts captured logs', async () => {
    const p = await scopedPair();
    const sender = await connect(p.studentCookie),
      receiver = await connect(p.mentorCookie);
    const types = [
      'message:created',
      'message:updated',
      'message:deleted',
      'conversation:membership-changed',
      'conversation:read',
      'typing:changed',
      'notification:created',
      'notifications:read',
    ];
    const events = new Map<string, unknown[]>();
    for (const type of types) {
      events.set(type, []);
      receiver.on(type, (event) => events.get(type)?.push(event));
    }
    async function deliver(messageId: string | null, type: string): Promise<void> {
      const rows: { id: string }[] = await db.query(
        `SELECT j.id FROM chat_jobs j JOIN chat_events e ON e.id=j.event_id
        WHERE j.consumer='REALTIME' AND e.conversation_id=$1 AND e.type=$2 AND ($3::uuid IS NULL OR e.message_id=$3) ORDER BY e.sequence DESC LIMIT 1`,
        [p.conversationId, type, messageId],
      );
      const complete = fixtureSignal('dispatched-before-complete');
      server.send({ type: 'dispatch-before-complete', jobId: rows[0]?.id });
      await complete;
      await eventually(async () => {
        expect(events.get(type)?.length).toBeGreaterThan(0);
      });
    }
    try {
      for (const socket of [sender, receiver])
        expect(
          await ack(socket, 'conversation:join', { conversationId: p.conversationId }),
        ).toEqual({
          ok: true,
          data: { conversationId: p.conversationId, highWatermark: expect.any(String) },
        });
      const view = await json<ConversationDto>(
        request(`/chat/conversations/${p.conversationId}`, p.studentCookie),
      );
      expect(view.capabilities).toEqual({
        canRead: true,
        canSend: true,
        canAttach: true,
        canType: true,
      });
      expect(await ack(sender, 'conversation:leave', { conversationId: p.conversationId })).toEqual(
        { ok: true, data: { conversationId: p.conversationId } },
      );
      expect(
        await ack(sender, 'conversation:join', {
          conversationId: p.conversationId,
          senderId: randomUUID(),
        }),
      ).toEqual({
        ok: false,
        error: { statusCode: 422, code: 'CHAT_INVALID_INPUT', message: 'CHAT_INVALID_INPUT' },
      });
      await ack(sender, 'conversation:join', { conversationId: p.conversationId });
      const body = `socket-contract-canary-${randomUUID()}`;
      sensitive.add(body);
      const sent = await ack(sender, 'message:send', {
        conversationId: p.conversationId,
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body,
      });
      expect(sent).toMatchObject({
        ok: true,
        data: {
          replayed: false,
          message: {
            id: expect.any(String),
            conversationId: p.conversationId,
            body,
            type: 'TEXT',
            version: 1,
            sequence: expect.any(String),
          },
        },
      });
      const message = sent.data?.message;
      if (!message) throw new Error('Missing command message DTO');
      await deliver(message.id, 'message:created');
      const fanout: { id: string }[] = await db.query(
        "SELECT j.id FROM chat_jobs j JOIN chat_events e ON e.id=j.event_id WHERE j.consumer='NOTIFICATION' AND e.message_id=$1 AND e.type='message:created'",
        [message.id],
      );
      const notified = fixtureSignal('notification-delivered');
      server.send({ type: 'fanout-once', jobId: fanout[0]?.id });
      await notified;
      await eventually(async () => {
        expect(events.get('notification:created')?.length).toBe(1);
      });
      expect(events.get('notification:created')?.[0]).toMatchObject({
        notification: {
          id: expect.any(String),
          type: 'CHAT_MESSAGE',
          actorId: p.studentId,
          conversationId: p.conversationId,
          messageId: message.id,
          title: 'Tin nhắn mới',
          body: 'Bạn có tin nhắn mới.',
          data: { conversationId: p.conversationId, messageId: message.id },
          readAt: null,
          createdAt: expect.any(String),
        },
      });
      expect(
        await ack(sender, 'message:read', {
          conversationId: p.conversationId,
          throughSequence: message.sequence,
        }),
      ).toMatchObject({
        ok: true,
        data: {
          conversationId: p.conversationId,
          lastReadSequence: message.sequence,
          lastReadAt: expect.any(String),
          unreadCount: 0,
        },
      });
      await eventually(async () => {
        expect(events.get('conversation:read')?.[0]).toMatchObject({
          conversationId: p.conversationId,
          userId: p.studentId,
          lastReadSequence: message.sequence,
          unreadCount: 0,
        });
      });
      expect(await ack(sender, 'typing:start', { conversationId: p.conversationId })).toEqual({
        ok: true,
        data: { expiresInMs: 5000 },
      });
      await new Promise((resolve) => setTimeout(resolve, 2050));
      expect(await ack(sender, 'typing:stop', { conversationId: p.conversationId })).toEqual({
        ok: true,
        data: { expiresInMs: 0 },
      });
      await eventually(async () => {
        expect(events.get('typing:changed')).toEqual([
          {
            conversationId: p.conversationId,
            userId: p.studentId,
            isTyping: true,
            expiresInMs: 5000,
          },
          {
            conversationId: p.conversationId,
            userId: p.studentId,
            isTyping: false,
            expiresInMs: 0,
          },
        ]);
      });
      expect((await request('/notifications/read-all', p.mentorCookie, {})).status).toBe(200);
      await eventually(async () => {
        expect(events.get('notifications:read')?.[0]).toEqual({
          readAt: expect.any(String),
          resyncRequired: true,
        });
      });
      expect(
        (
          await request(
            `/chat/conversations/${p.conversationId}/messages/${message.id}`,
            p.studentCookie,
            { expectedVersion: 1, body: 'Contract edit' },
            'PATCH',
            randomUUID(),
          )
        ).status,
      ).toBe(200);
      await deliver(message.id, 'message:updated');
      expect(
        (
          await request(
            `/chat/conversations/${p.conversationId}/messages/${message.id}?expectedVersion=2`,
            p.studentCookie,
            undefined,
            'DELETE',
            randomUUID(),
          )
        ).status,
      ).toBe(200);
      await deliver(message.id, 'message:deleted');
      const reconciled = fixtureSignal('reconciled');
      server.send({ type: 'reconcile', classId: p.id });
      await reconciled;
      await deliver(null, 'conversation:membership-changed');
      for (const [type, version, expectedBody] of [
        ['message:created', 1, body],
        ['message:updated', 2, 'Contract edit'],
        ['message:deleted', 3, null],
      ] as const)
        expect(events.get(type)?.[0]).toMatchObject({
          eventId: expect.any(String),
          conversationId: p.conversationId,
          sequence: expect.any(String),
          type,
          occurredAt: expect.any(String),
          message: { id: message.id, version, body: expectedBody },
        });
      expect(events.get('conversation:membership-changed')?.[0]).toMatchObject({
        eventId: expect.any(String),
        conversationId: p.conversationId,
        type: 'conversation:membership-changed',
        message: null,
      });
      const documentation = await readFile('docs/api_flow/PHASE_6_flow-api-breakdown.md', 'utf8');
      for (const event of [
        ...types,
        'conversation:access-changed',
        'conversation:join',
        'conversation:leave',
        'message:send',
        'message:read',
        'typing:start',
        'typing:stop',
      ])
        expect(documentation).toContain(event);
      for (const [name, value] of Object.entries(runtimeEnvironment))
        if (/KEY|SECRET/.test(name) && value) sensitive.add(value);
      for (const value of Object.values(
        JSON.parse(runtimeEnvironment.CHAT_ENCRYPTION_KEYS ?? '{}'),
      ))
        if (typeof value === 'string') sensitive.add(value);
      const log = serverLogs.join('');
      for (const value of sensitive)
        if (value.length > 12 && log.includes(value))
          throw new Error('Sensitive value appeared in captured server logs');
      expect(JSON.stringify([...events.values()])).not.toMatch(
        /"(?:ciphertext|keyVersion|iv|tag)":/,
      );
    } finally {
      sender.disconnect();
      receiver.disconnect();
    }
  }, 30000);
});
