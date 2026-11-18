import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import type { HttpAdapterHost } from '@nestjs/core';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { TokenService } from '../auth/services/token.service.js';
import { UserRole } from '../users/user-role.enum.js';
import { boardError } from './domain/board-document.js';
import { WhiteboardSocketService } from './whiteboard-socket.service.js';
import type { BoardSyncState, WhiteboardsService } from './whiteboards.service.js';

describe('presenter viewport socket', () => {
  let server: Server;
  let service: WhiteboardSocketService;
  let url: string;
  let revoked: Set<string>;
  const sockets: Socket[] = [];
  const boardId = randomUUID(),
    epoch = randomUUID();
  const mentor: AuthenticatedUser = {
    userId: randomUUID(),
    sessionId: randomUUID(),
    role: UserRole.MENTOR,
  };
  const student: AuthenticatedUser = {
    userId: randomUUID(),
    sessionId: randomUUID(),
    role: UserRole.STUDENT,
  };
  const viewport = { epoch, x: -500, y: 250, width: 1440, height: 900, scale: 1.5 };

  beforeEach(async () => {
    revoked = new Set();
    server = createServer();
    const sync = async (
      actor: AuthenticatedUser,
      id: string,
      consume?: (state: BoardSyncState) => void,
    ) => {
      if (revoked.has(actor.userId)) boardError(403, 'BOARD_ACCESS_DENIED');
      const control = actor.role === UserRole.MENTOR;
      const state: BoardSyncState = {
        board: {
          id,
          sessionId: randomUUID(),
          title: 'Board',
          mode: 'PRESENTATION',
          epoch,
          sequence: '0',
          controlVersion: '1',
          schemaVersion: 2,
          lastPersistedAt: new Date(),
        },
        binary: 'AAA=',
        identity: { id: actor.userId, name: control ? 'Giảng viên' : 'Học viên' },
        capabilities: {
          canView: true,
          canCreate: control,
          canEdit: control,
          canControl: control,
          canUpload: control,
          canSnapshot: control,
          canRestore: control,
          canExport: control,
          canCollaborate: control,
          canImportPdf: false,
          canExportPdf: false,
        },
      };
      consume?.(state);
      return state;
    };
    // Minimal DI doubles; exercise real Socket.IO framing and the command boundary.
    service = new WhiteboardSocketService(
      new ConfigService({ WHITEBOARD_ENABLED: true, CORS_ORIGINS: 'http://localhost:3003' }),
      { httpAdapter: { getHttpServer: () => server } } as HttpAdapterHost,
      {
        verifySocketIdentity: (auth: { mentor?: boolean }) => ({
          principal: auth.mentor ? mentor : student,
          expiresAt: new Date(Date.now() + 60000),
        }),
      } as unknown as TokenService,
      { assertAccessPrincipalValid: async () => {} } as unknown as AuthService,
      { sync } as unknown as WhiteboardsService,
    );
    service.onApplicationBootstrap();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    url = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    service.onApplicationShutdown();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function connect(isMentor = false, id = boardId) {
    const socket = io(url, {
      path: '/ws/whiteboards',
      addTrailingSlash: false,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: { mentor: isMentor },
      extraHeaders: { origin: 'http://localhost:3003' },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    await socket.timeout(1000).emitWithAck('board:join', { boardId: id });
    return socket;
  }
  it('relays FOV with server identity only to authorized peers of the same board', async () => {
    const m = await connect(true),
      s = await connect(),
      other = await connect(false, randomUUID());
    const unrelated: unknown[] = [];
    other.on('board:viewport', (value) => unrelated.push(value));
    const received = new Promise<unknown>((resolve) => s.once('board:viewport', resolve));
    expect(await m.timeout(1000).emitWithAck('board:viewport', viewport)).toEqual({
      ok: true,
      data: { accepted: true },
    });
    expect(await received).toEqual({
      ...viewport,
      connectionId: m.id,
      identity: { id: mentor.userId, name: 'Giảng viên' },
    });
    expect(unrelated).toEqual([]);
  });
  it('rejects student presentation and spoofed identities', async () => {
    const s = await connect();
    expect(await s.timeout(1000).emitWithAck('board:viewport', viewport)).toMatchObject({
      ok: false,
      error: { statusCode: 403 },
    });
    const m = await connect(true);
    expect(
      await m
        .timeout(1000)
        .emitWithAck('board:viewport', { ...viewport, identity: { id: student.userId } }),
    ).toMatchObject({ ok: false, error: { statusCode: 422 } });
  });
  it('validates finite bounds and rejects a stale epoch without changing the document', async () => {
    const m = await connect(true);
    for (const bad of [
      { width: 0 },
      { height: 20000 },
      { scale: 0 },
      { x: 100001 },
      { y: '0' },
      { width: null },
    ])
      expect(
        await m.timeout(1000).emitWithAck('board:viewport', { ...viewport, ...bad }),
      ).toMatchObject({ ok: false, error: { statusCode: 422 } });
    expect(
      await m.timeout(1000).emitWithAck('board:viewport', { ...viewport, epoch: randomUUID() }),
    ).toMatchObject({ ok: false, error: { statusCode: 409, code: 'BOARD_EPOCH_CHANGED' } });
  });
  it('reauthorizes the recipient before fanout and disconnects revoked access', async () => {
    const m = await connect(true),
      s = await connect();
    const received: unknown[] = [];
    s.on('board:viewport', (value) => received.push(value));
    const disconnected = new Promise<void>((resolve) => s.once('disconnect', () => resolve()));
    revoked.add(student.userId);
    expect(await m.timeout(1000).emitWithAck('board:viewport', viewport)).toMatchObject({
      ok: true,
    });
    await disconnected;
    expect(received).toEqual([]);
  });
});
