import type { Server as HttpServer } from 'node:http';
import {
  HttpException,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { HttpAdapterHost } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { Server, type Socket } from 'socket.io';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TokenService } from '../auth/services/token.service.js';
import { boardError } from './domain/board-document.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { WhiteboardsService } from './whiteboards.service.js';

type Ack = (
  result: { ok: true; data: unknown } | { ok: false; error: { statusCode: number; code: string } },
) => void;
interface Peer {
  socket: Socket;
  actor: AuthenticatedUser;
  expiresAt: number;
  boardId?: string;
  sequence?: string;
  epoch?: string;
  control?: string;
  capabilities?: string;
  window: number;
  count: number;
  identity?: { id: string; name: string };
  authorizedAt?: number;
}

/** Single-node adapter. Every protected fanout is freshly authorized, never a room broadcast. */
@Injectable()
export class WhiteboardSocketService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server?: Server;
  private timer?: ReturnType<typeof setInterval>;
  private readonly peers = new Map<string, Peer>();
  private polling = false;
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpAdapterHost,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly boards: WhiteboardsService,
  ) {}
  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('WHITEBOARD_ENABLED', false) || !this.http.httpAdapter) return;
    const origins = this.config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((s) => s.trim());
    this.server = new Server(this.http.httpAdapter.getHttpServer() as HttpServer, {
      path: '/ws/whiteboards',
      addTrailingSlash: false,
      transports: ['websocket'],
      maxHttpBufferSize: 360000,
      cors: { origin: origins, credentials: true },
      allowRequest: (r, done) =>
        done(null, !!r.headers.origin && origins.includes(r.headers.origin)),
    });
    this.server.use(async (s, next) => {
      try {
        const { principal, expiresAt } = this.tokens.verifySocketIdentity(
          s.handshake.auth,
          s.handshake.headers.cookie,
          s.handshake.headers.origin,
          'whiteboards',
        );
        await this.auth.assertAccessPrincipalValid(principal);
        if ([...this.peers.values()].filter((p) => p.actor.userId === principal.userId).length >= 5)
          boardError(429, 'BOARD_RATE_LIMITED');
        const peer: Peer = {
          socket: s,
          actor: principal,
          expiresAt: expiresAt.getTime(),
          window: Date.now(),
          count: 0,
        };
        this.peers.set(s.id, peer);
        next();
      } catch {
        next(new Error('AUTHENTICATION_REQUIRED'));
      }
    });
    this.server.on('connection', (s) => this.connect(s));
    this.timer = setInterval(() => {
      void this.poll();
    }, 500);
    this.timer.unref();
  }
  private connect(s: Socket): void {
    const peer = this.peers.get(s.id);
    if (!peer) return;
    const expiry = setTimeout(
      () => s.disconnect(true),
      Math.max(1, Math.min(2147483647, peer.expiresAt - Date.now())),
    );
    expiry.unref();
    s.on('disconnect', () => {
      clearTimeout(expiry);
      this.peers.delete(s.id);
    });
    const command =
      (fn: (p: Record<string, unknown>, reply: (data: unknown) => void) => Promise<unknown>) =>
      (payload: unknown, ack: Ack) => {
        if (typeof ack !== 'function') return;
        void (async () => {
          try {
            await this.valid(peer);
            this.rate(peer);
            if (!payload || typeof payload !== 'object' || Array.isArray(payload))
              boardError(422, 'BOARD_INVALID_INPUT');
            let answered = false;
            const data = await fn(payload as Record<string, unknown>, (result) => {
              if (s.connected) {
                answered = true;
                ack({ ok: true, data: result });
              }
            });
            if (!answered) ack({ ok: true, data });
          } catch (e) {
            const statusCode = e instanceof HttpException ? e.getStatus() : 503;
            const response = e instanceof HttpException ? e.getResponse() : null;
            const code =
              typeof response === 'object' && response && 'code' in response
                ? String(response.code)
                : 'BOARD_UNAVAILABLE';
            ack({ ok: false, error: { statusCode, code } });
            if (statusCode === 401 || statusCode === 403) s.disconnect(true);
          }
        })();
      };
    s.on(
      'board:join',
      command(async (p, reply) => {
        if (
          Object.keys(p).some((k) => k !== 'boardId') ||
          typeof p.boardId !== 'string' ||
          !isUUID(p.boardId, '4')
        )
          boardError(422, 'BOARD_INVALID_INPUT');
        const id = p.boardId;
        await this.boards.sync(peer.actor, id, (state) => {
          peer.boardId = id;
          this.watermark(peer, state);
          reply(state);
        });
        return undefined;
      }),
    );
    s.on(
      'board:update',
      command(async (p) => {
        if (
          Object.keys(p).some((k) => !['epoch', 'updateId', 'binary'].includes(k)) ||
          !peer.boardId ||
          typeof p.epoch !== 'string' ||
          typeof p.updateId !== 'string' ||
          typeof p.binary !== 'string'
        )
          boardError(422, 'BOARD_INVALID_INPUT');
        const result = await this.boards.update(
          peer.actor,
          peer.boardId,
          p.epoch,
          p.updateId,
          p.binary,
        );
        await Promise.all(
          [...this.peers.values()]
            .filter((p) => p.boardId === peer.boardId)
            .map((p) => this.deliver(p)),
        );
        return result;
      }),
    );
    s.on(
      'board:awareness',
      command(async (p) => {
        if (
          !peer.boardId ||
          Object.keys(p).some((k) => !['x', 'y', 'preview'].includes(k)) ||
          typeof p.x !== 'number' ||
          typeof p.y !== 'number' ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          Math.abs(p.x) > 100000 ||
          Math.abs(p.y) > 100000
        )
          boardError(422, 'BOARD_INVALID_INPUT');
        const state = await this.boards.sync(peer.actor, peer.boardId);
        // Awareness is ephemeral and server-identified. Untrusted stroke previews are not relayed.
        for (const target of this.peers.values()) {
          if (target === peer || target.boardId !== peer.boardId) continue;
          try {
            await this.valid(target);
            await this.boards.sync(target.actor, peer.boardId, () =>
              target.socket.emit('board:awareness', {
                connectionId: s.id,
                identity: state.identity,
                x: p.x,
                y: p.y,
              }),
            );
          } catch {
            target.socket.disconnect(true);
          }
        }
        return { accepted: true };
      }),
    );
  }
  private watermark(p: Peer, s: Awaited<ReturnType<WhiteboardsService['sync']>>): void {
    p.sequence = s.board.sequence;
    p.epoch = s.board.epoch;
    p.control = s.board.controlVersion;
    p.capabilities = JSON.stringify(s.capabilities);
    p.identity = s.identity;
    p.authorizedAt = Date.now();
  }
  private async valid(p: Peer): Promise<void> {
    if (p.expiresAt <= Date.now()) boardError(401, 'AUTHENTICATION_REQUIRED');
    await this.auth.assertAccessPrincipalValid(p.actor);
  }
  private rate(p: Peer): void {
    if (Date.now() - p.window >= 1000) {
      p.window = Date.now();
      p.count = 0;
    }
    if (++p.count > 30) boardError(429, 'BOARD_RATE_LIMITED');
  }
  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const p of this.peers.values()) {
        try {
          await this.valid(p);
          if (!p.boardId) continue;
          await this.deliver(p);
        } catch {
          p.socket.emit('board:revoked');
          p.socket.disconnect(true);
        }
      }
    } finally {
      this.polling = false;
    }
  }
  private async deliver(p: Peer): Promise<void> {
    if (!p.boardId) return;
    try {
      await this.valid(p);
      await this.boards.sync(p.actor, p.boardId, (state) => {
        if (
          p.sequence !== state.board.sequence ||
          p.epoch !== state.board.epoch ||
          p.control !== state.board.controlVersion ||
          p.capabilities !== JSON.stringify(state.capabilities)
        ) {
          if (p.socket.conn.transport.writable) {
            p.socket.emit('board:state', state);
            this.watermark(p, state);
          } else p.socket.disconnect(true);
        }
        p.identity = state.identity;
        p.authorizedAt = Date.now();
        if (p.socket.conn.transport.writable) {
          const people = [
            ...new Map(
              [...this.peers.values()]
                .filter(
                  (other) =>
                    other.boardId === p.boardId &&
                    other.socket.connected &&
                    other.identity &&
                    (other.authorizedAt ?? 0) > Date.now() - 2000,
                )
                .map((other) => [other.actor.userId, other.identity]),
            ).values(),
          ];
          p.socket.emit('board:presence', { people });
        }
      });
    } catch {
      p.socket.emit('board:revoked');
      p.socket.disconnect(true);
    }
  }
  onApplicationShutdown(): void {
    clearInterval(this.timer);
    for (const p of this.peers.values()) p.socket.disconnect(true);
    this.peers.clear();
    this.server?.close();
  }
}
