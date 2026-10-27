import type { Server as HttpServer } from 'node:http';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI token.
import { HttpAdapterHost } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import { Server, type Socket } from 'socket.io';
// biome-ignore lint/style/useImportType: Nest DI token.
import { AuthService } from '../../auth/auth.service.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { TokenService } from '../../auth/services/token.service.js';
import { ReadChatInput, SendChatInput } from '../dtos/chat.dto.js';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatService } from './chat.service.js';
import type { ChatJob } from './chat-jobs.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatRateService } from './chat-rate.service.js';

type Ack = (
  value:
    | { ok: true; data: unknown }
    | {
        ok: false;
        error: { statusCode: number; code: string; message: string; retryAfterMs?: number };
      },
) => void;
interface ClientEvents {
  'conversation:join': (payload: unknown, ack: Ack) => void;
  'conversation:leave': (payload: unknown, ack: Ack) => void;
  'message:send': (payload: unknown, ack: Ack) => void;
  'message:read': (payload: unknown, ack: Ack) => void;
  'typing:start': (payload: unknown, ack: Ack) => void;
  'typing:stop': (payload: unknown, ack: Ack) => void;
}
interface ServerEvents {
  [event: string]: (payload: unknown) => void;
}
interface SocketData {
  principal: AuthenticatedUser;
  expiresAt: number;
  subscriptions: Set<string>;
}
type ChatSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

/** Direct Socket.IO adapter on Nest's HTTP server. No room broadcast carries protected data. */
@Injectable()
export class ChatSocketService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: Server<ClientEvents, ServerEvents, Record<string, never>, SocketData> | undefined;
  private readonly sockets = new Map<string, ChatSocket>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private poll: ReturnType<typeof setInterval> | undefined;
  private auditing = false;
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpAdapterHost,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly chat: ChatService,
    private readonly rate: ChatRateService,
  ) {}
  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('CHAT_ENABLED', false) || !this.http.httpAdapter) return;
    const origins = this.config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    this.server = new Server(this.http.httpAdapter.getHttpServer() as HttpServer, {
      path: '/socket.io',
      transports: ['websocket'],
      maxHttpBufferSize: 32768,
      cors: { origin: origins, credentials: true },
      allowRequest: (req, done) =>
        done(null, typeof req.headers.origin === 'string' && origins.includes(req.headers.origin)),
    });
    const namespace = this.server.of('/chat');
    namespace.use(async (socket, next) => {
      try {
        const cookie = socket.handshake.headers.cookie ?? '';
        const token = cookie
          .split(';')
          .map((x) => x.trim())
          .find((x) => x.startsWith('access_token='))
          ?.slice('access_token='.length);
        if (!token) throw new ChatException(401, 'AUTHENTICATION_REQUIRED');
        const { principal, expiresAt } = this.tokens.verifyAccessTokenWithExpiry(
          decodeURIComponent(token),
        );
        if (!['MENTOR', 'STUDENT'].includes(principal.role))
          throw new ChatException(401, 'AUTHENTICATION_REQUIRED');
        await this.auth.assertAccessPrincipalValid(principal);
        if (
          [...this.sockets.values()].filter((s) => s.data.principal.userId === principal.userId)
            .length >= 5
        )
          throw new ChatException(429, 'CHAT_RATE_LIMITED');
        socket.data = { principal, expiresAt: expiresAt.getTime(), subscriptions: new Set() };
        this.sockets.set(socket.id, socket);
        next();
      } catch (e) {
        const error = new Error('Chat authentication failed');
        const response = e instanceof ChatException ? e.getResponse() : null;
        const code =
          typeof response === 'object' && response !== null && 'code' in response
            ? String(response.code)
            : 'AUTHENTICATION_REQUIRED';
        Object.assign(error, {
          data: { code, statusCode: e instanceof ChatException ? e.getStatus() : 401 },
        });
        next(error);
      }
    });
    namespace.on('connection', (socket) => this.connect(socket));
    // Passive accounts/sessions and subscriptions are checked even without client commands.
    this.poll = setInterval(() => {
      void this.audit();
    }, 1000);
    this.poll.unref();
  }
  private connect(socket: ChatSocket): void {
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(1, Math.min(2147483647, socket.data.expiresAt - Date.now())),
    );
    timer.unref();
    this.timers.set(socket.id, timer);
    socket.on('disconnect', () => {
      this.sockets.delete(socket.id);
      socket.data.subscriptions.clear();
      clearTimeout(this.timers.get(socket.id));
      this.timers.delete(socket.id);
    });
    const command =
      (action: (payload: unknown) => Promise<unknown>) =>
      (payload: unknown, ack: Ack): void => {
        if (typeof ack !== 'function') return;
        void (async () => {
          try {
            await this.valid(socket);
            ack({ ok: true, data: await action(payload) });
          } catch (e) {
            const status = e instanceof ChatException ? e.getStatus() : 503;
            const response = e instanceof ChatException ? e.getResponse() : null;
            const code =
              typeof response === 'object' && response !== null && 'code' in response
                ? String(response.code)
                : 'CHAT_UNAVAILABLE';
            const detail =
              typeof response === 'object' &&
              response !== null &&
              'details' in response &&
              Array.isArray(response.details)
                ? response.details[0]
                : undefined;
            const retryAfterMs =
              typeof detail === 'object' &&
              detail !== null &&
              'retryAfterMs' in detail &&
              typeof detail.retryAfterMs === 'number'
                ? detail.retryAfterMs
                : undefined;
            ack({
              ok: false,
              error: {
                statusCode: status,
                code,
                message: code,
                ...(retryAfterMs ? { retryAfterMs } : {}),
              },
            });
            if (status === 401) socket.disconnect(true);
          }
        })();
      };
    socket.on(
      'conversation:join',
      command(async (p) => {
        const id = this.conversationId(p),
          c = await this.chat.get(socket.data.principal, id);
        if (!socket.data.subscriptions.has(id) && socket.data.subscriptions.size >= 20)
          throw new ChatException(429, 'CHAT_RATE_LIMITED');
        socket.data.subscriptions.add(id);
        return { conversationId: id, highWatermark: c.highWatermark };
      }),
    );
    socket.on(
      'conversation:leave',
      command(async (p) => {
        const id = this.conversationId(p);
        socket.data.subscriptions.delete(id);
        return { conversationId: id };
      }),
    );
    socket.on(
      'message:send',
      command(async (p) => {
        const id = this.conversationId(p, false),
          input = await this.input(SendChatInput, p);
        return this.chat.send(socket.data.principal, id, input);
      }),
    );
    socket.on(
      'message:read',
      command(async (p) => {
        const id = this.conversationId(p, false),
          input = await this.input(ReadChatInput, p);
        const result = await this.chat.read(socket.data.principal, id, input.throughSequence);
        await this.broadcast(id, 'conversation:read', {
          ...result,
          userId: socket.data.principal.userId,
        });
        return result;
      }),
    );
    for (const [event, active] of [
      ['typing:start', true],
      ['typing:stop', false],
    ] as const)
      socket.on(
        event,
        command(async (p) => {
          const id = this.conversationId(p),
            c = await this.chat.get(socket.data.principal, id);
          if (!socket.data.subscriptions.has(id) || !c.capabilities.canSend)
            throw new ChatException(403, 'CHAT_READ_ONLY');
          this.rate.type(socket.data.principal.userId, id);
          await this.broadcast(
            id,
            'typing:changed',
            {
              conversationId: id,
              userId: socket.data.principal.userId,
              isTyping: active,
              expiresInMs: active ? 5000 : 0,
            },
            socket.id,
          );
          return { expiresInMs: active ? 5000 : 0 };
        }),
      );
  }
  async dispatch(job: ChatJob): Promise<void> {
    if (!job.conversation_id) return;
    for (const socket of [...this.sockets.values()]) {
      if (
        !socket.data.subscriptions.has(job.conversation_id) ||
        !job.recipient_ids.includes(socket.data.principal.userId)
      )
        continue;
      try {
        await this.valid(socket);
        const event = await this.chat.event(
          socket.data.principal,
          job.conversation_id,
          job.event_id,
        );
        if (event && socket.connected && Date.now() < socket.data.expiresAt)
          socket.emit(event.type, event);
      } catch {
        await this.revoke(socket, job.conversation_id);
      }
    }
  }
  async readChanged(actor: AuthenticatedUser, id: string, result: unknown): Promise<void> {
    await this.broadcast(id, 'conversation:read', {
      ...(typeof result === 'object' && result !== null ? result : {}),
      userId: actor.userId,
    });
    await this.own(
      actor.userId,
      'notifications:read',
      { readAt: new Date().toISOString(), resyncRequired: true },
      id,
    );
  }
  async own(userId: string, event: string, data: unknown, conversationId?: string): Promise<void> {
    for (const socket of [...this.sockets.values()]) {
      if (socket.data.principal.userId !== userId) continue;
      try {
        await this.valid(socket);
        if (conversationId) await this.chat.get(socket.data.principal, conversationId);
        if (socket.connected) socket.emit(event, data);
      } catch {
        if (conversationId) await this.revoke(socket, conversationId);
      }
    }
  }
  private async broadcast(
    id: string,
    event: string,
    data: unknown,
    except?: string,
  ): Promise<void> {
    for (const socket of [...this.sockets.values()]) {
      if (socket.id === except || !socket.data.subscriptions.has(id)) continue;
      try {
        await this.valid(socket);
        await this.chat.get(socket.data.principal, id);
        if (socket.connected) socket.emit(event, data);
      } catch {
        await this.revoke(socket, id);
      }
    }
  }
  private async valid(socket: ChatSocket): Promise<void> {
    if (Date.now() >= socket.data.expiresAt) {
      socket.disconnect(true);
      throw new ChatException(401, 'AUTHENTICATION_REQUIRED');
    }
    try {
      await this.auth.assertAccessPrincipalValid(socket.data.principal);
    } catch {
      socket.disconnect(true);
      throw new ChatException(401, 'AUTHENTICATION_REQUIRED');
    }
  }
  private async audit(): Promise<void> {
    if (this.auditing) return;
    this.auditing = true;
    try {
      for (const socket of [...this.sockets.values()]) {
        try {
          await this.valid(socket);
        } catch {
          continue;
        }
        for (const id of [...socket.data.subscriptions]) {
          try {
            await this.chat.get(socket.data.principal, id);
          } catch {
            await this.revoke(socket, id);
          }
        }
      }
    } finally {
      this.auditing = false;
    }
  }
  private async revoke(socket: ChatSocket, id: string): Promise<void> {
    socket.data.subscriptions.delete(id);
    if (socket.connected)
      socket.emit('conversation:access-changed', { conversationId: id, reason: 'ACCESS_REVOKED' });
  }
  private conversationId(value: unknown, only = true): string {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    const input = value as Record<string, unknown>;
    if (
      typeof input.conversationId !== 'string' ||
      !isUUID(input.conversationId, '4') ||
      (only && Object.keys(input).some((k) => k !== 'conversationId'))
    )
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    return input.conversationId.toLowerCase();
  }
  private async input<T extends object>(type: new () => T, value: unknown): Promise<T> {
    if (typeof value !== 'object' || value === null)
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    const fields = { ...value };
    if ('conversationId' in fields) delete fields.conversationId;
    const input = plainToInstance(type, fields),
      errors = await validate(input, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      });
    if (errors.length) throw new ChatException(422, 'CHAT_INVALID_INPUT');
    return input;
  }
  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.poll);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.sockets.clear();
    this.timers.clear();
    if (this.server) await this.server.close();
  }
}
