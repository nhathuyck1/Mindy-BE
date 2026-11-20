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
import { Server, type Socket } from 'socket.io';
// biome-ignore lint/style/useImportType: Nest DI token.
import { AuthService } from '../../auth/auth.service.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { TokenService } from '../../auth/services/token.service.js';
// biome-ignore lint/style/useImportType: Exported composition provider.
import { ChatSocketService } from '../../chat/services/chat-socket.service.js';
import { NotificationException } from '../exceptions/notification.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { NotificationInboxService } from './notification-inbox.service.js';

interface Peer {
  socket: Socket;
  actor: AuthenticatedUser;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class NotificationSocketService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server?: Server;
  private audit?: ReturnType<typeof setInterval>;
  private auditing = false;
  private readonly peers = new Map<string, Peer>();
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpAdapterHost,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly inbox: NotificationInboxService,
    private readonly chat: ChatSocketService,
  ) {}

  onApplicationBootstrap(): void {
    this.chat.onNotificationRead((userId, readAt) =>
      this.read(userId, { readAt, resyncRequired: true }),
    );
    if (!this.enabled() || !this.http.httpAdapter) return;
    const origins = this.config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    this.server = new Server(this.http.httpAdapter.getHttpServer() as HttpServer, {
      path: '/ws/notifications',
      addTrailingSlash: false,
      transports: ['websocket'],
      maxHttpBufferSize: 32768,
      cors: { origin: origins, credentials: true },
      allowRequest: (req, done) =>
        done(null, typeof req.headers.origin === 'string' && origins.includes(req.headers.origin)),
    });
    const ns = this.server.of('/notifications');
    ns.use(async (socket, next) => {
      try {
        if (!this.enabled()) throw new NotificationException(503, 'NOTIFICATIONS_DISABLED');
        const { principal, expiresAt } = this.tokens.verifySocketIdentity(
          socket.handshake.auth,
          socket.handshake.headers.cookie,
          socket.handshake.headers.origin,
          'notifications',
        );
        if (!['MENTOR', 'STUDENT'].includes(principal.role))
          throw new NotificationException(403, 'INSUFFICIENT_ROLE');
        await this.auth.assertAccessPrincipalValid(principal);
        if ([...this.peers.values()].filter((p) => p.actor.userId === principal.userId).length >= 5)
          throw new NotificationException(429, 'NOTIFICATION_RATE_LIMITED');
        const timer = setTimeout(
          () => socket.disconnect(true),
          Math.max(1, Math.min(2147483647, expiresAt.getTime() - Date.now())),
        );
        timer.unref();
        this.peers.set(socket.id, {
          socket,
          actor: principal,
          expiresAt: expiresAt.getTime(),
          timer,
        });
        socket.on('disconnect', () => {
          clearTimeout(timer);
          this.peers.delete(socket.id);
        });
        next();
      } catch (error) {
        const failure = new Error('Notification connection refused');
        Object.assign(failure, {
          data: {
            statusCode: error instanceof NotificationException ? error.getStatus() : 401,
            code: error instanceof NotificationException ? error.code : 'AUTHENTICATION_REQUIRED',
          },
        });
        next(failure);
      }
    });
    this.audit = setInterval(() => {
      void this.auditPeers();
    }, 5000);
    this.audit.unref();
  }

  async created(userId: string, notificationId: string): Promise<void> {
    if (!this.enabled()) return;
    for (const peer of this.peers.values()) {
      if (peer.actor.userId !== userId) continue;
      try {
        if (!(await this.valid(peer))) continue;
        const notification = await this.inbox.get(peer.actor, notificationId);
        // Business channel never sends chat rows or accepts client-selected recipients.
        if (notification.type === 'CHAT_MESSAGE') continue;
        if (peer.socket.connected && (await this.valid(peer)))
          peer.socket.emit('notification-inbox:created', { notification });
      } catch {
        /* Durable inbox + reconnect/refetch is the recovery path. */
      }
    }
  }

  async read(userId: string, result: { readAt: string; resyncRequired: true }): Promise<void> {
    for (const peer of this.peers.values()) {
      if (peer.actor.userId === userId && (await this.valid(peer)) && peer.socket.connected)
        peer.socket.emit('notification-inbox:read', result);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.chat.onNotificationRead(undefined);
    if (this.audit) clearInterval(this.audit);
    for (const peer of this.peers.values()) {
      clearTimeout(peer.timer);
      peer.socket.disconnect(true);
    }
    this.peers.clear();
    // Disconnect only our namespace. Closing Socket.IO here would also close the shared HTTP server.
    this.server?.of('/notifications').disconnectSockets(true);
    this.server?.engine.close();
  }

  private enabled(): boolean {
    return (
      this.config.get<boolean>('NOTIFICATIONS_ENABLED', false) &&
      this.config.get<boolean>('NOTIFICATION_SOCKET_ENABLED', false)
    );
  }
  private async valid(peer: Peer): Promise<boolean> {
    try {
      if (!this.enabled() || peer.expiresAt <= Date.now()) throw new Error('expired');
      await this.auth.assertAccessPrincipalValid(peer.actor);
      return true;
    } catch {
      peer.socket.disconnect(true);
      return false;
    }
  }
  private async auditPeers(): Promise<void> {
    if (this.auditing) return;
    this.auditing = true;
    try {
      for (const peer of this.peers.values()) await this.valid(peer);
    } finally {
      this.auditing = false;
    }
  }
}
