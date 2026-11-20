// Transport fixture: real compiled auth/controller/gateways; in-memory domain data, no database.
import 'reflect-metadata';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as Y from 'yjs';
import { AuthService } from '../dist/modules/auth/auth.service.js';
import { AccessTokenGuard } from '../dist/modules/auth/guards/access-token.guard.js';
import { RolesGuard } from '../dist/modules/auth/guards/roles.guard.js';
import { RealtimeTicketController } from '../dist/modules/auth/realtime-ticket.controller.js';
import { TokenService } from '../dist/modules/auth/services/token.service.js';
import { ChatService } from '../dist/modules/chat/services/chat.service.js';
import { ChatRateService } from '../dist/modules/chat/services/chat-rate.service.js';
import { ChatSocketService } from '../dist/modules/chat/services/chat-socket.service.js';
import { WhiteboardSocketService } from '../dist/modules/whiteboards/whiteboard-socket.service.js';
import { WhiteboardsService } from '../dist/modules/whiteboards/whiteboards.service.js';

export async function startRealtimeTestServer(origins) {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = new ConfigService({
    CORS_ORIGINS: origins.join(','),
    CHAT_ENABLED: true,
    WHITEBOARD_ENABLED: true,
    ACCESS_TOKEN_TTL_SECONDS: 900,
    JWT_PRIVATE_KEY_BASE64: Buffer.from(
      keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    ).toString('base64'),
    JWT_PUBLIC_KEY_BASE64: Buffer.from(
      keys.publicKey.export({ type: 'spki', format: 'pem' }),
    ).toString('base64'),
  });
  const actor = { userId: randomUUID(), sessionId: randomUUID(), role: 'MENTOR' };
  let revoked = false;
  const auth = {
    assertAccessPrincipalValid: async (principal) => {
      if (revoked || principal.sessionId !== actor.sessionId) throw new UnauthorizedException();
    },
  };
  const board = {
    id: randomUUID(),
    sessionId: randomUUID(),
    title: 'Transport test',
    mode: 'COLLABORATIVE',
    epoch: randomUUID(),
    controlVersion: '1',
    sequence: '0',
    schemaVersion: 2,
    lastPersistedAt: new Date().toISOString(),
  };
  const capabilities = Object.fromEntries(
    [
      'canView',
      'canCreate',
      'canEdit',
      'canControl',
      'canUpload',
      'canSnapshot',
      'canRestore',
      'canExport',
      'canCollaborate',
      'canImportPdf',
      'canExportPdf',
    ].map((key) => [key, true]),
  );
  const context = {
    sessionId: board.sessionId,
    sessionTitle: 'Portable realtime',
    classId: randomUUID(),
    className: 'Transport fixture',
    sessionStatus: 'IN_PROGRESS',
    displayName: 'Mentor test',
    mentor: true,
  };
  const doc = new Y.Doc();
  const state = () => ({
    board,
    capabilities,
    identity: { id: actor.userId, name: 'Mentor test' },
    binary: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
  });
  const boards = {
    sync: async (_, id, callback) => {
      if (id !== board.id) throw new Error('Wrong board');
      const result = state();
      callback?.(result);
      return result;
    },
    update: async (_, id, epoch, updateId, binary) => {
      if (id !== board.id || epoch !== board.epoch) throw new Error('Wrong board');
      Y.applyUpdate(doc, Buffer.from(binary, 'base64'));
      board.sequence = String(BigInt(board.sequence) + 1n);
      return { epoch, updateId, sequence: board.sequence };
    },
  };
  const module = await Test.createTestingModule({
    controllers: [RealtimeTicketController],
    providers: [
      TokenService,
      AccessTokenGuard,
      RolesGuard,
      WhiteboardSocketService,
      ChatSocketService,
      ChatRateService,
      { provide: ConfigService, useValue: config },
      { provide: AuthService, useValue: auth },
      { provide: WhiteboardsService, useValue: boards },
      {
        provide: ChatService,
        useValue: { get: async () => ({ highWatermark: '0', capabilities: { canSend: true } }) },
      },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      errorHttpStatusCode: 422,
    }),
  );
  await app.listen(0, '127.0.0.1');
  return {
    app,
    config,
    actor,
    tokens: app.get(TokenService),
    url: await app.getUrl(),
    board,
    context,
    capabilities,
    state,
    chatConnections: () => app.get(ChatSocketService).sockets.size,
    disconnectChats: () => {
      for (const socket of app.get(ChatSocketService).sockets.values()) socket.disconnect(true);
    },
    disconnectBoards: () => {
      for (const peer of app.get(WhiteboardSocketService).peers.values())
        peer.socket.disconnect(true);
    },
    revoke: () => {
      revoked = true;
    },
    close: async () => {
      doc.destroy();
      await app.close();
    },
  };
}
