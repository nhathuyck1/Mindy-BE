import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { NotificationException } from '../exceptions/notification.exceptions.js';

@Injectable()
export class NotificationCursorService {
  constructor(private readonly config: ConfigService) {}

  encode(owner: string, scope: string, position: string): string {
    const now = Date.now();
    const body = Buffer.from(
      JSON.stringify({ v: 1, owner, scope, position, issuedAt: now, expiresAt: now + 86400000 }),
    ).toString('base64url');
    return `${body}.${this.sign(body).toString('base64url')}`;
  }

  decode(cursor: string, owner: string, scope: string): string {
    try {
      if (cursor.length > 2048) throw new Error('size');
      const [body, signature, extra] = cursor.split('.');
      if (!body || !signature || extra !== undefined) throw new Error('format');
      const actual = Buffer.from(signature, 'base64url'),
        expected = this.sign(body);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error('signature');
      const value: unknown = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (
        !value ||
        typeof value !== 'object' ||
        !('v' in value) ||
        value.v !== 1 ||
        !('owner' in value) ||
        value.owner !== owner ||
        !('scope' in value) ||
        value.scope !== scope ||
        !('position' in value) ||
        typeof value.position !== 'string' ||
        !('expiresAt' in value) ||
        typeof value.expiresAt !== 'number'
      )
        throw new Error('scope');
      this.position(value.position);
      if (value.expiresAt <= Date.now())
        throw new NotificationException(410, 'NOTIFICATION_CURSOR_EXPIRED');
      return value.position;
    } catch (error) {
      if (error instanceof NotificationException) throw error;
      throw new NotificationException(422, 'NOTIFICATION_CURSOR_INVALID');
    }
  }

  position(value: string): [string | null, string | null] {
    if (!value) return [null, null];
    const [time, id, extra] = value.split('|');
    if (!time || !id || extra || !isUUID(id, '4') || !Number.isFinite(Date.parse(time)))
      throw new NotificationException(422, 'NOTIFICATION_CURSOR_INVALID');
    return [time, id];
  }

  private sign(body: string): Buffer {
    const secret = this.config.getOrThrow<string>('NOTIFICATION_CURSOR_SECRET');
    if (Buffer.byteLength(secret) < 32)
      throw new NotificationException(503, 'NOTIFICATIONS_DISABLED');
    return createHmac('sha256', secret).update(body).digest();
  }
}
